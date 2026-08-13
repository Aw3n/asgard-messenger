import { EventEmitter } from 'events'
import { appendFileSync } from 'fs'
import { join } from 'path'
import os from 'os'

// DIAGNOSTICS: File-based logging for main process
// Cross-platform log directory: Windows APPDATA, Linux/macOS HOME
const LOG_FILE = join(
  process.env.APPDATA || (process.platform === 'darwin' ? join(os.homedir(), 'Library', 'Logs') : os.homedir()),
  'asgard-network.log'
)
function logMain(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try { appendFileSync(LOG_FILE, line) } catch {}
  console.log(msg)
}

/**
 * NetworkService — manages Hyperswarm P2P connections using the Pear stack.
 *
 * Uses:
 * - Hyperswarm for peer discovery and encrypted connections
 * - Protomux for protocol multiplexing over each connection
 * - Corestore for automatic data replication on connect
 *
 * Hyperswarm sockets (@hyperswarm/secret-stream) are already framed,
 * so no manual length-prefix framing is needed.
 */
export class NetworkService extends EventEmitter {
  private swarm: HyperswarmInstance | null = null
  private peers: Map<string, PeerConnection> = new Map()
  private topics: Set<string> = new Set()
  private bandwidth = { up: 0, down: 0 }
  // PERFORMANCE: Sliding window bandwidth averaging for accurate display
  private bandwidthWindow: { up: number[]; down: number[]; timestamps: number[] } = { up: [], down: [], timestamps: [] }
  private static readonly BANDWIDTH_WINDOW_MS = 3000 // 3s sliding window
  private initialized = false
  private corestore: CorestoreLike | null = null
  private seed: Buffer | null = null
  private initPromise: Promise<void> | null = null
  private localPublicKey: string | null = null
  private peerPublicKeyMap: Map<string, string> = new Map() // Hyperswarm peerId → Ed25519 pk
  private peerChannels: Map<string, { main: any; media: any; file: any }> = new Map() // Protomux channels per peer
  private peerInfos: Map<string, any> = new Map() // PeerInfo for prioritization
  // PERFORMANCE: Track peer latency for smart routing
  private peerLatency: Map<string, number> = new Map() // peerId → last ping RTT (ms)
  private peerScores: Map<string, number> = new Map() // peerId → quality score (0-100)
  // Blocked peers (firewall)
  private blockedPeers: Set<string> = new Set()
  // PERFORMANCE: Periodic re-announce timer for DHT freshness
  private reannounceInterval: ReturnType<typeof setInterval> | null = null
  private static readonly REANNOUNCE_INTERVAL_MS = 120_000 // 2 minutes
  // PERFORMANCE: Peer score update timer
  private scoreUpdateInterval: ReturnType<typeof setInterval> | null = null
  private static readonly SCORE_UPDATE_INTERVAL_MS = 15_000 // 15s
  // DHT Profile publishing
  private profileRepublishInterval: ReturnType<typeof setInterval> | null = null
  private static readonly PROFILE_REPUBLISH_INTERVAL_MS = 300_000 // 5 minutes
  private lastDisplayName = ''
  private profileCache: Map<string, { data: DHTProfile; timestamp: number }> = new Map()
  private static readonly PROFILE_CACHE_TTL_MS = 60_000 // 1 minute cache
  // STATUS: Current user online status — extended to support all UserStatus values
  private currentStatus: 'online' | 'away' | 'offline' | 'dnd' = 'online'
  private currentStatusMessage: string | undefined
  // CONNECTIVITY: Network status monitoring
  private isOnline = true
  private lastNetworkChange = 0
  private reconnectAttempts: Map<string, number> = new Map() // peerId -> attempt count
  private static readonly MAX_RECONNECT_ATTEMPTS = 5
  private static readonly RECONNECT_BACKOFF_MS = 2000 // 2s base backoff
  // DIAGNOSTICS: Track media sends per peer
  private _mediaSendCount: Map<string, number> | null = null
  // DIAGNOSTICS: Track media receives per peer
  private _mediaRecvCount: Map<string, number> | null = null
  // DIAGNOSTICS: Track file channel receives per peer
  private _fileRecvCount: Map<string, number> | null = null

  constructor() {
    super()
    // Defer initialization until seed is provided via setSeed()
    // This ensures a deterministic Noise keypair for stable peer identity
  }

  /**
   * Set the identity seed for deterministic Hyperswarm keypair generation.
   * Must be called before any network operations.
   * The seed is derived from the user's Ed25519 public key to ensure
   * the same peer ID across app restarts.
   */
  async setSeed(seedHex: string): Promise<void> {
    this.seed = Buffer.from(seedHex, 'hex')
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * Provide a Corestore instance for automatic replication on peer connect.
   * Must be called before or after construction; replication activates dynamically.
   */
  setCorestore(store: CorestoreLike): void {
    this.corestore = store
  }

  /**
   * Set the local Ed25519 public key (hex) for identity exchange with peers.
   * This allows mapping Hyperswarm Noise peer IDs to application-level Ed25519 keys.
   */
  setLocalPublicKey(publicKeyHex: string): void {
    this.localPublicKey = publicKeyHex
    console.log('[NetworkService] Local Ed25519 public key set:', publicKeyHex.slice(0, 32) + '...')
  }

  /**
   * Get the mapping of Hyperswarm peer IDs to Ed25519 public keys.
   */
  getPeerPublicKeyMap(): Map<string, string> {
    return this.peerPublicKeyMap
  }

  /**
   * Helper to access the underlying HyperDHT instance with proper typing.
   */
  private getDHT(): DHTLike | undefined {
    return (this.swarm as unknown as { dht?: DHTLike }).dht
  }

  /**
   * Initializes Hyperswarm instance
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Dynamic import for ESM-only packages
      const { default: Hyperswarm } = await import('hyperswarm') as unknown as { default: HyperswarmConstructor }

      const swarmOpts: {
        maxPeers: number
        firewall: (key: Buffer) => boolean
        seed?: Buffer
        connectionKeepAlive?: number
        maxConnections?: number
        ephemeral?: boolean
      } = {
        maxPeers: 64,
        // CONNECTIVITY: Allow more simultaneous connection attempts
        maxConnections: 128,
        // CRITICAL: Non-ephemeral nodes announce themselves to the DHT as reachable servers.
        // Without this, contacts cannot discover or reconnect to us when we are online.
        ephemeral: false,
        // PERFORMANCE: Firewall blocks known-banned peers
        firewall: (remotePublicKey: Buffer) => {
          const hex = remotePublicKey.toString('hex')
          if (this.blockedPeers.has(hex)) {
            console.log('[NetworkService] Firewall blocked peer:', hex.slice(0, 16))
            return true // Reject
          }
          return false // Allow
        },
        // CONNECTIVITY: Keep-alive at 15s to avoid premature disconnections on idle links.
        // Default is 5000ms; 15s balances NAT timeout tolerance with fast dead-peer detection.
        connectionKeepAlive: 15000,
      }

      // Use deterministic seed if available — ensures stable peer ID across restarts
      if (this.seed) {
        swarmOpts.seed = this.seed
        console.log('[NetworkService] Using deterministic identity seed')
      } else {
        console.warn('[NetworkService] No identity seed — peer ID will be random')
      }

      this.swarm = new Hyperswarm(swarmOpts)

      // CONNECTIVITY: Configure underlying DHT for faster hole punching
      // randomPunchInterval: reduce from default 20s to 5s for faster peer discovery/reconnection
      const dht = this.getDHT()
      if (dht) {
        dht.randomPunchInterval = 5000
        console.log('[NetworkService] DHT randomPunchInterval set to 5s (was 20s default)')

        // HOLEPUNCH BEST PRACTICE: Republish profile/status when the node becomes
        // persistent (non-ephemeral) and after wake-up from sleep.
        const handlePersistent = () => {
          console.log('[NetworkService] DHT became persistent — republishing profile')
          if (this.lastDisplayName) this.publishProfile(this.lastDisplayName).catch(() => {})
          this.publishStatus(this.currentStatus, this.currentStatusMessage).catch(() => {})
        }
        const handleWakeUp = () => {
          console.log('[NetworkService] DHT wake-up detected — republishing profile')
          if (this.lastDisplayName) this.publishProfile(this.lastDisplayName).catch(() => {})
          this.publishStatus(this.currentStatus, this.currentStatusMessage).catch(() => {})
        }
        dht.on('persistent', handlePersistent)
        dht.on('wake-up', handleWakeUp)
      }

      // Handle new peer connections
      this.swarm.on('connection', (conn: PeerSocket, info: PeerInfo) => {
        const peerId = info.publicKey.toString('hex')
        console.log('[NetworkService] === PEER CONNECTED ===', peerId.slice(0, 32), '| localPublicKey set:', !!this.localPublicKey)
        this.handleConnection(conn, info)
      })

      // PERFORMANCE: Listen for swarm updates to push status to UI
      this.swarm.on('update', () => {
        this.emit('status:update', this.getStatus())
      })

      // PERFORMANCE: Listen for peer ban events for UI feedback
      this.swarm.on('ban', (info: PeerInfo, err: Error | undefined) => {
        const peerId = info.publicKey.toString('hex')
        console.log('[NetworkService] Peer banned:', peerId.slice(0, 16), err?.message ?? '')
        this.emit('peer:banned', { peerId, reason: err?.message })
      })

      this.initialized = true
      console.log('[NetworkService] Initialized Hyperswarm (keepAlive=3s)')

      // PERFORMANCE: Periodic re-announce to keep DHT entries fresh
      this.reannounceInterval = setInterval(() => {
        this.reannounceTopics()
      }, NetworkService.REANNOUNCE_INTERVAL_MS)

      // PERFORMANCE: Periodic peer score update based on connection health
      this.scoreUpdateInterval = setInterval(() => {
        this.updatePeerScores()
      }, NetworkService.SCORE_UPDATE_INTERVAL_MS)
    } catch (err) {
      console.error('[NetworkService] Failed to initialize:', err)
    }
  }

  /**
   * Publish user profile to the DHT as a mutable record.
   * This allows contacts to find our profile even without a direct connection.
   * PERFORMANCE: Republishes periodically to keep the record fresh.
   */
  async publishProfile(displayName: string, _avatar?: string): Promise<boolean> {
    if (!this.swarm) return false
    this.lastDisplayName = displayName
    try {
      // Ensure the DHT is fully bootstrapped before publishing (lighter than flush()).
      const dht = this.getDHT()
      if (!dht) {
        console.warn('[NetworkService] DHT not available for profile publishing')
        return false
      }
      await dht.fullyBootstrapped().catch(() => {})

      // CRITICAL: DHT mutable records have a ~1000 byte limit.
      // Never include avatar (can be 3.8MB) — it's sent via media channel.
      const profile: DHTProfile = {
        displayName,
        timestamp: Date.now(),
        version: 2,
        status: this.currentStatus,
        statusMessage: this.currentStatusMessage,
      }

      const value = Buffer.from(JSON.stringify(profile))
      if (value.length > 1000) {
        console.warn('[NetworkService] Profile too large for DHT:', value.length, 'bytes — truncating')
        // Truncate displayName to fit
        const trimmed = { displayName: displayName.slice(0, 50), timestamp: Date.now(), version: 1 }
        const trimmedValue = Buffer.from(JSON.stringify(trimmed))
        const keyPair = (this.swarm as unknown as { keyPair?: { publicKey: Buffer; secretKey: Buffer } }).keyPair
        if (!keyPair) return false
        await dht.mutablePut(keyPair, trimmedValue)
        return true
      }
      const keyPair = (this.swarm as unknown as { keyPair?: { publicKey: Buffer; secretKey: Buffer } }).keyPair
      if (!keyPair) {
        console.warn('[NetworkService] No keyPair available for profile publishing')
        return false
      }

      await dht.mutablePut(keyPair, value)
      console.log('[NetworkService] Profile published to DHT:', displayName)

      // Start periodic republish if not already running
      if (!this.profileRepublishInterval) {
        this.profileRepublishInterval = setInterval(() => {
          this.publishProfile(this.lastDisplayName).catch(() => {})
          this.publishStatus(this.currentStatus, this.currentStatusMessage).catch(() => {})
        }, NetworkService.PROFILE_REPUBLISH_INTERVAL_MS)
      }

      return true
    } catch (err) {
      console.error('[NetworkService] Failed to publish profile:', err)
      return false
    }
  }

  /**
   * Publish user online status to the DHT.
   * Allows contacts to see if user is online/away/offline/dnd.
   */
  async publishStatus(status: 'online' | 'away' | 'offline' | 'dnd', statusMessage?: string): Promise<boolean> {
    this.currentStatus = status
    this.currentStatusMessage = statusMessage

    if (!this.swarm) return false
    try {
      const dht = this.getDHT()
      if (!dht) return false

      // Ensure the DHT is bootstrapped before publishing status.
      await dht.fullyBootstrapped().catch(() => {})

      // First fetch existing profile to preserve displayName
      const keyPair = (this.swarm as unknown as { keyPair?: { publicKey: Buffer; secretKey: Buffer } }).keyPair
      if (!keyPair) return false

      let existingProfile: Partial<DHTProfile> = {}
      try {
        const existing = await dht.mutableGet(keyPair.publicKey, { latest: true }) as { value?: Buffer } | null
        if (existing?.value) {
          existingProfile = JSON.parse(existing.value.toString())
        }
      } catch {}

      const profile: DHTProfile = {
        displayName: existingProfile.displayName || 'Unknown',
        timestamp: Date.now(),
        version: 2,
        status,
        statusMessage,
        lastSeen: status === 'offline' ? Date.now() : existingProfile.lastSeen,
      }

      const value = Buffer.from(JSON.stringify(profile))
      if (value.length > 1000) {
        // Truncate statusMessage to fit
        profile.statusMessage = statusMessage?.slice(0, 100)
        const trimmedValue = Buffer.from(JSON.stringify(profile))
        await dht.mutablePut(keyPair, trimmedValue)
      } else {
        await dht.mutablePut(keyPair, value)
      }

      console.log('[NetworkService] Status published to DHT:', status)
      return true
    } catch (err) {
      console.error('[NetworkService] Failed to publish status:', err)
      return false
    }
  }

  /**
   * Get current user status.
   */
  getCurrentStatus(): { status: string; message?: string } {
    return { status: this.currentStatus, message: this.currentStatusMessage }
  }

  /**
   * Store an immutable value in the DHT.
   * The value is hashed and cannot be modified. Use for public data like verification keys.
   * Returns the hash (SHA256) of the stored value.
   */
  async immutablePut(value: Buffer): Promise<string | null> {
    if (!this.swarm) return null
    try {
      const dht = this.getDHT()
      if (!dht) return null

      const result = await dht.immutablePut(value)
      const hash = result.hash.toString('hex')
      console.log('[NetworkService] Immutable record stored in DHT, hash:', hash.slice(0, 16))
      return hash
    } catch (err) {
      console.error('[NetworkService] Failed to store immutable record:', err)
      return null
    }
  }

  /**
   * Fetch an immutable value from the DHT by its hash.
   * Returns the value or null if not found.
   */
  async immutableGet(hash: string): Promise<Buffer | null> {
    if (!this.swarm) return null
    try {
      const dht = this.getDHT()
      if (!dht) return null

      const hashBuffer = Buffer.from(hash, 'hex')
      const result = await dht.immutableGet(hashBuffer)
      if (!result?.value) return null

      console.log('[NetworkService] Immutable record fetched from DHT, hash:', hash.slice(0, 16))
      return result.value
    } catch (err) {
      console.error('[NetworkService] Failed to fetch immutable record:', err)
      return null
    }
  }

  /**
   * Fetch a contact's profile from the DHT.
   * Uses a local cache to avoid excessive DHT queries.
   */
  async fetchProfile(publicKeyHex: string): Promise<DHTProfile | null> {
    if (!this.swarm) return null

    // Check cache first
    const cached = this.profileCache.get(publicKeyHex)
    if (cached && Date.now() - cached.timestamp < NetworkService.PROFILE_CACHE_TTL_MS) {
      return cached.data
    }

    try {
      const dht = this.getDHT()
      if (!dht) return null

      // CRITICAL: The DHT mutable record key is NOT the raw Ed25519 public key.
      // setIdentity derives the Hyperswarm seed as sha256(ed25519PublicKeyHex),
      // and Hyperswarm derives its keyPair from that seed. We must derive the
      // same keyPair here so the lookup matches the published record.
      const crypto = await import('crypto')
      const seed = crypto.createHash('sha256').update(publicKeyHex).digest()
      const HyperDHT = await import('hyperdht')
      const keyPair = HyperDHT.default.keyPair(seed)
      const publicKey = keyPair.publicKey

      // Try up to 2 times — DHT lookups can fail on first try due to propagation
      let result: { value?: Buffer } | null = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await dht.mutableGet(publicKey, { latest: true }) as { value?: Buffer } | null
          if (result?.value) break
          // Wait briefly before retry
          if (attempt < 1) await new Promise(r => setTimeout(r, 2000))
        } catch {
          if (attempt < 1) await new Promise(r => setTimeout(r, 2000))
        }
      }

      if (!result || !result.value) {
        console.log('[NetworkService] Profile not found in DHT:', publicKeyHex.slice(0, 16))
        return null
      }

      const profile: DHTProfile = JSON.parse(result.value.toString())

      // Cache the result
      this.profileCache.set(publicKeyHex, { data: profile, timestamp: Date.now() })

      console.log('[NetworkService] Profile fetched from DHT:', publicKeyHex.slice(0, 16), profile.displayName)
      return profile
    } catch (err) {
      console.error('[NetworkService] Failed to fetch profile:', err)
      return null
    }
  }

  /**
   * Clear the profile cache for a specific contact or all contacts.
   */
  clearProfileCache(publicKeyHex?: string): void {
    if (publicKeyHex) {
      this.profileCache.delete(publicKeyHex)
    } else {
      this.profileCache.clear()
    }
  }

  /**
   * Join a discovery topic (conversation, group, etc.)
   * PERFORMANCE: Uses flushed() + findingPeers() for optimal core replication.
   */
  async join(topicHex: string): Promise<void> {
    if (!this.swarm) {
      await this.waitForInit()
    }
    if (!this.swarm) throw new Error('Swarm not initialized')

    if (this.topics.has(topicHex)) return

    const topicBuffer = Buffer.from(topicHex, 'hex')
    const discovery = this.swarm.join(topicBuffer, { client: true, server: true })

    // PERFORMANCE: Signal to corestore that we're finding peers.
    // This allows core.update() to properly wait for replication data
    // instead of returning immediately with stale data.
    if (this.corestore) {
      try {
        const cores = (this.corestore as unknown as { getCores?: () => HypercoreLike[] }).getCores?.() ?? []
        for (const core of cores) {
          if (typeof (core as unknown as { findingPeers?: () => () => void }).findingPeers === 'function') {
            const done = (core as unknown as { findingPeers: () => () => void }).findingPeers()
            // Call done after discovery flushes
            discovery.flushed().then(() => done()).catch(() => done())
          }
        }
      } catch {
        // Ignore findingPeers errors — not critical
      }
    }

    await discovery.flushed()

    this.topics.add(topicHex)
    console.log('[NetworkService] Joined topic:', topicHex.slice(0, 16) + '...')
  }

  /**
   * CONNECTIVITY: Wait for all pending DHT announces and peer connections to complete.
   * Uses Hyperswarm's swarm.flush() for reliable peer discovery.
   */
  async flush(): Promise<void> {
    if (!this.swarm) return
    try {
      // Use swarm.flush() directly for complete discovery + connection wait
      await (this.swarm as unknown as { flush: () => Promise<void> }).flush()
    } catch {
      // Fallback: wait for individual topic discoveries
      const discoveries = Array.from(this.topics).map(async (topicHex) => {
        const topicBuffer = Buffer.from(topicHex, 'hex')
        const status = this.swarm!.status(topicBuffer)
        if (status?.flushed) {
          await status.flushed()
        }
      })
      await Promise.allSettled(discoveries)
    }
  }

  /**
   * Leave a discovery topic
   */
  async leave(topicHex: string): Promise<void> {
    if (!this.swarm) return

    const topicBuffer = Buffer.from(topicHex, 'hex')
    await this.swarm.leave(topicBuffer)
    this.topics.delete(topicHex)
  }

  /**
   * Derive the Hyperswarm Noise public key from an Ed25519 public key.
   *
   * CRITICAL: The Noise public key is NOT simply sha256(ed25519PublicKey).
   * It is HyperDHT.keyPair(sha256(ed25519PublicKey)).publicKey — an Ed25519
   * keypair derived from the seed. Using the raw sha256 hash as the Noise key
   * (as was previously done in App.tsx) means joinPeer() connects to a
   * non-existent peer and peers NEVER discover each other.
   *
   * The derivation MUST match what setSeed() + Hyperswarm does internally:
   *   seed = sha256(ed25519PublicKeyHex)
   *   noiseKeyPair = HyperDHT.keyPair(seed)
   *   noisePublicKey = noiseKeyPair.publicKey
   */
  async deriveNoisePublicKey(ed25519PublicKeyHex: string): Promise<string> {
    const crypto = await import('crypto')
    const seed = crypto.createHash('sha256').update(ed25519PublicKeyHex).digest()
    const HyperDHT = await import('hyperdht')
    const keyPair = HyperDHT.default.keyPair(seed)
    const noisePublicKeyHex = keyPair.publicKey.toString('hex')
    console.log('[NetworkService] deriveNoisePublicKey:', ed25519PublicKeyHex.slice(0, 16), '→', noisePublicKeyHex.slice(0, 16))
    return noisePublicKeyHex
  }

  /**
   * CONNECTIVITY: Establish a direct connection to a known peer.
   * Uses Hyperswarm's joinPeer() for fast reconnection without DHT lookup.
   * Ideal for favorite contacts and frequently called peers.
   *
   * IMPORTANT: noisePublicKeyHex must be derived via deriveNoisePublicKey(),
   * NOT a raw sha256 hash of the Ed25519 key.
   */
  joinPeer(noisePublicKeyHex: string): void {
    if (!this.swarm) return
    const keyBuffer = Buffer.from(noisePublicKeyHex, 'hex')
    this.swarm.joinPeer(keyBuffer)
    console.log('[NetworkService] joinPeer:', noisePublicKeyHex.slice(0, 16) + '...')
  }

  /**
   * CONNECTIVITY: Connect to a contact with prioritization.
   * Combines joinPeer() + prioritizePeer() for fastest possible connection.
   * Also resets reconnect attempts so the peer can retry if disconnected.
   */
  connectToContact(noisePublicKeyHex: string, prioritized: boolean = false): void {
    if (!this.swarm) return
    const keyBuffer = Buffer.from(noisePublicKeyHex, 'hex')

    // Reset reconnect attempts for this peer
    this.reconnectAttempts.delete(noisePublicKeyHex)

    // Join peer for discovery + direct connection
    this.swarm.joinPeer(keyBuffer)

    // If prioritized, mark the peer for rapid reconnection
    if (prioritized) {
      const peers = (this.swarm as unknown as { peers?: Map<string, { prioritized?: boolean }> }).peers
      const peerInfo = peers?.get(noisePublicKeyHex)
      if (peerInfo) {
        peerInfo.prioritized = true
      }
    }

    console.log('[NetworkService] connectToContact:', noisePublicKeyHex.slice(0, 16) + '...', prioritized ? '(prioritized)' : '')
  }

  /**
   * Stop attempting direct connections to a known peer.
   */
  leavePeer(noisePublicKeyHex: string): void {
    if (!this.swarm) return
    const keyBuffer = Buffer.from(noisePublicKeyHex, 'hex')
    this.swarm.leavePeer(keyBuffer)
    console.log('[NetworkService] leavePeer:', noisePublicKeyHex.slice(0, 16) + '...')
  }

  /**
   * PERFORMANCE: Suspend the swarm, disconnecting all peers and stopping discovery.
   * Useful when the app goes to background to save battery and network.
   */
  async suspend(): Promise<void> {
    if (!this.swarm) return
    await (this.swarm as unknown as { suspend: () => Promise<void> }).suspend()
    console.log('[NetworkService] Swarm suspended')
  }

  /**
   * Resume a suspended swarm, reannouncing to DHT and reconnecting to peers.
   */
  async resume(): Promise<void> {
    if (!this.swarm) return
    await (this.swarm as unknown as { resume: () => Promise<void> }).resume()
    console.log('[NetworkService] Swarm resumed')
  }

  /**
   * Check if a peer is currently connected with open channels.
   */
  isPeerConnected(peerId: string): boolean {
    const peer = this.peers.get(peerId)
    return !!peer && !!peer.sendMessage
  }

  /**
   * Wait for a peer to connect with a timeout.
   * Returns true if connected, false if timeout reached.
   */
  async waitForPeer(peerId: string, timeoutMs: number = 15000): Promise<boolean> {
    if (this.isPeerConnected(peerId)) return true

    return new Promise<boolean>((resolve) => {
      const startTime = Date.now()

      const checkInterval = setInterval(() => {
        if (this.isPeerConnected(peerId)) {
          clearInterval(checkInterval)
          resolve(true)
          return
        }
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval)
          console.warn(`[NetworkService] waitForPeer timeout for ${peerId.slice(0, 16)} after ${timeoutMs}ms`)
          resolve(false)
        }
      }, 200) // Check every 200ms
    })
  }

  /**
   * Send data to a specific peer via Protomux channel.
   * PERFORMANCE: Tracks bandwidth with sliding window averaging.
   * FALLBACK: If peerId is an Ed25519 public key (not a Noise peer id),
   * resolve it via the peerPublicKeyMap reverse lookup.
   */
  async send(peerId: string, data: Uint8Array): Promise<void> {
    let peer = this.peers.get(peerId)
    if (!peer) {
      // The renderer often passes the Ed25519 public key as peerId.
      // Resolve it to the Noise peer id that indexes this.peers.
      const noiseId = this.resolveNoisePeerId(peerId)
      if (noiseId) {
        peer = this.peers.get(noiseId)
      }
    }
    if (!peer) {
      throw new Error(`Peer ${peerId.slice(0, 16)} not found`)
    }
    if (!peer.sendMessage) {
      throw new Error(`Protomux channel not ready for peer ${peerId.slice(0, 16)}`)
    }

    // PERFORMANCE: Avoid unnecessary Buffer copy if data is already a Buffer
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
    peer.sendMessage.send(buf)
    this.trackBandwidth(buf.length, 0)
  }

  /**
   * Resolve an Ed25519 public key to the corresponding Noise peer id.
   * Used when the renderer sends with the contact's Ed25519 key but the
   * main process indexes peers by Noise (Hyperswarm) peer id.
   */
  private resolveNoisePeerId(ed25519OrNoiseId: string): string | null {
    for (const [noiseId, ed25519] of this.peerPublicKeyMap.entries()) {
      if (ed25519 === ed25519OrNoiseId) {
        return noiseId
      }
    }
    return null
  }

  /**
   * Send media data (audio/video chunks, avatars) to a specific peer.
   * PERFORMANCE: Sends via main channel with 0x02 header byte for reliability.
   */
  async sendMedia(peerId: string, data: Uint8Array): Promise<void> {
    let peer = this.peers.get(peerId)
    if (!peer) {
      // Resolve Ed25519 → Noise peer id (same fallback as send())
      const noiseId = this.resolveNoisePeerId(peerId)
      if (noiseId) {
        peer = this.peers.get(noiseId)
      }
    }
    if (!peer) {
      logMain(`[sendMedia] ❌ peer not found: ${peerId.slice(0, 16)}`)
      return
    }

    // CONNECTIVITY: Use dedicated media channel (Protomux 'asgard-media') for audio/video.
    if (peer.sendMedia) {
      try {
        peer.sendMedia.send(Buffer.from(data))
        this.trackBandwidth(data.length, 0)
        // DIAGNOSTICS: Log first few sends
        if (!this._mediaSendCount) this._mediaSendCount = new Map()
        const count = (this._mediaSendCount.get(peerId) ?? 0) + 1
        this._mediaSendCount.set(peerId, count)
        if (count <= 3) {
          logMain(`[sendMedia] ✅ Media channel send #${count} to ${peerId.slice(0, 16)}, size: ${data.length}`)
        }
      } catch (err) {
        logMain(`[sendMedia] ❌ Media channel send failed: ${err}`)
      }
      return
    }

    // FALLBACK: If media channel is not available, use main channel with 0x02 framing.
    if (peer.sendMessage) {
      const framed = Buffer.alloc(1 + data.length)
      framed[0] = 0x02
      Buffer.from(data).copy(framed, 1)
      try {
        peer.sendMessage.send(framed)
        this.trackBandwidth(framed.length, 0)
        logMain(`[sendMedia] ⚠️ Fallback main channel send to ${peerId.slice(0, 16)}, size: ${framed.length}`)
      } catch (err) {
        logMain(`[sendMedia] ❌ Main channel fallback send failed: ${err}`)
      }
      return
    }

    logMain(`[sendMedia] ❌ No channels available for peer: ${peerId.slice(0, 16)}`)
  }

  /**
   * HOLEPUNCH PATTERN: Batch-send multiple media chunks with cork/uncork for optimal throughput.
   * Cork buffers all messages, then uncork flushes them in a single batch — reducing per-packet
   * framing overhead by ~80% for small audio chunks.
   *
   * This is the recommended Protomux pattern for real-time streaming:
   * channel.cork() → N×message.send() → channel.uncork()
   */
  async sendMediaBatch(peerId: string, chunks: Uint8Array[]): Promise<void> {
    if (chunks.length === 0) return

    let peer = this.peers.get(peerId)
    if (!peer) {
      const noiseId = this.resolveNoisePeerId(peerId)
      if (noiseId) peer = this.peers.get(noiseId)
    }
    if (!peer) {
      logMain(`[sendMediaBatch] ❌ peer not found: ${peerId.slice(0, 16)}`)
      return
    }

    // CRITICAL: Cork the media channel to batch all sends
    const channels = this.peerChannels.get(peerId)
    if (channels?.media?.cork) {
      channels.media.cork()
    }

    try {
      for (const data of chunks) {
        if (peer.sendMedia) {
          try {
            peer.sendMedia.send(Buffer.from(data))
            this.trackBandwidth(data.length, 0)
          } catch (err) {
            logMain(`[sendMediaBatch] ❌ send failed: ${err}`)
            break
          }
        } else if (peer.sendMessage) {
          // Fallback: main channel with 0x02 framing
          const framed = Buffer.alloc(1 + data.length)
          framed[0] = 0x02
          Buffer.from(data).copy(framed, 1)
          try {
            peer.sendMessage.send(framed)
            this.trackBandwidth(framed.length, 0)
          } catch (err) {
            logMain(`[sendMediaBatch] ❌ fallback send failed: ${err}`)
            break
          }
        } else {
          break
        }
      }
    } finally {
      // CRITICAL: Uncork to flush all buffered messages in a single batch
      if (channels?.media?.uncork) {
        channels.media.uncork()
      }
    }
  }

  /**
   * Send file transfer data to a specific peer via the dedicated 'asgard-files' Protomux channel.
   * HOLEPUNCH PATTERN: Each protocol type gets its own Protomux channel for isolation
   * and independent backpressure. File transfers don't interfere with audio/video.
   *
   * Falls back to the media channel if the file channel is unavailable (older peer).
   */
  async sendFileData(peerId: string, data: Uint8Array): Promise<void> {
    let peer = this.peers.get(peerId)
    if (!peer) {
      const noiseId = this.resolveNoisePeerId(peerId)
      if (noiseId) {
        peer = this.peers.get(noiseId)
      }
    }
    if (!peer) {
      logMain(`[sendFile] ❌ peer not found: ${peerId.slice(0, 16)}`)
      return
    }

    // Use dedicated file channel (Protomux 'asgard-files')
    if (peer.sendFile) {
      try {
        peer.sendFile.send(Buffer.from(data))
        this.trackBandwidth(data.length, 0)
      } catch (err) {
        logMain(`[sendFile] ❌ File channel send failed: ${err}`)
      }
      return
    }

    // FALLBACK: If file channel is not available, use media channel with 0x04 marker.
    // The marker distinguishes file data from audio/video on the shared media channel.
    if (peer.sendMedia) {
      try {
        const framed = Buffer.alloc(1 + data.length)
        framed[0] = 0x04 // FILE_TRANSFER_MARKER
        Buffer.from(data).copy(framed, 1)
        peer.sendMedia.send(framed)
        this.trackBandwidth(framed.length, 0)
        logMain(`[sendFile] ⚠️ Fallback to media channel for ${peerId.slice(0, 16)}`)
      } catch (err) {
        logMain(`[sendFile] ❌ Media channel fallback send failed: ${err}`)
      }
      return
    }

    logMain(`[sendFile] ❌ No channels available for peer: ${peerId.slice(0, 16)}`)
  }

  /**
   * PERFORMANCE: Track bandwidth with sliding window averaging.
   * Provides accurate KB/s display instead of cumulative totals.
   */
  private trackBandwidth(upBytes: number, downBytes: number): void {
    const now = Date.now()
    if (upBytes > 0) {
      this.bandwidth.up += upBytes
      this.bandwidthWindow.up.push(upBytes)
      this.bandwidthWindow.timestamps.push(now)
    }
    if (downBytes > 0) {
      this.bandwidth.down += downBytes
      this.bandwidthWindow.down.push(downBytes)
      if (this.bandwidthWindow.timestamps.length <= this.bandwidthWindow.up.length + this.bandwidthWindow.down.length) {
        // Already pushed above
      } else {
        this.bandwidthWindow.timestamps.push(now)
      }
    }
    // Prune old entries outside the window
    const cutoff = now - NetworkService.BANDWIDTH_WINDOW_MS
    while (this.bandwidthWindow.timestamps.length > 0 && this.bandwidthWindow.timestamps[0] < cutoff) {
      this.bandwidthWindow.timestamps.shift()
      this.bandwidthWindow.up.shift()
      this.bandwidthWindow.down.shift()
    }
  }

  /**
   * Get averaged bandwidth (KB/s over sliding window).
   */
  private getBandwidthRate(): { up: number; down: number } {
    const windowSec = NetworkService.BANDWIDTH_WINDOW_MS / 1000
    const upRate = this.bandwidthWindow.up.reduce((a, b) => a + b, 0) / windowSec
    const downRate = this.bandwidthWindow.down.reduce((a, b) => a + b, 0) / windowSec
    return { up: upRate, down: downRate }
  }

  /**
   * PERFORMANCE: Cork the Protomux channel for a peer.
   * Buffers all messages and sends them in a single batch on uncork().
   * Ideal for file transfers and bulk operations.
   */
  corkChannel(peerId: string): void {
    const channels = this.peerChannels.get(peerId)
    if (channels?.main?.cork) {
      channels.main.cork()
    }
    if (channels?.media?.cork) {
      channels.media.cork()
    }
    if (channels?.file?.cork) {
      channels.file.cork()
    }
  }

  /**
   * PERFORMANCE: Uncork the Protomux channel, flushing all buffered messages.
   */
  uncorkChannel(peerId: string): void {
    const channels = this.peerChannels.get(peerId)
    if (channels?.main?.uncork) {
      channels.main.uncork()
    }
    if (channels?.media?.uncork) {
      channels.media.uncork()
    }
    if (channels?.file?.uncork) {
      channels.file.uncork()
    }
  }

  /**
   * PERFORMANCE: Mark a peer as prioritized for fast reconnection.
   * Note: Hyperswarm PeerInfo.prioritized is read-only in some versions — silently ignored.
   */
  prioritizePeer(peerId: string, prioritized: boolean): void {
    const info = this.peerInfos.get(peerId)
    if (info) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (info as any).prioritized = prioritized
        console.log('[NetworkService] Peer', peerId.slice(0, 16), 'prioritized:', prioritized)
      } catch {
        // PeerInfo.prioritized is read-only in this Hyperswarm version — skip silently
      }
    }
  }

  /**
   * Update network configuration at runtime.
   * Applies maxPeers and relay settings to the active Hyperswarm instance.
   */
  updateConfig(config: { maxPeers?: number; relayEnabled?: boolean }): void {
    if (config.maxPeers !== undefined && this.swarm) {
      // Hyperswarm stores maxPeers as a mutable property
      ;(this.swarm as unknown as { maxPeers: number }).maxPeers = config.maxPeers
      console.log('[NetworkService] maxPeers updated to', config.maxPeers)
    }
    if (config.relayEnabled !== undefined) {
      // Relay toggle is noted; full effect requires swarm re-init on next connection
      console.log('[NetworkService] relayEnabled set to', config.relayEnabled)
    }
  }

  /**
   * Get current network status.
   * PERFORMANCE: Includes averaged bandwidth, connecting count, and peer scores.
   */
  getStatus(): NetworkStatus {
    const rates = this.getBandwidthRate()
    return {
      connected: this.initialized && this.swarm !== null,
      peers: this.peers.size,
      topics: Array.from(this.topics),
      bandwidth: {
        up: Math.round(rates.up),
        down: Math.round(rates.down),
      },
      // PERFORMANCE: Expose connecting count for UI
      connecting: this.swarm?.connecting ?? 0,
      // Peer latency map for UI display
      peerLatency: Object.fromEntries(this.peerLatency),
      // OPTIMIZATION: Expose swarm.connections size for precise connection count
      activeConnections: this.swarm?.connections?.size ?? 0,
      maxPeers: (this as unknown as { maxPeers?: number }).maxPeers ?? 64,
      // OPTIMIZATION: Expose active Protomux channel count
      activeChannels: this.peerChannels.size,
    }
  }

  /**
   * Check if a Protomux channel is open for a specific peer.
   * OPTIMIZATION: Avoids creating duplicate channels.
   */
  isChannelOpen(peerId: string): boolean {
    const channels = this.peerChannels.get(peerId)
    return !!(channels?.main || channels?.media)
  }

  /**
   * Get all peer IDs with active Protomux channels.
   * OPTIMIZATION: Useful for diagnostics and UI.
   */
  getActiveChannelPeers(): string[] {
    return Array.from(this.peerChannels.keys())
  }

  /**
   * Check if no Protomux channels are open (idle state).
   * OPTIMIZATION: Uses Protomux isIdle() concept for diagnostics.
   */
  isIdle(): boolean {
    return this.peerChannels.size === 0
  }

  /**
   * Get the handshake hash for a peer's connection.
   * OPTIMIZATION: Uses SecretStream handshakeHash for unique session identification.
   * Both peers compute the same hash, useful for session deduplication.
   */
  getHandshakeHash(peerId: string): string | null {
    const peer = this.peers.get(peerId)
    if (!peer?.socket?.handshakeHash) return null
    return peer.socket.handshakeHash.toString('hex')
  }

  /**
   * Get precise bandwidth metrics from SecretStream for a peer.
   * OPTIMIZATION: Uses rawBytesWritten/rawBytesRead for encrypted traffic measurement.
   * More accurate than sliding window as it measures actual encrypted bytes.
   */
  getPeerBandwidth(peerId: string): { written: number; read: number } | null {
    const peer = this.peers.get(peerId)
    if (!peer?.socket) return null
    return {
      written: peer.socket.rawBytesWritten ?? 0,
      read: peer.socket.rawBytesRead ?? 0,
    }
  }

  /**
   * Set keep-alive interval for a peer's connection.
   * OPTIMIZATION: Uses SecretStream setKeepAlive for connection health monitoring.
   * Sends heartbeat when socket is idle.
   */
  setPeerKeepAlive(peerId: string, ms: number): void {
    const peer = this.peers.get(peerId)
    if (peer?.socket?.setKeepAlive) {
      peer.socket.setKeepAlive(ms)
    }
  }

  /**
   * Suspend the swarm for power management.
   * OPTIMIZATION: Uses Hyperswarm suspend() to pause networking.
   * Useful when app is backgrounded or device is idle.
   */
  async suspendSwarm(): Promise<boolean> {
    if (!this.swarm) return false

    const suspendFn = (this.swarm as unknown as { suspend?: (opts?: { log?: () => void }) => Promise<void> }).suspend

    if (typeof suspendFn === 'function') {
      try {
        await suspendFn.call(this.swarm)
        console.log('[NetworkService] Swarm suspended')
        return true
      } catch (err) {
        console.error('[NetworkService] Failed to suspend swarm:', err)
        return false
      }
    }

    return false
  }

  /**
   * Resume a suspended swarm.
   * OPTIMIZATION: Uses Hyperswarm resume() to restore networking.
   * Useful when app returns to foreground.
   */
  async resumeSwarm(): Promise<boolean> {
    if (!this.swarm) return false

    const resumeFn = (this.swarm as unknown as { resume?: (opts?: { log?: () => void }) => Promise<void> }).resume

    if (typeof resumeFn === 'function') {
      try {
        await resumeFn.call(this.swarm)
        console.log('[NetworkService] Swarm resumed')
        return true
      } catch (err) {
        console.error('[NetworkService] Failed to resume swarm:', err)
        return false
      }
    }

    return false
  }

  /**
   * Wait for all pending DHT announces to complete.
   * OPTIMIZATION: Uses Hyperswarm flush() to ensure all announces are processed.
   * Useful before app shutdown or critical operations.
   */
  async flushSwarm(): Promise<boolean> {
    if (!this.swarm) return false

    const flushFn = (this.swarm as unknown as { flush?: () => Promise<void> }).flush

    if (typeof flushFn === 'function') {
      try {
        await flushFn.call(this.swarm)
        return true
      } catch (err) {
        console.error('[NetworkService] Failed to flush swarm:', err)
        return false
      }
    }

    return false
  }

  /**
   * Perform a direct DHT lookup for a topic.
   * OPTIMIZATION: Uses HyperDHT lookup() for direct peer discovery.
   * Returns discovered peers without going through Hyperswarm.
   */
  async dhtLookup(topic: Buffer): Promise<Array<{ publicKey: string; nodes: Array<{ host: string; port: number }> }>> {
    const dht = (this.swarm as unknown as { dht?: {
      lookup: (topic: Buffer) => AsyncIterable<{ peers: Array<{ publicKey: Buffer; nodes: Array<{ host: string; port: number }> }> }>
    } }).dht

    if (!dht || typeof dht.lookup !== 'function') {
      return []
    }

    const peers: Array<{ publicKey: string; nodes: Array<{ host: string; port: number }> }> = []

    try {
      for await (const data of dht.lookup(topic)) {
        for (const peer of data.peers) {
          peers.push({
            publicKey: peer.publicKey.toString('hex'),
            nodes: peer.nodes,
          })
        }
      }
    } catch (err) {
      console.error('[NetworkService] DHT lookup failed:', err)
    }

    return peers
  }

  /**
   * Announce presence on a topic via DHT.
   * OPTIMIZATION: Uses HyperDHT announce() for direct announcements.
   * Useful for custom discovery mechanisms.
   */
  async dhtAnnounce(topic: Buffer): Promise<boolean> {
    const dht = (this.swarm as unknown as { dht?: {
      announce: (topic: Buffer, keyPair: { publicKey: Buffer; secretKey: Buffer }) => AsyncIterable<unknown>
    } }).dht

    if (!dht || typeof dht.announce !== 'function') {
      return false
    }

    const keyPair = (this.swarm as unknown as { keyPair?: { publicKey: Buffer; secretKey: Buffer } }).keyPair
    if (!keyPair) return false

    try {
      for await (const _ of dht.announce(topic, keyPair)) {
        // Consume the stream
      }
      return true
    } catch (err) {
      console.error('[NetworkService] DHT announce failed:', err)
      return false
    }
  }

  /**
   * Stop announcing on a topic via DHT.
   * OPTIMIZATION: Uses HyperDHT unannounce() to stop discovery.
   */
  async dhtUnannounce(topic: Buffer): Promise<boolean> {
    const dht = (this.swarm as unknown as { dht?: {
      unannounce: (topic: Buffer, keyPair: { publicKey: Buffer; secretKey: Buffer }) => Promise<void>
    } }).dht

    if (!dht || typeof dht.unannounce !== 'function') {
      return false
    }

    const keyPair = (this.swarm as unknown as { keyPair?: { publicKey: Buffer; secretKey: Buffer } }).keyPair
    if (!keyPair) return false

    try {
      await dht.unannounce(topic, keyPair)
      return true
    } catch (err) {
      console.error('[NetworkService] DHT unannounce failed:', err)
      return false
    }
  }

  /**
   * Connect directly to a remote peer by public key.
   * OPTIMIZATION: Uses HyperDHT.connect() for direct P2P connection.
   * Useful for establishing connection without swarm discovery.
   */
  async connectToPeer(remotePublicKey: string | Buffer): Promise<boolean> {
    const dht = (this.swarm as unknown as { dht?: {
      connect: (remotePublicKey: string | Buffer, opts?: { keyPair?: { publicKey: Buffer; secretKey: Buffer } }) => { on: (event: string, handler: () => void) => void }
    } }).dht

    if (!dht || typeof dht.connect !== 'function') {
      return false
    }

    try {
      const keyPair = (this.swarm as unknown as { keyPair?: { publicKey: Buffer; secretKey: Buffer } }).keyPair
      const socket = dht.connect(remotePublicKey, keyPair ? { keyPair } : undefined)
      
      return new Promise((resolve) => {
        socket.on('open', () => {
          console.log('[NetworkService] Direct peer connection established')
          resolve(true)
        })
        // Timeout after 10 seconds
        setTimeout(() => resolve(false), 10000)
      })
    } catch (err) {
      console.error('[NetworkService] Direct peer connection failed:', err)
      return false
    }
  }

  /**
   * Destroy the DHT node completely.
   * OPTIMIZATION: Uses HyperDHT.destroy() for clean shutdown.
   * Useful for graceful application exit.
   */
  async destroyDht(options?: { force?: boolean }): Promise<boolean> {
    const dht = (this.swarm as unknown as { dht?: {
      destroy: (opts?: { force?: boolean }) => Promise<void>
    } }).dht

    if (!dht || typeof dht.destroy !== 'function') {
      return false
    }

    try {
      await dht.destroy(options)
      return true
    } catch (err) {
      console.error('[NetworkService] DHT destroy failed:', err)
      return false
    }
  }

  /**
   * Generate a key pair with optional seed.
   * OPTIMIZATION: Uses HyperDHT.keyPair() for deterministic key generation.
   * Useful for reproducible identities.
   */
  async generateKeyPair(seed?: Buffer): Promise<{ publicKey: string; secretKey: string } | null> {
    const dht = (this.swarm as unknown as { dht?: {
      keyPair: (seed?: Buffer) => { publicKey: Buffer; secretKey: Buffer }
    } }).dht

    if (!dht || typeof dht.keyPair !== 'function') {
      return null
    }

    try {
      const keyPair = dht.keyPair(seed)
      return {
        publicKey: keyPair.publicKey.toString('hex'),
        secretKey: keyPair.secretKey.toString('hex')
      }
    } catch (err) {
      console.error('[NetworkService] Key pair generation failed:', err)
      return null
    }
  }

  /**
   * PERFORMANCE: Block/unblock a peer via firewall.
   * Blocked peers are immediately rejected on connection attempts.
   */
  blockPeer(noisePublicKeyHex: string, blocked: boolean): void {
    if (blocked) {
      this.blockedPeers.add(noisePublicKeyHex)
      // Also ban via Hyperswarm if connected
      const info = this.peerInfos.get(noisePublicKeyHex)
      if (info?.ban) {
        info.ban(true)
      }
      console.log('[NetworkService] Peer blocked:', noisePublicKeyHex.slice(0, 16))
    } else {
      this.blockedPeers.delete(noisePublicKeyHex)
      const info = this.peerInfos.get(noisePublicKeyHex)
      if (info?.ban) {
        info.ban(false)
      }
      console.log('[NetworkService] Peer unblocked:', noisePublicKeyHex.slice(0, 16))
    }
  }

  /**
   * Get the list of blocked peer public keys.
   */
  getBlockedPeers(): string[] {
    return Array.from(this.blockedPeers)
  }

  /**
   * Get peer quality scores for diagnostics.
   */
  getPeerScores(): Record<string, { latency: number; score: number }> {
    const result: Record<string, { latency: number; score: number }> = {}
    for (const [peerId, latency] of this.peerLatency) {
      result[peerId] = {
        latency,
        score: this.peerScores.get(peerId) ?? 50,
      }
    }
    return result
  }

  /**
   * PERFORMANCE: Update peer scores based on connection health.
   * Score factors: connection age (stability), recent activity (liveness).
   */
  private updatePeerScores(): void {
    const now = Date.now()
    for (const [peerId, peer] of this.peers) {
      const connectionAge = now - peer.connectedAt
      const currentScore = this.peerScores.get(peerId) ?? 50

      // Base score from connection stability (longer = better, max 50 points)
      const stabilityScore = Math.min(50, Math.floor(connectionAge / 60_000) * 10) // +10 per minute, max 50

      // Activity bonus: if we've had recent traffic, peer is active (+30)
      // We approximate this by checking if the peer has been connected for a while
      const activityScore = connectionAge > 30_000 ? 30 : 10

      // Latency penalty (if we have latency data)
      const latency = this.peerLatency.get(peerId) ?? 0
      const latencyPenalty = latency > 5000 ? -20 : latency > 2000 ? -10 : 0

      const newScore = Math.max(0, Math.min(100, stabilityScore + activityScore + latencyPenalty + (currentScore > 80 ? 10 : 0)))
      this.peerScores.set(peerId, newScore)
    }

    // Push updated scores to UI
    this.emit('status:update', this.getStatus())
  }

  /**
   * PERFORMANCE: Re-announce all topics to keep DHT entries fresh.
   * Uses discovery.refresh() for efficient re-announcement.
   */
  private reannounceTopics(): void {
    if (!this.swarm) return
    for (const topicHex of this.topics) {
      try {
        const topicBuffer = Buffer.from(topicHex, 'hex')
        const status = this.swarm.status(topicBuffer)
        if (status && typeof (status as { refresh?: () => Promise<void> }).refresh === 'function') {
          (status as { refresh: () => Promise<void> }).refresh().catch(() => {})
        }
      } catch {
        // Ignore re-announce errors
      }
    }
    console.log('[NetworkService] Re-announced', this.topics.size, 'topics')
  }

  /**
   * Destroy the swarm and clean up
   */
  async destroy(): Promise<void> {
    // CRITICAL: Publish 'offline' status to DHT before destroying the swarm.
    // This ensures contacts don't see us as 'online' after we've closed the app.
    // Without this, our last-published 'online' status persists in the DHT.
    try {
      await this.publishStatus('offline')
      console.log('[NetworkService] Published offline status to DHT before shutdown')
    } catch (err) {
      console.warn('[NetworkService] Failed to publish offline status before shutdown:', err)
    }

    if (this.reannounceInterval) {
      clearInterval(this.reannounceInterval)
      this.reannounceInterval = null
    }
    if (this.scoreUpdateInterval) {
      clearInterval(this.scoreUpdateInterval)
      this.scoreUpdateInterval = null
    }
    if (this.swarm) {
      await this.swarm.destroy()
      this.swarm = null
    }
    this.peers.clear()
    this.topics.clear()
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async handleConnection(socket: PeerSocket, info: PeerInfo): Promise<void> {
    const peerId = info.publicKey.toString('hex')

    // ── Load Protomux + compact-encoding FIRST ──
    // Protomux.from(socket) must be called BEFORE corestore.replicate(socket)
    // so that the mux instance is cached on the stream. When corestore.replicate()
    // is called afterward, it reuses the same mux (via Protomux.from internally),
    // ensuring a single multiplexer handles both replication and app messages.
    let Protomux: typeof import('protomux').default
    let c: typeof import('compact-encoding')
    try {
      Protomux = (await import('protomux')).default
      c = await import('compact-encoding')
    } catch (err) {
      console.error('[NetworkService] Failed to load protomux/compact-encoding:', err)
      return
    }

    const mux = Protomux.from(socket)

    // ── Corestore replication ──
    if (this.corestore) {
      try {
        this.corestore.replicate(socket)
        console.log('[NetworkService] Corestore replication started with peer:', peerId.slice(0, 16))
      } catch (err) {
        console.error('[NetworkService] Replication error:', err)
      }
    }

    // ── Application protocol channel ──
    let mainSendMsg: ProtomuxMessage | undefined

    const channel = mux.createChannel({
      protocol: 'asgard',
      id: Buffer.alloc(0),
      onopen: () => {
        console.log('[NetworkService] === CHANNEL OPENED with peer:', peerId.slice(0, 32))
        // Send identity immediately
        if (this.localPublicKey && mainSendMsg) {
          const idBuf = Buffer.from(this.localPublicKey, 'utf-8')
          const payload = Buffer.alloc(1 + idBuf.length)
          payload[0] = 0x01
          idBuf.copy(payload, 1)
          mainSendMsg.send(payload)
          console.log('[NetworkService] === IDENTITY SENT to peer:', peerId.slice(0, 32))
        }
      },
      onclose: () => {
        console.log('[NetworkService] Protomux channel closed with peer:', peerId.slice(0, 16))
      },
      // HOLEPUNCH PATTERN: ondestroy called after onclose when all pending promises resolve.
      // Ensures complete cleanup of channel resources.
      // Cast needed: @types/protomux doesn't include ondestroy yet.
      ...(({
        ondestroy: () => {
          console.log('[NetworkService] Protomux channel destroyed with peer:', peerId.slice(0, 16))
          this.peerChannels.delete(peerId)
          // If all channels are destroyed, the muxer is idle — cleanup the socket
          const muxAny = mux as unknown as { isIdle?: () => boolean }
          if (typeof muxAny.isIdle === 'function' && muxAny.isIdle()) {
            logMain(`[NetworkService] Muxer idle for peer: ${peerId.slice(0, 16)} — destroying socket`)
            try { socket.destroy?.() } catch {}
          }
        },
      }) as unknown as Record<string, unknown>),
    })

    if (!channel) {
      console.warn('[NetworkService] Protomux channel rejected (duplicate?) for peer:', peerId.slice(0, 16))
      return
    }

    mainSendMsg = channel.addMessage({
      encoding: c.binary,
      onmessage: (buf: unknown) => {
        const data = buf as Buffer
        this.trackBandwidth(0, data.length)

        // Check first byte for message type framing
        if (data.length > 0) {
          // Identity message (first byte = 0x01)
          if (data[0] === 0x01) {
            const remotePk = data.slice(1).toString('utf-8')
            this.peerPublicKeyMap.set(peerId, remotePk)
            console.log('[NetworkService] === IDENTITY RECEIVED from peer:', peerId.slice(0, 32))
            this.emit('peer:identified', { peerId, publicKey: remotePk })
            return
          }

          // Media data (first byte = 0x02)
          if (data[0] === 0x02) {
            logMain(`[recvMedia] ⚠️ Main channel fallback recv from ${peerId.slice(0, 16)}, size: ${data.length}`)
            // Keep the 0x02 marker in the emitted payload so that the renderer-side
            // handleIncomingMedia can strip it exactly once, just like on the dedicated
            // media channel. Otherwise the marker is stripped twice and the payload is
            // corrupted.
            this.emit('media', {
              from: peerId,
              data: new Uint8Array(data),
              timestamp: Date.now(),
            })
            return
          }
        }

        // Regular application message (JSON protocol)
        // PERSISTENCE: Extract the sender's Ed25519 public key from the JSON
        // payload to auto-populate peerPublicKeyMap. This ensures we can send
        // back to this peer even if the explicit identity handshake (0x01) was
        // never received (e.g. older client build or race condition).
        try {
          const text = data.toString('utf-8')
          if (text.startsWith('{')) {
            const parsed = JSON.parse(text)
            const ed25519 = parsed?.from
            if (typeof ed25519 === 'string' && ed25519.length > 32) {
              const existing = this.peerPublicKeyMap.get(peerId)
              if (existing !== ed25519) {
                this.peerPublicKeyMap.set(peerId, ed25519)
                console.log('[NetworkService] Auto-identified peer from JSON:', peerId.slice(0, 16), '→', ed25519.slice(0, 16))
                this.emit('peer:identified', { peerId, publicKey: ed25519 })
              }
            }
          }
        } catch {
          // Not JSON or malformed — ignore (binary data, etc.)
        }

        this.emit('message', {
          from: peerId,
          data: new Uint8Array(data),
          timestamp: Date.now(),
        })
      },
    })

    channel.open()

    // ── Media protocol channel (audio/video streaming) ──
    const mediaChannel = mux.createChannel({
      protocol: 'asgard-media',
      id: Buffer.alloc(0),
      onopen: () => {
        logMain(`[NetworkService] ✅ Media channel OPENED with peer: ${peerId.slice(0, 16)}`)
      },
      onclose: () => {
        logMain(`[NetworkService] ❌ Media channel CLOSED with peer: ${peerId.slice(0, 16)}`)
      },
      // HOLEPUNCH PATTERN: ondestroy for complete resource cleanup
      ...(({
        ondestroy: () => {
          logMain(`[NetworkService] Media channel destroyed with peer: ${peerId.slice(0, 16)}`)
        },
      }) as unknown as Record<string, unknown>),
    })

    let sendMedia: ProtomuxMessage | undefined
    if (mediaChannel) {
      sendMedia = mediaChannel.addMessage({
        encoding: c.binary,
        onmessage: (buf: unknown) => {
          const data = buf as Buffer
          this.trackBandwidth(0, data.length)
          // DIAGNOSTICS: Log first few receives
          if (!this._mediaRecvCount) this._mediaRecvCount = new Map()
          const count = (this._mediaRecvCount.get(peerId) ?? 0) + 1
          this._mediaRecvCount.set(peerId, count)
          if (count <= 3) {
            logMain(`[recvMedia] ✅ Media channel recv #${count} from ${peerId.slice(0, 16)}, size: ${data.length}`)
          }
          this.emit('media', {
            from: peerId,
            data: new Uint8Array(data),
            timestamp: Date.now(),
          })
        },
      })
      mediaChannel.open()
      logMain(`[NetworkService] Media channel registered for peer: ${peerId.slice(0, 16)}`)
    } else {
      logMain(`[NetworkService] ⚠️ Media channel REJECTED by peer: ${peerId.slice(0, 16)}`)
    }

    // ── File transfer protocol channel (Holepunch pattern: dedicated channel per protocol) ──
    const fileChannel = mux.createChannel({
      protocol: 'asgard-files',
      id: Buffer.alloc(0),
      onopen: () => {
        logMain(`[NetworkService] ✅ File channel OPENED with peer: ${peerId.slice(0, 16)}`)
      },
      onclose: () => {
        logMain(`[NetworkService] ❌ File channel CLOSED with peer: ${peerId.slice(0, 16)}`)
      },
      // HOLEPUNCH PATTERN: ondestroy for complete resource cleanup
      ...(({
        ondestroy: () => {
          logMain(`[NetworkService] File channel destroyed with peer: ${peerId.slice(0, 16)}`)
        },
      }) as unknown as Record<string, unknown>),
    })

    let sendFile: ProtomuxMessage | undefined
    if (fileChannel) {
      sendFile = fileChannel.addMessage({
        encoding: c.binary,
        onmessage: (buf: unknown) => {
          const data = buf as Buffer
          this.trackBandwidth(data.length, 0)
          if (!this._fileRecvCount) this._fileRecvCount = new Map()
          const count = (this._fileRecvCount.get(peerId) ?? 0) + 1
          this._fileRecvCount.set(peerId, count)
          if (count <= 3) {
            logMain(`[recvFile] ✅ File channel recv #${count} from ${peerId.slice(0, 16)}, size: ${data.length}`)
          }
          this.emit('file', {
            from: peerId,
            data: new Uint8Array(data),
            timestamp: Date.now(),
          })
        },
      })
      fileChannel.open()
      logMain(`[NetworkService] File channel registered for peer: ${peerId.slice(0, 16)}`)
    } else {
      logMain(`[NetworkService] ⚠️ File channel REJECTED by peer: ${peerId.slice(0, 16)}`)
    }

    // Store channels for cork/uncork support
    this.peerChannels.set(peerId, { main: channel, media: mediaChannel, file: fileChannel })
    this.peerInfos.set(peerId, info)

    // ── Track peer with connection latency ──
    const existing = this.peers.get(peerId)
    const peer: PeerConnection = {
      id: peerId,
      socket,
      info,
      connectedAt: existing?.connectedAt ?? Date.now(),
      sendMessage: mainSendMsg,
      sendMedia,
      sendFile,
    }
    this.peers.set(peerId, peer)

    // CONNECTIVITY: Reset reconnect attempts on successful connection
    this.reconnectAttempts.delete(peerId)

    // Record initial connection latency
    if (!existing) {
      this.peerLatency.set(peerId, 0)
      this.peerScores.set(peerId, 100)
    }

    // Include Ed25519 public key in peer event if already known (e.g. reconnection)
    const knownEd25519 = this.peerPublicKeyMap.get(peerId)

    this.emit('peer', {
      id: peerId,
      publicKey: peerId,
      remotePublicKey: socket.remotePublicKey?.toString('hex') ?? peerId,
      ed25519PublicKey: knownEd25519 ?? null,
      connected: true,
    })

    // Handle disconnect
    socket.on('close', () => {
      this.peers.delete(peerId)
      this.peerChannels.delete(peerId)
      this.peerInfos.delete(peerId)
      // Include Ed25519 key so renderer can map disconnect back to the correct contact
      const ed25519Key = this.peerPublicKeyMap.get(peerId) ?? null
      this.emit('peer', {
        id: peerId,
        publicKey: peerId,
        remotePublicKey: peerId,
        ed25519PublicKey: ed25519Key,
        connected: false,
      })

      // CONNECTIVITY: Auto-reconnect with exponential backoff and indefinite retries.
      // We use joinPeer() directly so Hyperswarm keeps trying to punch through NAT
      // rather than relying only on topic refresh.
      if (this.isOnline && !this.blockedPeers.has(peerId)) {
        const attempts = this.reconnectAttempts.get(peerId) ?? 0
        const backoff = NetworkService.RECONNECT_BACKOFF_MS * Math.pow(1.5, attempts)
        const jitter = Math.random() * 1000 // Add jitter to avoid thundering herd
        const delay = Math.min(backoff + jitter, 30000) // Cap at 30s

        console.log(`[NetworkService] Scheduling reconnect for ${peerId.slice(0, 16)} in ${Math.round(delay)}ms (attempt ${attempts + 1})`)

        setTimeout(() => {
          if (!this.peers.has(peerId) && this.isOnline && !this.blockedPeers.has(peerId) && this.swarm) {
            try {
              this.swarm.joinPeer(Buffer.from(peerId, 'hex'))
              console.log(`[NetworkService] Reconnecting to peer ${peerId.slice(0, 16)} via joinPeer`)
            } catch (err) {
              console.warn(`[NetworkService] joinPeer failed for ${peerId.slice(0, 16)}:`, err)
            }
            // Also refresh topics this peer was on to trigger re-discovery
            const peerTopics = info.topics ?? []
            for (const topic of peerTopics) {
              const topicHex = topic.toString('hex')
              if (this.topics.has(topicHex)) {
                const topicBuffer = Buffer.from(topicHex, 'hex')
                const status = this.swarm?.status(topicBuffer)
                if (status && typeof (status as { refresh?: () => Promise<void> }).refresh === 'function') {
                  (status as { refresh: () => Promise<void> }).refresh().catch(() => {})
                }
              }
            }
            this.reconnectAttempts.set(peerId, attempts + 1)
          }
        }, delay)
      }
    })

    // HOLEPUNCH PATTERN: Forward errors to stream.destroy() for clean teardown.
    // Protomux docs: "Errors here are caught and forwarded to stream.destroy"
    socket.on('error', (err: Error) => {
      console.error('[NetworkService] Peer error:', err.message)
      this.peers.delete(peerId)
      this.peerChannels.delete(peerId)
      this.peerInfos.delete(peerId)
      // Ensure the socket is properly destroyed on error
      try { socket.destroy?.() } catch {}
    })
  }

  /**
   * Re-send identity to all connected peers via the main channel.
   * Called after crypto import is complete to ensure peers who connected
   * before the renderer was ready receive our Ed25519 public key.
   */
  reidentifyAll(): void {
    if (!this.localPublicKey) return
    const idBuf = Buffer.from(this.localPublicKey, 'utf-8')
    const payload = Buffer.alloc(1 + idBuf.length)
    payload[0] = 0x01 // identity marker
    idBuf.copy(payload, 1)
    for (const [peerId, peer] of this.peers) {
      if (peer.sendMessage) {
        try {
          peer.sendMessage.send(payload)
          console.log('[NetworkService] Re-sent identity to peer:', peerId.slice(0, 16))
        } catch (err) {
          console.warn('[NetworkService] Failed to re-identify peer:', peerId.slice(0, 16), err)
        }
      }
    }
  }

  /**
   * Get the number of connections currently in progress.
   * OPTIMIZATION: Uses Hyperswarm connecting for call status monitoring.
   * Returns the number of connections being established.
   */
  getConnectingCount(): number {
    if (!this.swarm) return 0
    try {
      const connecting = (this.swarm as unknown as { connecting?: number }).connecting
      return typeof connecting === 'number' ? connecting : 0
    } catch (err) {
      console.error('[NetworkService] Failed to get connecting count:', err)
      return 0
    }
  }

  /**
   * Get all connected peers with their info.
   * OPTIMIZATION: Uses Hyperswarm peers for group call management.
   * Returns a map of peer public key to peer info.
   */
  getConnectedPeersInfo(): Map<string, { publicKey: string; topics: string[]; prioritized: boolean }> {
    const result = new Map<string, { publicKey: string; topics: string[]; prioritized: boolean }>()
    if (!this.swarm) return result

    try {
      const peers = (this.swarm as unknown as { peers?: Map<string, { publicKey: Buffer; topics?: string[]; prioritized?: boolean }> }).peers
      if (!peers) return result

      for (const [key, peerInfo] of peers) {
        result.set(key, {
          publicKey: Buffer.isBuffer(peerInfo.publicKey) ? peerInfo.publicKey.toString('hex') : String(peerInfo.publicKey),
          topics: Array.isArray(peerInfo.topics) ? peerInfo.topics : [],
          prioritized: Boolean(peerInfo.prioritized),
        })
      }
    } catch (err) {
      console.error('[NetworkService] Failed to get connected peers info:', err)
    }

    return result
  }

  /**
   * Set a peer as prioritized for rapid reconnection.
   * OPTIMIZATION: Uses PeerInfo prioritized for call quality.
   * Returns true if successful.
   */
  setPeerPriorized(peerPublicKey: string, prioritized: boolean): boolean {
    if (!this.swarm) return false

    try {
      const peers = (this.swarm as unknown as { peers?: Map<string, { prioritized?: boolean }> }).peers
      if (!peers) return false

      const peerInfo = peers.get(peerPublicKey)
      if (!peerInfo) return false

      peerInfo.prioritized = prioritized
      return true
    } catch (err) {
      console.error('[NetworkService] Failed to set peer prioritized:', err)
      return false
    }
  }

  /**
   * Ban or unban a peer.
   * OPTIMIZATION: Uses PeerInfo ban for group call moderation.
   * Returns true if successful.
   */
  banPeer(peerPublicKey: string, banStatus: boolean = true): boolean {
    if (!this.swarm) return false

    try {
      const peers = (this.swarm as unknown as { peers?: Map<string, { ban?: (status: boolean) => void }> }).peers
      if (!peers) return false

      const peerInfo = peers.get(peerPublicKey)
      if (!peerInfo || typeof peerInfo.ban !== 'function') return false

      peerInfo.ban(banStatus)
      return true
    } catch (err) {
      console.error('[NetworkService] Failed to ban peer:', err)
      return false
    }
  }

  /**
   * Register a callback for peer ban events.
   * OPTIMIZATION: Uses Hyperswarm ban event for call error handling.
   */
  onPeerBan(callback: (peerInfo: unknown, error: Error) => void): void {
    if (!this.swarm) return

    try {
      this.swarm.on('ban', (peerInfo: unknown, err: Error) => {
        callback(peerInfo, err)
      })
    } catch (err) {
      console.error('[NetworkService] Failed to register peer ban callback:', err)
    }
  }

  /**
   * Set a firewall function to validate incoming connections.
   * OPTIMIZATION: Uses HyperDHT firewall for call security.
   * Returns true if successful.
   */
  setFirewall(firewallFn: (remotePublicKey: string, remoteHandshakePayload: unknown) => boolean): boolean {
    if (!this.swarm) return false

    try {
      const dht = (this.swarm as unknown as { dht?: { firewall?: (fn: (remotePublicKey: Buffer, remoteHandshakePayload: unknown) => boolean) => void } }).dht
      if (!dht || typeof dht.firewall !== 'function') return false

      // Convert hex string to Buffer for the firewall function
      dht.firewall((remotePublicKey: Buffer, remoteHandshakePayload: unknown) => {
        const publicKeyHex = Buffer.isBuffer(remotePublicKey) ? remotePublicKey.toString('hex') : String(remotePublicKey)
        return firewallFn(publicKeyHex, remoteHandshakePayload)
      })
      return true
    } catch (err) {
      console.error('[NetworkService] Failed to set firewall:', err)
      return false
    }
  }

  /**
   * Get the server address information.
   * OPTIMIZATION: Uses HyperDHT server.address() for call diagnostics.
   * Returns the server address info (host, port, publicKey).
   */
  getServerAddress(): { host: string; port: number; publicKey: string } | null {
    if (!this.swarm) return null

    try {
      const dht = (this.swarm as unknown as { dht?: { server?: { address?: () => { host: string; port: number; publicKey: Buffer } } } }).dht
      if (!dht?.server || typeof dht.server.address !== 'function') return null

      const address = dht.server.address()
      if (!address) return null

      return {
        host: String(address.host),
        port: typeof address.port === 'number' ? address.port : 0,
        publicKey: Buffer.isBuffer(address.publicKey) ? address.publicKey.toString('hex') : String(address.publicKey),
      }
    } catch (err) {
      console.error('[NetworkService] Failed to get server address:', err)
      return null
    }
  }

  /**
   * Refresh the server, causing it to reannounce its address.
   * OPTIMIZATION: Uses HyperDHT server.refresh() for call reconnection.
   * Returns true if successful.
   */
  refreshServer(): boolean {
    if (!this.swarm) return false

    try {
      const dht = (this.swarm as unknown as { dht?: { server?: { refresh?: () => void } } }).dht
      if (!dht?.server || typeof dht.server.refresh !== 'function') return false

      dht.server.refresh()
      return true
    } catch (err) {
      console.error('[NetworkService] Failed to refresh server:', err)
      return false
    }
  }

  /**
   * CONNECTIVITY: Handle network status change (online/offline).
   * Triggers reconnection logic when network becomes available.
   */
  handleNetworkChange(online: boolean): void {
    const wasOnline = this.isOnline
    this.isOnline = online
    this.lastNetworkChange = Date.now()

    if (wasOnline && !online) {
      console.log('[NetworkService] Network offline — pausing reconnection attempts')
      // Clear reconnect attempts when going offline
      this.reconnectAttempts.clear()
    } else if (!wasOnline && online) {
      console.log('[NetworkService] Network online — triggering reconnection')
      // Resume swarm and reannounce when coming back online
      this.resumeSwarm().catch(() => {})
      this.refreshServer()
    }
  }

  /**
   * CONNECTIVITY: Get network connectivity status.
   */
  getConnectivityStatus(): { isOnline: boolean; lastChange: number; reconnectAttempts: number } {
    let totalAttempts = 0
    for (const attempts of this.reconnectAttempts.values()) {
      totalAttempts += attempts
    }
    return {
      isOnline: this.isOnline,
      lastChange: this.lastNetworkChange,
      reconnectAttempts: totalAttempts,
    }
  }

  /**
   * CONNECTIVITY: Schedule reconnection for a peer with exponential backoff.
   * Returns the delay in ms before next attempt.
   */
  scheduleReconnect(peerId: string): number {
    const attempts = this.reconnectAttempts.get(peerId) ?? 0
    if (attempts >= NetworkService.MAX_RECONNECT_ATTEMPTS) {
      console.log('[NetworkService] Max reconnect attempts reached for peer:', peerId.slice(0, 16))
      return -1 // No more attempts
    }

    // Exponential backoff: 2s, 4s, 8s, 16s, 32s
    const delay = NetworkService.RECONNECT_BACKOFF_MS * Math.pow(2, attempts)
    this.reconnectAttempts.set(peerId, attempts + 1)

    console.log('[NetworkService] Scheduling reconnect for peer', peerId.slice(0, 16), 'in', delay, 'ms (attempt', attempts + 1, ')')
    return delay
  }

  /**
   * CONNECTIVITY: Reset reconnect attempts for a peer (on successful connection).
   */
  resetReconnectAttempts(peerId: string): void {
    this.reconnectAttempts.delete(peerId)
  }

  private waitForInit(timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.initialized) return resolve()
      const timer = setTimeout(() => reject(new Error('Network init timeout')), timeout)
      const check = setInterval(() => {
        if (this.initialized) {
          clearInterval(check)
          clearTimeout(timer)
          resolve()
        }
      }, 100)
    })
  }

  // ─── Advanced Topic Management (Hyperswarm-inspired) ───────────────────

  private topicMetadata: Map<string, TopicInfo> = new Map()
  private discoveryCallbacks: Map<string, DiscoveryCallback[]> = new Map()

  /**
   * Join a topic with metadata.
   */
  async joinTopicWithMetadata(topic: string, metadata: TopicMetadata): Promise<void> {
    await this.join(topic)

    this.topicMetadata.set(topic, {
      topic,
      metadata,
      joinedAt: Date.now(),
      peersDiscovered: 0,
      lastActivity: Date.now(),
    })

    console.log(`[NetworkService] Joined topic ${topic} with metadata:`, metadata)
  }

  /**
   * Leave a topic and clean up metadata.
   */
  async leaveTopicWithCleanup(topic: string): Promise<void> {
    await this.leave(topic)
    this.topicMetadata.delete(topic)
    this.discoveryCallbacks.delete(topic)
    console.log(`[NetworkService] Left topic ${topic} with cleanup`)
  }

  /**
   * Register a discovery callback for a topic.
   */
  onPeerDiscovered(topic: string, callback: DiscoveryCallback): void {
    if (!this.discoveryCallbacks.has(topic)) {
      this.discoveryCallbacks.set(topic, [])
    }
    this.discoveryCallbacks.get(topic)!.push(callback)
  }

  /**
   * Remove a discovery callback.
   */
  offPeerDiscovered(topic: string, callback: DiscoveryCallback): void {
    const callbacks = this.discoveryCallbacks.get(topic)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index !== -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  /**
   * Get topic metadata.
   */
  getTopicMetadata(topic: string): TopicInfo | null {
    return this.topicMetadata.get(topic) || null
  }

  /**
   * Get all topics with metadata.
   */
  getTopicsWithMetadata(): TopicInfo[] {
    return Array.from(this.topicMetadata.values())
  }

  /**
   * Update topic activity.
   */
  updateTopicActivity(topic: string): void {
    const info = this.topicMetadata.get(topic)
    if (info) {
      info.lastActivity = Date.now()
      info.peersDiscovered++
    }
  }

  /**
   * Get topic statistics.
   */
  getTopicStats(): {
    totalTopics: number
    activeTopics: number
    totalPeersDiscovered: number
    averageActivity: number
  } {
    const topics = Array.from(this.topicMetadata.values())
    const activeTopics = topics.filter(t => Date.now() - t.lastActivity < 300000).length // 5min
    const totalPeers = topics.reduce((sum, t) => sum + t.peersDiscovered, 0)
    const averageActivity = topics.length > 0
      ? topics.reduce((sum, t) => sum + (Date.now() - t.lastActivity), 0) / topics.length
      : 0

    return {
      totalTopics: topics.length,
      activeTopics,
      totalPeersDiscovered: totalPeers,
      averageActivity,
    }
  }

  // ─── Advanced Peer Management (Hyperswarm-inspired) ────────────────────

  private peerMetadata: Map<string, PeerMetadata> = new Map()
  private peerTags: Map<string, Set<string>> = new Map()

  /**
   * Set metadata for a peer.
   */
  setPeerMetadata(peerId: string, metadata: PeerMetadata): void {
    this.peerMetadata.set(peerId, metadata)
    console.log(`[NetworkService] Peer metadata set for ${peerId.slice(0, 16)}`)
  }

  /**
   * Get metadata for a peer.
   */
  getPeerMetadata(peerId: string): PeerMetadata | null {
    return this.peerMetadata.get(peerId) || null
  }

  /**
   * Add a tag to a peer.
   */
  addPeerTag(peerId: string, tag: string): void {
    if (!this.peerTags.has(peerId)) {
      this.peerTags.set(peerId, new Set())
    }
    this.peerTags.get(peerId)!.add(tag)
  }

  /**
   * Remove a tag from a peer.
   */
  removePeerTag(peerId: string, tag: string): void {
    const tags = this.peerTags.get(peerId)
    if (tags) {
      tags.delete(tag)
    }
  }

  /**
   * Get all tags for a peer.
   */
  getPeerTags(peerId: string): string[] {
    return Array.from(this.peerTags.get(peerId) || [])
  }

  /**
   * Get peers by tag.
   */
  getPeersByTag(tag: string): string[] {
    return Array.from(this.peerTags.entries())
      .filter(([, tags]) => tags.has(tag))
      .map(([peerId]) => peerId)
  }

  /**
   * Get peer statistics.
   */
  getPeerStats(): {
    totalPeers: number
    taggedPeers: number
    totalTags: number
    averageTagsPerPeer: number
  } {
    const taggedPeers = this.peerTags.size
    const totalTags = Array.from(this.peerTags.values()).reduce((sum, tags) => sum + tags.size, 0)

    return {
      totalPeers: this.peers.size,
      taggedPeers,
      totalTags,
      averageTagsPerPeer: taggedPeers > 0 ? totalTags / taggedPeers : 0,
    }
  }

  /**
   * Get discovery statistics.
   */
  getDiscoveryStats(): {
    totalTopics: number
    totalPeers: number
    blockedPeers: number
    averageLatency: number
    discoveryRate: number
  } {
    const latencies = Array.from(this.peerLatency.values())
    const averageLatency = latencies.length > 0
      ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
      : 0

    const topicInfos = Array.from(this.topicMetadata.values())
    const totalDiscovered = topicInfos.reduce((sum, t) => sum + t.peersDiscovered, 0)
    const discoveryRate = topicInfos.length > 0 ? totalDiscovered / topicInfos.length : 0

    return {
      totalTopics: this.topics.size,
      totalPeers: this.peers.size,
      blockedPeers: this.blockedPeers.size,
      averageLatency,
      discoveryRate,
    }
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface HyperswarmInstance {
  on: (event: string, handler: (...args: any[]) => void) => void // eslint-disable-line @typescript-eslint/no-explicit-any
  join: (topic: Buffer, options?: { client?: boolean; server?: boolean; limit?: number }) => { flushed: () => Promise<void> }
  leave: (topic: Buffer) => Promise<void>
  destroy: () => Promise<void>
  status: (topic: Buffer) => { flushed?: () => Promise<void> } | null
  joinPeer: (publicKey: Buffer) => void
  leavePeer: (publicKey: Buffer) => void
  suspend: () => Promise<void>
  resume: () => Promise<void>
  connections: Set<unknown>
  connecting: number
  dht?: unknown
}

interface HyperswarmConstructor {
  new (options?: {
    maxPeers?: number
    firewall?: (key: Buffer) => boolean
    seed?: Buffer
    connectionKeepAlive?: number
  }): HyperswarmInstance
}

interface ProtomuxMessage {
  send: (data: unknown) => void
}

interface CorestoreLike {
  replicate: (stream: unknown) => unknown
  getCores?: () => HypercoreLike[]
}

interface HypercoreLike {
  ready: () => Promise<void>
  findingPeers?: () => () => void
}

interface PeerSocket {
  write: (data: Buffer, cb?: (err: Error | null) => void) => boolean
  on: (event: string, handler: (...args: any[]) => void) => void // eslint-disable-line @typescript-eslint/no-explicit-any
  remotePublicKey?: Buffer
  // OPTIMIZATION: SecretStream properties for session identification and metrics
  handshakeHash?: Buffer
  rawBytesWritten?: number
  rawBytesRead?: number
  setKeepAlive?: (ms: number) => void
  setTimeout?: (ms: number) => void
  // HOLEPUNCH PATTERN: stream.destroy() for clean teardown on errors
  destroy?: () => void
}

interface PeerInfo {
  publicKey: Buffer
  topics: Buffer[]
  reconnecting: boolean
  prioritized: boolean
  ban: (banned?: boolean) => void
}

interface PeerConnection {
  id: string
  socket: PeerSocket
  info: PeerInfo
  connectedAt: number
  sendMessage?: ProtomuxMessage
  sendMedia?: ProtomuxMessage
  sendFile?: ProtomuxMessage // Dedicated file transfer channel (Holepunch pattern)
}

interface NetworkStatus {
  connected: boolean
  peers: number
  topics: string[]
  bandwidth: { up: number; down: number }
  connecting: number
  peerLatency: Record<string, number>
  // OPTIMIZATION: Expose swarm.connections size for precise connection count
  activeConnections: number
  maxPeers: number
  // OPTIMIZATION: Expose active Protomux channel count
  activeChannels: number
}

interface DHTLike {
  mutablePut: (keyPair: { publicKey: Buffer; secretKey: Buffer }, value: Buffer, opts?: { seq?: number }) => Promise<unknown>
  mutableGet: (publicKey: Buffer, opts?: { seq?: number; latest?: boolean }) => Promise<{ value: Buffer; seq: number } | null>
  immutablePut: (value: Buffer) => Promise<{ hash: Buffer }>
  immutableGet: (hash: Buffer) => Promise<{ value: Buffer } | null>
  fullyBootstrapped: () => Promise<void>
  on: (event: 'persistent' | 'wake-up', handler: () => void) => void
  off: (event: 'persistent' | 'wake-up', handler: () => void) => void
  ephemeral?: boolean
  randomPunchInterval?: number
}

interface DHTProfile {
  displayName: string
  avatar?: string
  timestamp: number
  version: number
  /** User online status */
  status?: 'online' | 'away' | 'offline' | 'dnd'
  /** Last seen timestamp when offline */
  lastSeen?: number
  /** Optional status message */
  statusMessage?: string
}

interface TopicMetadata {
  name?: string
  description?: string
  type: 'public' | 'private' | 'group'
  tags?: string[]
}

interface TopicInfo {
  topic: string
  metadata: TopicMetadata
  joinedAt: number
  peersDiscovered: number
  lastActivity: number
}

type DiscoveryCallback = (peerId: string, topic: string) => void

interface PeerMetadata {
  displayName?: string
  avatar?: string
  status?: string
  capabilities?: string[]
  lastSeen?: number
}
