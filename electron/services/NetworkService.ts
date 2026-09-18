import { EventEmitter } from 'events'
import { appendFileSync } from 'fs'
import { join } from 'path'
import os from 'os'
// CRITICAL: Protomux and compact-encoding MUST be loaded synchronously at module level.
// Per Protomux source (_requestSession): if the remote's OPEN frame arrives before
// createChannel() is called AND no pair() handler is registered, the session is
// immediately REJECTED. Dynamic import() yields to the event loop, allowing the
// remote OPEN to arrive during the import delay, causing channel rejection.
// With static imports, Protomux.from() + createChannel() execute synchronously
// in handleConnection, eliminating the race condition.
import Protomux from 'protomux'
import * as c from 'compact-encoding'

// DIAGNOSTICS: File-based logging for main process
function networkLogDir(): string {
  if (process.env.APPDATA) return process.env.APPDATA
  if (process.platform === 'darwin') return join(os.homedir(), 'Library', 'Logs')
  return process.env.XDG_STATE_HOME || join(os.homedir(), '.local', 'state')
}
const LOG_FILE = join(networkLogDir(), 'asgard-network.log')
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
  // FERMETURE : true dès que destroy() est appelé. Les timers périodiques ne
  // doivent plus rien pousser vers l'UI : la BrowserWindow est déjà détruite à
  // ce moment-là, et un `webContents.send` sur un objet détruit lève une
  // exception non rattrapée dans le process principal.
  private shuttingDown = false
  private corestore: CorestoreLike | null = null
  private seed: Buffer | null = null
  private initPromise: Promise<void> | null = null
  private localPublicKey: string | null = null
  private peerPublicKeyMap: Map<string, string> = new Map() // Hyperswarm peerId → Ed25519 pk
  private peerChannels: Map<string, { main: any; media: any; file: any }> = new Map() // Protomux channels per peer
  private peerInfos: Map<string, any> = new Map() // PeerInfo for prioritization
  // KEEP-ALIVE APPLICATIF : le keep-alive Hyperswarm (transport TCP/noise, 15s) ne détecte pas
  // un mux applicatif gelé chez un process distant vivant — la connexion reste "open" alors
  // qu'aucun message applicatif ne circule plus ("ghost online"). Ping 0x03/pong 0x05 sur le
  // canal main ; sans preuve de vie en 60s → destroy → reconnexion auto (handler 'close').
  private peerKeepAlive: Map<string, { timer: NodeJS.Timeout; lastAlive: number }> = new Map()
  // PERFORMANCE: Track peer latency for smart routing
  private peerLatency: Map<string, number> = new Map() // peerId → last ping RTT (ms)
  private peerScores: Map<string, number> = new Map() // peerId → quality score (0-100)
  // Blocked peers (firewall)
  private blockedPeers: Set<string> = new Set()
  // CONFORMITÉ HOLEPUNCH: hyperdht 6.34.0 n'expose pas de dht.firewall() dynamique
  // (le mot "firewall" est absent de hyperdht/index.js) — le firewall se configure
  // via l'option `firewall` du constructeur Hyperswarm (pattern officiel).
  // setFirewall() stocke la règle ici ; le firewall du constructeur la consulte.
  private customFirewall: ((remotePublicKeyHex: string, remoteHandshakePayload: unknown) => boolean) | null = null
  // PERFORMANCE: Periodic re-announce timer for DHT freshness
  private reannounceInterval: ReturnType<typeof setInterval> | null = null
  private static readonly REANNOUNCE_INTERVAL_MS = 60_000 // 1 minute
  // PERFORMANCE: Peer score update timer
  private scoreUpdateInterval: ReturnType<typeof setInterval> | null = null
  private static readonly SCORE_UPDATE_INTERVAL_MS = 15_000 // 15s
  // DHT Profile publishing
  private profileRepublishInterval: ReturnType<typeof setInterval> | null = null
  private static readonly PROFILE_REPUBLISH_INTERVAL_MS = 300_000 // 5 minutes
  // FERMETURE : budgets du teardown réseau. Le filet global (`before-quit` →
  // force-exit 5 s dans ipc/handlers.ts) est PARTAGÉ avec le stockage : sans
  // borne ici, un DHT injoignable mangeait tout le budget et le corestore
  // n'était jamais refermé proprement.
  private static readonly OFFLINE_PUBLISH_TIMEOUT_MS = 1_500
  private static readonly SWARM_DESTROY_TIMEOUT_MS = 1_500
  // BLINDAGE : nombre de tentatives du drain quand la file interne d'hyperswarm
  // est incohérente. `head()` remélange le seau de priorité à chaque tirage, donc
  // un trou dans le tableau est franchi dès la tentative suivante (cf.
  // hardenSwarmQueueDrain).
  private static readonly SWARM_DRAIN_ATTEMPTS = 4
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
  private getDHT(): HyperDHTInstance | undefined {
    return (this.swarm as unknown as { dht?: HyperDHTInstance }).dht;
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
      const { default: HyperDHT } = await import('hyperdht') as unknown as { default: HyperDHTConstructor }

      // CRITICAL FIX: Create HyperDHT with CORRECT options per Holepunch specification.
      // Per HyperDHT docs (https://github.com/holepunchto/hyperdht):
      //   - bootstrap: array of bootstrap nodes (defaults to Pear mainnet)
      //   - keyPair: default key pair for server.listen and connect
      //   - connectionKeepAlive: keep-alive interval (defaults to 5000ms)
      //   - randomPunchInterval: min delay between punch retries (defaults to 20000ms)
      // Per dht-rpc docs (https://github.com/holepunchto/dht-rpc):
      //   - ephemeral: false to become persistent immediately (bypass adaptive mode)
      //   - firewalled: auto-detected, but can be set to false if known open
      //   - fullyBootstrapped(): wait for routing table to be fully populated
      //   - Events: 'bootstrap', 'ready', 'persistent', 'wake-up', 'network-change'
      const dhtOpts: {
        bootstrap?: string[]
        keyPair?: { publicKey: Buffer; secretKey: Buffer }
        port?: number
        connectionKeepAlive?: number
        randomPunchInterval?: number
        ephemeral?: boolean
      } = {}

      // Use default Pear bootstrap nodes (public DHT)
      // These are the official Holepunch bootstrap nodes per hyperdht docs.
      dhtOpts.bootstrap = [
        '88.99.3.86@node1.hyperdht.org:49737',
        '142.93.90.113@node2.hyperdht.org:49737',
        '138.68.147.8@node3.hyperdht.org:49737',
      ]

      // CRITICAL: Set connectionKeepAlive on the DHT (defaults to 5000ms).
      // Higher value (15s) helps maintain connections through NATs.
      dhtOpts.connectionKeepAlive = 15000

      // CRITICAL: Use public randomPunchInterval (not internal _randomPunchInterval).
      // Default is 20000ms. Lower value = faster hole-punch retries for cross-border.
      dhtOpts.randomPunchInterval = 5000

      // NON-EPHEMERAL: Announce ourselves to the DHT as reachable servers.
      // Per dht-rpc docs: "Nodes per default use adaptive mode to decide whether or not
      // they want to join other nodes' routing table. Adaptive mode is conservative,
      // so it might take ~20-30 mins for the node to turn persistent."
      // Setting ephemeral: false bypasses adaptive mode and becomes persistent immediately
      // (assuming open NAT). This is critical for contacts to discover us.
      dhtOpts.ephemeral = false

      // CRITICAL: Generate deterministic keyPair from seed using HyperDHT.keyPair().
      // Per HyperDHT docs: "keyPair = DHT.keyPair([seed]) — Use this method to generate
      // the required keypair for DHT operations. Returns {publicKey, secretKey}."
      // This is the CORRECT way to use a seed — NOT passing seed to constructor.
      let dhtKeyPair: { publicKey: Buffer; secretKey: Buffer } | undefined
      if (this.seed) {
        const HyperDHTModule = await import('hyperdht')
        dhtKeyPair = (HyperDHTModule.default as any).keyPair(this.seed) as { publicKey: Buffer; secretKey: Buffer }
        dhtOpts.keyPair = dhtKeyPair
        logMain(`[NetworkService] 🔑 DHT keyPair generated from seed | publicKey=${dhtKeyPair!.publicKey.toString('hex').slice(0, 16)}`)
      } else {
        logMain('[NetworkService] ⚠️ No identity seed — DHT keyPair will be random')
      }

      const dht = new HyperDHT(dhtOpts)
      logMain(`[NetworkService] 🔧 HyperDHT created | bootstrap=${dhtOpts.bootstrap?.join(', ')} | ephemeral=${dhtOpts.ephemeral} | keepAlive=${dhtOpts.connectionKeepAlive}ms | punchInterval=${dhtOpts.randomPunchInterval}ms`)

      const swarmOpts: {
        maxPeers: number
        firewall: (remotePublicKey: Buffer, remoteHandshakePayload?: unknown) => boolean
        dht: HyperDHTInstance
        keyPair?: { publicKey: Buffer; secretKey: Buffer }
      } = {
        maxPeers: 100,
        // CRITICAL FIX: Pass the deterministic DHT keyPair to Hyperswarm.
        // Per Hyperswarm source (index.js constructor): `keyPair = DHT.keyPair(seed)`
        // defaults to a RANDOM keypair when neither `keyPair` nor `seed` is passed —
        // even when a custom `dht` carrying its own keyPair is provided.
        // A random swarm.keyPair silently breaks two things:
        //   1. swarm.listen() → server.listen(this.keyPair): the server would listen
        //      on a key that changes every restart, so remote peers calling
        //      joinPeer(deriveNoisePublicKey(...)) could NEVER connect to us.
        //   2. dht.mutablePut(this.swarm.keyPair, ...): profiles/status would be
        //      published under a random key that fetchProfile() never derives.
        keyPair: dhtKeyPair,
        // CRITICAL: Non-ephemeral nodes announce themselves to the DHT as reachable servers.
        // Without this, contacts cannot discover or reconnect to us when we are online.
        // Note: `ephemeral` is NOT a Hyperswarm option — handled via DHT constructor above.
        // PERFORMANCE: Firewall blocks known-banned peers
        firewall: (remotePublicKey: Buffer, remoteHandshakePayload?: unknown) => {
          const hex = remotePublicKey.toString('hex')
          if (this.blockedPeers.has(hex)) {
            console.log('[NetworkService] Firewall blocked peer:', hex.slice(0, 16))
            return true // Reject
          }
          // CONFORMITÉ HOLEPUNCH: hyperswarm/index.js appelle _firewall(remotePublicKey,
          // payload) avec le payload du handshake — route la règle dynamique de setFirewall().
          if (this.customFirewall && this.customFirewall(hex, remoteHandshakePayload)) {
            console.log('[NetworkService] Firewall custom rule rejected peer:', hex.slice(0, 16))
            return true // Reject
          }
          return false // Allow
        },
        dht,
      }

      this.swarm = new Hyperswarm(swarmOpts)
      // BLINDAGE posé dès la création de l'instance : le drain de la file
      // d'essaimage peut lever une exception que rien ne rattrape, depuis
      // n'importe quel handler `close`, y compris quand notre teardown ne
      // s'exécute pas (fin de session brutale, force-exit, version installée
      // plus ancienne que le correctif).
      this.hardenSwarmQueueDrain(this.swarm)
      logMain(`[NetworkService] 🔑 swarm.keyPair ${dhtKeyPair ? 'deterministic (seed-derived)' : 'RANDOM (no seed!)'} | publicKey=${(this.swarm as unknown as { keyPair?: { publicKey: Buffer } }).keyPair?.publicKey.toString('hex').slice(0, 16)}`)

      // CRITICAL: Configure underlying DHT for faster hole punching
      // Per HyperDHT/dht-rpc docs:
      //   Events: 'bootstrap', 'ready', 'persistent', 'wake-up', 'network-change'
      //   Properties: host, port, firewalled, ephemeral, id
      //   Methods: fullyBootstrapped(), refresh(), toArray()
      const configuredDht = this.getDHT()
      if (configuredDht) {
        logMain('[NetworkService] 🔧 DHT event listeners registered')

        // CRITICAL: Listen for DHT bootstrap events for diagnostics
        configuredDht.on('bootstrap', () => {
          logMain(`[NetworkService] ✅ DHT BOOTSTRAP | routing table fully populated | nodes=${configuredDht.toArray?.()?.length ?? '?'}`)
        })
        configuredDht.on('ready', () => {
          logMain(`[NetworkService] ✅ DHT READY | fully bootstrapped | host=${configuredDht.host ?? 'unknown'} | port=${configuredDht.port ?? 'unknown'} | firewalled=${configuredDht.firewalled ?? 'unknown'} | ephemeral=${configuredDht.ephemeral ?? 'unknown'}`)
        })

        // HOLEPUNCH BEST PRACTICE: Republish profile/status when the node becomes
        // persistent (non-ephemeral) and after wake-up from sleep.
        const handlePersistent = () => {
          logMain(`[NetworkService] ✅ DHT PERSISTENT | node is now persistent (reachable) | host=${configuredDht.host ?? 'unknown'} | port=${configuredDht.port ?? 'unknown'}`)
          if (this.lastDisplayName) this.publishProfile(this.lastDisplayName).catch(() => {})
          this.publishStatus(this.currentStatus, this.currentStatusMessage).catch(() => {})
        }
        const handleWakeUp = () => {
          logMain('[NetworkService] ⚠️ DHT WAKE-UP | computer resumed from sleep — re-bootstrapping')
          if (this.lastDisplayName) this.publishProfile(this.lastDisplayName).catch(() => {})
          this.publishStatus(this.currentStatus, this.currentStatusMessage).catch(() => {})
        }
        const handleNetworkChange = () => {
          logMain('[NetworkService] ⚠️ DHT NETWORK-CHANGE | interfaces changées — re-bootstrapping')
          if (this.lastDisplayName) this.publishProfile(this.lastDisplayName).catch(() => {})
          this.publishStatus(this.currentStatus, this.currentStatusMessage).catch(() => {})
        }
        configuredDht.on('persistent', handlePersistent)
        configuredDht.on('wake-up', handleWakeUp)
        configuredDht.on('network-change', handleNetworkChange)
      }

      // CRITICAL: Wait for DHT to be fully bootstrapped before proceeding.
      // Per dht-rpc docs: "await node.fullyBootstrapped() — Wait for the node to be fully bootstrapped etc."
      // This ensures the routing table is populated before we try to publish/fetch.
      logMain('[NetworkService] ⏳ Waiting for DHT to fully bootstrap...')
      try {
        await dht.fullyBootstrapped()
        logMain(`[NetworkService] ✅ DHT FULLY BOOTSTRAPPED | host=${dht.host ?? 'unknown'} | port=${dht.port ?? 'unknown'} | firewalled=${dht.firewalled ?? 'unknown'} | ephemeral=${dht.ephemeral ?? 'unknown'} | nodes=${dht.toArray?.()?.length ?? '?'}`)
      } catch (bootstrapErr) {
        logMain(`[NetworkService] ❌ DHT BOOTSTRAP FAILED: ${bootstrapErr instanceof Error ? bootstrapErr.message : String(bootstrapErr)}`)
      }

      // CRITICAL: Start the DHT server before any topic joins.
      // Hyperswarm auto-calls listen() when the first topic is joined as
      // server, but explicit ensures inbound connections are ready early.
      try {
        await (this.swarm as unknown as { listen: () => Promise<void> }).listen()
        logMain(`[NetworkService] ✅ Swarm listening | DHT host=${dht.host ?? 'unknown'} | port=${dht.port ?? 'unknown'}`)
      } catch (err) {
        logMain(`[NetworkService] ❌ swarm.listen() failed: ${err instanceof Error ? err.message : String(err)}`)
      }

      // Handle new peer connections
      this.swarm.on('connection', (conn: PeerSocket, info: PeerInfo) => {
        const peerId = info.publicKey.toString('hex')
        logMain(`[NetworkService] === PEER CONNECTED === ${peerId.slice(0, 32)} | localPublicKey set: ${!!this.localPublicKey}`)
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
      console.log('[NetworkService] Initialized Hyperswarm (keepAlive=15s)')

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
    // HARDENING: toutes les écritures de records mutables sont sérialisées ici.
    // publishProfile et publishStatus dérivent chacun leur `seq` d'un
    // mutableGet({latest:true}) puis écrivent seq+1 : appelés en parallèle
    // (démarrage, intervalle interne 5 min, boucle 30 s du renderer, wake-up,
    // re-public sur connexion de pair), ils envoient le MÊME seq avec des
    // VALEURS DIFFÉRENTES → les nœuds répondent SEQ_REUSED
    // (hyperdht/lib/persistent.js:onmutableput) et hyperdht ne remonte jamais
    // l'erreur : mutablePut se résout normalement. Une écriture sur deux était
    // donc perdue en silence, ce qui peut figer l'horodatage vu par les
    // contacts (présence unilatérale « il me voit mais je ne le vois pas »).
    this.lastDisplayName = displayName
    return this.enqueueDhtWrite('publishProfile', () => this.doPublishProfile(displayName))
  }

  private async doPublishProfile(displayName: string): Promise<boolean> {
    if (!this.swarm) return false
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
        // AUTO-DÉCLARATION de la clé Ed25519 : permet à un contact qui lit cet
        // enregistrement de détecter une entrée obsolète (identité régénérée
        // après un import de seed phrase par exemple) au lieu d'afficher
        // silencieusement « hors ligne » sur un record gelé depuis des jours.
        identityPk: this.localPublicKey || undefined,
      }

      const value = Buffer.from(JSON.stringify(profile))
      const keyPair = (this.swarm as unknown as { keyPair?: { publicKey: Buffer; secretKey: Buffer } }).keyPair
      if (!keyPair) {
        console.warn('[NetworkService] No keyPair available for profile publishing')
        return false
      }
      if (value.length > 1000) {
        console.warn('[NetworkService] Profile too large for DHT:', value.length, 'bytes — truncating')
        // Truncate displayName to fit
        const trimmed = { displayName: displayName.slice(0, 50), timestamp: Date.now(), version: 2, status: this.currentStatus, statusMessage: this.currentStatusMessage, identityPk: this.localPublicKey || undefined }
        const trimmedValue = Buffer.from(JSON.stringify(trimmed))
        return this.mutablePutLatest(dht, keyPair, trimmedValue)
      }

      const landed = await this.mutablePutLatest(dht, keyPair, value)
      console.log('[NetworkService] ' + (landed ? '✅' : '⚠️') + ' Profile ' + (landed ? 'published' : 'NOT published (rejeté par les nœuds DHT)') + ' to DHT:', displayName,
        '| DHT key:', keyPair.publicKey.toString('hex').slice(0, 16),
        '| status:', this.currentStatus)

      // Start periodic republish if not already running
      if (!this.profileRepublishInterval) {
        this.profileRepublishInterval = setInterval(() => {
          this.publishProfile(this.lastDisplayName).catch(() => {})
          this.publishStatus(this.currentStatus, this.currentStatusMessage).catch(() => {})
        }, NetworkService.PROFILE_REPUBLISH_INTERVAL_MS)
      }

      return landed
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
    // Sérialisé avec publishProfile — voir enqueueDhtWrite().
    return this.enqueueDhtWrite('publishStatus', () => this.doPublishStatus(status, statusMessage))
  }

  private async doPublishStatus(status: 'online' | 'away' | 'offline' | 'dnd', statusMessage?: string): Promise<boolean> {
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
      let existingSeq: number | undefined
      try {
        const existing = await dht.mutableGet(keyPair.publicKey, { latest: true }) as { value?: Buffer; seq?: number } | null
        if (existing?.value) {
          existingProfile = JSON.parse(existing.value.toString())
        }
        if (existing && typeof existing.seq === 'number') {
          existingSeq = existing.seq
        }
      } catch {}

      const profile: DHTProfile = {
        // CRITICAL FIX: Use lastDisplayName (set by publishProfile) instead of
        // defaulting to 'Unknown'. This prevents the displayName from being
        // overwritten to 'Unknown' when publishStatus is called before publishProfile.
        displayName: existingProfile.displayName || this.lastDisplayName || 'Unknown',
        timestamp: Date.now(),
        version: 2,
        status,
        statusMessage,
        lastSeen: status === 'offline' ? Date.now() : existingProfile.lastSeen,
        identityPk: this.localPublicKey || existingProfile.identityPk || undefined,
      }

      const value = Buffer.from(JSON.stringify(profile))
      logMain(`[NetworkService] 📡 DHT PUBLISH | name=${profile.displayName} | status=${status} | valueSize=${value.length} | dhtKey=${keyPair.publicKey.toString('hex').slice(0, 16)}`)
      let landed: boolean
      if (value.length > 1000) {
        // Truncate statusMessage to fit
        profile.statusMessage = statusMessage?.slice(0, 100)
        const trimmedValue = Buffer.from(JSON.stringify(profile))
        landed = await this.mutablePutLatest(dht, keyPair, trimmedValue, existingSeq)
      } else {
        landed = await this.mutablePutLatest(dht, keyPair, value, existingSeq)
      }
      logMain(`[NetworkService] ${landed ? '✅ DHT PUBLISH SUCCESS' : '❌ DHT PUBLISH REJECTED (record non atterri sur le réseau)'} | status=${status} | size=${value.length}`)
      return landed
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
   * HOLEPUNCH CONFORMANCE: dht.mutablePut() signs with `seq = opts.seq || 0` (hyperdht
   * index.js) and DHT nodes reject records whose seq is not strictly greater than the
   * stored one — hyperdht/lib/persistent.js onmutableput() replies SEQ_REUSED when
   * seq === existing.seq with a different value, and SEQ_TOO_LOW when seq < existing.seq.
   * Publishing without an increasing seq therefore fails silently after the very first
   * write. This helper resolves the latest stored seq via mutableGet({ latest: true })
   * and writes with seq + 1, matching the official HyperDHT mutable-record pattern.
   *
   * CRITICAL: `mutablePut` est un fire-and-forget — il résout sa promise même
   * lorsque TOUS les nœuds interrogés ont rejeté l'écriture (hyperdht/index.js:365-399,
   * les erreurs ne sont que dans `closestNodes`). L'ancienne version retournait donc
   * void et l'app affirmait « statut publié » sur un réseau qui n'avait rien reçu.
   * Cette version relit l'enregistrement et ne déclare le succès que si la valeur lue est
   * OCTET POUR OCTET celle envoyée (un autre writer au même seq produirait une valeur
   * différente), avec autant de tentatives que nécessaire en repartant du seq réellement
   * stocké. Retourne false uniquement après épuisement des tentatives.
   */
  private async mutablePutLatest(
    dht: HyperDHTInstance,
    keyPair: { publicKey: Buffer; secretKey: Buffer },
    value: Buffer,
    knownSeq?: number
  ): Promise<boolean> {
    const MAX_ATTEMPTS = 3
    let seq = knownSeq
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (seq === undefined) {
        seq = 0
        try {
          const existing = await dht.mutableGet(keyPair.publicKey, { latest: true }) as { seq?: number } | null
          if (existing && typeof existing.seq === 'number') {
            seq = existing.seq
          }
        } catch {
          // No stored record yet (or transient lookup failure) — start from a fresh seq.
        }
      }
      const sentSeq = seq + 1
      try {
        await dht.mutablePut(keyPair, value, { seq: sentSeq })
      } catch (err) {
        logMain(`[NetworkService] ❌ mutablePut threw | seq=${sentSeq} | err=${err instanceof Error ? err.message : String(err)}`)
      }
      // VÉRIFICATION: relire et comparer — seul moyen de détecter un rejet
      // SEQ_REUSED/SEQ_TOO_LOW, que hyperdht avale silencieusement.
      try {
        const after = await dht.mutableGet(keyPair.publicKey, { latest: true }) as { seq?: number; value?: Uint8Array } | null
        if (after?.value && Buffer.compare(Buffer.from(after.value), value) === 0) {
          if (attempt > 1) logMain(`[NetworkService] ✅ DHT mutable record landed on attempt ${attempt} | seq=${sentSeq}`)
          return true
        }
        const storedSeq = after && typeof after.seq === 'number' ? after.seq : 0
        logMain(`[NetworkService] ⚠️ DHT WRITE NOT LANDED | attempt=${attempt}/${MAX_ATTEMPTS} | sent seq=${sentSeq} | stored seq=${storedSeq} ${storedSeq === sentSeq ? '(SEQ_REUSED: une autre valeur occupe ce seq)' : '(SEQ_TOO_LOW / non propagé)'} — retry depuis le seq stocké`)
        seq = storedSeq
      } catch (err) {
        logMain(`[NetworkService] ⚠️ DHT write verification unreadable | attempt=${attempt}/${MAX_ATTEMPTS} | err=${err instanceof Error ? err.message : String(err)}`)
        seq = undefined
      }
    }
    logMain('[NetworkService] ❌ DHT WRITE FAILED after all attempts — le réseau garde un enregistrement périmé (présence unilatérale probable)')
    return false
  }

  /**
   * File d'attente FIFO des écritures de records mutables DHT.
   * Garantit qu'une seule séquence (lecture du seq → écriture seq+1 → vérification)
   * est en vol à la fois, ce qui supprime les collisions SEQ_REUSED entre
   * publishProfile et publishStatus (appelés en parallèle au démarrage, par la
   * boucle 30 s du renderer, l'intervalle 5 min interne, les évènements
   * persistent/wake-up/network-change et la re-public sur connexion de pair).
   */
  private dhtWriteQueue: Promise<unknown> = Promise.resolve()

  private enqueueDhtWrite<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const run = this.dhtWriteQueue.then(fn, fn)
    // La file ne doit jamais se bloquer sur un rejet.
    this.dhtWriteQueue = run.then(() => undefined, (err) => {
      console.warn(`[NetworkService] DHT write ${label} failed:`, err instanceof Error ? err.message : String(err))
      return undefined
    })
    return run
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
      console.log('[NetworkService] Profile cache hit for:', publicKeyHex.slice(0, 16), '| age:', Math.round((Date.now() - cached.timestamp) / 1000) + 's')
      return cached.data
    }

    try {
      const dht = this.getDHT()
      if (!dht) {
        console.warn('[NetworkService] DHT not available for profile fetch')
        return null
      }

      // CRITICAL: Ensure DHT is fully bootstrapped before lookup.
      // Without this, mutableGet can fail silently because the node hasn't
      // connected to enough DHT bootstrap nodes yet.
      await dht.fullyBootstrapped().catch(() => {})

      // CRITICAL: The DHT mutable record key is NOT the raw Ed25519 public key.
      // setIdentity derives the Hyperswarm seed as sha256(ed25519PublicKeyHex),
      // and Hyperswarm derives its keyPair from that seed. We must derive the
      // same keyPair here so the lookup matches the published record.
      const crypto = await import('crypto')
      const seed = crypto.createHash('sha256').update(publicKeyHex).digest()
      const HyperDHT = await import('hyperdht')
      const keyPair = HyperDHT.default.keyPair(seed)
      const publicKey = keyPair.publicKey

      console.log('[NetworkService] Fetching DHT profile for:', publicKeyHex.slice(0, 16), '| DHT key:', publicKey.toString('hex').slice(0, 16))
      logMain(`[NetworkService] 🔍 DHT FETCH | peer=${publicKeyHex.slice(0, 16)} | dhtKey=${publicKey.toString('hex').slice(0, 16)}`)

      // Try up to 3 times — DHT lookups can fail due to propagation delays,
      // especially for cross-border connections (e.g. Belgium ↔ France).
      let result: { value?: Buffer } | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await dht.mutableGet(publicKey, { latest: true }) as { value?: Buffer } | null
          if (result?.value) {
            logMain(`[NetworkService] ✅ DHT FETCH SUCCESS on attempt ${attempt + 1} | peer=${publicKeyHex.slice(0, 16)} | valueSize=${result.value.length}`)
            break
          }
          logMain(`[NetworkService] ⚠️ DHT FETCH NOT FOUND on attempt ${attempt + 1} | peer=${publicKeyHex.slice(0, 16)}`)
          // Wait before retry — increasing backoff: 1.5s, 3s
          if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
        } catch (err) {
          logMain(`[NetworkService] ❌ DHT FETCH ERROR on attempt ${attempt + 1}: ${err instanceof Error ? err.message : String(err)}`)
          if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
        }
      }

      if (!result || !result.value) {
        logMain(`[NetworkService] ⚠️ DHT FETCH FAILED after 3 attempts | peer=${publicKeyHex.slice(0, 16)}`)
        return null
      }

      const profile: DHTProfile = JSON.parse(result.value.toString())
      const ageSeconds = profile.timestamp ? Math.round((Date.now() - profile.timestamp) / 1000) : 0

      // Cache the result
      this.profileCache.set(publicKeyHex, { data: profile, timestamp: Date.now() })

      logMain(`[NetworkService] ✅ DHT PROFILE | peer=${publicKeyHex.slice(0, 16)} | name=${profile.displayName} | status=${profile.status || 'none'} | age=${ageSeconds}s`)
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
    if (!this.swarm) {
      console.warn('[NetworkService] joinPeer: swarm not initialized')
      return
    }
    const keyBuffer = Buffer.from(noisePublicKeyHex, 'hex')
    console.log('[NetworkService] joinPeer: calling swarm.joinPeer for', noisePublicKeyHex.slice(0, 16) + '...')
    this.swarm.joinPeer(keyBuffer)
    // CRITICAL: Reset Hyperswarm's internal attempts counter.
    // Per Hyperswarm source: peers with attempts >= 5 are skipped in _attemptClientConnections.
    // Without this, after 5 failed attempts, Hyperswarm silently stops trying.
    const peers = (this.swarm as unknown as { peers?: Map<string, { attempts?: number }> }).peers
    const peerInfo = peers?.get(noisePublicKeyHex)
    if (peerInfo) {
      peerInfo.attempts = 0
      console.log('[NetworkService] joinPeer: reset attempts for', noisePublicKeyHex.slice(0, 16) + '...')
    }
    console.log('[NetworkService] joinPeer: initiated for', noisePublicKeyHex.slice(0, 16) + '...')
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

    // CONNECTIVITY: joinPeer() only takes publicKey (no opts).
    // Per Hyperswarm source: joinPeer(publicKey) — sets peerInfo.explicit = true
    // and enqueues for connection. The prioritized flag must be set separately
    // on the PeerInfo object AFTER joinPeer creates it.
    this.swarm.joinPeer(keyBuffer)

    // Configure PeerInfo for optimal reconnection behavior.
    // Per Hyperswarm source (peer-info.js):
    // - peers with attempts > 3 are deprioritized and skipped by _updatePriority()
    // - `prioritized` is a GETTER (return this.priority >= NORMAL_PRIORITY), NOT a setter
    // - To prioritize, set `priority` to HIGH_PRIORITY (3) or VERY_HIGH_PRIORITY (4)
    // - Prioritized peers skip _reset() in _handlePeer, maintaining proven/tried state
    const peers = (this.swarm as unknown as { peers?: Map<string, { priority?: number; attempts?: number }> }).peers
    const peerInfo = peers?.get(noisePublicKeyHex)
    if (peerInfo) {
      // CRITICAL: Reset attempts counter so Hyperswarm will retry connection.
      // Without this, after 5 failed attempts, the peer is silently skipped.
      peerInfo.attempts = 0
      if (prioritized) {
        // VERY_HIGH_PRIORITY = 4 (Hyperswarm constants)
        // This ensures `prioritized` getter returns true (priority >= 2)
        // AND skips _reset() in _handlePeer, preserving proven/tried state
        peerInfo.priority = 4
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
    const peer = this.peers.get(this.resolvePeerKey(peerId))
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

    // CRITICAL FIX: Wait for Protomux channel to be ready instead of throwing.
    // The peer may be marked 'connected' in the network store before the Protomux
    // channel handshake completes. Without this wait, presence:update and other
    // messages sent during this window are silently lost — causing the "both online
    // but can't see each other" bug.
    if (!peer.sendMessage) {
      const MAX_WAIT = 5000 // 5s max wait for channel (typical: 1-2s)
      const POLL_INTERVAL = 200
      let waited = 0
      while (!peer.sendMessage && waited < MAX_WAIT) {
        // Check if peer was disconnected while waiting
        if (!this.peers.has(peerId) && !this.peers.has(peer.id)) {
          throw new Error(`Peer ${peerId.slice(0, 16)} disconnected while waiting for channel`)
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
        waited += POLL_INTERVAL
        // Re-fetch peer in case it was updated
        peer = this.peers.get(peerId) ?? this.peers.get(peer.id) ?? peer
      }
      if (!peer.sendMessage) {
        throw new Error(`Protomux channel not ready for peer ${peerId.slice(0, 16)} after ${MAX_WAIT}ms`)
      }
      logMain(`[NetworkService] ⏳ Channel ready after ${waited}ms wait for peer ${peerId.slice(0, 16)}`)
    }

    // PERFORMANCE: Avoid unnecessary Buffer copy if data is already a Buffer
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
    
    // DIAGNOSTIC: Log message sends to help debug presence issues
    let sentMsgType = 'unknown'
    try {
      const preview = buf.toString('utf-8', 0, Math.min(buf.length, 100))
      if (preview.startsWith('{')) {
        const parsed = JSON.parse(preview)
        sentMsgType = parsed?.type ?? 'json-no-type'
      }
    } catch {}
    
    // CRITICAL DIAGNOSTIC: Log send attempt with channel state
    const channelState = {
      hasSendMessage: !!peer.sendMessage,
      hasSendMethod: typeof peer.sendMessage?.send === 'function',
      socketDestroyed: peer.socket?.destroyed ?? 'unknown',
    }
    logMain(`[NetworkService] 📤 SEND to ${peerId.slice(0, 16)} | type=${sentMsgType} | size=${buf.length} | state=${JSON.stringify(channelState)}`)
    
    // Un canal Protomux fermé conserve ses message handles et retourne false de
    // send() en avalant la trame : sans ce garde, le « ✅ SEND SUCCESS » ci-dessous
    // mentait et l'émetteur ne pouvait ni persister ni remettre en file.
    if (peer.socket.destroyed || peer.socket.destroying) {
      throw new Error(`Socket closed for peer ${peerId.slice(0, 16)}`)
    }
    if (this.peerChannels.get(this.resolvePeerKey(peerId))?.main?.closed) {
      throw new Error(`Protomux channel closed for peer ${peerId.slice(0, 16)}`)
    }

    try {
      peer.sendMessage.send(buf)
      this.trackBandwidth(buf.length, 0)
      logMain(`[NetworkService] ✅ SEND SUCCESS to ${peerId.slice(0, 16)}`)
    } catch (sendErr) {
      logMain(`[NetworkService] ❌ SEND FAILED to ${peerId.slice(0, 16)}: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`)
      throw sendErr
    }
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
   * CONFORMITÉ (résolution unifiée) : accepte indifféremment le Noise peer id
   * ou la clé publique Ed25519 du contact, et retourne la clé interne (Noise)
   * qui indexe this.peers / this.peerChannels / this.peerInfos. send() faisait
   * déjà cette résolution, mais corkChannel()/uncorkChannel()/isChannelOpen()/
   * isPeerConnected()/… non — le renderer (ex. FileService) passant la clé
   * Ed25519, le cork/uncork des transferts de fichiers était silencieusement
   * sans effet. Retourne l'entrée inchangée quand aucun mapping n'est connu.
   */
  private resolvePeerKey(peerId: string): string {
    if (this.peers.has(peerId)) return peerId
    return this.resolveNoisePeerId(peerId) ?? peerId
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
    // (peerChannels is keyed by Noise id — resolve Ed25519 keys the same way send() does)
    const channels = this.peerChannels.get(this.resolvePeerKey(peerId))
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
   * Resolves only after SecretStream flushes its encrypted buffers and transport.
   */
  async sendFileData(peerId: string, data: Uint8Array): Promise<void> {
    const noiseId = this.resolvePeerKey(peerId)
    const peer = this.peers.get(noiseId)
    if (!peer) {
      throw new Error(`Peer ${peerId.slice(0, 16)} not found`)
    }
    if (peer.socket.destroyed || peer.socket.destroying) {
      throw new Error(`Socket closed for peer ${peerId.slice(0, 16)}`)
    }

    const channels = this.peerChannels.get(noiseId)
    const message = peer.sendFile ?? peer.sendMedia
    const channel = peer.sendFile ? channels?.file : channels?.media
    if (!message || !channel) {
      throw new Error(`File transfer channel not available for peer ${peerId.slice(0, 16)}`)
    }
    // A closed Protomux channel also returns false from send(), but drops the data.
    if (channel.closed) {
      throw new Error(`File transfer channel closed for peer ${peerId.slice(0, 16)}`)
    }

    let buf: Buffer
    if (peer.sendFile) {
      buf = Buffer.from(data)
    } else {
      // Preserve the media fallback framing used by older peers.
      buf = Buffer.alloc(1 + data.length)
      buf[0] = 0x04 // FILE_TRANSFER_MARKER
      Buffer.from(data).copy(buf, 1)
    }

    // send(false) on an open channel means backpressure, not failure.
    // Even send(true) only queues the data: completion must wait for the flush.
    message.send(buf)
    if (!(await peer.socket.flush())) {
      throw new Error(`File transfer flush failed for peer ${peerId.slice(0, 16)}`)
    }
    this.trackBandwidth(buf.length, 0)
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
   * PERFORMANCE: Cork the Protomux mux for a peer.
   * Buffers all messages across ALL channels and sends them in a single batch on uncork().
   * Ideal for file transfers and bulk operations.
   *
   * CRITICAL: Per Protomux source, cork()/uncork() are reference-counted on the shared mux.
   * All channels (asgard, asgard-media, asgard-files) share the SAME mux instance.
   * We must cork the mux exactly ONCE — not once per channel — to avoid unbalanced
   * reference counting when some channels are null (causing the batch to never flush).
   */
  corkChannel(peerId: string): void {
    const channels = this.peerChannels.get(this.resolvePeerKey(peerId))
    // Cork the shared mux exactly once via any available channel
    const anyChannel = channels?.main ?? channels?.media ?? channels?.file
    if (anyChannel?.cork) {
      anyChannel.cork()
    }
  }

  /**
   * PERFORMANCE: Uncork the Protomux mux, flushing all buffered messages.
   * Must be called exactly once per corkChannel() call.
   */
  uncorkChannel(peerId: string): void {
    const channels = this.peerChannels.get(this.resolvePeerKey(peerId))
    // Uncork the shared mux exactly once via any available channel
    const anyChannel = channels?.main ?? channels?.media ?? channels?.file
    if (anyChannel?.uncork) {
      anyChannel.uncork()
    }
  }

  /**
   * PERFORMANCE: Mark a peer as prioritized for fast reconnection.
   * Per Hyperswarm source (peer-info.js): `prioritized` is a getter
   * (return this.priority >= NORMAL_PRIORITY). To set priority,
   * we must write to `priority` directly.
   * VERY_HIGH_PRIORITY = 4, HIGH_PRIORITY = 3, NORMAL_PRIORITY = 2
   */
  prioritizePeer(peerId: string, prioritized: boolean): void {
    const info = this.peerInfos.get(this.resolvePeerKey(peerId))
    if (info) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (info as any).priority = prioritized ? 4 : 2 // VERY_HIGH_PRIORITY or NORMAL_PRIORITY
        console.log('[NetworkService] Peer', peerId.slice(0, 16), 'priority set to:', prioritized ? 'VERY_HIGH (4)' : 'NORMAL (2)')
      } catch {
        // PeerInfo.priority is read-only in this Hyperswarm version — skip silently
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
      (this.swarm as unknown as { maxPeers: number }).maxPeers = config.maxPeers
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
      // Read the real configured limit from the Hyperswarm instance (was previously
      // reading a non-existent service property — always returned the default 64)
      maxPeers: this.swarm?.maxPeers ?? 100,
      // OPTIMIZATION: Expose active Protomux channel count
      activeChannels: this.peerChannels.size,
    }
  }

  /**
   * CONNECTIVITÉ : instantané PULL des pairs réellement connectés dans ce
   * processus.
   *
   * NÉCESSAIRE : les évènements `network:peer` / `network:peerIdentified` sont
   * uniquement PUSH (forwardés vers le renderer par handlers.ts). Or le swarm
   * démarre dès `network:setIdentity`, donc tout pair qui se connecte avant que
   * `p2pService.initialize()` n'enregistre ses listeners est perdu sans retour
   * possible : le socket vit ici (`this.peers`, `send()` y écrit même avec
   * succès) alors que le renderer croit voir `peers=0`. Il n'envoie alors ni
   * présence ni messages, et le contact nous voit « hors ligne » alors que nous
   * le voyons « en ligne » via le DHT — asymétrie exacte des logs.
   *
   * Cette méthode permet la réconciliation (et un filet périodique contre tout
   * évènement égaré : rechargement de fenêtre, navigation, perte d'évènement).
   */
  getLivePeers(): Array<{
    id: string
    publicKey: string
    remotePublicKey: string
    ed25519PublicKey: string | null
    connected: true
    channelReady: boolean
  }> {
    const list: Array<{
      id: string
      publicKey: string
      remotePublicKey: string
      ed25519PublicKey: string | null
      connected: true
      channelReady: boolean
    }> = []
    for (const [peerId, peer] of this.peers.entries()) {
      list.push({
        id: peerId,
        publicKey: peerId,
        remotePublicKey: peer.socket?.remotePublicKey?.toString('hex') ?? peerId,
        ed25519PublicKey: this.peerPublicKeyMap.get(peerId) ?? null,
        connected: true,
        channelReady: !!peer.sendMessage,
      })
    }
    return list
  }

  /**
   * Check if a Protomux channel is open for a specific peer.
   * OPTIMIZATION: Avoids creating duplicate channels.
   */
  isChannelOpen(peerId: string): boolean {
    const channels = this.peerChannels.get(this.resolvePeerKey(peerId))
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
    const peer = this.peers.get(this.resolvePeerKey(peerId))
    if (!peer?.socket?.handshakeHash) return null
    return peer.socket.handshakeHash.toString('hex')
  }

  /**
   * Get precise bandwidth metrics from SecretStream for a peer.
   * OPTIMIZATION: Uses rawBytesWritten/rawBytesRead for encrypted traffic measurement.
   * More accurate than sliding window as it measures actual encrypted bytes.
   */
  getPeerBandwidth(peerId: string): { written: number; read: number } | null {
    const peer = this.peers.get(this.resolvePeerKey(peerId))
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
    const peer = this.peers.get(this.resolvePeerKey(peerId))
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

        // CONNECTIVITY: After resume, re-announce all topics to refresh DHT entries.
        // During suspend, DHT records may have expired or been garbage-collected.
        // Without re-announce, peers cannot discover us after waking from sleep.
        this.reannounceTopics()

        // CONNECTIVITY: Re-publish profile and status to DHT.
        // The previous DHT records may be stale after suspend.
        if (this.lastDisplayName) this.publishProfile(this.lastDisplayName).catch(() => {})
        this.publishStatus(this.currentStatus, this.currentStatusMessage).catch(() => {})

        // CONNECTIVITY: Flush to ensure DHT entries are fully propagated.
        // Critical for cross-border connections where peers need to discover
        // us through the DHT before they can connect.
        this.flush().catch(() => {})

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
   * CONFORMITÉ HOLEPUNCH (pattern officiel hyperswarm/lib/peer-discovery.js:110):
   * `dht.announce(topic, swarm.keyPair, swarm.server.relayAddresses, opts)` — le 3e
   * argument relayAddresses est requis (hyperdht/index.js:254 n'a pas de valeur par
   * défaut) ; sans lui l'announce échoue au commit.
   * Useful for custom discovery mechanisms.
   */
  async dhtAnnounce(topic: Buffer): Promise<boolean> {
    if (!this.swarm) return false

    const dht = (this.swarm as unknown as { dht?: {
      announce: (topic: Buffer, keyPair: { publicKey: Buffer; secretKey: Buffer }, relayAddresses: Array<{ host: string; port: number }>) => AsyncIterable<unknown>
    } }).dht

    if (!dht || typeof dht.announce !== 'function') {
      return false
    }

    const keyPair = (this.swarm as unknown as { keyPair?: { publicKey: Buffer; secretKey: Buffer } }).keyPair
    if (!keyPair) return false

    const relayAddresses = this.swarm.server?.relayAddresses ?? []

    try {
      for await (const _ of dht.announce(topic, keyPair, relayAddresses)) {
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
    // CONFORMITÉ HOLEPUNCH: `keyPair(seed)` est une méthode STATIQUE de HyperDHT
    // (hyperdht/index.js:458) — `dht.keyPair` d'instance n'existe pas (l'ancien code
    // retournait donc toujours null). Même pattern que setSeed()/_doInitialize().
    try {
      const HyperDHTModule = await import('hyperdht') as unknown as { default: HyperDHTConstructor }
      const keyPair = HyperDHTModule.default.keyPair(seed)
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
    // Fenêtre fermée → plus personne à informer : inutile de réveiller l'IPC.
    if (this.shuttingDown) return
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

    // CONNECTIVITY: Flush after re-announce to ensure DHT entries propagate.
    // Essential for cross-border discovery where DHT records take longer to spread.
    this.flush().catch(() => {})
  }

  /**
   * GEL DE LA MACHINERIE DE RE-CONNEXION — à appeler avant toute attente du shutdown.
   *
   * Hyperswarm draine sa file de pairs à connecter depuis les handlers `close`
   * de chaque stream chiffré (`_connectDone` → `_attemptClientConnections`,
   * hyperswarm/index.js:276-307). Or pendant tout le teardown les connexions
   * meurent une à une (on a coupé nos keep-alive, le pair cesse de répondre) :
   * la boucle `while (this._queue.length && this._shouldConnect())` peut alors
   * sortir un `peerInfo` null et lever
   * `TypeError: Cannot set properties of null (setting 'queued')` — exception
   * levée dans un callback de la librairie, donc hors de portée de notre `try`,
   * et qui affichait la boîte d'erreur à la fermeture.
   *
   * `swarm.suspended` est le drapeau que la librairie consulte en tête de
   * `_attemptClientConnections()` (`if (this._drainingQueue || this.suspended)
   * return`) et que `suspend()` pose lui-même avant de détruire ses streams —
   * `destroy()`, lui, ne le pose jamais. Le poser est donc le geste attendu :
   * la machine à re-connecter est gelée, le DHT reste utilisable (la publication
   * « offline » passe par `swarm.dht`).
   */
  private quiesceSwarm(): void {
    if (!this.swarm) return
    this.swarm.suspended = true
  }

  /**
   * BLINDAGE INDÉPENDANT DU CHEMIN DE FERMETURE — à poser à la création du swarm.
   *
   * `quiesceSwarm()` gèle la machine à re-connexion, mais seulement si notre
   * teardown s'exécute. La file interne d'hyperswarm 4.17.1 peut, elle, être
   * incohérente pendant toute la vie du swarm : `ShuffledPriorityQueue.head()`
   * (shuffled-priority-queue/index.js:19) tire un élément AU HASARD dans le seau
   * de priorité, et un trou laissé dans ce tableau par un `remove()` compte
   * toujours dans `length` (l.11). Le `while (this._queue.length &&
   * this._shouldConnect())` d'hyperswarm/index.js:300 entre alors en boucle sur
   * un `shift()` qui rend null, et l'écriture `peerInfo.queued = false` (l.302)
   * tue le process principal.
   *
   * Remplacer la méthode sur NOTRE instance est le seul point dont nous sommes
   * maîtres sans patcher `node_modules` : la librairie ne l'appelle que via
   * `this._attemptClientConnections()`, notre propriété d'instance masque donc
   * celle du prototype pour tous les appelants (`_connectDone`, handlers
   * `close`, `resume()`, retry timer…).
   *
   * Attraper ne suffit pas : la garde d'entrée teste `_drainingQueue`, qui
   * resterait à true après l'exception et figerait l'essaimage pour toute la
   * session. Le drain est donc ré-essayé `SWARM_DRAIN_ATTEMPTS` fois — chaque
   * tirage remélangeant le seau, un pair sauté ce tour-ci est de toute façon
   * re-propagé par la découverte.
   */
  private hardenSwarmQueueDrain(swarm: HyperswarmInstance): void {
    const mutable = swarm as unknown as {
      _attemptClientConnections?: () => void
      _drainingQueue?: boolean
    }
    const drain = typeof mutable._attemptClientConnections === 'function'
      ? mutable._attemptClientConnections.bind(swarm)
      : null
    if (!drain) {
      logMain('[NetworkService] ⚠️ hyperswarm._attemptClientConnections introuvable — blindage non posé')
      return
    }

    let failures = 0
    mutable._attemptClientConnections = (): void => {
      for (let attempt = 1; attempt <= NetworkService.SWARM_DRAIN_ATTEMPTS; attempt++) {
        try {
          drain()
          return
        } catch (err) {
          // File incohérente : on remet la garde d'entrée en état puis on
          // retente, jusqu'à franchir le trou. Le dernier échec est journalisé —
          // jamais masqué — pour rester diagnostiquable chez l'utilisateur.
          mutable._drainingQueue = false
          if (attempt === NetworkService.SWARM_DRAIN_ATTEMPTS) {
            failures++
            const message = err instanceof Error ? err.message : String(err)
            logMain(`[NetworkService] ⚠️ file d'essaimage hyperswarm incohérente, drain n°${failures} neutralisé: ${message}`)
          }
        }
      }
    }
  }

  /**
   * Attend `p` au plus `ms`, puis l'abandonne. En fermeture, aucune promesse
   * réseau ne doit immobiliser le reste du teardown (le stockage attend son
   * tour, et un force-exit à 5 s attend derrière). Les rejets tardifs de la
   * promesse abandonnée sont avalés : un `publishStatus` qui échoue deux
   * secondes après le délai n'a plus personne à prévenir.
   */
  private static async bounded<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const guard = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms) })
    p.catch(() => { /* échec tardif : trop tard pour en faire quoi que ce soit */ })
    try {
      return await Promise.race([p, guard])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /**
   * Destroy the swarm and clean up
   */
  async destroy(): Promise<void> {
    // FERMETURE PROPRE : coupure des timers AVANT toute attente. `publishStatus`
    // ci-dessous est réseau (DHT, jusqu'à plusieurs secondes) et le shutdown est
    // séquentiel : tant qu'il durait, `scoreUpdateInterval` continuait d'émettre
    // `status:update` vers une fenêtre déjà détruite — le `webContents.send` du
    // handler levait alors `TypeError: Object has been destroyed`, affiché sous
    // forme de boîte d'erreur JavaScript à chaque fermeture.
    this.shuttingDown = true
    if (this.reannounceInterval) {
      clearInterval(this.reannounceInterval)
      this.reannounceInterval = null
    }
    if (this.scoreUpdateInterval) {
      clearInterval(this.scoreUpdateInterval)
      this.scoreUpdateInterval = null
    }
    if (this.profileRepublishInterval) {
      clearInterval(this.profileRepublishInterval)
      this.profileRepublishInterval = null
    }
    // KEEP-ALIVE : arrêter tous les timers de vie des pairs (anti-fuite au shutdown)
    for (const ka of this.peerKeepAlive.values()) {
      clearInterval(ka.timer)
    }
    this.peerKeepAlive.clear()

    // Geler la machinerie de re-connexion AVANT la moindre attente : dès ici les
    // connexions qui meurent ne relancent plus la file de l'essaimage, qui était
    // à l'origine de la boîte d'erreur à la fermeture (cf. quiesceSwarm()).
    this.quiesceSwarm()

    // CRITICAL: Publish 'offline' status to DHT before destroying the swarm.
    // This ensures contacts don't see us as 'online' after we've closed the app.
    // Without this, our last-published 'online' status persists in the DHT.
    // Mais borné : `doPublishStatus` attend `fullyBootstrapped()`, qui peut ne
    // jamais revenir sur un réseau mort, et le teardown du stockage attend derrière.
    try {
      const published = await NetworkService.bounded(
        this.publishStatus('offline'),
        NetworkService.OFFLINE_PUBLISH_TIMEOUT_MS,
      )
      if (published === undefined) {
        console.warn('[NetworkService] Statut offline non confirmé dans le délai — fermeture poursuivie')
      } else {
        console.log('[NetworkService] Published offline status to DHT before shutdown')
      }
    } catch (err) {
      console.warn('[NetworkService] Failed to publish offline status before shutdown:', err)
    }

    if (this.swarm) {
      // `force` : le chemin normal attendrait le `clear()` de toutes les sessions
      // de découverte, plusieurs secondes sur un DHT lent — alors que le
      // force-exit de `quitCleanups` tourne déjà en parallèle. Ce que le
      // corestore attend de nous, à savoir les streams de réplication fermés par
      // `dht.destroy()`, est bien conservé dans ce chemin.
      try {
        await NetworkService.bounded(
          this.swarm.destroy({ force: true }),
          NetworkService.SWARM_DESTROY_TIMEOUT_MS,
        )
      } catch (err) {
        console.warn('[NetworkService] swarm.destroy() a échoué — fermeture poursuivie:', err)
      }
      this.swarm = null
    }
    this.peers.clear()
    this.topics.clear()
    this.profileCache.clear()
    this.reconnectAttempts.clear()
    this.peerPublicKeyMap.clear()
    this.peerLatency.clear()
    this.peerScores.clear()
    this.blockedPeers.clear()
    this.peerChannels.clear()
    this.peerInfos.clear()
    this.topicMetadata.clear()
    this.discoveryCallbacks.clear()
    this.peerMetadata.clear()
    this.peerTags.clear()
  }

  /**
   * Send identity frame to peer over Protomux main channel.
   * Safe to call before mainSendMsg is assigned — silently returns.
   */
  private sendIdentityFrame(peerId: string, sendMsg?: { send: (data: Buffer) => void }): void {
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

  /**
   * KEEP-ALIVE APPLICATIF (header 0x03 ping / 0x05 pong sur le canal main).
   * RÉSILIENCE ZOMBIE : un pair au mux gelé (process vivant, TCP open, zéro message
   * applicatif) survit au keep-alive transport de Hyperswarm et reste "ghost online".
   * Chaque message applicatif reçu marque la vie (markPeerAlive) ; un ping part toutes
   * les 20s ; sans preuve de vie en 60s le socket est détruit — le handler 'close'
   * existant nettoie et planifie la reconnexion avec backoff.
   * COMPATIBILITÉ ANCIENNES BUILDS : elles ignorent 0x03/0x05 (payload binaire → JSON
   * parse silencieux → drop inoffensif côté renderer) — seuls leurs messages applicatifs
   * (chat, présence) les maintiennent en vie ; en idle elles sont recyclées puis
   * ré-identifiées à la reconnexion, ce qui rafraîchit le canal pour l'échange suivant.
   */
  private markPeerAlive(peerId: string): void {
    const ka = this.peerKeepAlive.get(peerId)
    if (ka) ka.lastAlive = Date.now()
  }

  private startPeerKeepAlive(peerId: string, socket: PeerSocket): void {
    if (this.peerKeepAlive.has(peerId)) return
    const entry = { timer: null as unknown as NodeJS.Timeout, lastAlive: Date.now() }
    const PING_INTERVAL = 20000
    const ZOMBIE_AFTER = 60000
    entry.timer = setInterval(() => {
      const peer = this.peers.get(peerId)
      if (!peer || socket.destroyed) {
        this.stopPeerKeepAlive(peerId)
        return
      }
      // Canal établi → ping [0x03][timestamp LE] (canal en cours d'établissement → skip ce tick)
      if (peer.sendMessage) {
        const ping = Buffer.alloc(9)
        ping[0] = 0x03
        ping.writeBigUInt64LE(BigInt(Date.now()), 1)
        try { peer.sendMessage.send(ping) } catch { /* canal en cours de fermeture */ }
      }
      if (Date.now() - entry.lastAlive > ZOMBIE_AFTER) {
        logMain(`[NetworkService] 🧟 Zombie peer ${peerId.slice(0, 16)} — aucune preuve de vie depuis ${Math.round((Date.now() - entry.lastAlive) / 1000)}s malgré les pings, destruction de la connexion`)
        this.stopPeerKeepAlive(peerId)
        try { socket.destroy?.() } catch { /* déjà détruit */ }
      }
    }, PING_INTERVAL)
    this.peerKeepAlive.set(peerId, entry)
  }

  private stopPeerKeepAlive(peerId: string): void {
    const ka = this.peerKeepAlive.get(peerId)
    if (ka) {
      clearInterval(ka.timer)
      this.peerKeepAlive.delete(peerId)
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async handleConnection(socket: PeerSocket, info: PeerInfo): Promise<void> {
    const peerId = info.publicKey.toString('hex')
    logMain(`[NetworkService] === HANDLE CONNECTION === peer=${peerId.slice(0, 32)} | localPublicKey=${!!this.localPublicKey} | socket.destroyed=${socket.destroyed}`)

    // ── Load Protomux + compact-encoding ──
    // CRITICAL: These are now static imports (loaded at module level).
    // Protomux.from(socket) must be called BEFORE corestore.replicate(socket)
    // so that the mux instance is cached on the stream. When corestore.replicate()
    // is called afterward, it reuses the same mux (via Protomux.from internally),
    // ensuring a single multiplexer handles both replication and app messages.
    //
    // HOLEPUNCH CONFORMANCE: Per Protomux source _requestSession(), if the remote's
    // OPEN frame arrives before createChannel() AND no pair() handler exists, the
    // session is immediately rejected via _rejectSession(). Static imports ensure
    // the entire channel setup (Protomux.from → createChannel → open) executes
    // synchronously without yielding to the event loop.

    const mux = Protomux.from(socket)
    logMain(`[NetworkService] Protomux created for peer: ${peerId.slice(0, 16)}`)

    // ── Corestore replication ──
    if (this.corestore) {
      try {
        this.corestore.replicate(socket)
        console.log('[NetworkService] Corestore replication started with peer:', peerId.slice(0, 16))
      } catch (err) {
        console.error('[NetworkService] Replication error:', err)
      }
    }

    // ── HOLEPUNCH CONFORMANCE: Register pair() handlers BEFORE creating channels.
    // Per Protomux source _requestSession(): if the remote's OPEN arrives and no
    // pair() handler is registered, the session is IMMEDIATELY REJECTED via
    // _rejectSession(). By registering pair() handlers that create channels on
    // demand, we ensure that:
    //   1. If remote opens first → pair() fires → we create the channel → matched
    //   2. If we open first → createChannel() → info.outgoing → remote OPEN matches
    //   3. If simultaneous → both sides create channels → OPEN frames match
    // This is the ROBUST pattern that handles ALL timing scenarios.
    let mainSendMsg: ProtomuxMessage | undefined
    let sendMedia: ProtomuxMessage | undefined
    let sendFile: ProtomuxMessage | undefined
    let channel: ReturnType<typeof mux.createChannel> = null
    let mediaChannel: ReturnType<typeof mux.createChannel> = null
    let fileChannel: ReturnType<typeof mux.createChannel> = null

    const onMainMessage = (buf: unknown) => {
      const data = buf as Buffer
      this.trackBandwidth(0, data.length)
      // CRITICAL DIAGNOSTIC: Log EVERY incoming message at the very start
      const firstBytes = data.length > 0 ? Array.from(data.slice(0, Math.min(8, data.length))).map(b => b.toString(16).padStart(2, '0')).join(' ') : 'empty'
      logMain(`[NetworkService] 🔴 ON_MAIN_MESSAGE | peer=${peerId.slice(0, 16)} | size=${data.length} | firstBytes=${firstBytes}`)
      if (data.length > 0) {
        // KEEP-ALIVE : tout octet applicatif reçu = preuve de vie (anti zombie)
        this.markPeerAlive(peerId)
        if (data[0] === 0x03) {
          // Ping keep-alive → répondre pong immédiatement (écho du payload)
          const peer = this.peers.get(peerId)
          if (peer?.sendMessage) {
            const pong = Buffer.from(data)
            pong[0] = 0x05
            try { peer.sendMessage.send(pong) } catch { /* canal en cours de fermeture */ }
          }
          return
        }
        if (data[0] === 0x05) {
          // Pong keep-alive — la vie est déjà marquée ci-dessus
          return
        }
        if (data[0] === 0x01) {
          const remotePk = data.slice(1).toString('utf-8')
          this.peerPublicKeyMap.set(peerId, remotePk)
          logMain(`[NetworkService] === IDENTITY RECEIVED from peer: ${peerId.slice(0, 32)} → ${remotePk.slice(0, 32)}`)
          this.emit('peer:identified', { peerId, publicKey: remotePk })
          return
        }
        if (data[0] === 0x02) {
          logMain(`[recvMedia] ⚠️ Main channel fallback recv from ${peerId.slice(0, 16)}, size: ${data.length}`)
          // CONFORMITÉ PROTOCOLE : sendMedia()/sendMediaBatch() émettent
          // [0x02][payload] sur le canal main en fallback — déframer comme le
          // fait l'identité 0x01 (data.slice(1)), sinon chaque chunk média
          // arrive au renderer avec un octet 0x02 parasite en tête.
          this.emit('media', { from: peerId, data: new Uint8Array(data.slice(1)), timestamp: Date.now() })
          return
        }
      }
      // CRITICAL DIAGNOSTIC: Log ALL non-identity messages arriving on the main channel.
      // This helps diagnose why presence:update messages are not reaching the renderer.
      const firstByte = data.length > 0 ? data[0].toString(16) : 'empty'
      let msgType = 'unknown'
      try {
        const preview = data.toString('utf-8', 0, Math.min(data.length, 100))
        if (preview.startsWith('{')) {
          const parsed = JSON.parse(preview)
          msgType = parsed?.type ?? 'json-no-type'
        }
      } catch {}
      logMain(`[NetworkService] 📨 MAIN CHANNEL MSG from ${peerId.slice(0, 16)} | firstByte=0x${firstByte} | type=${msgType} | size=${data.length}`)

      // CRITICAL FIX: Auto-identify from JSON payload BEFORE resolving fromKey.
      // This ensures the Ed25519 key is available for the 'from' field even if
      // the identity exchange (0x01 prefix) hasn't happened yet.
      try {
        const text = data.toString('utf-8')
        if (text.startsWith('{')) {
          const parsed = JSON.parse(text)
          const ed25519 = parsed?.from
          if (typeof ed25519 === 'string' && ed25519.length > 32) {
            const existing = this.peerPublicKeyMap.get(peerId)
            if (existing !== ed25519) {
              this.peerPublicKeyMap.set(peerId, ed25519)
              logMain(`[NetworkService] Auto-identified peer from JSON: ${peerId.slice(0, 16)} → ${ed25519.slice(0, 16)}`)
              this.emit('peer:identified', { peerId, publicKey: ed25519 })
            }
          }
        }
      } catch {}

      // CRITICAL FIX: Resolve Ed25519 key for the 'from' field AFTER auto-identification.
      // The renderer looks up contacts by Ed25519 key, not Noise peer ID.
      // Without this, presence:update messages are silently dropped because
      // contactStore.getContact(noisePeerId) returns undefined.
      const ed25519Key = this.peerPublicKeyMap.get(peerId)
      const fromKey = ed25519Key ?? peerId

      this.emit('message', { from: fromKey, data: new Uint8Array(data), timestamp: Date.now() })
    }

    const createMainChannel = () => {
      if (channel) return channel
      logMain(`[NetworkService] Creating main channel for peer: ${peerId.slice(0, 16)} | localPublicKey: ${!!this.localPublicKey}`)
      channel = mux.createChannel({
        protocol: 'asgard',
        id: null,
        onopen: () => {
          logMain(`[NetworkService] === MAIN CHANNEL OPENED with peer: ${peerId.slice(0, 32)} | localPublicKey: ${!!this.localPublicKey} | mainSendMsg: ${!!mainSendMsg}`)
          this.sendIdentityFrame(peerId, mainSendMsg)
        },
        onclose: () => {
          logMain(`[NetworkService] ⚠️ Main channel CLOSED with peer: ${peerId.slice(0, 16)}`)
        },
        ...(({
          ondestroy: () => {
            logMain(`[NetworkService] ⚠️ Main channel DESTROYED with peer: ${peerId.slice(0, 16)}`)
            this.peerChannels.delete(peerId)
          },
        }) as unknown as Record<string, unknown>),
      })
      if (channel) {
        mainSendMsg = channel.addMessage({ encoding: c.binary, onmessage: onMainMessage })
        channel.open()
        // onopen can fire before addMessage assigns mainSendMsg — send again now.
        this.sendIdentityFrame(peerId, mainSendMsg)
        logMain(`[NetworkService] Main channel created & opened for peer: ${peerId.slice(0, 16)}`)
      } else {
        logMain(`[NetworkService] ⚠️ Main channel REJECTED (null) for peer: ${peerId.slice(0, 16)} | stream.destroyed: ${socket.destroyed}`)
      }
      return channel
    }

    const createMediaChannel = () => {
      if (mediaChannel) return mediaChannel
      mediaChannel = mux.createChannel({
        protocol: 'asgard-media',
        id: null,
        onopen: () => { logMain(`[NetworkService] ✅ Media channel OPENED with peer: ${peerId.slice(0, 16)}`) },
        onclose: () => { logMain(`[NetworkService] ❌ Media channel CLOSED with peer: ${peerId.slice(0, 16)}`) },
        ...(({ ondestroy: () => { logMain(`[NetworkService] Media channel destroyed with peer: ${peerId.slice(0, 16)}`) } }) as unknown as Record<string, unknown>),
      })
      if (mediaChannel) {
        sendMedia = mediaChannel.addMessage({
          encoding: c.binary,
          onmessage: (buf: unknown) => {
            const data = buf as Buffer
            this.trackBandwidth(0, data.length)
            // CONFORMITÉ PROTOCOLE : sendFileData() fallback émet [0x04][payload]
            // sur le canal média quand 'asgard-files' n'est pas ouvert — déframer
            // et router vers 'file' (jamais 'media'), sinon le chunk fichier
            // arrive comme chunk audio/vidéo avec un octet 0x04 parasite.
            if (data.length > 0 && data[0] === 0x04) {
              if (!this._fileRecvCount) this._fileRecvCount = new Map()
              const fcount = (this._fileRecvCount.get(peerId) ?? 0) + 1
              this._fileRecvCount.set(peerId, fcount)
              if (fcount <= 3) logMain(`[recvFile] ⚠️ Media channel fallback recv #${fcount} from ${peerId.slice(0, 16)}, size: ${data.length}`)
              this.emit('file', { from: peerId, data: new Uint8Array(data.slice(1)), timestamp: Date.now() })
              return
            }
            if (!this._mediaRecvCount) this._mediaRecvCount = new Map()
            const count = (this._mediaRecvCount.get(peerId) ?? 0) + 1
            this._mediaRecvCount.set(peerId, count)
            if (count <= 3) logMain(`[recvMedia] ✅ Media channel recv #${count} from ${peerId.slice(0, 16)}, size: ${data.length}`)
            this.emit('media', { from: peerId, data: new Uint8Array(data), timestamp: Date.now() })
          },
        })
        mediaChannel.open()
        logMain(`[NetworkService] Media channel registered for peer: ${peerId.slice(0, 16)}`)
      }
      return mediaChannel
    }

    const createFileChannel = () => {
      if (fileChannel) return fileChannel
      fileChannel = mux.createChannel({
        protocol: 'asgard-files',
        id: null,
        onopen: () => { logMain(`[NetworkService] ✅ File channel OPENED with peer: ${peerId.slice(0, 16)}`) },
        onclose: () => { logMain(`[NetworkService] ❌ File channel CLOSED with peer: ${peerId.slice(0, 16)}`) },
        ...(({ ondestroy: () => { logMain(`[NetworkService] File channel destroyed with peer: ${peerId.slice(0, 16)}`) } }) as unknown as Record<string, unknown>),
      })
      if (fileChannel) {
        sendFile = fileChannel.addMessage({
          encoding: c.binary,
          onmessage: (buf: unknown) => {
            const data = buf as Buffer
            this.trackBandwidth(data.length, 0)
            if (!this._fileRecvCount) this._fileRecvCount = new Map()
            const count = (this._fileRecvCount.get(peerId) ?? 0) + 1
            this._fileRecvCount.set(peerId, count)
            if (count <= 3) logMain(`[recvFile] ✅ File channel recv #${count} from ${peerId.slice(0, 16)}, size: ${data.length}`)
            this.emit('file', { from: peerId, data: new Uint8Array(data), timestamp: Date.now() })
          },
        })
        fileChannel.open()
        logMain(`[NetworkService] File channel registered for peer: ${peerId.slice(0, 16)}`)
      }
      return fileChannel
    }

    // Register pair() handlers — these fire when the remote opens a channel
    // BEFORE our createChannel() is called. Without pair(), Protomux would
    // immediately reject the remote's session via _rejectSession().
    mux.pair({ protocol: 'asgard', id: null }, async () => { createMainChannel() })
    mux.pair({ protocol: 'asgard-media', id: null }, async () => { createMediaChannel() })
    mux.pair({ protocol: 'asgard-files', id: null }, async () => { createFileChannel() })

    // Eagerly create channels — covers the case where we connect first.
    // If pair() already created the channel, createChannel returns null (no-op).
    createMainChannel()
    createMediaChannel()
    createFileChannel()

    if (!channel) {
      console.warn('[NetworkService] Protomux main channel rejected for peer:', peerId.slice(0, 16), '— peer will be registered on pair() callback')
      // With pair() handlers registered, the channel will be created when the
      // remote opens their side. We register the peer immediately so the renderer
      // knows about the connection even before the main channel is ready.
      const existingPeer = this.peers.get(peerId)
      if (!existingPeer) {
        const peer: PeerConnection = {
          id: peerId, socket, info, connectedAt: Date.now(),
          sendMessage: undefined, sendMedia: undefined, sendFile: undefined,
        }
        this.peers.set(peerId, peer)
        this.peerInfos.set(peerId, info)
        this.startPeerKeepAlive(peerId, socket)
        const knownEd25519 = this.peerPublicKeyMap.get(peerId)
        this.emit('peer', {
          id: peerId, publicKey: peerId, remotePublicKey: peerId,
          ed25519PublicKey: knownEd25519 ?? null, connected: true,
        })
      }
      // Update peer entry when channels are created via pair()
      const waitForChannels = () => {
        if (channel) {
          const peer = this.peers.get(peerId)
          if (peer) {
            peer.sendMessage = mainSendMsg
            peer.sendMedia = sendMedia
            peer.sendFile = sendFile
          }
          this.peerChannels.set(peerId, { main: channel, media: mediaChannel, file: fileChannel })
          this.reconnectAttempts.delete(peerId)
          console.log('[NetworkService] Pair() channels ready for peer:', peerId.slice(0, 16))
          return
        }
        if (!socket.destroyed) setTimeout(waitForChannels, 200)
      }
      setTimeout(waitForChannels, 100)
      return
    }

    // Store channels for cork/uncork support
    this.peerChannels.set(peerId, { main: channel!, media: mediaChannel, file: fileChannel })
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
    this.startPeerKeepAlive(peerId, socket)

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
    // CONNECTIVITY: Guard flag to prevent double-emit when error triggers destroy → close
    let disconnectHandled = false

    socket.on('close', () => {
      if (disconnectHandled) return
      disconnectHandled = true

      this.stopPeerKeepAlive(peerId)
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
            // CRITICAL: Reset Hyperswarm's internal attempts counter.
            // Per Hyperswarm source: peers with attempts >= 5 are skipped in _attemptClientConnections.
            // Without this, after 5 failed reconnects, Hyperswarm silently stops trying.
            const peers = (this.swarm as unknown as { peers?: Map<string, { attempts?: number }> }).peers
            const peerInfo = peers?.get(peerId)
            if (peerInfo) {
              peerInfo.attempts = 0
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

      // CONNECTIVITY: If close handler hasn't fired yet, handle disconnect here.
      // This ensures reconnection is scheduled even when the error doesn't
      // trigger a close event (e.g. ECONNRESET on cross-border connections).
      if (!disconnectHandled) {
        disconnectHandled = true
        this.peers.delete(peerId)
        this.peerChannels.delete(peerId)
        this.peerInfos.delete(peerId)

        const ed25519Key = this.peerPublicKeyMap.get(peerId) ?? null
        this.emit('peer', {
          id: peerId,
          publicKey: peerId,
          remotePublicKey: peerId,
          ed25519PublicKey: ed25519Key,
          connected: false,
        })

        // Schedule reconnect immediately (same logic as close handler)
        if (this.isOnline && !this.blockedPeers.has(peerId)) {
          const attempts = this.reconnectAttempts.get(peerId) ?? 0
          const backoff = NetworkService.RECONNECT_BACKOFF_MS * Math.pow(1.5, attempts)
          const jitter = Math.random() * 1000
          const delay = Math.min(backoff + jitter, 30000)

          setTimeout(() => {
            if (!this.peers.has(peerId) && this.isOnline && !this.blockedPeers.has(peerId) && this.swarm) {
              try {
                this.swarm.joinPeer(Buffer.from(peerId, 'hex'))
              } catch {}
              this.reconnectAttempts.set(peerId, attempts + 1)
            }
          }, delay)
        }
      }

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
  getConnectedPeersInfo(): Map<string, { publicKey: string; topics: string[]; prioritized: boolean; ed25519PublicKey: string | null }> {
    const result = new Map<string, { publicKey: string; topics: string[]; prioritized: boolean; ed25519PublicKey: string | null }>()
    if (!this.swarm) return result

    try {
      const peers = (this.swarm as unknown as { peers?: Map<string, { publicKey: Buffer; topics?: string[]; prioritized?: boolean }> }).peers
      if (!peers) return result

      for (const [key, peerInfo] of peers) {
        result.set(key, {
          publicKey: Buffer.isBuffer(peerInfo.publicKey) ? peerInfo.publicKey.toString('hex') : String(peerInfo.publicKey),
          topics: Array.isArray(peerInfo.topics) ? peerInfo.topics : [],
          prioritized: Boolean(peerInfo.prioritized),
          // Clé Ed25519 (identité Asgard) si le pair s'est identifié — permet au
          // renderer de distinguer les vrais contacts des pairs bruts non identifiés
          // (ex : zombie d'une ancienne build connecté au topic de rendez-vous).
          ed25519PublicKey: this.peerPublicKeyMap.get(key) ?? null,
        })
      }
    } catch (err) {
      console.error('[NetworkService] Failed to get connected peers info:', err)
    }

    return result
  }

  /**
   * Set a peer as prioritized for rapid reconnection.
   * Per Hyperswarm source (peer-info.js): `prioritized` is a getter
   * (return this.priority >= NORMAL_PRIORITY). We write to `priority` directly.
   * VERY_HIGH_PRIORITY = 4, NORMAL_PRIORITY = 2
   * Returns true if successful.
   */
  setPeerPriorized(peerPublicKey: string, prioritized: boolean): boolean {
    if (!this.swarm) return false

    try {
      const peers = (this.swarm as unknown as { peers?: Map<string, { priority?: number }> }).peers
      if (!peers) return false

      const peerInfo = peers.get(this.resolvePeerKey(peerPublicKey))
      if (!peerInfo) return false

      peerInfo.priority = prioritized ? 4 : 2 // VERY_HIGH_PRIORITY or NORMAL_PRIORITY
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

      const peerInfo = peers.get(this.resolvePeerKey(peerPublicKey))
      if (!peerInfo || typeof peerInfo.ban !== 'function') return false

      peerInfo.ban(banStatus)
      return true
    } catch (err) {
      console.error('[NetworkService] Failed to ban peer:', err)
      return false
    }
  }

  /**
   * Set a firewall function to validate incoming connections.
   * CONFORMITÉ HOLEPUNCH: route via l'option `firewall` du constructeur Hyperswarm
   * (hyperdht 6.34.0 n'expose pas de dht.firewall() dynamique — l'ancien code
   * retournait donc toujours false).
   * Returns true if successful.
   */
  setFirewall(firewallFn: (remotePublicKey: string, remoteHandshakePayload: unknown) => boolean): boolean {
    // Le firewall du constructeur (voir swarmOpts dans _doInitialize) consulte
    // this.customFirewall à chaque handshake entrant — aucune API interne DHT.
    this.customFirewall = firewallFn
    return true
  }

  /**
   * Get the server address information.
   * CONFORMITÉ HOLEPUNCH: utilise swarm.server.address() (hyperdht/lib/server.js:83)
   * — le server DHT vit sur le SWARM (hyperswarm/index.js:47 :
   * `this.server = this.dht.createServer(...)`), pas sur le DHT. L'ancien code lisait
   * `dht.server` (inexistant) et retournait donc toujours null.
   * Returns the server address info (host, port, publicKey).
   */
  getServerAddress(): { host: string; port: number; publicKey: string } | null {
    if (!this.swarm) return null

    try {
      const server = this.swarm.server
      if (!server || typeof server.address !== 'function') return null

      const address = server.address()
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
   * CONFORMITÉ HOLEPUNCH: utilise swarm.server.refresh() (hyperdht/lib/server.js:205
   * — relance l'announcer). Le server est exposé par le SWARM, pas par le DHT —
   * l'ancien code retournait donc toujours false.
   * Returns true if successful.
   */
  refreshServer(): boolean {
    if (!this.swarm) return false

    try {
      const server = this.swarm.server
      if (!server || typeof server.refresh !== 'function') return false

      server.refresh()
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

interface HyperDHTServer {
  // hyperdht/lib/server.js:83 — address() → { publicKey, host, port }
  address: () => { host: string | null; port: number | null; publicKey: Buffer } | null
  // hyperdht/lib/server.js:205 — refresh() relance l'announcer (re-annonce d'adresse)
  refresh: () => void
  // hyperdht/lib/server.js:60 — adresses relay par lesquelles ce server est joignable
  relayAddresses: Array<{ host: string; port: number }>
}

interface HyperswarmInstance {
  on: (event: string, handler: (...args: any[]) => void) => void // eslint-disable-line @typescript-eslint/no-explicit-any
  join: (topic: Buffer, options?: { client?: boolean; server?: boolean; limit?: number }) => { flushed: () => Promise<void> }
  leave: (topic: Buffer) => Promise<void>
  destroy: (options?: { force?: boolean }) => Promise<void>
  status: (topic: Buffer) => { flushed?: () => Promise<void>; refresh?: () => Promise<void> } | null
  joinPeer: (publicKey: Buffer) => void
  leavePeer: (publicKey: Buffer) => void
  suspend: () => Promise<void>
  resume: () => Promise<void>
  connections: Set<unknown>
  connecting: number
  // Hyperswarm index.js:623 — `suspend()` pose ce drapeau avant de détruire ses
  // streams, et `_attemptClientConnections()` y coupe court. Notre teardown en a
  // besoin pour la même raison (cf. quiesceSwarm()).
  suspended: boolean
  dht?: unknown
  // Per Hyperswarm source (index.js:47): `this.server = this.dht.createServer(...)`
  // — le server DHT vit sur le SWARM, pas sur l'instance DHT.
  server?: HyperDHTServer
  // Per Hyperswarm source: the DHT server listens on this keyPair (server.listen(this.keyPair))
  // and client connections use it (dht.connect(..., { keyPair: this.keyPair })).
  keyPair?: { publicKey: Buffer; secretKey: Buffer }
  maxPeers?: number
}

interface HyperswarmConstructor {
  new (options?: {
    maxPeers?: number
    // Per Hyperswarm source (index.js:315): _firewall(remotePublicKey, payload) est
    // appelé avec le payload du handshake comme second argument.
    firewall?: (remotePublicKey: Buffer, remoteHandshakePayload?: unknown) => boolean
    seed?: Buffer
    connectionKeepAlive?: number
  }): HyperswarmInstance
}

interface ProtomuxMessage {
  send: (data: unknown) => boolean
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
  // Hyperswarm sockets are SecretStreams: flush waits for encrypted data and transport.
  flush: () => Promise<boolean>
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
  // CONNECTIVITY: Check if stream is closing or destroyed (from streamx)
  destroying?: boolean
  destroyed?: boolean
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

interface HyperDHTInstance {
  mutablePut: (keyPair: { publicKey: Buffer; secretKey: Buffer }, value: Buffer, opts?: { seq?: number }) => Promise<unknown>
  mutableGet: (publicKey: Buffer, opts?: { seq?: number; latest?: boolean }) => Promise<{ value: Buffer; seq: number } | null>
  immutablePut: (value: Buffer) => Promise<{ hash: Buffer }>
  immutableGet: (hash: Buffer) => Promise<{ value: Buffer } | null>
  fullyBootstrapped: () => Promise<void>
  on: (event: 'bootstrap' | 'ready' | 'persistent' | 'wake-up' | 'network-change' | 'network-update' | string, handler: (...args: any[]) => void) => void
  off: (event: string, handler: (...args: any[]) => void) => void
  // DHT properties per dht-rpc docs
  readonly host: string | null
  readonly port: number | null
  readonly firewalled: boolean
  readonly ephemeral: boolean
  readonly id: string | null
  readonly randomized: boolean
  toArray: (opts?: { limit?: number }) => Array<{ host: string; port: number }>
  refresh: () => void
  destroy: (opts?: { force?: boolean }) => Promise<void>
  readonly destroyed: boolean
  // HyperDHT internal properties (with underscore prefix)
  // See: github.com/holepunchto/hyperdht/blob/master/index.js
  connectionKeepAlive?: number
  _randomPunchInterval?: number
  _randomPunchLimit?: number
  _randomPunches?: number
  randomPunchInterval?: number
}

interface HyperDHTConstructor {
  new (opts?: {
    bootstrap?: string[]
    nodes?: Array<{ host: string; port: number }>
    port?: number
    host?: string
    deferRandomPunch?: boolean
    randomPunchInterval?: number
    connectionKeepAlive?: number | false
    ephemeral?: boolean
    seed?: Buffer
    keyPair?: { publicKey: Buffer; secretKey: Buffer }
    firewalled?: boolean
  }): HyperDHTInstance
  keyPair: (seed?: Buffer) => { publicKey: Buffer; secretKey: Buffer }
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
  /**
   * Clé publique Ed25519 auto-déclarée par l'auteur de l'enregistrement.
   * Permet au lecteur de vérifier que l'entrée de contact qu'il a interrogée
   * correspond bien à l'identité actuelle de cette personne (au lieu de
   * confondre « hors ligne » et « clé publique changée / entrée obsolète »).
   */
  identityPk?: string
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
