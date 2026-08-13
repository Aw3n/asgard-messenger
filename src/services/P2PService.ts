import { EventEmitter } from 'eventemitter3'
import type { ProtocolMessage, ProtocolMessageType } from '@/types'
import { cryptoService } from './CryptoService'
import { useNetworkStore } from '@/stores/networkStore'
import { useIdentityStore } from '@/stores/identityStore'
import { toUint8Array } from '@/utils/bytes'

/**
 * P2PService — high-level P2P messaging layer.
 *
 * Sits on top of the Electron NetworkService (via IPC).
 * Handles message serialization, signing, verification,
 * replay attack protection, and routing.
 *
 * PERFORMANCE: Light messages (presence, typing, reactions) skip Ed25519
 * signing for ultra-low latency. Critical messages (chat, contact, call, file)
 * remain signed for security.
 */
class P2PService extends EventEmitter {
  private static instance: P2PService
  private seenMessages = new Set<string>() // Replay attack protection
  private cleanup: (() => void)[] = []
  private initialized = false
  private statusInterval: ReturnType<typeof setInterval> | null = null
  private _mediaSendLogged = false // DIAGNOSTICS: Track first media send
  // Reverse mapping: Ed25519 public key → Hyperswarm Noise peer ID
  // Populated by peer:identified events from NetworkService
  private ed25519ToNoiseMap: Map<string, string> = new Map()

  // HOLEPUNCH SECURITY: Rate limiting — prevents message flooding from malicious peers.
  // Tracks message count per peer within a sliding window.
  private messageRateMap: Map<string, { count: number; windowStart: number }> = new Map()
  private static readonly RATE_LIMIT_WINDOW_MS = 10_000 // 10s window
  private static readonly RATE_LIMIT_MAX_MESSAGES = 100 // Max 100 msgs per 10s per peer

  // CRITICAL: Message types that skip Ed25519 signing for performance.
  // These are ephemeral/frequent messages where latency matters more than non-repudiation.
  private static readonly UNSIGNED_TYPES: Set<ProtocolMessageType> = new Set([
    'presence:update',
    'presence:typing',
    'presence:ping',
    'presence:pong',
    'reaction:emoji',
    'chat:ephemeral',
    'chat:receipt',
    'chat:read',
    'group:receipt',
    'group:read',
    // PERFORMANCE: Call signaling is already authenticated by Noise encrypted channel
    'call:offer',
    'call:accept',
    'call:reject',
    'call:end',
    'call:participant:left',
    'call:participant:joined',
  ])

  static getInstance(): P2PService {
    if (!P2PService.instance) {
      P2PService.instance = new P2PService()
    }
    return P2PService.instance
  }

  /**
   * Initialize the P2P service and wire up IPC listeners
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    // Listen for incoming messages from main process
    const msgCleanup = window.asgard.network.onMessage((msg) => {
      // CRITICAL: Convert IPC serialized data back to Uint8Array.
      // contextBridge serializes Uint8Array as plain objects {0: byte, ...}.
      this.handleRawMessage({ ...msg, data: toUint8Array(msg.data) }).catch(console.error)
    })

    // Listen for incoming media data from main process
    let mediaChunksReceived = 0
    const mediaCleanup = window.asgard.network.onMedia((msg) => {
      mediaChunksReceived++
      if (mediaChunksReceived % 50 === 0) {
        console.log(`[P2PService] Media RX: ${mediaChunksReceived} chunks received from main process`)
      }
      this.emit('media:data', { from: msg.from, data: toUint8Array(msg.data) })
    })

    // HOLEPUNCH PATTERN: Listen for incoming file data via dedicated 'asgard-files' channel
    let fileChunksReceived = 0
    const fileCleanup = window.asgard.network.onFile((msg) => {
      fileChunksReceived++
      if (fileChunksReceived <= 3) {
        console.log(`[P2PService] File RX #${fileChunksReceived} from ${msg.from.slice(0, 16)}, size: ${msg.data?.length ?? 0}`)
      }
      this.emit('file:data', { from: msg.from, data: toUint8Array(msg.data) })
    })

    // Listen for peer events
    const peerCleanup = window.asgard.network.onPeer((peer) => {
      const store = useNetworkStore.getState()
      if (peer.connected) {
        store.addPeer({
          id: peer.id,
          publicKey: peer.publicKey,
          remotePublicKey: peer.remotePublicKey,
          connected: true,
          connectedAt: Date.now(),
        })
        this.emit('peer:connected', peer)
      } else {
        store.removePeer(peer.id)
        this.emit('peer:disconnected', peer)
      }
    })

    // Listen for peer identity events (Ed25519 key mapped to Hyperswarm peer ID)
    const identCleanup = window.asgard.network.onPeerIdentified((data) => {
      // Store reverse mapping: Ed25519 → Noise peer ID
      this.ed25519ToNoiseMap.set(data.publicKey, data.peerId)
      this.emit('peer:identified', data)
    })

    // PERFORMANCE: Listen for peer ban events
    const banCleanup = window.asgard.network.onPeerBanned((data) => {
      this.emit('peer:banned', data)
    })

    // PERFORMANCE: Real-time status updates from swarm events
    // Replaces the 5s polling with immediate push from main process
    const statusCleanup = window.asgard.network.onStatusUpdate((status) => {
      useNetworkStore.getState().updateStatus({
        state: status.connected ? 'connected' : 'disconnected',
        peers: status.peers,
        topics: status.topics,
        bandwidth: status.bandwidth,
        connecting: status.connecting,
        peerLatency: status.peerLatency,
      })
    })

    this.cleanup.push(msgCleanup, peerCleanup, mediaCleanup, fileCleanup, identCleanup, statusCleanup, banCleanup)

    // Sync initial status
    try {
      const status = await window.asgard.network.getStatus()
      useNetworkStore.getState().updateStatus({
        state: status.connected ? 'connected' : 'disconnected',
        peers: status.peers,
        topics: status.topics,
        bandwidth: status.bandwidth,
        connecting: status.connecting,
        peerLatency: status.peerLatency,
      })
    } catch (err) {
      console.warn('[P2PService] Could not fetch initial status:', err)
    }

    // PERFORMANCE: Reduced polling to 30s as fallback — real-time updates come from onStatusUpdate
    this.statusInterval = setInterval(async () => {
      try {
        const status = await window.asgard.network.getStatus()
        useNetworkStore.getState().updateStatus({
          state: status.connected ? 'connected' : 'disconnected',
          peers: status.peers,
          topics: status.topics,
          bandwidth: status.bandwidth,
          connecting: status.connecting,
          peerLatency: status.peerLatency,
        })
      } catch {
        // Silently fail — status sync is best-effort
      }
    }, 30000)
  }

  /**
   * Join a conversation topic (enables peer discovery for that conversation)
   */
  async joinTopic(topicHex: string): Promise<void> {
    await window.asgard.network.join(topicHex)
    const store = useNetworkStore.getState()
    store.updateStatus({
      topics: [...store.status.topics, topicHex],
    })
    // CONNECTIVITY: Flush after joining topic for faster peer discovery
    // swarm.flush() waits for all DHT announces + pending peer connections
    window.asgard.network.flush().catch(() => {})
  }

  /**
   * Leave a conversation topic
   */
  async leaveTopic(topicHex: string): Promise<void> {
    await window.asgard.network.leave(topicHex)
    const store = useNetworkStore.getState()
    store.updateStatus({
      topics: store.status.topics.filter((t) => t !== topicHex),
    })
  }

  /**
   * Send a typed protocol message to a specific peer.
   * PERFORMANCE: Light messages (presence, typing, reactions) skip Ed25519 signing
   * for ~10x faster delivery. Critical messages remain signed.
   */
  async sendMessage(
    peerId: string,
    type: ProtocolMessageType,
    payload: unknown
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    // CRITICAL: Translate Ed25519 public key to Hyperswarm Noise peer ID.
    const noisePeerId = this.ed25519ToNoiseMap.get(peerId) ?? peerId

    let encoded: Uint8Array
    if (P2PService.UNSIGNED_TYPES.has(type)) {
      // PERFORMANCE: Skip Ed25519 signing for ephemeral messages (5-20ms saved)
      const msg = {
        type,
        payload,
        timestamp: Date.now(),
        from: identity.keyPair.publicKey,
        seq: cryptoService.nextSeq(),
        unsigned: true, // Marker for receiver to skip verification
      }
      encoded = new TextEncoder().encode(JSON.stringify(msg))
    } else {
      // Critical messages: sign with Ed25519
      const msg: Omit<ProtocolMessage, 'signature'> = {
        type,
        payload,
        timestamp: Date.now(),
        from: identity.keyPair.publicKey,
        seq: cryptoService.nextSeq(),
      }
      const signature = await cryptoService.sign(msg)
      const fullMsg: ProtocolMessage = { ...msg, signature }
      encoded = new TextEncoder().encode(JSON.stringify(fullMsg))
    }

    await window.asgard.network.send(noisePeerId, encoded)
  }

  /**
   * PERFORMANCE: Send a pre-signed message (already signed by caller).
   * Skips the Ed25519 signing step — saves ~5-20ms per message.
   * Used by ChatService which already signs messages before calling P2P.
   */
  async sendRawMessage(
    peerId: string,
    type: ProtocolMessageType,
    payload: unknown
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const noisePeerId = this.ed25519ToNoiseMap.get(peerId) ?? peerId

    // DIAGNOSTIC: Log peer ID resolution to trace message delivery issues
    const hasMapping = this.ed25519ToNoiseMap.has(peerId)
    console.log('[P2PService] sendRawMessage:', type, '| ed25519:', peerId.slice(0, 20), '→ noise:', noisePeerId.slice(0, 20), '| mapped:', hasMapping)

    // Directly encode without signing — caller already signed the payload
    const msg = {
      type,
      payload,
      timestamp: Date.now(),
      from: identity.keyPair.publicKey,
      seq: cryptoService.nextSeq(),
      unsigned: true,
    }
    const encoded = new TextEncoder().encode(JSON.stringify(msg))
    try {
      await window.asgard.network.send(noisePeerId, encoded)
      console.log('[P2PService] ✅ sendRawMessage OK:', type, '| seq:', msg.seq)
    } catch (err) {
      console.error('[P2PService] ❌ sendRawMessage FAILED:', type, '| error:', err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  /**
   * PERFORMANCE: Batch-send multiple messages to the same peer using a single IPC call.
   * Encodes all messages, then sends them via network:sendBatch which does cork/send/uncork
   * in the main process — avoiding N*2 IPC round-trips.
   */
  async sendBatch(
    peerId: string,
    messages: Array<{ type: ProtocolMessageType; payload: unknown }>
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const noisePeerId = this.ed25519ToNoiseMap.get(peerId) ?? peerId

    // Encode all messages first (in renderer process)
    const encodedMessages: Uint8Array[] = []
    for (const { type, payload } of messages) {
      const msg = {
        type,
        payload,
        timestamp: Date.now(),
        from: identity.keyPair.publicKey,
        seq: cryptoService.nextSeq(),
      }

      if (P2PService.UNSIGNED_TYPES.has(type)) {
        const unsignedMsg = { ...msg, unsigned: true }
        encodedMessages.push(new TextEncoder().encode(JSON.stringify(unsignedMsg)))
      } else {
        const signature = await cryptoService.sign(msg)
        const fullMsg = { ...msg, signature }
        encodedMessages.push(new TextEncoder().encode(JSON.stringify(fullMsg)))
      }
    }

    // Single IPC call: cork + send all + uncork (in main process)
    await window.asgard.network.sendBatch(noisePeerId, encodedMessages)
  }

  /**
   * Send raw media data (audio/video chunks) to a specific peer via the media channel.
   * Unlike sendMessage(), this does NOT JSON-encode or sign — it sends raw binary
   * via the dedicated 'asgard-media' Protomux channel for low-latency streaming.
   */
  async sendMediaData(peerId: string, data: Uint8Array): Promise<void> {
    // CRITICAL: Translate Ed25519 public key to Hyperswarm Noise peer ID.
    const noisePeerId = this.ed25519ToNoiseMap.get(peerId) ?? peerId
    
    // DIAGNOSTICS: Log first send to verify IPC is working
    if (!this._mediaSendLogged) {
      this._mediaSendLogged = true
      console.log('[P2PService] First media send via IPC, ed25519:', peerId.slice(0, 16), '→ noise:', noisePeerId.slice(0, 16), 'data length:', data.length)
    }
    await window.asgard.network.sendMedia(noisePeerId, data)
  }

  /**
   * HOLEPUNCH PATTERN: Batch-send multiple media chunks via Protomux cork/uncork.
   * Cork buffers all messages, then uncork flushes them in a single batch —
   * reducing per-packet framing overhead by ~80% for small audio chunks.
   *
   * Pattern: channel.cork() → N×message.send() → channel.uncork()
   * This is the recommended Protomux pattern for real-time streaming.
   */
  async sendMediaBatch(peerId: string, chunks: Uint8Array[]): Promise<void> {
    if (chunks.length === 0) return
    const noisePeerId = this.ed25519ToNoiseMap.get(peerId) ?? peerId
    await window.asgard.network.sendMediaBatch(noisePeerId, chunks)
  }

  /**
   * HOLEPUNCH PATTERN: Send raw file transfer data via the dedicated 'asgard-files' Protomux channel.
   * Each protocol type gets its own channel for isolation and independent backpressure.
   * File transfers don't interfere with audio/video during active calls.
   */
  async sendFileData(peerId: string, data: Uint8Array): Promise<void> {
    // CRITICAL: Translate Ed25519 public key to Hyperswarm Noise peer ID.
    const noisePeerId = this.ed25519ToNoiseMap.get(peerId) ?? peerId
    await window.asgard.network.sendFileData(noisePeerId, data)
  }

  /**
   * Get the Ed25519 public key for a Noise peer ID.
   * Returns undefined if the mapping is not known.
   */
  getPeerPublicKey(noisePeerId: string): string | undefined {
    for (const [ed25519Key, noiseId] of this.ed25519ToNoiseMap.entries()) {
      if (noiseId === noisePeerId) return ed25519Key
    }
    return undefined
  }

  /**
   * Broadcast a message to all connected peers subscribed to a topic
   */
  async broadcast(type: ProtocolMessageType, payload: unknown): Promise<void> {
    const peers = useNetworkStore.getState().peers
    const connectedPeers = Object.values(peers).filter((p) => p.connected)
    const bcastMsg = `[P2PService] broadcast: type=${type} | total peers=${Object.keys(peers).length} | connected=${connectedPeers.length}`
    console.log(bcastMsg)
    try { window.asgard.debugLog(bcastMsg) } catch {}
    const promises = connectedPeers.map((p) =>
      this.sendMessage(p.id, type, payload).catch((err) => {
        const errMsg = `[P2PService] broadcast FAILED to peer ${p.id?.slice(0, 20)}: ${err instanceof Error ? err.message : String(err)}`
        console.error(errMsg)
        try { window.asgard.debugLog(errMsg) } catch {}
      })
    )
    await Promise.allSettled(promises)
    const doneMsg = `[P2PService] broadcast DONE: type=${type} | sent to ${connectedPeers.length} peers`
    console.log(doneMsg)
    try { window.asgard.debugLog(doneMsg) } catch {}
  }

  /**
   * Broadcast a message to specific peers by their Ed25519 public keys.
   * OPTIMIZATION: Only sends to group members instead of all connected peers.
   */
  async broadcastToPeers(
    peerPublicKeys: string[],
    type: ProtocolMessageType,
    payload: unknown
  ): Promise<{ sent: number; failed: number; unmapped: number }> {
    let sent = 0
    let failed = 0
    let unmapped = 0

    const promises = peerPublicKeys
      .map((ed25519Key) => {
        const noisePeerId = this.ed25519ToNoiseMap.get(ed25519Key)
        if (!noisePeerId) {
          unmapped++
          console.warn(`[P2PService] broadcastToPeers: no Noise mapping for ${ed25519Key.slice(0, 16)} — message dropped`)
          return null
        }
        return this.sendMessage(noisePeerId, type, payload)
          .then(() => { sent++ })
          .catch((err) => {
            failed++
            console.error(`[P2PService] broadcastToPeers FAILED to ${ed25519Key.slice(0, 16)}:`, err)
          })
      })
      .filter(Boolean) as Promise<void>[]

    await Promise.allSettled(promises)

    if (unmapped > 0 || failed > 0) {
      const logMsg = `[P2PService] broadcastToPeers: type=${type} | sent=${sent} | failed=${failed} | unmapped=${unmapped} | total=${peerPublicKeys.length}`
      console.warn(logMsg)
      try { window.asgard.debugLog(logMsg) } catch {}
    }

    return { sent, failed, unmapped }
  }

  /**
   * PERFORMANCE: Get list of connected peer IDs (Ed25519 public keys).
   * Used for ping/pong latency measurement.
   */
  getConnectedPeers(): string[] {
    const peers = useNetworkStore.getState().peers
    return Object.values(peers)
      .filter((p) => p.connected)
      .map((p) => p.id)
  }

  /**
   * PERFORMANCE: Establish a direct connection to a known peer.
   * Bypasses DHT lookup for faster reconnection to favorite contacts.
   */
  async joinPeer(noisePublicKeyHex: string): Promise<void> {
    await window.asgard.network.joinPeer(noisePublicKeyHex)
  }

  /**
   * Wait for a peer to be connected with open channels.
   * Translates Ed25519 key to Noise key for the check.
   */
  async waitForPeer(ed25519PeerId: string, timeoutMs: number = 15000): Promise<boolean> {
    const noisePeerId = this.ed25519ToNoiseMap.get(ed25519PeerId) ?? ed25519PeerId
    return await window.asgard.network.waitForPeer(noisePeerId, timeoutMs)
  }

  /**
   * Stop attempting direct connections to a known peer.
   */
  async leavePeer(noisePublicKeyHex: string): Promise<void> {
    await window.asgard.network.leavePeer(noisePublicKeyHex)
  }

  /**
   * PERFORMANCE: Suspend the swarm to save battery when app is in background.
   * Disconnects all peers and stops discovery.
   */
  async suspendSwarm(): Promise<void> {
    await window.asgard.network.suspend()
  }

  /**
   * Resume a suspended swarm, reannouncing to DHT and reconnecting to peers.
   */
  async resumeSwarm(): Promise<void> {
    await window.asgard.network.resume()
  }

  /**
   * PERFORMANCE: Wait for all pending DHT announces and peer connections.
   */
  async flush(): Promise<void> {
    await window.asgard.network.flush()
  }

  /**
   * PERFORMANCE: Block/unblock a peer via the DHT firewall.
   * Blocked peers are immediately rejected on future connection attempts.
   */
  async blockPeer(noisePublicKeyHex: string, blocked = true): Promise<void> {
    await window.asgard.network.blockPeer(noisePublicKeyHex, blocked)
  }

  /**
   * Get peer quality scores for diagnostics.
   */
  async getPeerScores(): Promise<Record<string, { latency: number; score: number }>> {
    return await window.asgard.network.getPeerScores()
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval)
      this.statusInterval = null
    }
    this.cleanup.forEach((fn) => fn())
    this.cleanup = []
    this.initialized = false
    this.removeAllListeners()
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async handleRawMessage(raw: { from: string; data: Uint8Array; timestamp: number }): Promise<void> {
    try {
      const text = new TextDecoder().decode(raw.data)
      const msg = JSON.parse(text)
      console.log('[P2PService] === MESSAGE RECEIVED:', msg.type, '| from:', msg.from?.slice(0, 20))

      // HOLEPUNCH SECURITY: Rate limiting — reject messages from peers exceeding the rate limit.
      // This prevents message flooding attacks that could overwhelm the application.
      const now = Date.now()
      let rateEntry = this.messageRateMap.get(msg.from)
      if (!rateEntry || (now - rateEntry.windowStart) > P2PService.RATE_LIMIT_WINDOW_MS) {
        rateEntry = { count: 0, windowStart: now }
        this.messageRateMap.set(msg.from, rateEntry)
      }
      rateEntry.count++
      if (rateEntry.count > P2PService.RATE_LIMIT_MAX_MESSAGES) {
        console.warn('[P2PService] !!! RATE LIMIT exceeded from:', msg.from?.slice(0, 32), '| count:', rateEntry.count, 'in', P2PService.RATE_LIMIT_WINDOW_MS / 1000, 's')
        return // Drop flood messages
      }
      // Clean up stale rate limit entries periodically
      if (this.messageRateMap.size > 500) {
        for (const [key, entry] of this.messageRateMap) {
          if (now - entry.windowStart > P2PService.RATE_LIMIT_WINDOW_MS * 2) {
            this.messageRateMap.delete(key)
          }
        }
      }

      // Replay attack protection — deduplicate by (from, seq)
      const msgKey = `${msg.from}:${msg.seq}`
      if (this.seenMessages.has(msgKey)) {
        console.log('[P2PService] ⚠️ DEDUP skip:', msg.type, '| key:', msgKey.slice(0, 40))
        return
      }
      this.seenMessages.add(msgKey)

      // Prune old entries to prevent memory growth
      if (this.seenMessages.size > 10000) {
        const entries = Array.from(this.seenMessages)
        this.seenMessages = new Set(entries.slice(entries.length - 5000))
      }

      // PERFORMANCE: Skip signature verification for unsigned (ephemeral) messages
      if (!msg.unsigned) {
        const { signature, ...msgWithoutSig } = msg
        const valid = await cryptoService.verify(msgWithoutSig, signature, msg.from)
        if (!valid) {
          console.warn('[P2PService] !!! INVALID SIGNATURE from:', msg.from?.slice(0, 32))
          return
        }
      }

      // Emit typed event
      console.log('[P2PService] Dispatching event: message:' + msg.type, '| from:', msg.from?.slice(0, 20), '| unsigned:', msg.unsigned)
      this.emit(`message:${msg.type}`, msg)
      this.emit('message', msg)
    } catch (err) {
      console.error('[P2PService] Failed to process message:', err)
    }
  }

  // ─── Custom Channel Management (Protomux-inspired) ─────────────────────

  private customChannels: Map<string, ChannelConfig> = new Map()
  private channelStats: Map<string, ChannelStats> = new Map()

  /**
   * Create a custom channel for specific message types.
   */
  createChannel(config: ChannelConfig): void {
    this.customChannels.set(config.name, config)
    this.channelStats.set(config.name, {
      name: config.name,
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      createdAt: Date.now(),
    })
    console.log(`[P2PService] Custom channel created: ${config.name} (priority: ${config.priority})`)
  }

  /**
   * Delete a custom channel.
   */
  deleteChannel(channelName: string): void {
    this.customChannels.delete(channelName)
    this.channelStats.delete(channelName)
    console.log(`[P2PService] Custom channel deleted: ${channelName}`)
  }

  /**
   * Get a custom channel configuration.
   */
  getChannel(channelName: string): ChannelConfig | null {
    return this.customChannels.get(channelName) || null
  }

  /**
   * Get all custom channels.
   */
  getChannels(): ChannelConfig[] {
    return Array.from(this.customChannels.values())
  }

  /**
   * Update channel statistics.
   */
  updateChannelStats(channelName: string, sent: number, received: number): void {
    const stats = this.channelStats.get(channelName)
    if (stats) {
      stats.messagesSent += sent
      stats.messagesReceived += received
      stats.bytesSent += sent * 100 // Approximate
      stats.bytesReceived += received * 100
    }
  }

  /**
   * Get channel statistics.
   */
  getChannelStats(channelName: string): ChannelStats | null {
    return this.channelStats.get(channelName) || null
  }

  /**
   * Get all channel statistics.
   */
  getAllChannelStats(): ChannelStats[] {
    return Array.from(this.channelStats.values())
  }

  // ─── Priority Routing (Protomux-inspired) ──────────────────────────────

  private priorityRules: Map<string, PriorityRule> = new Map()

  /**
   * Add a priority rule for message routing.
   */
  addPriorityRule(rule: PriorityRule): void {
    this.priorityRules.set(rule.id, rule)
    console.log(`[P2PService] Priority rule added: ${rule.messageType} -> priority ${rule.priority}`)
  }

  /**
   * Remove a priority rule.
   */
  removePriorityRule(ruleId: string): void {
    this.priorityRules.delete(ruleId)
    console.log(`[P2PService] Priority rule removed: ${ruleId}`)
  }

  /**
   * Get priority for a message type.
   */
  getMessagePriority(messageType: string): number {
    // Check custom rules first
    for (const rule of this.priorityRules.values()) {
      if (rule.messageType === messageType) {
        return rule.priority
      }
    }

    // Default priorities
    const defaults: Record<string, number> = {
      'call:offer': 10,
      'call:media': 9,
      'message:chat': 5,
      'presence:typing': 1,
      'presence:update': 1,
    }

    return defaults[messageType] || 3
  }

  /**
   * Get all priority rules.
   */
  getPriorityRules(): PriorityRule[] {
    return Array.from(this.priorityRules.values())
  }

  // ─── Message Routing (Protomux-inspired) ───────────────────────────────

  private routingTable: Map<string, RoutingEntry> = new Map()

  /**
   * Add a routing entry.
   */
  addRoute(destination: string, via: string, cost: number = 1): void {
    this.routingTable.set(destination, {
      destination,
      via,
      cost,
      addedAt: Date.now(),
    })
    console.log(`[P2PService] Route added: ${destination} via ${via} (cost: ${cost})`)
  }

  /**
   * Remove a routing entry.
   */
  removeRoute(destination: string): void {
    this.routingTable.delete(destination)
    console.log(`[P2PService] Route removed: ${destination}`)
  }

  /**
   * Get route for a destination.
   */
  getRoute(destination: string): RoutingEntry | null {
    return this.routingTable.get(destination) || null
  }

  /**
   * Get all routes.
   */
  getRoutes(): RoutingEntry[] {
    return Array.from(this.routingTable.values())
  }

  /**
   * Find best route to destination.
   */
  findBestRoute(destination: string): RoutingEntry | null {
    const routes = Array.from(this.routingTable.values())
      .filter(r => r.destination === destination)
      .sort((a, b) => a.cost - b.cost)
    return routes.length > 0 ? routes[0] : null
  }

  /**
   * Get routing statistics.
   */
  getRoutingStats(): {
    totalRoutes: number
    averageCost: number
    destinations: string[]
  } {
    const routes = Array.from(this.routingTable.values())
    const averageCost = routes.length > 0
      ? routes.reduce((sum, r) => sum + r.cost, 0) / routes.length
      : 0

    return {
      totalRoutes: routes.length,
      averageCost,
      destinations: [...new Set(routes.map(r => r.destination))],
    }
  }
}

export const p2pService = P2PService.getInstance()

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChannelConfig {
  name: string
  priority: number
  messageTypes: string[]
  encrypted: boolean
  description?: string
}

interface ChannelStats {
  name: string
  messagesSent: number
  messagesReceived: number
  bytesSent: number
  bytesReceived: number
  createdAt: number
}

interface PriorityRule {
  id: string
  messageType: string
  priority: number
  description?: string
}

interface RoutingEntry {
  destination: string
  via: string
  cost: number
  addedAt: number
}
