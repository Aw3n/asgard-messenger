from pathlib import Path

root = Path(__file__).resolve().parents[1]


def load(rel):
    return (root / rel).read_text(encoding="utf-8").replace("\r\n", "\n")


def save(rel, text):
    (root / rel).write_text(text, encoding="utf-8")


# --- NetworkService: DHT + listen + identity handshake ---
ns = load("electron/services/NetworkService.ts")

old_init = """      const swarmOpts: {
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
"""

new_init = """      // Hyperswarm 4.x does NOT forward `ephemeral` to HyperDHT. Passing it on
      // the swarm options is a no-op. Create the DHT ourselves (Holepunch docs:
      // https://github.com/holepunchto/hyperdht — ephemeral:false = reachable server).
      const HyperDHTMod = await import('hyperdht') as unknown as {
        default: {
          new (opts?: Record<string, unknown>): DHTLike
          keyPair: (seed?: Buffer) => { publicKey: Buffer; secretKey: Buffer }
        }
      }
      const HyperDHT = HyperDHTMod.default
      const dhtKeyPair = this.seed ? HyperDHT.keyPair(this.seed) : HyperDHT.keyPair()
      if (this.seed) {
        console.log('[NetworkService] Using deterministic identity seed')
      } else {
        console.warn('[NetworkService] No identity seed — peer ID will be random')
      }

      const dhtNode = new HyperDHT({
        keyPair: dhtKeyPair,
        ephemeral: false,
        randomPunchInterval: 5000,
      })

      const swarmOpts: {
        maxPeers: number
        firewall: (key: Buffer) => boolean
        keyPair: { publicKey: Buffer; secretKey: Buffer }
        dht: DHTLike
        connectionKeepAlive?: number
        maxClientConnections?: number
      } = {
        maxPeers: 64,
        maxClientConnections: 128,
        keyPair: dhtKeyPair,
        dht: dhtNode,
        firewall: (remotePublicKey: Buffer) => {
          const hex = remotePublicKey.toString('hex')
          if (this.blockedPeers.has(hex)) {
            console.log('[NetworkService] Firewall blocked peer:', hex.slice(0, 16))
            return true // Reject
          }
          return false // Allow
        },
        connectionKeepAlive: 15000,
      }

      this.swarm = new Hyperswarm(swarmOpts)

      // Server must listen BEFORE joinPeer() or inbound connections are dropped.
      // Hyperswarm only calls listen() when the first topic is joined as server.
      try {
        await (this.swarm as unknown as { listen: () => Promise<unknown> }).listen()
        console.log('[NetworkService] DHT server listening')
      } catch (err) {
        console.warn('[NetworkService] swarm.listen() failed:', err)
      }

      const dht = this.getDHT()
"""

if old_init not in ns:
    raise SystemExit("init block not found")
ns = ns.replace(old_init, new_init, 1)

old_onopen = """      onopen: () => {
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
"""
new_onopen = """      onopen: () => {
        console.log('[NetworkService] === CHANNEL OPENED with peer:', peerId.slice(0, 32))
        this.sendIdentityFrame(peerId, mainSendMsg)
      },
"""
if old_onopen not in ns:
    raise SystemExit("onopen block not found")
ns = ns.replace(old_onopen, new_onopen, 1)

old_open = """    channel.open()

    // ── Media protocol channel (audio/video streaming) ──
"""
new_open = """    channel.open()
    // onopen can fire before addMessage assigns mainSendMsg — send again now.
    this.sendIdentityFrame(peerId, mainSendMsg)

    // ── Media protocol channel (audio/video streaming) ──
"""
if old_open not in ns:
    raise SystemExit("channel.open block not found")
ns = ns.replace(old_open, new_open, 1)

helper = """
  private sendIdentityFrame(peerId: string, sendMsg?: ProtomuxMessage): void {
    if (!this.localPublicKey || !sendMsg) return
    try {
      const idBuf = Buffer.from(this.localPublicKey, 'utf-8')
      const payload = Buffer.alloc(1 + idBuf.length)
      payload[0] = 0x01
      idBuf.copy(payload, 1)
      sendMsg.send(payload)
      console.log('[NetworkService] === IDENTITY SENT to peer:', peerId.slice(0, 32))
    } catch (err) {
      console.warn('[NetworkService] Identity send failed:', err)
    }
  }
"""

marker = "  // ─── Private ───────────────────────────────────────────────────────────────\n"
if "sendIdentityFrame" not in ns:
    if marker not in ns:
        raise SystemExit("private marker not found")
    ns = ns.replace(marker, helper + "\n" + marker, 1)

save("electron/services/NetworkService.ts", ns)
print("patched NetworkService")

# --- ChatService: connection-based presence ---
cs = load("src/services/ChatService.ts")

old_hb = """    // 1. Detect stale peers — mark contacts offline if no recent activity,
    // but try to rejoin their conversation topic to reconnect.
    for (const [ed25519Key, lastActivity] of this.peerLastActivity.entries()) {
      if (now - lastActivity > timeout) {
        const contact = useContactStore.getState().getContact(ed25519Key)
        if (contact && contact.status === 'online') {
          useContactStore.getState().updateContact(ed25519Key, {
            status: 'offline',
          })
          console.log('[ChatService] Peer marked offline (heartbeat timeout):', ed25519Key.slice(0, 16))
        }
        this.peerLastActivity.delete(ed25519Key)
"""
new_hb = """    // 1. Detect stale peers. Holepunch/Keet presence = live Hyperswarm socket.
    // Never mark offline while the Noise connection is still open.
    const liveNoise = new Set(p2pService.getConnectedPeers())
    for (const [ed25519Key, lastActivity] of this.peerLastActivity.entries()) {
      const noiseId = this.ed25519ToNoiseMap.get(ed25519Key)
      if (noiseId && liveNoise.has(noiseId)) {
        this.peerLastActivity.set(ed25519Key, now)
        const liveContact = useContactStore.getState().getContact(ed25519Key)
        if (liveContact && liveContact.status === 'offline') {
          useContactStore.getState().updateContact(ed25519Key, {
            status: 'online',
            lastSeen: now,
          })
        }
        continue
      }
      if (now - lastActivity > timeout) {
        const contact = useContactStore.getState().getContact(ed25519Key)
        if (contact && contact.status === 'online') {
          useContactStore.getState().updateContact(ed25519Key, {
            status: 'offline',
          })
          console.log('[ChatService] Peer marked offline (heartbeat timeout):', ed25519Key.slice(0, 16))
        }
        this.peerLastActivity.delete(ed25519Key)
"""
if old_hb not in cs:
    raise SystemExit("heartbeat block not found")
cs = cs.replace(old_hb, new_hb, 1)

old_skip = """    const connectedPeerCount = Object.values(useNetworkStore.getState().peers).filter((p) => p.connected).length
    const willSkip = status === this.lastBroadcastStatus && connectedPeerCount > 0
"""
new_skip = """    const connectedPeerCount = Object.values(useNetworkStore.getState().peers).filter((p) => p.connected).length
    // Never skip while any peer is connected: skipped heartbeats were the
    // reason both sides stayed "offline" despite an open Hyperswarm socket.
    const willSkip = false && status === this.lastBroadcastStatus && connectedPeerCount > 0
"""
if old_skip not in cs:
    raise SystemExit("skip block not found")
cs = cs.replace(old_skip, new_skip, 1)

# simpler: just set willSkip = false
cs = cs.replace(
    "    const willSkip = false && status === this.lastBroadcastStatus && connectedPeerCount > 0\n",
    "    const willSkip = false\n",
    1,
)

old_conn = """      if (ed25519Key) {
        // Cancel any pending offline timer — peer reconnected
        const offlineTimer = this.pendingOfflineTimers.get(ed25519Key)
        if (offlineTimer) {
          clearTimeout(offlineTimer)
          this.pendingOfflineTimers.delete(ed25519Key)
          console.log('[ChatService] Offline timer cancelled — peer reconnected:', ed25519Key.slice(0, 16))
        }
        this.flushPendingMessages(ed25519Key).catch(() => {})
"""
new_conn = """      if (ed25519Key) {
        // Cancel any pending offline timer — peer reconnected
        const offlineTimer = this.pendingOfflineTimers.get(ed25519Key)
        if (offlineTimer) {
          clearTimeout(offlineTimer)
          this.pendingOfflineTimers.delete(ed25519Key)
          console.log('[ChatService] Offline timer cancelled — peer reconnected:', ed25519Key.slice(0, 16))
        }
        // Live socket = online (Holepunch presence model)
        this.peerLastActivity.set(ed25519Key, Date.now())
        if (useContactStore.getState().getContact(ed25519Key)) {
          useContactStore.getState().updateContact(ed25519Key, {
            status: 'online',
            lastSeen: Date.now(),
          })
        }
        this.flushPendingMessages(ed25519Key).catch(() => {})
"""
if old_conn not in cs:
    raise SystemExit("peer connected block not found")
cs = cs.replace(old_conn, new_conn, 1)

save("src/services/ChatService.ts", cs)
print("patched ChatService")
