import type { Message, Mention, OutgoingMessage, ProtocolMessage, Contact, UserStatus, NetworkPeer } from '@/types'
import { p2pService } from './P2PService'
import { cryptoService } from './CryptoService'
import { storageService } from './StorageService'
import { groupService } from './GroupService'
import { ringtoneService } from './RingtoneService'
import { confirmPendingContact } from './contactRequests'
import { useMessageStore } from '@/stores/messageStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useContactStore } from '@/stores/contactStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useNetworkStore } from '@/stores/networkStore'
import { useUIStore } from '@/stores/uiStore'
import { useGroupStore } from '@/stores/groupStore'
import { generateId } from '@/utils/id'
import { speakText } from '@/utils/speech'
import i18n from '@/i18n/config'
import {
  toNetworkStatus,
  fromNetworkStatus,
  shouldPromoteToOnline,
  presenceMessage,
  type NetworkStatus,
} from '@/utils/presence'

/** Queued message for offline delivery retry */
interface PendingMessage {
  message: Message
  conversationId: string
  peerId: string
  createdAt: number
  attempts: number
}

/** Résultat d'un envoi : parti sur le réseau, ou mis en file d'attente */
export type SendOutcome = 'sent' | 'queued'

/** Queued reaction for retry when the peer was unreachable at toggle time */
interface PendingReaction {
  messageId: string
  conversationId: string
  emoji: string
  action: 'add' | 'remove'
  peerId: string
  createdAt: number
  attempts: number
}

/** Search result for full-text message search */
export interface SearchResult {
  message: Message
  conversationId: string
  contactName: string
  contactAvatar?: string
}

/** Search result for conversation search */
export interface ConversationSearchResult {
  conversation: import('@/types').Conversation
  contactName: string
  contactAvatar?: string
  matchCount: number
  lastMatchAt: number
}

/**
 * ChatService — orchestrates chat functionality.
 *
 * Handles:
 * - Sending and receiving messages
 * - Message editing and deletion
 * - Typing indicators
 * - Presence updates
 * - Conversation management
 */
class ChatService {
  private static instance: ChatService
  private typingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private contactRequestsSent: Set<string> = new Set()
  // PERFORMANCE: Throttle typing indicators to max 1 per 2s per peer
  private lastTypingSent: Map<string, number> = new Map()
  // CRITICAL: Track last activity time per peer for reliable offline detection.
  // Hyperswarm's socket.close can be delayed (background reconnection attempts),
  // so we can't rely solely on it to detect offline peers.
  private peerLastActivity: Map<string, number> = new Map()
  // CRITICAL: Buffer for reassembling multi-chunk avatar transfers.
  // Supports context: target ('contact' | 'group_member' | 'group_icon') and groupId for group avatars.
  private avatarBuffers: Map<string, { totalChunks: number; receivedChunks: number; chunks: Uint8Array[]; target?: string; groupId?: string }> = new Map()
  // DEDUPLICATION: Track which avatar hash has been sent to each peer.
  // Avoids resending the same avatar on every reconnection (saves bandwidth).
  // Key: peerEd25519Key, Value: hash of the last sent avatar
  private sentAvatarHashes: Map<string, string> = new Map()
  // Map Ed25519 public key → Noise peer id for proactive reconnections.
  private ed25519ToNoiseMap: Map<string, string> = new Map()
  // CACHE: ed25519 → Noise key dérivée (HyperDHT.keyPair(sha256(pkHex)) par le
  // process principal). Indispensable pour re-tenter les contacts encore jamais
  // rejoints — voir la note sur l'étape 4 de heartbeatTick().
  private noiseKeyCache: Map<string, string> = new Map()
  // Anti-rentree: connexions en cours de dérivation/tentative
  private redialInFlight: Set<string> = new Set()
  private lastRedialAt: Map<string, number> = new Map()
  // Anti-rafale des sondes déclenchées par l'ouverture d'une conversation.
  private lastProbeAt: Map<string, number> = new Map()
  private static readonly REDIAL_INTERVAL = 10_000 // 10 s — re-tentative rapide après une coupure
  private static readonly PROBE_INTERVAL = 8_000 // 8 s entre deux sondes du même contact
  private static readonly DHT_PROFILE_MAX_AGE = 2 * 60 * 1000 // au-delà, le record DHT ne prouve plus rien
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  // Peers considered offline until heard from (ms)
  // CRITICAL FIX: Reduced from 120s to 45s. A Hyperswarm/Noise connection does NOT
  // mean the remote app is running. Only actual presence messages prove liveness.
  private static readonly PRESENCE_TIMEOUT = 45_000  // 45s — no presence received → offline
  private static readonly HEARTBEAT_INTERVAL = 5_000 // 5s — very frequent keep-alive for strong persistence
  // GRACE PERIOD: When a peer disconnects, Hyperswarm (joinPeer) will actively try
  // to re-establish the connection. We defer marking the contact offline by this
  // delay to avoid flickering and false "offline" states during transient drops.
  // CRITICAL FIX: Reduced from 30s to 15s. If the peer doesn't reconnect in 15s,
  // they are very likely offline.
  private static readonly OFFLINE_GRACE_PERIOD = 15_000 // 15s grace period before marking offline
  private pendingOfflineTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  // CRITICAL: Queue of pending read/delivery receipts that failed to send.
  // Keyed by Ed25519 public key. Flushed when the peer reconnects.
  // Without this, read receipts are lost if the peer is temporarily disconnected
  // and the sender never sees the ✓✓ (read) status.
  private pendingReceipts: Map<string, Array<{ messageIds: string[]; status: 'delivered' | 'read'; conversationId?: string }>> = new Map()
  private lastBroadcastStatus: string | null = null   // Skip re-broadcast if unchanged
  // PRESENCE : horodatage de la dernière DÉCLARATION reçue d'un pair
  // (`presence:update`), distinct de la dernière ACTIVITÉ. Une simple activité ne
  // doit pas effacer un statut que le pair a choisi : « absent », « occupé » et
  // surtout « invisible » sont sa parole. Sans cette distinction, le ping du
  // heartbeat (5 s) faisait apparaître « en ligne » n'importe quel pair, y
  // compris un pair en mode invisible — voir markPeerActive().
  private presenceDeclaredAt: Map<string, number> = new Map()
  // PERFORMANCE: Auto-away detection — set status to 'away' after user inactivity
  private lastUserActivity = Date.now()
  private static readonly IDLE_TIMEOUT = 300_000 // 5 minutes — auto-away after 5 min idle
  private static readonly IDLE_CHECK_INTERVAL = 60_000 // Check every minute
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null
  // OFFLINE QUEUE: Messages queued for delivery when peer is offline
  private pendingMessages: Map<string, PendingMessage[]> = new Map() // peerId → queue
  // Réactions émises alors que le pair était injoignable — remises à la reconnexion
  private pendingReactions: Set<PendingReaction> = new Set()
  // Peers connected before we learned their Ed25519 key; flushed on peer:identified
  private pendingConnectedPeers: Set<string> = new Set()
  // Presence received before Hyperbee contacts were restored
  private pendingPresenceUpdates: Map<string, PresencePayload> = new Map()
  // Peer identities received before their contacts were restored
  private pendingIdentifiedPeers: Map<string, string> = new Map()
  // Keep the latest presence authoritative when identity arrives later.
  private lastPresenceStatus: Map<string, UserStatus> = new Map()
  private static readonly MAX_PENDING_PER_PEER = 500
  private static readonly MAX_PENDING_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days
  /** Nombre de renvois avant de marquer un message définitivement « failed » */
  private static readonly MAX_SEND_ATTEMPTS = 3
  private static readonly MAX_PENDING_REACTIONS = 200
  /** Contenu et identifiant d'un message 1:1 entrant. */
  private static readonly MAX_INCOMING_CHARS = 100_000
  private static readonly MAX_INCOMING_ID = 128
  private static readonly MAX_INCOMING_MENTIONS = 32
  private static readonly MAX_INCOMING_SIGNATURE = 256
  private static readonly REACTION_MAX_ATTEMPTS = 3

  static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService()
    }
    return ChatService.instance
  }

  /**
   * Initialize message listeners
   */
  initialize(): void {
    // CRITICAL FIX: Global message listener — ANY message from a peer proves they are online.
    // Without this, only presence:update/ping/pong and chat messages trigger markPeerActive.
    // Other message types (contact:request, contact:accept, chat:receipt, file:metadata, etc.)
    // were ignored for presence tracking, causing cross-border peers to appear offline
    // even though they were actively communicating.
    p2pService.on('message', (msg: ProtocolMessage) => {
      this.markPeerActive(msg.from)
    })

    // CRITICAL: Handle incoming avatar data via binary media channel.
    // Per Holepunch pattern: avatars are sent via binary media channel, NOT in signed messages.
    // Supports multiple avatar contexts via header 'target' field:
    //   - 'contact' (default): 1:1 contact profile avatar → contactStore
    //   - 'group_member': group member's profile avatar → groupStore.updateMember + contactStore
    //   - 'group_icon': group's own avatar/icon → groupStore.updateGroup
    //
    // Format:
    //   Chunk 0: JSON header { t: 'avatar', target, groupId?, total: N } + null byte + chunk data
    //   Chunks 1..N-1: chunk data (raw bytes)
    p2pService.on('media:data', (data: { from: string; data: Uint8Array }) => {
      try {
        const bytes = data.data
        
        // CRITICAL: Skip call audio (0x01), video (0x02/0x03) and file-transfer (0x04) data.
        // Avatars start with a JSON header, so any non-JSON byte can be safely ignored here.
        if (bytes.length > 0 && (bytes[0] === 0x01 || bytes[0] === 0x02 || bytes[0] === 0x03 || bytes[0] === 0x04)) return
        if (bytes.length === 0 || bytes[0] !== 0x7b) return // 0x7b = '{'
        
        const logMsg = `[ChatService] media:data received from Noise peer ${data.from.slice(0, 16)}, ${bytes.length} bytes`
        console.log(logMsg)
        try { window.asgard.debugLog(logMsg) } catch {}

        // Check if this is a first chunk (has null separator with JSON header)
        let sepIdx = -1
        for (let i = 0; i < Math.min(bytes.length, 200); i++) {
          if (bytes[i] === 0) { sepIdx = i; break }
        }

        if (sepIdx > 0) {
          // First chunk with header
          const headerStr = new TextDecoder().decode(bytes.slice(0, sepIdx))
          const header = JSON.parse(headerStr) as { t: string; target?: string; groupId?: string; total?: number }
          if (header.t !== 'avatar') return

          const chunkData = bytes.slice(sepIdx + 1)
          const totalChunks = header.total ?? 1
          // A header is attacker-controlled: bound the reassembly before
          // allocating anything on its promise (legit chunks are 16 KiB).
          if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > ChatService.MAX_AVATAR_CHUNKS) return
          if (chunkData.length > ChatService.MAX_AVATAR_CHUNK_BYTES) return
          const target = header.target ?? 'contact' // Backward compat: default to 'contact'
          const groupId = header.groupId

          const recvMsg = `[ChatService] Avatar chunk 0 received: ${chunkData.length} bytes, total chunks: ${totalChunks}, target=${target}`
          console.log(recvMsg)
          try { window.asgard.debugLog(recvMsg) } catch {}

          if (totalChunks === 1) {
            // Single chunk — decode immediately
            const avatarData = new TextDecoder().decode(chunkData)
            const ed25519Key = p2pService.getPeerPublicKey(data.from)
            if (!ed25519Key) {
              console.warn('[ChatService] Cannot map Noise peer to Ed25519 key for avatar')
              return
            }
            this.storeAvatar(ed25519Key, avatarData, target, groupId)
          } else {
            // Multi-chunk — store buffer for reassembly (with context)
            this.avatarBuffers.set(data.from, {
              totalChunks,
              receivedChunks: 1,
              chunks: [new Uint8Array(chunkData)],
              target,
              groupId,
            })
          }
        } else {
          // Subsequent chunk (no header) — append to buffer
          const buf = this.avatarBuffers.get(data.from)
          if (!buf) return
          if (buf.chunks.length >= buf.totalChunks || bytes.length > ChatService.MAX_AVATAR_CHUNK_BYTES) {
            this.avatarBuffers.delete(data.from)
            return
          }

          buf.chunks.push(new Uint8Array(bytes))
          buf.receivedChunks++

          if (buf.receivedChunks >= buf.totalChunks) {
            // All chunks received — reassemble
            const totalLength = buf.chunks.reduce((sum, c) => sum + c.length, 0)
            const assembled = new Uint8Array(totalLength)
            let offset = 0
            for (const chunk of buf.chunks) {
              assembled.set(chunk, offset)
              offset += chunk.length
            }
            const avatarData = new TextDecoder().decode(assembled)
            const ed25519Key = p2pService.getPeerPublicKey(data.from)
            if (!ed25519Key) {
              console.warn('[ChatService] Cannot map Noise peer to Ed25519 key for avatar')
              return
            }
            this.storeAvatar(ed25519Key, avatarData, buf.target ?? 'contact', buf.groupId)
            this.avatarBuffers.delete(data.from)
          }
        }
      } catch (err) {
        const errMsg = `[ChatService] Error processing media data: ${err}`
        console.warn(errMsg)
        try { window.asgard.debugLog(errMsg) } catch {}
      }
    })

    // Handle incoming chat messages
    p2pService.on('message:chat:message', (msg: ProtocolMessage) => {
      this.handleIncomingMessage(msg).catch((err) => {
        console.error('[ChatService] handleIncomingMessage error:', err)
      })
    })

    // ─── Avatar Storage Helper ───
    // Routes incoming avatar data to the appropriate store based on context:
    //   'contact'     → contactStore.updateContact (1:1 profile avatar)
    //   'group_member' → groupStore.updateMember + contactStore (member profile in group)
    //   'group_icon'  → groupStore.updateGroup (group's own avatar/icon)
    // This ensures avatars are stored in all relevant places regardless of context.

    // Handle message edits
    p2pService.on('message:chat:edit', (msg: ProtocolMessage) => {
      this.handleChatEdit(msg)
    })

    // Handle message deletions
    p2pService.on('message:chat:delete', (msg: ProtocolMessage) => {
      this.handleChatDelete(msg)
    })

    // Handle reactions
    p2pService.on('message:chat:reaction', (msg: ProtocolMessage) => {
      this.handleChatReaction(msg)
    })

    // Handle read receipts (DM)
    p2pService.on('message:chat:read', (msg: ProtocolMessage) => {
      this.handleChatRead(msg)
    })

    // Handle delivery & read receipts (unified receipt protocol).
    p2pService.on('message:chat:receipt', (msg: ProtocolMessage) => {
      this.handleChatReceipt(msg)
    })

    // Handle message recall
    p2pService.on('message:chat:recall', (msg: ProtocolMessage) => {
      this.handleChatRecall(msg)
    })

    // Handle ephemeral message expiration notification
    p2pService.on('message:chat:ephemeral', (msg: ProtocolMessage) => {
      const payload = msg.payload as { expiresAt?: unknown } | null
      if (!msg.from || !payload || typeof payload !== 'object') return
      const requested = payload.expiresAt
      if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) return
      // A peer owns its message's lifetime, not an unbounded timer: cap the
      // declaration so a far-future or absurd value cannot park the store.
      const expiresAt = Math.min(requested, Date.now() + 30 * 24 * 60 * 60 * 1000)
      const store = useMessageStore.getState()

      // Resolve the correct local conversationId
      const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
      if (!myPk) return
      const resolvedConvId = cryptoService.deriveConversationId(myPk, msg.from)

      // Find the last message from this peer and set its expiration
      const msgs = store.messages[resolvedConvId]
      if (msgs) {
        const lastFromPeer = [...msgs].reverse().find(m => m.senderId === msg.from && !m.expiresAt)
        if (lastFromPeer) {
          store.updateMessageAttachment(lastFromPeer.id, resolvedConvId, { expiresAt })
          // Start cleanup if not already running
          this.startEphemeralCleanup()
        }
      }
    })

    // Handle typing indicators
    p2pService.on('message:presence:typing', (msg: ProtocolMessage) => {
      const payload = msg.payload as { conversationId?: unknown; typing?: unknown } | null
      if (!msg.from || !payload || typeof payload !== 'object') return
      if (typeof payload.typing !== 'boolean') return
      const contact = useContactStore.getState().getContact(msg.from)
      // A typing indicator names a conversation; only the DM this peer owns is
      // legitimate, or a third contact could make them appear in another chat.
      if (!contact || contact.relation === 'blocked') return
      const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
      if (!myPk) return
      const conversationId = cryptoService.deriveConversationId(myPk, msg.from)
      if (payload.conversationId !== conversationId) return

      // Activity from peer proves they are online (fallback for older clients)
      this.markPeerActive(msg.from)
      const typing = payload.typing
      useNetworkStore.getState().setTyping(conversationId, msg.from, typing)

      // Auto-clear typing after 5 seconds
      const key = `${conversationId}:${msg.from}`
      clearTimeout(this.typingTimers.get(key))
      if (typing) {
        const timer = setTimeout(() => {
          useNetworkStore.getState().setTyping(conversationId, msg.from, false)
        }, 5000)
        this.typingTimers.set(key, timer)
      } else {
        this.typingTimers.delete(key)
      }
    })

    // Handle presence updates
    p2pService.on('message:presence:update', (msg: ProtocolMessage) => {
      const payload = msg.payload as PresencePayload | null
      if (!msg.from || !payload || typeof payload !== 'object') return
      const declared = typeof payload.status === 'string' ? payload.status.trim().toLowerCase() : ''
      if (!['online', 'away', 'offline', 'dnd', 'busy', 'invisible'].includes(declared)) return
      const recvMsg = `[ChatService] === PRESENCE RECEIVED from: ${msg.from?.slice(0, 32)} | status: ${payload.status}`
      console.log(recvMsg)
      try { window.asgard.debugLog(recvMsg) } catch {}
      const contact = useContactStore.getState().getContact(msg.from)
      // A blocked contact keeps its frozen card: no status, name or avatar push.
      if (contact?.relation === 'blocked') return
      const mappedStatus = fromNetworkStatus(payload.status)
      const updateMsg = `[ChatService] Presence update: contact found=${!!contact} | mapped=${mappedStatus}`
      console.log(updateMsg)
      try { window.asgard.debugLog(updateMsg) } catch {}
      if (!contact) {
        this.pendingPresenceUpdates.set(msg.from, payload)
        return
      }
      this.applyPresenceUpdate(msg.from, payload)
    })

    // PERFORMANCE: Handle ping/pong for latency measurement
    p2pService.on('message:presence:ping', (msg: ProtocolMessage) => {
      // Any traffic from peer proves they are online (fallback for older clients)
      this.markPeerActive(msg.from)
      const payload = msg.payload as { timestamp?: unknown } | null
      const sentAt = typeof payload?.timestamp === 'number' && Number.isFinite(payload.timestamp)
        ? payload.timestamp
        : Date.now()
      // Respond with pong immediately
      p2pService.sendMessage(msg.from, 'presence:pong', { timestamp: sentAt }).catch(() => {})
    })

    p2pService.on('message:presence:pong', (msg: ProtocolMessage) => {
      // Any traffic from peer proves they are online (fallback for older clients)
      this.markPeerActive(msg.from)
      const payload = msg.payload as { timestamp?: unknown } | null
      const sentAt = typeof payload?.timestamp === 'number' && Number.isFinite(payload.timestamp)
        ? payload.timestamp
        : null
      if (sentAt === null) return
      const rtt = Date.now() - sentAt
      // Reject clock-skewed or absurd values instead of displaying them.
      if (rtt < 0 || rtt > 60_000) return
      // Update network store with latency
      useNetworkStore.getState().setPeerLatency(msg.from, rtt)
      console.log('[ChatService] Pong from', msg.from.slice(0, 16), '— RTT:', rtt, 'ms')
    })

    // Handle contact protocol
    p2pService.on('message:contact:request', (msg: ProtocolMessage) => {
      this.handleContactRequest(msg)
    })

    p2pService.on('message:contact:accept', (msg: ProtocolMessage) => {
      this.handleContactAccept(msg)
    })

    // Handle contact removal — peer removed us from their contacts
    p2pService.on('message:contact:remove', (msg: ProtocolMessage) => {
      this.handleContactRemove(msg)
    })

    // CRITICAL: When a peer's Ed25519 identity is received, check if they're
    // in our contacts list. The identity exchange happens via a dedicated Protomux
    // 'asgard-id' channel right after connection. This maps the Hyperswarm Noise
    // peer ID to the application-level Ed25519 public key, enabling contact lookup.
    p2pService.on('peer:identified', (data: { peerId: string; publicKey: string }) => {
      const contact = useContactStore.getState().getContact(data.publicKey)
      const msg = `[ChatService] === PEER IDENTIFIED: ${data.publicKey.slice(0, 32)} | Noise: ${data.peerId.slice(0, 32)} | In contacts: ${!!contact}`
      console.log(msg)
      try { window.asgard.debugLog(msg) } catch {}
      if (contact) {
        this.handleIdentifiedPeer(data)
      } else {
        this.pendingIdentifiedPeers.set(data.publicKey, data.peerId)
      }
    })

    // PERSISTENCE: When a peer disconnects, don't mark it offline immediately.
    // Hyperswarm's joinPeer() will actively try to re-establish the connection
    // (it re-punches NAT and retries). We defer marking offline by OFFLINE_GRACE_PERIOD
    // so that transient socket closes (common during NAT rebinding) don't cause
    // flickering between online/offline states.
    p2pService.on('peer:disconnected', (peer: { id: string; publicKey?: string; ed25519PublicKey?: string }) => {
      // CRITICAL FIX: Resolve Ed25519 key from Noise peer ID if not provided.
      // When a peer disconnects before the identity exchange completed, the
      // ed25519PublicKey field is null. Without resolving the key, the contact
      // stays "online" forever because no grace-period timer is started.
      let ed25519Key = peer.ed25519PublicKey ?? null
      if (!ed25519Key) {
        ed25519Key = p2pService.getPeerPublicKey(peer.id) ?? null
      }
      const contact = ed25519Key
        ? useContactStore.getState().getContact(ed25519Key)
        : undefined
      if (contact) {
        // Cancel any previous pending-offline timer (e.g. double disconnect events)
        const existingTimer = this.pendingOfflineTimers.get(contact.publicKey)
        if (existingTimer) clearTimeout(existingTimer)

        const timer = setTimeout(() => {
          this.pendingOfflineTimers.delete(contact.publicKey)
          // CRITICAL FIX: Check if the peer has reconnected via Hyperswarm.
          // The old check used peerLastActivity which could be set by messages received
          // just before disconnect, preventing the timer from ever marking offline.
          // Now we check the actual Hyperswarm connection state: if the Noise peer
          // is back in the network store, the peer reconnected during the grace period.
          const noisePeerId = this.ed25519ToNoiseMap.get(contact.publicKey)
          const isConnected = noisePeerId
            ? Object.values(useNetworkStore.getState().peers).some((p: NetworkPeer) => p.id === noisePeerId && p.connected)
            : false
          if (isConnected) {
            // Peer reconnected during the grace period — keep them online
            console.log('[ChatService] Peer reconnected during grace period, keeping online:', contact.publicKey.slice(0, 16))
            return
          }
          useContactStore.getState().updateContact(contact.publicKey, {
            status: 'offline',
          })
          this.peerLastActivity.delete(contact.publicKey)
          console.log('[ChatService] Peer marked offline after grace period:', contact.publicKey.slice(0, 16))
        }, ChatService.OFFLINE_GRACE_PERIOD)

        this.pendingOfflineTimers.set(contact.publicKey, timer)
        console.log('[ChatService] Peer disconnected — grace period started for', contact.publicKey.slice(0, 16))
      }
    })

    // CRITICAL: Start periodic heartbeat to keep presence fresh and detect stale peers.
    // This broadcasts our presence every HEARTBEAT_INTERVAL and marks peers offline
    // if we haven't heard from them in PRESENCE_TIMEOUT.
    this.startHeartbeat()

    // PERSISTENCE: Join all conversation topics for existing contacts so we stay
    // discoverable even when a conversation is not currently open.
    const contacts = useContactStore.getState().contacts
    const myPublicKey = useIdentityStore.getState().identity?.keyPair.publicKey
    if (myPublicKey) {
      for (const contact of Object.values(contacts)) {
        cryptoService.deriveConversationTopic(myPublicKey, contact.publicKey)
          .then((topic) => p2pService.joinTopic(topic))
          .catch(() => {})
      }
    }

    // PERFORMANCE: Start idle detection — auto-set 'away' after inactivity
    this.startIdleDetection()

    // OFFLINE QUEUE: Flush pending messages when peer reconnects.
    // If we don't know the peer's Ed25519 key yet, remember the Noise peer id
    // and flush as soon as peer:identified fires.
    p2pService.on('peer:connected', (peer: { id: string; publicKey?: string; ed25519PublicKey?: string }) => {
      const ed25519Key = peer.ed25519PublicKey
      if (ed25519Key) {
        // Cancel any pending offline timer — peer reconnected
        const offlineTimer = this.pendingOfflineTimers.get(ed25519Key)
        if (offlineTimer) {
          clearTimeout(offlineTimer)
          this.pendingOfflineTimers.delete(ed25519Key)
          console.log('[ChatService] Offline timer cancelled — peer reconnected:', ed25519Key.slice(0, 16))
        }
        // Live socket proves liveness, nothing more: it is NOT a status the peer
        // chose. markPeerActive() promotes to 'online' only while no declaration is
        // fresh, so a peer who declared 'invisible' does not flash "en ligne" at
        // every reconnection before their presence:update lands.
        if (useContactStore.getState().getContact(ed25519Key)) {
          this.markPeerActive(ed25519Key)
        } else {
          this.peerLastActivity.set(ed25519Key, Date.now())
        }
        this.flushPendingMessages(ed25519Key).catch(() => {})
        // REACTION RETRY: Flush emoji reactions emitted while this peer was unreachable.
        this.flushPendingReactions(ed25519Key).catch(() => {})
        // RECEIPT RETRY: Flush any pending read/delivery receipts for this peer.
        this.flushPendingReceipts(ed25519Key).catch(() => {})
        // GROUP OFFLINE QUEUE: Flush any pending group messages for this peer.
        // Per Holepunch/Keet pattern: messages sent while peer was offline are delivered on reconnect.
        groupService.flushPendingGroupMessages(ed25519Key).catch(() => {})
      } else {
        this.pendingConnectedPeers.add(peer.id)
      }

      // CRITICAL: Force re-broadcast of presence when a peer connects.
      // Per Hyperswarm docs, swarm.on('connection') fires immediately when a
      // peer connects. This is the ideal moment to send our presence — the
      // peer is now reachable. Without this, the peer may never receive our
      // status if broadcastPresence() was previously called with 0 connected
      // peers (lastBroadcastStatus was set, causing all subsequent broadcasts
      // to be skipped even though the message went to nobody).
      this.lastBroadcastStatus = null  // Invalidate to force re-broadcast
      this.broadcastPresence().catch(() => {})

      // CRITICAL FIX: Send presence DIRECTLY to this specific peer.
      // broadcast() sends to all peers in the network store, but this peer
      // may have connected during the initialization gap (between setIdentity
      // and chatService.initialize) — in that case the peer:connected event
      // was missed, and broadcast() may have been skipped by the heartbeat.
      // Sending directly via Noise peer ID guarantees the peer receives our
      // presence, fixing the "I see them online but they don't see me" bug.
      const identity = useIdentityStore.getState().identity
      if (identity) {
        const status = this.outgoingPresence()
        p2pService.sendMessage(peer.id, 'presence:update', {
          status,
          displayName: identity.profile.displayName,
          customStatus: identity.profile.customStatus,
        }).catch(() => {
          // Peer may not be ready yet — presence will be sent on next heartbeat or peer:identified
        })
        console.log('[ChatService] Direct presence sent to newly connected peer:', peer.id.slice(0, 16), '| status:', status)
      }

      // PERFORMANCE: Send our avatar via binary media channel on reconnection.
      // This ensures the peer always has our latest avatar, even if it changed
      // while we were disconnected.
      if (ed25519Key) {
        const identity = useIdentityStore.getState().identity
        if (identity?.profile.avatar) {
          this.sendAvatarViaMedia(ed25519Key, identity.profile.avatar, 'contact').catch(() => {})
        }
      }

      // CRITICAL: Re-publish our DHT profile when a peer connects.
      // This ensures our profile is fresh in the DHT for other peers who might fetch it.
      // Without this, profiles can become stale (days old) if the app was running but
      // the DHT record TTL expired.
      const currentIdentity = useIdentityStore.getState().identity
      if (currentIdentity) {
        // PRIVACY: this path used to publish the raw profile status, ignoring
        // `privacy.onlineStatus` — the DHT therefore kept advertising a user who
        // had hidden their presence as "online", five lines after the P2P channel
        // had correctly told everyone they were offline.
        const networkStatus = this.outgoingPresence()
        const statusMessage = presenceMessage(currentIdentity.profile)
        window.asgard.network.publishStatus(networkStatus, statusMessage).catch(() => {})
        console.log('[ChatService] DHT status re-published on peer connect:', networkStatus)
      }
    })

    // STATUS SYNC: Immediately broadcast presence when our own status changes
    // (online/away/busy/invisible) so contacts see the update right away instead
    // of waiting for the next heartbeat interval.
    useIdentityStore.subscribe((state, prevState) => {
      const newStatus = state.identity?.profile.status
      const oldStatus = prevState?.identity?.profile.status
      if (newStatus !== oldStatus) {
        console.log('[ChatService] Own status changed:', oldStatus, '→', newStatus, '— broadcasting immediately')
        this.lastBroadcastStatus = null
        this.broadcastPresence().catch(() => {})
      }

      // AVATAR SYNC: When our avatar changes, push it to all connected contacts
      // and group members via binary media channel. Per Holepunch pattern, avatars
      // are never included in signed messages — they must be sent separately.
      const newAvatar = state.identity?.profile.avatar
      const oldAvatar = prevState?.identity?.profile.avatar
      if (newAvatar !== oldAvatar && newAvatar) {
        console.log('[ChatService] Avatar changed — pushing to all contacts and groups')
        this.pushAvatarToAllContacts(newAvatar).catch(() => {})
      }
    })

    // PRIVACY SYNC: the moment the user flips "let my contacts see my status",
    // what we announce has to flip too. Nothing used to listen to that setting, so
    // the peers and the DHT kept the noisy declaration until the 30 s re-publish
    // loop happened to overwrite it — and only if the profile status had changed.
    let prevPresenceVisible = useUIStore.getState().settings.privacy.onlineStatus
    useUIStore.subscribe((state) => {
      const visible = state.settings.privacy.onlineStatus
      if (visible === prevPresenceVisible) return
      prevPresenceVisible = visible
      console.log('[ChatService] Presence visibility changed:', visible, '— re-announcing')
      this.lastBroadcastStatus = null
      this.broadcastPresence().catch(() => {})
      this.publishDhtStatus().catch(() => {})
    })
  }

  private handleIdentifiedPeer(data: { peerId: string; publicKey: string }): void {
    this.ed25519ToNoiseMap.set(data.publicKey, data.peerId)

    const contact = useContactStore.getState().getContact(data.publicKey)
    if (!contact) return

    if (this.pendingConnectedPeers.has(data.peerId)) {
      this.pendingConnectedPeers.delete(data.peerId)
    }

    this.flushPendingReceipts(data.publicKey).catch(() => {})

    window.asgard.network.joinPeer(data.peerId).catch((err) => {
      console.warn('[ChatService] joinPeer failed:', data.peerId.slice(0, 16), err)
    })
    window.asgard.network.prioritize(data.peerId, true).catch(() => {})

    // PRESENCE TRACKING: Initialize peerLastActivity when peer is identified.
    // A successful identity exchange strongly indicates the remote app is running.
    // Without this, the peer is never tracked by the heartbeat, and contacts
    // appear offline even though they're connected.
    // The ghost online issue is handled by the heartbeat: if we don't receive
    // any actual presence messages within PRESENCE_TIMEOUT (45s), we mark them offline.
    const existingActivity = this.peerLastActivity.get(data.publicKey)
    if (!existingActivity || Date.now() - existingActivity > ChatService.PRESENCE_TIMEOUT) {
      this.peerLastActivity.set(data.publicKey, Date.now())
    }

    const offlineTimer = this.pendingOfflineTimers.get(data.publicKey)
    if (offlineTimer) {
      clearTimeout(offlineTimer)
      this.pendingOfflineTimers.delete(data.publicKey)
      console.log('[ChatService] Offline timer cancelled — peer re-identified:', data.publicKey.slice(0, 16))
    }

    // STATUS: the identity exchange proves the remote app is running, but it does
    // NOT prove the user chose "online". Go through markPeerActive() so a recently
    // declared 'away' / 'busy' / 'invisible' survives until presence:update says
    // otherwise; a peer that never declares anything (old client) still lands
    // online as before. If the peer is a "ghost" (app closed but Hyperswarm keeps
    // the socket), the heartbeat marks them offline after PRESENCE_TIMEOUT (45 s).
    this.markPeerActive(data.publicKey)

    const identity = useIdentityStore.getState().identity
    if (identity) {
      const status = this.outgoingPresence()
      const presMsg = `[ChatService] Sending presence to peer: ${data.peerId.slice(0, 32)} | status: ${status} | hasAvatar: ${!!identity.profile.avatar}`
      console.log(presMsg)
      try { window.asgard.debugLog(presMsg) } catch {}
      p2pService.sendMessage(data.peerId, 'presence:update', {
        status,
        displayName: identity.profile.displayName,
        customStatus: identity.profile.customStatus,
      }).catch((err) => {
        console.warn('[ChatService] Failed to send presence to peer:', err)
      })
    }

    this.flushPendingMessages(data.publicKey).catch(() => {})
    this.flushPendingReactions(data.publicKey).catch(() => {})

    // CRITICAL FIX: Flush any pending presence updates for this peer.
    // If the peer sent presence:update before we identified them (e.g. during
    // the initialization gap), the update was stored in pendingPresenceUpdates.
    // Now that we know the peer's Ed25519 key and the contact exists, apply it.
    // Without this, presence is only applied when contact:request/accept arrives,
    // which can be delayed or lost on cross-border connections.
    const pendingPayload = this.pendingPresenceUpdates.get(data.publicKey)
    if (pendingPayload) {
      this.pendingPresenceUpdates.delete(data.publicKey)
      this.applyPresenceUpdate(data.publicKey, pendingPayload)
      console.log('[ChatService] Applied pending presence for peer:', data.publicKey.slice(0, 16), '| status:', pendingPayload.status)
    }

    // La demande n'est renvoyée que si NOUS avons ajouté ce pair et qu'il ne l'a
    // pas encore confirmée. L'ancien envoi inconditionnel, à chaque connexion,
    // transformait une simple identification (contact déjà confirmé, ou pair
    // recroisé) en demande : elle ne doit naître que d'un ajout volontaire.
    if (
      contact.relation === 'pending' &&
      contact.requestDirection === 'outgoing' &&
      !this.contactRequestsSent.has(data.publicKey)
    ) {
      this.contactRequestsSent.add(data.publicKey)
      if (identity) {
        p2pService.sendMessage(data.peerId, 'contact:request', {
          displayName: identity.profile.displayName,
        }).catch(err => {
          console.warn('[ChatService] Failed to send contact request to:', data.peerId.slice(0, 16), err)
          this.contactRequestsSent.delete(data.publicKey)
        })
      }
    }

    if (identity?.profile.avatar) {
      this.sendAvatarViaMedia(data.publicKey, identity.profile.avatar, 'contact').catch(() => {})
    }

    // CRITICAL: Invalidate lastBroadcastStatus to force broadcastPresence()
    // to actually send. Without this, the broadcast is skipped when the status
    // hasn't changed since the last broadcast — but this newly identified peer
    // may have connected during the initialization gap and never received our
    // presence. Forcing the broadcast ensures all connected peers (including
    // this one) get our current status.
    this.lastBroadcastStatus = null
    this.broadcastPresence().catch(() => {})

    // CONNECTIVITY: Delayed presence re-send to guarantee delivery.
    // The immediate send above may fail silently if the Protomux channel
    // isn't fully ready yet (common on cross-border connections with latency).
    // Re-sending after 2s ensures the peer receives our presence even if
    // the first attempt was lost.
    setTimeout(() => {
      if (p2pService.getConnectedPeers().includes(data.peerId)) {
        const freshIdentity = useIdentityStore.getState().identity
        if (freshIdentity) {
          const freshStatus = this.outgoingPresence()
          p2pService.sendMessage(data.peerId, 'presence:update', {
            status: freshStatus,
            displayName: freshIdentity.profile.displayName,
            customStatus: freshIdentity.profile.customStatus,
          }).catch(() => {})
        }
      }
    }, 2000)

    groupService.flushPendingGroupMessages(data.publicKey).catch(() => {})
  }

  private applyPresenceUpdate(publicKey: string, payload: PresencePayload): void {
    const mappedStatus = fromNetworkStatus(payload.status)
    const now = Date.now()

    // This IS the declaration — record it so markPeerActive() and the identity
    // exchange below stop overwriting it with a bare 'online'.
    this.presenceDeclaredAt.set(publicKey, now)
    this.lastPresenceStatus.set(publicKey, mappedStatus)
    this.peerLastActivity.set(publicKey, now)

    const offlineTimer = this.pendingOfflineTimers.get(publicKey)
    if (offlineTimer) {
      clearTimeout(offlineTimer)
      this.pendingOfflineTimers.delete(publicKey)
    }

    const updates: Partial<Contact> = {
      status: mappedStatus,
      lastSeen: now,
    }
    const displayName = ChatService.declaredName(payload.displayName)
    if (displayName) updates.displayName = displayName
    const avatar = ChatService.declaredAvatar(payload.avatar)
    if (avatar) updates.avatar = avatar
    if (typeof payload.customStatus === 'string') {
      updates.customStatus = payload.customStatus.slice(0, ChatService.MAX_CUSTOM_STATUS)
    }

    useContactStore.getState().updateContact(publicKey, updates)
  }

  flushPendingPresence(): void {
    const pendingIdentities = Array.from(this.pendingIdentifiedPeers.entries())
    for (const [publicKey, peerId] of pendingIdentities) {
      if (!useContactStore.getState().getContact(publicKey)) continue
      this.pendingIdentifiedPeers.delete(publicKey)
      this.handleIdentifiedPeer({ publicKey, peerId })
    }

    const pendingPresences = Array.from(this.pendingPresenceUpdates.entries())
    for (const [publicKey, payload] of pendingPresences) {
      if (!useContactStore.getState().getContact(publicKey)) continue
      this.pendingPresenceUpdates.delete(publicKey)
      this.applyPresenceUpdate(publicKey, payload)
    }
  }

  /**
   * Send a new message.
   * Uses a deterministic conversationId derived from both peers' public keys
   * (via the discovery topic hash), ensuring both parties use the same ID.
   */
  async sendMessage(outgoing: OutgoingMessage, _conversationId: string, peerId: string): Promise<SendOutcome> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    console.log('[ChatService] === SEND MESSAGE to peer:', peerId.slice(0, 32), '| type:', outgoing.type)
    try { window.asgard.debugLog('[ChatService] === SEND MESSAGE to peer: ' + peerId.slice(0, 32)) } catch {}

    // Derive deterministic conversationId from both peers' public keys
    const resolvedId = cryptoService.deriveConversationId(identity.keyPair.publicKey, peerId)
    const signedMessage = await this.buildSignedMessage(outgoing, resolvedId, identity.keyPair.publicKey)

    // Répondre vaut acceptation : si ce pair nous avait ajoutés, notre message
    // est la réponse qui confirme l'ajout (et lui envoie contact:accept).
    this.confirmReplyContact(peerId)

    try {
      // PERFORMANCE: sendRawMessage() saute la signature Ed25519 du P2P — le
      // payload est déjà signé ci-dessus (~5-20 ms gagnés par message).
      await p2pService.sendRawMessage(peerId, 'chat:message', signedMessage)
      useMessageStore.getState().updateStatus(signedMessage.id, resolvedId, 'sent')
      storageService.saveMessage(resolvedId, signedMessage).catch(console.error)
      this.ensureConversation(resolvedId, peerId, signedMessage)
      console.log('[ChatService] Message sent:', signedMessage.id)
      return 'sent'
    } catch (err) {
      const errMsg = `[ChatService] sendMessage network failure: ${err instanceof Error ? err.message : String(err)}`
      console.error(errMsg)
      try { window.asgard.debugLog(errMsg) } catch {}

      // Hors ligne : on garde le message signé en file, il sera renvoyé à la
      // reconnexion. Le statut reste « sending » (horloge) tant que les
      // tentatives ne sont pas épuisées.
      this.queueMessage(signedMessage, resolvedId, peerId)
      useMessageStore.getState().updateStatus(signedMessage.id, resolvedId, 'sending')
      return 'queued'
    }
  }

  /**
   * Renvoie un message passé en échec définitif, à la demande de l'utilisateur.
   * Même identifiant et même horodatage que l'original : le pair qui l'aurait
   * déjà reçu (échec ambigu) le déduplique au lieu d'afficher deux bulles.
   * Un second échec réseau le remet en file pour la reconnexion.
   */
  async retryMessage(messageId: string, conversationId: string, peerId: string): Promise<SendOutcome> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const message = useMessageStore.getState().getMessage(messageId, conversationId)
    if (!message || message.deleted) throw new Error('Message not found')

    const signature = await cryptoService.sign({
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      senderId: message.senderId,
    })
    const signedMessage: Message = { ...message, signature }

    this.confirmReplyContact(peerId)

    try {
      await p2pService.sendRawMessage(peerId, 'chat:message', signedMessage)
      useMessageStore.getState().updateStatus(messageId, conversationId, 'sent')
      storageService.saveMessage(conversationId, signedMessage).catch(console.error)
      return 'sent'
    } catch (err) {
      console.warn('[ChatService] retry failed — message re-queued:', err)
      this.queueMessage(signedMessage, conversationId, peerId)
      useMessageStore.getState().updateStatus(messageId, conversationId, 'sending')
      return 'queued'
    }
  }

  /**
   * Répondre dans la conversation vaut acceptation d'une demande entrante.
   * L'avatar n'est poussé qu'à la transition, pas à chaque message.
   */
  private confirmReplyContact(peerId: string): void {
    if (!confirmPendingContact(peerId, 'incoming', true)) return
    const identity = useIdentityStore.getState().identity
    if (identity?.profile.avatar && p2pService.isPeerConnected(peerId)) {
      this.sendAvatarViaMedia(peerId, identity.profile.avatar, 'contact').catch(() => {})
    }
  }

  /**
   * Crée le message local puis le signe. Le message signé est réutilisé tel
   * quel par les renvois : re-passer par messageStore.sendMessage créerait un
   * doublon dans la conversation à chaque tentative.
   */
  private async buildSignedMessage(
    outgoing: OutgoingMessage,
    conversationId: string,
    senderId: string
  ): Promise<Message> {
    const message = await useMessageStore.getState().sendMessage(
      { ...outgoing, conversationId },
      senderId
    )
    try {
      const signature = await cryptoService.sign({
        id: message.id,
        content: message.content,
        timestamp: message.timestamp,
        senderId: message.senderId,
      })
      return { ...message, signature }
    } catch (err) {
      // Erreur locale (signature) : rien à réessayer sur le réseau.
      // On laisse un échec visible au lieu d'un spinner éternel.
      console.error('[ChatService] buildSignedMessage failure:', err)
      useMessageStore.getState().updateStatus(message.id, conversationId, 'failed')
      throw err
    }
  }

  // ─── Offline Message Queue ────────────────────────────────────────────────

  /**
   * Queue a message for later delivery when peer is offline.
   * Messages are stored in memory and flushed when peer reconnects.
   */
  private queueMessage(message: Message, conversationId: string, peerId: string): void {
    const queue = this.pendingMessages.get(peerId) ?? []

    // Un renvoi ne doit jamais empiler deux fois le même message.
    if (queue.some((pending) => pending.message.id === message.id)) return

    // Enforce max queue size per peer — le plus ancien écarté doit être
    // visible comme échec, pas disparaître silencieusement.
    if (queue.length >= ChatService.MAX_PENDING_PER_PEER) {
      const dropped = queue.shift()
      if (dropped) {
        useMessageStore.getState().updateStatus(dropped.message.id, dropped.conversationId, 'failed')
        console.warn(`[ChatService] Offline queue full — message ${dropped.message.id} marked failed`)
      }
    }

    queue.push({
      message,
      conversationId,
      peerId,
      createdAt: Date.now(),
      attempts: 0,
    })

    this.pendingMessages.set(peerId, queue)
    console.log(`[ChatService] Message queued for offline delivery to ${peerId.slice(0, 16)} (queue: ${queue.length})`)
  }

  /** Marque définitivement un message en file comme non délivré. */
  private markPendingFailed(pending: PendingMessage, reason: string): void {
    useMessageStore.getState().updateStatus(pending.message.id, pending.conversationId, 'failed')
    console.warn(`[ChatService] Pending message ${pending.message.id} failed (${reason}, attempts: ${pending.attempts})`)
  }

  /**
   * Flush pending messages for a peer when they come back online.
   * Retries sending each queued message in order.
   */
  async flushPendingMessages(peerId: string): Promise<void> {
    const queue = this.pendingMessages.get(peerId)
    if (!queue || queue.length === 0) return

    console.log(`[ChatService] Flushing ${queue.length} pending messages for peer ${peerId.slice(0, 16)}`)

    const survivors: PendingMessage[] = []

    for (const pending of queue) {
      // Expiré : échec explicite (l'ancien code le retirait sans statut).
      if (Date.now() - pending.createdAt > ChatService.MAX_PENDING_AGE) {
        this.markPendingFailed(pending, 'expired')
        continue
      }

      try {
        await p2pService.sendRawMessage(peerId, 'chat:message', pending.message)
        useMessageStore.getState().updateStatus(pending.message.id, pending.conversationId, 'sent')
        storageService.saveMessage(pending.conversationId, pending.message).catch(console.error)
        console.log(`[ChatService] Pending message sent successfully (attempt ${pending.attempts + 1})`)
      } catch (err) {
        pending.attempts++
        if (pending.attempts >= ChatService.MAX_SEND_ATTEMPTS) {
          this.markPendingFailed(pending, err instanceof Error ? err.message : 'send failed')
        } else {
          survivors.push(pending)
        }
      }
    }

    if (survivors.length === 0) {
      this.pendingMessages.delete(peerId)
    } else {
      this.pendingMessages.set(peerId, survivors)
    }
  }

  /**
   * Get count of pending messages for a peer.
   */
  getPendingCount(peerId?: string): number {
    if (peerId) {
      return this.pendingMessages.get(peerId)?.length ?? 0
    }
    let total = 0
    for (const queue of this.pendingMessages.values()) {
      total += queue.length
    }
    return total
  }

  // ─── Ephemeral Messages (Disappearing) ────────────────────────────────────

  private ephemeralCleanupInterval: ReturnType<typeof setInterval> | null = null
  private static readonly EPHEMERAL_CHECK_INTERVAL = 30_000 // Check every 30s

  /**
   * Start periodic cleanup of expired ephemeral messages.
   */
  private startEphemeralCleanup(): void {
    if (this.ephemeralCleanupInterval) return

    this.ephemeralCleanupInterval = setInterval(() => {
      const now = Date.now()
      const allMessages = useMessageStore.getState().messages

      for (const [convId, msgs] of Object.entries(allMessages)) {
        for (const msg of msgs) {
          if (msg.expiresAt && msg.expiresAt <= now && !msg.deleted) {
            useMessageStore.getState().deleteMessage(msg.id, convId)
            console.log(`[ChatService] Ephemeral message expired: ${msg.id}`)
          }
        }
      }
    }, ChatService.EPHEMERAL_CHECK_INTERVAL)
  }

  /**
   * Stop ephemeral cleanup interval.
   */
  stopEphemeralCleanup(): void {
    if (this.ephemeralCleanupInterval) {
      clearInterval(this.ephemeralCleanupInterval)
      this.ephemeralCleanupInterval = null
    }
  }

  /**
   * Edit a sent message
   */
  async editMessage(messageId: string, conversationId: string, newContent: string, peerId: string): Promise<void> {
    useMessageStore.getState().editMessage(messageId, conversationId, newContent)
    await p2pService.sendMessage(peerId, 'chat:edit', { messageId, conversationId, newContent })
  }

  /**
   * Toggle pin on a message in a DM conversation.
   */
  togglePinMessage(messageId: string, conversationId: string): void {
    const store = useMessageStore.getState()
    const isPinned = store.isMessagePinned(messageId, conversationId)
    if (isPinned) {
      store.unpinMessage(messageId, conversationId)
    } else {
      store.pinMessage(messageId, conversationId)
    }
  }

  /**
   * Delete a message (soft delete — marks as deleted)
   */
  async deleteMessage(messageId: string, conversationId: string, peerId: string): Promise<void> {
    useMessageStore.getState().deleteMessage(messageId, conversationId)
    await p2pService.sendMessage(peerId, 'chat:delete', { messageId, conversationId })
  }

  /**
   * Delete a message permanently (hard delete — removes from store and storage)
   */
  async deleteMessagePermanently(messageId: string, conversationId: string, peerId?: string): Promise<void> {
    useMessageStore.getState().deleteMessagePermanently(messageId, conversationId)
    storageService.deleteMessage(conversationId, messageId).catch(console.error)
    if (peerId) {
      await p2pService.sendMessage(peerId, 'chat:delete', { messageId, conversationId }).catch(() => {})
    }
  }

  /**
   * Clear all messages in a conversation (keeps the conversation)
   * OPTIMIZATION: Uses batch delete via clearMessages() instead of individual deletes.
   */
  async clearConversation(conversationId: string): Promise<void> {
    useMessageStore.getState().clearConversationMessages(conversationId)
    // OPTIMIZATION: Batch delete all messages in one operation
    await storageService.clearMessages(conversationId).catch(console.error)
  }

  // ─── Full-Text Search ─────────────────────────────────────────────────────

  /**
   * Search messages across all conversations.
   * Returns matching messages with conversation context.
   */
  searchMessagesGlobal(query: string, options?: {
    conversationId?: string
    senderId?: string
    limit?: number
    fromDate?: number
    toDate?: number
  }): SearchResult[] {
    const q = query.toLowerCase().trim()
    if (!q) return []

    const limit = options?.limit ?? 50
    const results: SearchResult[] = []
    const allMessages = useMessageStore.getState().messages
    const contacts = useContactStore.getState().contacts

    // Search in specific conversation or all
    const conversationsToSearch = options?.conversationId
      ? { [options.conversationId]: allMessages[options.conversationId] || [] }
      : allMessages

    for (const [convId, msgs] of Object.entries(conversationsToSearch)) {
      if (!msgs) continue

      for (const msg of msgs) {
        // Skip deleted/recalled messages
        if (msg.deleted || msg.recalled) continue

        // Apply filters
        if (options?.senderId && msg.senderId !== options.senderId) continue
        if (options?.fromDate && msg.timestamp < options.fromDate) continue
        if (options?.toDate && msg.timestamp > options.toDate) continue

        // Check content match
        const contentMatch = msg.content?.toLowerCase().includes(q)
        
        // Check attachment filenames
        const attachmentMatch = msg.attachments?.some(a => 
          a.name?.toLowerCase().includes(q)
        )

        if (contentMatch || attachmentMatch) {
          // Get contact info for this conversation
          const contact = Object.values(contacts).find(c => {
            const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
            if (!myPk) return false
            const derivedId = cryptoService.deriveConversationId(myPk, c.publicKey)
            return derivedId === convId
          })

          results.push({
            message: msg,
            conversationId: convId,
            contactName: contact?.displayName || 'Unknown',
            contactAvatar: contact?.avatar,
          })

          if (results.length >= limit) break
        }
      }
    }

    // Sort by timestamp (newest first)
    return results.sort((a, b) => b.message.timestamp - a.message.timestamp)
  }

  /**
   * Search and return matching conversations (by message content or contact name).
   */
  searchConversations(query: string): ConversationSearchResult[] {
    const q = query.toLowerCase().trim()
    if (!q) return []

    const results: ConversationSearchResult[] = []
    const conversations = useConversationStore.getState().conversations
    const contacts = useContactStore.getState().contacts
    const allMessages = useMessageStore.getState().messages

    for (const conv of Object.values(conversations)) {
      // Check if contact name matches
      const contact = conv.participantId ? contacts[conv.participantId] : undefined
      const nameMatch = contact?.displayName?.toLowerCase().includes(q)

      // Check if any message content matches
      const msgs = allMessages[conv.id] || []
      const contentMatch = msgs.some(m => 
        !m.deleted && !m.recalled && m.content?.toLowerCase().includes(q)
      )

      if (nameMatch || contentMatch) {
        // Count matching messages
        const matchCount = msgs.filter(m => 
          !m.deleted && !m.recalled && m.content?.toLowerCase().includes(q)
        ).length

        results.push({
          conversation: conv,
          contactName: contact?.displayName || 'Unknown',
          contactAvatar: contact?.avatar,
          matchCount,
          lastMatchAt: nameMatch ? Date.now() : 0,
        })
      }
    }

    // Sort by match count (most relevant first)
    return results.sort((a, b) => b.matchCount - a.matchCount)
  }

  /**
   * Delete a conversation entirely (conversation + all messages)
   */
  async deleteConversation(conversationId: string, _peerId?: string): Promise<void> {
    // Clear all messages first
    await this.clearConversation(conversationId)
    // Remove the conversation from the store
    useConversationStore.getState().removeConversation(conversationId)
  }

  /**
   * Toggle a reaction on a message: optimistic UI update, persisted locally, and
   * queued for retry when the peer is unreachable.
   */
  async toggleReaction(messageId: string, conversationId: string, emoji: string, peerId: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    let message = useMessageStore.getState().getMessage(messageId, conversationId)

    // Fallback — search across all conversations if message not found
    if (!message) {
      const allMessages = useMessageStore.getState().messages
      for (const convId of Object.keys(allMessages)) {
        const found = allMessages[convId]?.find((m) => m.id === messageId)
        if (found) {
          message = found
          conversationId = convId
          break
        }
      }
    }
    if (!message) return

    const myReaction = message.reactions?.find((r) => r.emoji === emoji)
    const hasReacted = myReaction?.users.includes(identity.keyPair.publicKey)

    // PERFORMANCE: Optimistic UI update IMMEDIATELY (before network)
    if (hasReacted) {
      useMessageStore.getState().removeReaction(messageId, conversationId, emoji, identity.keyPair.publicKey)
    } else {
      useMessageStore.getState().addReaction(messageId, conversationId, emoji, identity.keyPair.publicKey)
    }

    const payload: ReactionPayload = {
      messageId,
      conversationId,
      emoji,
      action: hasReacted ? 'remove' : 'add',
    }

    // Sans cette écriture, la réaction de l'émetteur ne survit qu'à la session en cours.
    const persisted = useMessageStore.getState().getMessage(messageId, conversationId)
    if (persisted) storageService.saveMessage(conversationId, persisted).catch(() => {})

    try {
      await p2pService.sendMessage(peerId, 'chat:reaction', payload)
    } catch (err) {
      const errMsg = `[ChatService] chat:reaction send FAILED to ${peerId.slice(0, 16)}: ${err instanceof Error ? err.message : String(err)}`
      console.warn(errMsg)
      try { window.asgard.debugLog(errMsg) } catch {}
      this.queueReaction({ ...payload, peerId, createdAt: Date.now(), attempts: 0 })
    }
  }

  /**
   * Mettre une réaction en file pour remise ultérieure (pair injoignable).
   */
  private queueReaction(pending: PendingReaction): void {
    if (this.pendingReactions.size >= ChatService.MAX_PENDING_REACTIONS) {
      const oldest = this.pendingReactions.values().next().value
      if (oldest) this.pendingReactions.delete(oldest)
    }
    this.pendingReactions.add(pending)
    console.log(`[ChatService] Reaction queued for offline delivery to ${pending.peerId.slice(0, 16)} (queue: ${this.pendingReactions.size})`)
  }

  /**
   * Remettre les réactions en attente quand un pair revient en ligne.
   */
  async flushPendingReactions(peerId: string): Promise<void> {
    const now = Date.now()
    for (const pending of this.pendingReactions) {
      if (pending.peerId !== peerId) continue

      if (now - pending.createdAt > ChatService.MAX_PENDING_AGE) {
        this.pendingReactions.delete(pending)
        continue
      }

      try {
        await p2pService.sendMessage(peerId, 'chat:reaction', {
          messageId: pending.messageId,
          conversationId: pending.conversationId,
          emoji: pending.emoji,
          action: pending.action,
        })
        this.pendingReactions.delete(pending)
        console.log(`[ChatService] Pending reaction delivered to ${peerId.slice(0, 16)}`)
      } catch (err) {
        pending.attempts++
        if (pending.attempts >= ChatService.REACTION_MAX_ATTEMPTS) {
          this.pendingReactions.delete(pending)
          const errMsg = `[ChatService] Pending reaction abandoned after ${pending.attempts} attempts: ${err instanceof Error ? err.message : String(err)}`
          console.warn(errMsg)
          try { window.asgard.debugLog(errMsg) } catch {}
        }
      }
    }
  }

  /**
   * Send typing indicator
   */
  async sendTyping(conversationId: string, peerId: string, typing: boolean): Promise<void> {
    // Respect privacy setting: don't send typing indicators if disabled
    const privacy = useUIStore.getState().settings.privacy
    if (!privacy.typingIndicators) return

    const throttleKey = `${peerId}:${conversationId}`

    // PERFORMANCE: Throttle typing:true to max 1 per 2s per peer (avoid flooding network).
    // typing:false must always be sent immediately so the indicator disappears on the peer.
    if (typing) {
      const lastSent = this.lastTypingSent.get(throttleKey) ?? 0
      if (Date.now() - lastSent < 2000) return
      this.lastTypingSent.set(throttleKey, Date.now())
    }

    // Fire-and-forget: typing indicators are best-effort, don't await
    p2pService.sendMessage(peerId, 'presence:typing', {
      conversationId,
      typing,
    }).catch(() => {})
  }

  /**
   * Forward a message to another conversation or peer.
   * Adds forwardedFrom metadata to the new message.
   */
  async forwardMessage(
    messageId: string,
    fromConversationId: string,
    toConversationId: string,
    toPeerId: string
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    // Get the original message
    const originalMessage = useMessageStore.getState().getMessage(messageId, fromConversationId)
    if (!originalMessage) throw new Error('Message not found')

    // Create a new forwarded message
    const forwardedMessage = await useMessageStore.getState().sendMessage(
      {
        conversationId: toConversationId,
        type: originalMessage.type,
        content: originalMessage.content,
        attachments: undefined, // Don't forward attachments for now
      },
      identity.keyPair.publicKey
    )

    // Update with forwarded metadata
    const updatedMessage = {
      ...forwardedMessage,
      forwardedFrom: {
        messageId: originalMessage.id,
        senderId: originalMessage.senderId,
        conversationId: originalMessage.conversationId,
      },
    }

    // Sign the message
    const signature = await cryptoService.sign({
      id: updatedMessage.id,
      content: updatedMessage.content,
      timestamp: updatedMessage.timestamp,
      senderId: updatedMessage.senderId,
    })

    const signedMessage = { ...updatedMessage, signature }

    // PERFORMANCE: Optimistic UI update + sendRawMessage to skip double signing
    useMessageStore.getState().updateStatus(updatedMessage.id, toConversationId, 'sent')
    const sendPromise = p2pService.sendRawMessage(toPeerId, 'chat:message', signedMessage)

    // Fire-and-forget storage
    storageService.saveMessage(toConversationId, signedMessage).catch(console.error)
    await sendPromise
  }

  /**
   * Send a delivery receipt to confirm a message was received.
   * Called automatically when we receive a chat:message.
   */
  async sendDeliveryReceipt(peerId: string, messageIds: string[]): Promise<void> {
    const logMsg = `[ChatService] sendDeliveryReceipt to ${peerId.slice(0, 16)} | msgs: ${messageIds.length}`
    console.log(logMsg)
    try { window.asgard.debugLog(logMsg) } catch {}
    try {
      await p2pService.sendMessage(peerId, 'chat:receipt', {
        messageIds,
        status: 'delivered',
        timestamp: Date.now(),
      })
    } catch (err) {
      // Queue for retry when peer reconnects
      this.queuePendingReceipt(peerId, { messageIds, status: 'delivered' })
      console.warn('[ChatService] sendDeliveryReceipt failed — queued for retry:', err)
    }
  }

  /**
   * Send read receipt for messages (DM).
   * Called when the user opens the conversation and sees the messages.
   */
  async sendReadReceipt(conversationId: string, peerId: string, messageIds: string[]): Promise<void> {
    const logMsg = `[ChatService] sendReadReceipt to ${peerId.slice(0, 16)} | msgs: ${messageIds.length} | convId: ${conversationId.slice(0, 16)}`
    console.log(logMsg)
    try { window.asgard.debugLog(logMsg) } catch {}
    let success = true
    // Send unified receipt (chat:receipt) so the sender's status icon updates
    try {
      await p2pService.sendMessage(peerId, 'chat:receipt', {
        messageIds,
        status: 'read',
        conversationId,
        timestamp: Date.now(),
      })
    } catch (err) {
      success = false
      console.warn('[ChatService] sendReadReceipt (chat:receipt) failed — will retry:', err)
    }
    // Also send legacy chat:read for backward compatibility
    try {
      await p2pService.sendMessage(peerId, 'chat:read', {
        conversationId,
        messageIds,
        timestamp: Date.now(),
      })
    } catch (err) {
      success = false
    }
    if (!success) {
      // Queue for retry when peer reconnects
      this.queuePendingReceipt(peerId, { messageIds, status: 'read', conversationId })
    }
  }

  /**
   * Queue a pending receipt for retry when the peer reconnects.
   */
  private queuePendingReceipt(peerId: string, receipt: { messageIds: string[]; status: 'delivered' | 'read'; conversationId?: string }): void {
    const existing = this.pendingReceipts.get(peerId) ?? []
    existing.push(receipt)
    this.pendingReceipts.set(peerId, existing)
  }

  /**
   * Flush all pending receipts for a peer — called when they reconnect.
   * Per Hyperswarm docs, swarm.on('connection') fires immediately on reconnect.
   */
  private async flushPendingReceipts(peerId: string): Promise<void> {
    const queued = this.pendingReceipts.get(peerId)
    if (!queued || queued.length === 0) return
    this.pendingReceipts.delete(peerId)
    console.log(`[ChatService] Flushing ${queued.length} pending receipt(s) to ${peerId.slice(0, 16)}`)
    for (const receipt of queued) {
      try {
        await p2pService.sendMessage(peerId, 'chat:receipt', {
          messageIds: receipt.messageIds,
          status: receipt.status,
          conversationId: receipt.conversationId,
          timestamp: Date.now(),
        })
        console.log(`[ChatService] ✅ Pending ${receipt.status} receipt flushed to ${peerId.slice(0, 16)}`)
      } catch (err) {
        // Re-queue if still failing
        this.queuePendingReceipt(peerId, receipt)
        console.warn(`[ChatService] Pending receipt flush failed — re-queued:`, err)
        break // Stop trying — peer might not be ready yet
      }
    }
  }

  /**
   * Recall a sent message (request deletion from recipient).
   */
  async recallMessage(
    messageId: string,
    conversationId: string,
    peerId: string,
    reason?: string
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    // Mark as recalled locally
    useMessageStore.getState().recallMessage(messageId, conversationId, reason)

    // Send recall request to peer
    await p2pService.sendMessage(peerId, 'chat:recall', {
      messageId,
      conversationId,
      reason,
      timestamp: Date.now(),
    }).catch(console.error)

    // Also delete from storage
    storageService.deleteMessage(conversationId, messageId).catch(console.error)
  }

  /**
   * Generate link previews for URLs in message content.
   * Extracts URLs and fetches metadata asynchronously.
   */
  async generateLinkPreviews(messageId: string, conversationId: string, content: string): Promise<void> {
    // Extract URLs from content
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[]]+/g
    const urls = content.match(urlRegex) || []

    if (urls.length === 0) return

    const previews: import('@/types').LinkPreview[] = []

    for (const url of urls.slice(0, 3)) { // Limit to 3 previews per message
      try {
        // Use a simple fetch to get page metadata
        const response = await fetch(url, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000) // 5s timeout
        })
        
        if (!response.ok) continue

        const html = await response.text()
        
        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
        const title = titleMatch ? titleMatch[1].trim() : undefined

        // Extract description from meta tags
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
        const description = descMatch ? descMatch[1].trim() : undefined

        // Extract image from og:image
        const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i)
        const image = imageMatch ? imageMatch[1].trim() : undefined

        // Extract favicon
        const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i)
        let favicon = faviconMatch ? faviconMatch[1].trim() : undefined
        if (favicon && !favicon.startsWith('http')) {
          const urlObj = new URL(url)
          favicon = `${urlObj.protocol}//${urlObj.host}${favicon}`
        }

        previews.push({ url, title, description, image, favicon })
      } catch {
        // Skip failed previews
        continue
      }
    }

    if (previews.length > 0) {
      useMessageStore.getState().updateLinkPreviews(messageId, conversationId, previews)
    }
  }

  /**
   * Send a voice message to a peer.
   * Voice messages include waveform data for visualization.
   */
  async sendVoiceMessage(
    _conversationId: string,
    peerId: string,
    audioBlob: Blob,
    waveform: number[],
    duration: number
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const resolvedId = cryptoService.deriveConversationId(identity.keyPair.publicKey, peerId)

    // Create the voice message
    const message = await useMessageStore.getState().sendMessage(
      {
        conversationId: resolvedId,
        type: 'voice',
        content: '', // Voice messages have no text content
        waveform,
      },
      identity.keyPair.publicKey
    )

    // Store audio blob (filesystem via StorageService.putBlob — cf. electron/services/StorageService.ts)
    const blobKey = await storageService.putBlob(await audioBlob.arrayBuffer())

    // Update message with attachment
    useMessageStore.getState().updateMessageAttachment(message.id, resolvedId, {
      attachments: [{
        id: generateId(),
        type: 'voice',
        name: 'voice-message.ogg',
        size: audioBlob.size,
        mimeType: audioBlob.type || 'audio/ogg',
        blobKey,
        duration,
      }],
    })

    // Sign and send the message
    const signature = await cryptoService.sign({
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      senderId: message.senderId,
    })

    const signedMessage = { ...message, signature }
    await p2pService.sendMessage(peerId, 'chat:message', signedMessage)
    useMessageStore.getState().updateStatus(message.id, resolvedId, 'sent')

    // Persist to storage
    storageService.saveMessage(resolvedId, signedMessage).catch(console.error)
  }

  /**
   * Schedule a message for later delivery.
   */
  async scheduleMessage(
    conversationId: string,
    peerId: string,
    content: string,
    scheduledAt: number,
    type: 'text' | 'image' | 'file' = 'text'
  ): Promise<string> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const messageId = generateId()
    const scheduledMessage: import('@/types').ScheduledMessage = {
      id: messageId,
      conversationId,
      peerId,
      content,
      type,
      scheduledAt,
      sent: false,
      createdAt: Date.now(),
    }

    useMessageStore.getState().scheduleMessage(scheduledMessage)

    // Also add to local messages with 'scheduled' status
    const resolvedId = cryptoService.deriveConversationId(identity.keyPair.publicKey, peerId)
    useMessageStore.getState().addMessage({
      id: messageId,
      conversationId: resolvedId,
      senderId: identity.keyPair.publicKey,
      type,
      content,
      timestamp: Date.now(),
      status: 'scheduled',
      scheduledAt,
    })

    return messageId
  }

  /**
   * Send a threaded reply to a message.
   */
  async sendThreadReply(
    _conversationId: string,
    peerId: string,
    parentMessageId: string,
    content: string
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const resolvedId = cryptoService.deriveConversationId(identity.keyPair.publicKey, peerId)

    // Create the reply message
    const message = await useMessageStore.getState().sendMessage(
      {
        conversationId: resolvedId,
        type: 'text',
        content,
        threadParentId: parentMessageId,
      },
      identity.keyPair.publicKey
    )

    // Update the parent message's thread info
    const threadMessages = useMessageStore.getState().getThreadMessages(parentMessageId, resolvedId)
    useMessageStore.getState().updateThreadInfo(
      parentMessageId,
      resolvedId,
      threadMessages.length + 1,
      Date.now()
    )

    // Sign and send
    const signature = await cryptoService.sign({
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      senderId: message.senderId,
    })

    const signedMessage = { ...message, signature }
    await p2pService.sendMessage(peerId, 'chat:thread', {
      parentMessageId,
      message: signedMessage,
    })
    useMessageStore.getState().updateStatus(message.id, resolvedId, 'sent')

    storageService.saveMessage(resolvedId, signedMessage).catch(console.error)
  }

  /**
   * Send a priority/urgent message.
   * Priority messages trigger special notifications.
   */
  async sendPriorityMessage(
    _conversationId: string,
    peerId: string,
    content: string
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const resolvedId = cryptoService.deriveConversationId(identity.keyPair.publicKey, peerId)

    const message = await useMessageStore.getState().sendMessage(
      {
        conversationId: resolvedId,
        type: 'text',
        content,
        priority: true,
      },
      identity.keyPair.publicKey
    )

    // Sign and send with priority flag
    const signature = await cryptoService.sign({
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      senderId: message.senderId,
    })

    const signedMessage = { ...message, signature, priority: true }
    await p2pService.sendMessage(peerId, 'chat:message', signedMessage)
    useMessageStore.getState().updateStatus(message.id, resolvedId, 'sent')

    storageService.saveMessage(resolvedId, signedMessage).catch(console.error)
  }

  /**
   * Send a poll to a peer.
   */
  async sendPoll(
    _conversationId: string,
    peerId: string,
    question: string,
    options: string[],
    multipleAnswers: boolean = false,
    endsAt?: number,
    anonymous: boolean = false
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const resolvedId = cryptoService.deriveConversationId(identity.keyPair.publicKey, peerId)

    const pollData = {
      question,
      options: options.map((text) => ({ id: generateId(), text, votes: [] })),
      multipleAnswers,
      endsAt,
      anonymous,
    }

    const message = await useMessageStore.getState().sendMessage(
      {
        conversationId: resolvedId,
        type: 'poll',
        content: question,
        poll: pollData,
      },
      identity.keyPair.publicKey
    )

    const signature = await cryptoService.sign({
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      senderId: message.senderId,
    })

    const signedMessage = { ...message, signature }
    await p2pService.sendMessage(peerId, 'chat:poll', signedMessage)
    useMessageStore.getState().updateStatus(message.id, resolvedId, 'sent')

    storageService.saveMessage(resolvedId, signedMessage).catch(console.error)
  }

  /**
   * Vote on a poll.
   */
  async voteOnPoll(
    conversationId: string,
    peerId: string,
    messageId: string,
    optionId: string
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    useMessageStore.getState().voteOnPoll(messageId, conversationId, optionId, identity.keyPair.publicKey)

    await p2pService.sendMessage(peerId, 'chat:poll', {
      type: 'vote',
      messageId,
      optionId,
      voterPublicKey: identity.keyPair.publicKey,
    })
  }

  /**
   * Send a location to a peer.
   */
  async sendLocation(
    _conversationId: string,
    peerId: string,
    location: {
      latitude: number
      longitude: number
      altitude?: number
      accuracy?: number
      name?: string
      address?: string
    }
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const resolvedId = cryptoService.deriveConversationId(identity.keyPair.publicKey, peerId)

    const message = await useMessageStore.getState().sendMessage(
      {
        conversationId: resolvedId,
        type: 'location',
        content: location.name || `${location.latitude}, ${location.longitude}`,
        location,
      },
      identity.keyPair.publicKey
    )

    const signature = await cryptoService.sign({
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      senderId: message.senderId,
    })

    const signedMessage = { ...message, signature }
    await p2pService.sendMessage(peerId, 'chat:location', signedMessage)
    useMessageStore.getState().updateStatus(message.id, resolvedId, 'sent')

    storageService.saveMessage(resolvedId, signedMessage).catch(console.error)
  }

  /**
   * Send an event to a peer.
   */
  async sendEvent(
    _conversationId: string,
    peerId: string,
    event: {
      title: string
      description?: string
      startTime: number
      endTime: number
      location?: { latitude: number; longitude: number; name?: string }
      attendees: string[]
      recurring?: 'daily' | 'weekly' | 'monthly' | 'yearly'
    }
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const resolvedId = cryptoService.deriveConversationId(identity.keyPair.publicKey, peerId)

    const message = await useMessageStore.getState().sendMessage(
      {
        conversationId: resolvedId,
        type: 'event',
        content: event.title,
        event,
      },
      identity.keyPair.publicKey
    )

    const signature = await cryptoService.sign({
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      senderId: message.senderId,
    })

    const signedMessage = { ...message, signature }
    await p2pService.sendMessage(peerId, 'chat:event', signedMessage)
    useMessageStore.getState().updateStatus(message.id, resolvedId, 'sent')

    storageService.saveMessage(resolvedId, signedMessage).catch(console.error)
  }

  /**
   * Send a task to a peer.
   */
  async sendTask(
    _conversationId: string,
    peerId: string,
    task: {
      title: string
      description?: string
      dueDate?: number
      assignees: string[]
      priority: 'low' | 'medium' | 'high' | 'urgent'
    }
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const resolvedId = cryptoService.deriveConversationId(identity.keyPair.publicKey, peerId)

    const message = await useMessageStore.getState().sendMessage(
      {
        conversationId: resolvedId,
        type: 'task',
        content: task.title,
        task: { ...task, completed: false },
      },
      identity.keyPair.publicKey
    )

    const signature = await cryptoService.sign({
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      senderId: message.senderId,
    })

    const signedMessage = { ...message, signature }
    await p2pService.sendMessage(peerId, 'chat:task', signedMessage)
    useMessageStore.getState().updateStatus(message.id, resolvedId, 'sent')

    storageService.saveMessage(resolvedId, signedMessage).catch(console.error)
  }

  /**
   * Share a contact card with a peer.
   */
  async shareContactCard(
    _conversationId: string,
    peerId: string,
    contactCard: {
      publicKey: string
      displayName: string
      avatar?: string
      status?: string
      customStatus?: string
      shareEmail?: boolean
      sharePhone?: boolean
      email?: string
      phone?: string
    }
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const resolvedId = cryptoService.deriveConversationId(identity.keyPair.publicKey, peerId)

    const message = await useMessageStore.getState().sendMessage(
      {
        conversationId: resolvedId,
        type: 'contact',
        content: `Contact: ${contactCard.displayName}`,
        contactCard,
      },
      identity.keyPair.publicKey
    )

    const signature = await cryptoService.sign({
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      senderId: message.senderId,
    })

    const signedMessage = { ...message, signature }
    await p2pService.sendMessage(peerId, 'chat:contact', signedMessage)
    useMessageStore.getState().updateStatus(message.id, resolvedId, 'sent')

    storageService.saveMessage(resolvedId, signedMessage).catch(console.error)
  }

  /**
   * Broadcast a message to multiple recipients.
   */
  async broadcastMessage(
    content: string,
    recipientPublicKeys: string[],
    type: 'text' | 'image' | 'file' = 'text'
  ): Promise<string[]> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const messageIds: string[] = []

    for (const peerId of recipientPublicKeys) {
      try {
        const resolvedId = cryptoService.deriveConversationId(identity.keyPair.publicKey, peerId)

        const message = await useMessageStore.getState().sendMessage(
          {
            conversationId: resolvedId,
            type,
            content,
            broadcastRecipients: recipientPublicKeys,
          },
          identity.keyPair.publicKey
        )

        messageIds.push(message.id)

        const signature = await cryptoService.sign({
          id: message.id,
          content: message.content,
          timestamp: message.timestamp,
          senderId: message.senderId,
        })

        const signedMessage = { ...message, signature }
        await p2pService.sendMessage(peerId, 'chat:broadcast', signedMessage)
        useMessageStore.getState().updateStatus(message.id, resolvedId, 'sent')

        storageService.saveMessage(resolvedId, signedMessage).catch(console.error)
      } catch (error) {
        console.error(`Failed to broadcast to ${peerId}:`, error)
      }
    }

    return messageIds
  }

  /**
   * Start periodic heartbeat: broadcast presence and detect stale peers.
   * This ensures:
   * 1. Our contacts always know we're online (we re-broadcast every 20s)
   * 2. Stale peers are marked offline within ~45s of last activity
   * 3. Immediate broadcast on first start (don't wait for first interval)
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) return

    // PERFORMANCE: Immediate first broadcast (don't wait 20s)
    this.broadcastPresence().catch(() => {})

    this.heartbeatInterval = setInterval(() => {
      this.heartbeatTick()
    }, ChatService.HEARTBEAT_INTERVAL)

    // CONNECTIVITY: Listen for online/offline events for immediate reconnection
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[ChatService] Network online — immediate presence broadcast + reconnect all peers')
        this.lastBroadcastStatus = null // Force re-broadcast
        this.broadcastPresence().catch(() => {})
        // Re-join all known peers so Hyperswarm re-establishes direct connections
        this.reconnectAllKnownPeers()
      })
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          // User came back to tab — refresh presence and check peer connections
          this.lastBroadcastStatus = null
          this.broadcastPresence().catch(() => {})
          this.reconnectAllKnownPeers()
        }
      })
    }
  }

    /**
   * Stop the heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval)
      this.idleCheckInterval = null
    }
  }

  /**
   * PERSISTENCE: Re-establish connections to all known contacts.
   * Called when the network comes back online or the app becomes visible.
   * Uses Hyperswarm joinPeer() (via connectToContact) for peers whose Noise id
   * we know, and falls back to re-joining the conversation topic otherwise.
   */
  private reconnectAllKnownPeers(): void {
    const contacts = useContactStore.getState().contacts
    const connectedPeers = new Set(p2pService.getConnectedPeers())
    const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
    if (!myPk) return

    for (const contact of Object.values(contacts)) {
      if (contact.relation === 'blocked') continue
      const noisePeerId = this.ed25519ToNoiseMap.get(contact.publicKey) ?? this.noiseKeyCache.get(contact.publicKey)
      if (noisePeerId) {
        // If already connected, skip
        if (connectedPeers.has(noisePeerId)) continue
        void this.redial(contact.publicKey, noisePeerId)
      } else {
        // No Noise id known yet: derive it from the contact's Ed25519 key
        // (direct joinPeer) AND re-join the conversation topic so discovery
        // keeps working for peers that announce only via topic.
        cryptoService.deriveConversationTopic(myPk, contact.publicKey)
          .then((topic) => p2pService.joinTopic(topic))
          .catch(() => {})
        void this.redial(contact.publicKey)
      }
    }
  }

  /**
   * CONNECTIVITY: Establish (or re-establish) a direct connection to one contact.
   *
   * The Noise peer id is NOT stored anywhere when a contact is added — it can
   * only be obtained either from a live `peer:identified` event or by deriving
   * it from the contact's Ed25519 key (same SHA-256 → HyperDHT.keyPair chain as
   * the local identity, computed by the main process). Relying on
   * `ed25519ToNoiseMap` alone meant a contact never reached since startup was
   * never retried: Hyperswarm gives up after ~5 attempts, and App.tsx only
   * calls joinPeer once, so the peer stayed invisible until the app restarted
   * (hence the permanent `peers=0` and one-way presence).
   *
   * Cheap and idempotent: Hyperswarm deduplicates `joinPeer` for a known peer,
   * and `redialInFlight` prevents overlapping derivations.
   */
  private async redial(ed25519Key: string, knownNoiseKey?: string): Promise<void> {
    if (this.redialInFlight.has(ed25519Key)) return
    this.redialInFlight.add(ed25519Key)
    try {
      let noiseKey = knownNoiseKey ?? this.noiseKeyCache.get(ed25519Key)
      if (!noiseKey) {
        noiseKey = await window.asgard.network.deriveNoisePublicKey(ed25519Key)
        if (noiseKey) this.noiseKeyCache.set(ed25519Key, noiseKey)
      }
      if (!noiseKey) {
        console.warn('[ChatService] Re-dial skipped: no Noise key for', ed25519Key.slice(0, 16))
        return
      }
      if (!this.ed25519ToNoiseMap.has(ed25519Key)) {
        const msg = `[ChatService] re-dial → ${ed25519Key.slice(0, 16)} (noise ${noiseKey.slice(0, 16)})`
        console.log(msg)
        try { window.asgard.debugLog(msg) } catch { /* logging must never break connectivity */ }
      }
      await window.asgard.network.connectToContact(noiseKey, true)
    } catch (err) {
      console.warn('[ChatService] Re-dial failed for', ed25519Key.slice(0, 16), err)
    } finally {
      this.redialInFlight.delete(ed25519Key)
    }
  }

  /**
   * PERFORMANCE: Start idle detection for auto-away status.
   * Monitors user activity (mouse/keyboard) and sets status to 'away' after IDLE_TIMEOUT.
   * Restores previous status when user becomes active again.
   */
  private startIdleDetection(): void {
    if (this.idleCheckInterval) return

    // Track user activity
    const updateActivity = () => {
      this.lastUserActivity = Date.now()
      // PAS DE RESTAURATION ICI. La politique « devenir absent quand l'utilisateur
      // ne bouge plus, le rétablir à son retour » appartient à ActivityMonitor, qui
      // seul sait si le « absent » affiché vient de lui ou d'un choix manuel. Ce
      // bloc réécrivait 'online' à la main : un second décideur pour le même
      // statut, et déjà désaccordé — il transformait un « absent » choisi par
      // l'utilisateur en « en ligne » au premier mouvement de souris.
    }

    // Listen for user activity events
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', updateActivity, { passive: true })
      window.addEventListener('keydown', updateActivity, { passive: true })
      window.addEventListener('click', updateActivity, { passive: true })
    }

    // PERSISTENCE: Do not auto-switch to 'away'. Users expect to stay online
    // as long as the application is running. The idle detection machinery is
    // kept in place for future optional status controls, but it no longer
    // changes the profile status automatically.
    this.idleCheckInterval = setInterval(() => {
      const idleTime = Date.now() - this.lastUserActivity
      if (idleTime > ChatService.IDLE_TIMEOUT) {
        // No-op: status remains online.
      }
    }, ChatService.IDLE_CHECK_INTERVAL)

    console.log('[ChatService] Idle detection active (auto-away disabled for persistence)')
  }

  /**
   * Stop idle detection — reserved for cleanup on destroy
   */
  
  // @ts-ignore
  private _stopIdleDetection(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval)
      this.idleCheckInterval = null
    }
  }

  /**
   * Called every HEARTBEAT_INTERVAL. Broadcasts presence and prunes stale peers.
   */
  private heartbeatTick(): void {
    const now = Date.now()
    const timeout = ChatService.PRESENCE_TIMEOUT

    // 1. Detect stale peers.
    // CRITICAL FIX: A Noise connection (Hyperswarm socket) does NOT prove the remote
    // app is running. Hyperswarm can maintain TCP connections to peers whose DHT entries
    // exist but whose app is closed. Only actual presence messages (presence:update,
    // ping, pong, chat messages) prove liveness via markPeerActive().
    // We use the Noise connection only as a secondary signal: if the connection is
    // broken, we know for sure the peer is offline. But if it's open, we still
    // require recent presence activity to mark them online.
    const liveNoise = new Set(p2pService.getConnectedPeers())
    for (const [ed25519Key, lastActivity] of this.peerLastActivity.entries()) {
      const noiseId = this.ed25519ToNoiseMap.get(ed25519Key)
      const isConnected = noiseId && liveNoise.has(noiseId)

      // CRITICAL: Do NOT update peerLastActivity based on Noise connection alone.
      // Only markPeerActive() should update it (when actual messages are received).
      // However, if the connection is broken, we can accelerate offline detection.
      if (!isConnected && now - lastActivity > timeout) {
        const contact = useContactStore.getState().getContact(ed25519Key)
        // EXPIRY: every non-offline status must expire, not just 'online'. A peer
        // that declared 'away' or 'busy' and then closed the app stayed forever
        // « absent » / « occupé » on our side: the test only matched 'online'.
        if (contact && contact.status !== 'offline') {
          useContactStore.getState().updateContact(ed25519Key, {
            status: 'offline',
          })
          console.log('[ChatService] Peer marked offline (no presence + no connection):', ed25519Key.slice(0, 16))
        }
        this.peerLastActivity.delete(ed25519Key)
        this.presenceDeclaredAt.delete(ed25519Key)
      } else if (isConnected && now - lastActivity > timeout * 2) {
        // CRITICAL: Even with an active Noise connection, if we haven't received
        // any presence messages for 2x timeout (90s), mark offline.
        // This handles the "ghost online" case where Hyperswarm keeps the socket
        // open but the remote app is closed.
        const contact = useContactStore.getState().getContact(ed25519Key)
        if (contact && contact.status !== 'offline') {
          useContactStore.getState().updateContact(ed25519Key, {
            status: 'offline',
          })
          console.log('[ChatService] Peer marked offline (ghost online — connection open but no presence):', ed25519Key.slice(0, 16))
        }
        this.peerLastActivity.delete(ed25519Key)
        this.presenceDeclaredAt.delete(ed25519Key)
      }
    }

    // 2. Re-broadcast our presence to all connected peers
    this.broadcastPresence().catch(() => {})

    // 3. PERFORMANCE: Send ping to connected peers for latency measurement
    for (const peerId of liveNoise) {
      p2pService.sendMessage(peerId, 'presence:ping', { timestamp: Date.now() }).catch(() => {})
    }

    // 4. CONNECTIVITY: Periodically refresh joinPeer for all known contacts
    // that are NOT currently connected. Hyperswarm's joinPeer() maintains
    // connection attempts, but these can go stale after network changes
    // (WiFi → mobile, NAT rebinding). Re-calling joinPeer every heartbeat
    // ensures Hyperswarm keeps actively trying to reach offline peers.
    // This is cheap — Hyperswarm deduplicates internally.
    //
    // CRITICAL: la re-tentative ne peut PAS se limiter aux pairs présents dans
    // `ed25519ToNoiseMap` — cette map n'est remplie que par `peer:identified`,
    // donc UNIQUEMENT APRÈS une connexion aboutie. Un contact jamais atteint
    // depuis le démarrage n'y figure jamais : le heartbeat ne le re-join donc
    // jamais, alors que Hyperswarm abandonne après 5 tentatives
    // (peerInfo.attempts) — App.tsx ne faisant qu'UN seul joinPeer au
    // démarrage, un pair manqué à cet instant restait inexistant jusqu'au
    // redémarrage de l'app. D'où le « peers=0 » permanent et la présence
    // unilatérale. On dérive donc la Noise key depuis la clé du contact.
    const contacts = useContactStore.getState().contacts
    for (const contact of Object.values(contacts)) {
      if (contact.relation === 'blocked') continue
      const noisePeerId = this.ed25519ToNoiseMap.get(contact.publicKey) ?? this.noiseKeyCache.get(contact.publicKey)
      if (noisePeerId && liveNoise.has(noisePeerId)) continue
      const lastAttempt = this.lastRedialAt.get(contact.publicKey) ?? 0
      if (now - lastAttempt < ChatService.REDIAL_INTERVAL) continue
      this.lastRedialAt.set(contact.publicKey, now)
      void this.redial(contact.publicKey, noisePeerId)
    }

    // 5. RECEIPT RETRY: Re-attempt flushing any pending receipts for connected peers.
    // This catches receipts queued between heartbeat ticks whose peer is now reachable.
    // The pendingReceipts Map is keyed by Ed25519; we need the Noise peer ID to check
    // connectivity via ed25519ToNoiseMap.
    if (this.pendingReceipts.size > 0) {
      for (const [ed25519Key] of this.pendingReceipts.entries()) {
        const noisePeerId = this.ed25519ToNoiseMap.get(ed25519Key)
        if (noisePeerId && liveNoise.has(noisePeerId)) {
          this.flushPendingReceipts(ed25519Key).catch(() => {})
        }
      }
    }

    // 6. GROUP PRESENCE: délégué au heartbeat dédié de GroupService (30 s, avec
    // skip si statut inchangé, force-broadcast toutes les ~2,5 min et
    // cleanupStalePresence). Ce tick 5 s annonçait DE FAÇON INCONDITIONNELLE à tous
    // les membres de chaque groupe (message signé broadcast) — soit ~6× le trafic
    // du heartbeat dédié, sans gain de fraîcheur : un changement réel de statut
    // déclenche l'annonce immédiate via l'abonnement AUTO-PRESENCE de GroupService.
  }

  /**
   * Our own status as the network must see it: the single internal-to-network
   * mapping of src/utils/presence.ts, gated by the `privacy.onlineStatus`
   * setting. Every emission point (peer:connected, peer:identified, delayed
   * re-send, heartbeat broadcast, contact:request / contact:accept, DHT
   * re-publish) goes through here. They used to each inline their own chain of
   * ternaries, and two of them forgot the privacy gate - so a user hiding their
   * presence still leaked their real status into the DHT and to each new peer.
   */
  private outgoingPresence(): NetworkStatus {
    const identity = useIdentityStore.getState().identity
    if (!identity) return 'offline'
    const hidePresence = !useUIStore.getState().settings.privacy.onlineStatus
    return toNetworkStatus(identity.profile.status, hidePresence)
  }

  /**
   * Publish our (privacy-gated) status to the DHT. App.tsx owns the startup
   * publish and the 30 s refresh loop; this method lets an immediate event — a
   * visibility toggle, a status picked in the settings — reach the DHT without
   * waiting for that loop. Always goes through outgoingPresence() so the DHT can
   * never advertise more than the P2P channel does.
   */
  async publishDhtStatus(): Promise<void> {
    if (!window.asgard?.network?.publishStatus) return
    const identity = useIdentityStore.getState().identity
    if (!identity) return
    const statusMessage = presenceMessage(identity.profile)
    const networkStatus = this.outgoingPresence()
    await window.asgard.network.publishStatus(networkStatus, statusMessage).catch(() => {})
    console.log('[ChatService] DHT status published:', networkStatus)
  }

  /**
   * Do we hold a recent presence DECLARATION from this peer? The DHT refresh loop
   * in App.tsx asks this: a DHT record is an older copy of the same declaration
   * (republished every 30 s, read every 60 s), so it may inform us about a peer we
   * cannot reach over P2P, but it must never contradict a live declaration.
   */
  hasFreshPresence(publicKey: string, maxAgeMs: number = ChatService.PRESENCE_TIMEOUT): boolean {
    const declaredAt = this.presenceDeclaredAt.get(publicKey)
    return declaredAt !== undefined && Date.now() - declaredAt <= maxAgeMs
  }

  /**
   * Un signal P2P récent (déclaration ou socket ouvert) fait autorité : le DHT
   * n'apporte alors qu'une copie plus ancienne et ne doit pas être interrogé.
   */
  isPeerReachable(publicKey: string): boolean {
    return this.hasFreshPresence(publicKey) || p2pService.isPeerConnected(publicKey)
  }

  /**
   * Accélère la découverte d'un contact au moment où l'utilisateur ouvre sa
   * conversation : compose directement son adresse Noise (sans attendre le
   * heartbeat) et interroge son profil DHT si aucun signal P2P ne fait autorité.
   * Throttlé : ouvrir une conversation ne doit pas relancer une rafale DHT.
   */
  probeContact(publicKey: string): void {
    const contact = useContactStore.getState().getContact(publicKey)
    if (!contact || contact.relation === 'blocked') return
    const now = Date.now()
    if (now - (this.lastProbeAt.get(publicKey) ?? 0) < ChatService.PROBE_INTERVAL) return
    this.lastProbeAt.set(publicKey, now)

    if (!p2pService.isPeerConnected(publicKey)) {
      void this.redial(publicKey)
    }
    if (!this.isPeerReachable(publicKey)) {
      void this.refreshDhtPresence(publicKey)
    }
  }

  /** Lit le profil DHT d'un contact et applique son statut avec les règles de priorité. */
  async refreshDhtPresence(publicKey: string): Promise<boolean> {
    if (!window.asgard?.network?.fetchProfile) return false
    const profile = await window.asgard.network.fetchProfile(publicKey).catch(() => null)
    return this.applyDhtProfile(publicKey, profile)
  }

  /**
   * Applique un profil DHT (ou son absence) au statut d'un contact.
   *
   * Règles, dans l'ordre :
   * 1. bloqué → jamais touché ;
   * 2. signal P2P récent → le DHT est une copie plus ancienne, ignorée ;
   * 3. profil de moins de 2 min → son statut s'applique ;
   * 4. profil absent ou périmé → hors ligne.
   * Renvoie true si le statut a changé.
   */
  applyDhtProfile(
    publicKey: string,
    profile: { status?: string; timestamp?: number } | null,
    maxAgeMs: number = ChatService.DHT_PROFILE_MAX_AGE,
  ): boolean {
    const contact = useContactStore.getState().getContact(publicKey)
    if (!contact || contact.relation === 'blocked') return false
    if (this.isPeerReachable(publicKey)) return false

    const fresh = !!profile?.status && !!profile.timestamp && Date.now() - profile.timestamp < maxAgeMs
    const next = fresh && profile?.status ? fromNetworkStatus(profile.status) : 'offline'
    if (contact.status === next) return false
    useContactStore.getState().updateContact(publicKey, { status: next })
    return true
  }

  /**
   * Broadcast presence update to all connected peers.
   * PERFORMANCE: Skips broadcast if status hasn't changed since last broadcast.
   * Sends minimal payload (status + customStatus, no displayName/avatar).
   */
  async broadcastPresence(): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const status = this.outgoingPresence()

    // CRITICAL: Always re-broadcast when peers are connected — this acts as a
    // keep-alive so peers always know our current status. Skip only when status
    // is unchanged AND 0 peers are connected (nothing to send to).
    // The presence:ping message does NOT carry our status — only presence:update does.
    // Without periodic re-broadcast, peers who missed the initial update never
    // learn our status, causing "I see them but they don't see me" asymmetry.
    const connectedPeerCount = Object.values(useNetworkStore.getState().peers).filter((p) => p.connected).length
    const willSkip = status === this.lastBroadcastStatus && connectedPeerCount === 0
    console.log(`[ChatService] broadcastPresence: status=${status} | lastBroadcast=${this.lastBroadcastStatus} | peers=${connectedPeerCount} | skip=${willSkip}`)
    try { window.asgard.debugLog(`[ChatService] broadcastPresence: status=${status} | lastBroadcast=${this.lastBroadcastStatus} | peers=${connectedPeerCount} | skip=${willSkip}`) } catch {}
    if (willSkip) return

    // CRITICAL FIX: Send presence FIRST, then mark as sent.
    // Previously, lastBroadcastStatus was set BEFORE the broadcast — if all sends
    // failed (e.g. channels not ready), the next broadcast was incorrectly skipped.
    // Now we only mark as sent after the broadcast completes.
    await p2pService.broadcast('presence:update', {
      status,
      displayName: identity.profile.displayName,
      avatar: undefined,
      customStatus: identity.profile.customStatus,
    }).catch(console.error)
    this.lastBroadcastStatus = status
  }

  /**
   * Mark a peer as online when we see any activity from them (typing, ping, pong,
   * message, etc.). This acts as a fallback when the remote client is on an older
   * build that still reports 'away' or misses presence broadcasts.
   *
   * FALLBACK only — it must not contradict a status the peer declared itself.
   * P2PService emits `message:<type>` BEFORE the generic `message` event, so this
   * method ran AFTER applyPresenceUpdate() on every presence:update; forcing
   * 'online' here therefore erased the declared status every 5 s, which is why
   * « absent », « occupé » and « invisible » never showed up on the other side.
   */
  private markPeerActive(peerId: string): void {
    const now = Date.now()
    this.peerLastActivity.set(peerId, now)
    const contact = useContactStore.getState().getContact(peerId)
    if (!contact) return
    // Cancel any pending offline timer — peer is clearly active
    const offlineTimer = this.pendingOfflineTimers.get(peerId)
    if (offlineTimer) {
      clearTimeout(offlineTimer)
      this.pendingOfflineTimers.delete(peerId)
    }

    if (shouldPromoteToOnline(this.presenceDeclaredAt.get(peerId), now, ChatService.PRESENCE_TIMEOUT)) {
      // Nothing declared (or the declaration is stale): activity is our only
      // evidence, so show the peer online.
      if (contact.status !== 'online' || now - (contact.lastSeen ?? 0) > 5000) {
        useContactStore.getState().updateContact(peerId, {
          status: 'online',
          lastSeen: now,
        })
      }
      return
    }

    // A declaration stands: keep 'away' / 'busy' / 'offline' as written, but the
    // peer is provably alive, so refresh the lastSeen used by the UI labels.
    if (now - (contact.lastSeen ?? 0) > 5000) {
      useContactStore.getState().updateContact(peerId, { lastSeen: now })
    }
  }

  /**
   * Push our current avatar to all connected contacts and group members
   * via binary media channel. Called when our avatar changes.
   * Per Holepunch pattern: avatars are never in signed messages — they
   * are always pushed via the binary media channel.
   */
  private async pushAvatarToAllContacts(avatar: string): Promise<void> {
    const contacts = useContactStore.getState().contacts
    const connectedPeers = p2pService.getConnectedPeers()

    // Send to each connected contact via binary media channel
    for (const contact of Object.values(contacts)) {
      if (contact.relation === 'contact' || contact.relation === 'pending') {
        const noisePeerId = this.ed25519ToNoiseMap.get(contact.publicKey)
        if (noisePeerId && connectedPeers.includes(noisePeerId)) {
          this.sendAvatarViaMedia(contact.publicKey, avatar, 'contact').catch(() => {})
        }
      }
    }

    // Also announce to all groups with avatar push. announceGroupPresence(groupId, true)
    // sends our avatar via sendMemberAvatarViaMedia to each group member.
    const groups = useGroupStore.getState().getAllGroups()
    for (const group of groups) {
      groupService.announceGroupPresence(group.id, true).catch(() => {})
    }
  }

  /**
   * Route incoming avatar data to the appropriate store based on context.
   * Called by the media:data handler when a complete avatar is received.
   *
   * @param ed25519Key - Sender's Ed25519 public key
   * @param avatarData - Decoded avatar string (base64 data URL)
   * @param target - 'contact' | 'group_member' | 'group_icon'
   * @param groupId - Group ID (required for group_member and group_icon)
   */
  /** Avatars are compressed to ≤256 px WebP; anything multi-megabyte is abuse. */
  private static readonly MAX_AVATAR_CHARS = 2 * 1024 * 1024
  private static readonly MAX_AVATAR_CHUNKS = 256
  private static readonly MAX_AVATAR_CHUNK_BYTES = 64 * 1024
  private static readonly AVATAR_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/
  private static readonly MAX_PROFILE_NAME = 200
  private static readonly MAX_CUSTOM_STATUS = 200

  /** A peer-declared name: trimmed, non-empty, bounded. */
  private static declaredName(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed ? trimmed.slice(0, ChatService.MAX_PROFILE_NAME) : undefined
  }

  /** A peer-declared avatar must be an image data URL of sane size. */
  private static declaredAvatar(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length === 0) return undefined
    if (value.length > ChatService.MAX_AVATAR_CHARS) return undefined
    return ChatService.AVATAR_DATA_URL.test(value) ? value : undefined
  }

  private storeAvatar(ed25519Key: string, avatarData: string, target: string, groupId?: string): void {
    // Binary chunks carry no application-level signature: validate before any
    // store sees them, or a peer could inject arbitrary markup via the data
    // URL or park megabytes in the zustand stores and local persistence.
    if (typeof avatarData !== 'string' || avatarData.length === 0) return
    if (avatarData.length > ChatService.MAX_AVATAR_CHARS) return
    if (!ChatService.AVATAR_DATA_URL.test(avatarData)) return
    const group = typeof groupId === 'string' && groupId.length <= 128
      ? useGroupStore.getState().getGroup(groupId)
      : undefined

    if (target === 'group_member' && groupId) {
      // Only a member of that group can refresh its own member avatar.
      if (!group?.members.some((member) => member.publicKey === ed25519Key)) return
      useGroupStore.getState().updateMember(groupId, ed25519Key, { avatar: avatarData })
      // The member avatar is the sender's own profile: keep the 1:1 card in sync.
      useContactStore.getState().updateContact(ed25519Key, { avatar: avatarData })
      const msg = `[ChatService] Group member avatar stored: ${avatarData.length} chars for ${ed25519Key.slice(0, 16)} in group ${groupId.slice(0, 16)}`
      console.log(msg)
      try { window.asgard.debugLog(msg) } catch {}
    } else if (target === 'group_icon' && groupId) {
      // The icon is an admin setting: a member (or an outsider) must not be
      // able to deface it by pushing media with a guessed groupId.
      if (!group || !useGroupStore.getState().isAdmin(groupId, ed25519Key)) return
      useGroupStore.getState().updateGroup(groupId, { avatar: avatarData })
      const msg = `[ChatService] Group icon avatar stored: ${avatarData.length} chars for group ${groupId.slice(0, 16)}`
      console.log(msg)
      try { window.asgard.debugLog(msg) } catch {}
    } else {
      // Contact avatar: updateContact ignores keys that are not contacts.
      useContactStore.getState().updateContact(ed25519Key, { avatar: avatarData })
      // Standard contact avatar
      const msg = `[ChatService] Contact avatar stored: ${avatarData.length} chars for ${ed25519Key.slice(0, 16)}`
      console.log(msg)
      try { window.asgard.debugLog(msg) } catch {}
    }
  }

  /**
   * Send avatar via binary media channel in chunks (avoids bloating single messages).
   * Per Holepunch pattern: binary data must never be in signed messages.
   * Format: 
   *   Chunk 0: JSON header { t: 'avatar', target, total: N } + null byte + chunk data
   *   Chunks 1..N-1: chunk data (raw bytes)
   * 
   * IMPROVEMENTS (verified against Holepunch/Keet patterns):
   *   - Deduplication: Skips sending if same avatar already sent to this peer
   *   - Polling: Waits for peer connection instead of fixed 1500ms delay
   *   - Retry: Up to 2 retries with exponential backoff on failure
   * 
   * @param peerId - Ed25519 public key of the recipient
   * @param avatar - Avatar data (base64 data URL or blob key)
   * @param target - Avatar context: 'contact' (1:1), 'group_member' (profile in group), 'group_icon' (group avatar)
   * @param groupId - Required when target is 'group_member' or 'group_icon'
   */
  private async sendAvatarViaMedia(peerId: string, avatar?: string, target: string = 'contact', groupId?: string): Promise<void> {
    if (!avatar) return

    // DEDUPLICATION: Compute a quick hash of the avatar to avoid resending identical data.
    // This saves significant bandwidth on reconnections (avatar can be 50-500KB base64).
    let avatarHash = ''
    try {
      // Simple FNV-1a hash of first/last 1KB for fast comparison
      const sample = avatar.slice(0, 1024) + avatar.slice(-1024)
      let h = 0x811c9dc5
      for (let i = 0; i < sample.length; i++) {
        h ^= sample.charCodeAt(i)
        h = (h * 0x01000193) >>> 0
      }
      avatarHash = h.toString(36) + ':' + avatar.length
    } catch {
      avatarHash = ':' + avatar.length
    }

    const existingHash = this.sentAvatarHashes.get(peerId)
    if (existingHash === avatarHash) {
      // Same avatar already sent — skip
      return
    }

    // POLLING: Wait for peer to be connected (max 10s) instead of fixed 1500ms.
    // Cross-border connections can take longer to establish channels.
    const maxWait = 10000
    const pollInterval = 500
    let waited = 0
    while (waited < maxWait) {
      const connected = p2pService.getConnectedPeers().includes(
        this.ed25519ToNoiseMap.get(peerId) ?? peerId
      )
      if (connected) break
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
      waited += pollInterval
    }

    // Send with retry (up to 2 retries)
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const CHUNK_SIZE = 16 * 1024 // 16KB chunks to stay well under Protomux limits
        const dataBytes = new TextEncoder().encode(avatar)
        const totalChunks = Math.ceil(dataBytes.length / CHUNK_SIZE)

        if (attempt === 1) {
          const logMsg = `[ChatService] Sending avatar via media: ${avatar.length} chars, ${dataBytes.length} bytes, ${totalChunks} chunks, target=${target}`
          console.log(logMsg)
          try { window.asgard.debugLog(logMsg) } catch {}
        } else {
          console.log(`[ChatService] Avatar send retry attempt ${attempt}/${maxAttempts} for peer: ${peerId.slice(0, 16)}`)
        }

        // Send first chunk with header (includes target + groupId for context-aware reception)
        const header = JSON.stringify({ t: 'avatar', target, ...(groupId ? { groupId } : {}), total: totalChunks })
        const headerBytes = new TextEncoder().encode(header)
        const firstChunkSize = Math.min(CHUNK_SIZE, dataBytes.length)
        const firstChunk = new Uint8Array(headerBytes.length + 1 + firstChunkSize)
        firstChunk.set(headerBytes, 0)
        firstChunk[headerBytes.length] = 0 // null separator
        firstChunk.set(dataBytes.slice(0, firstChunkSize), headerBytes.length + 1)
        await p2pService.sendMediaData(peerId, firstChunk)

        // Send remaining chunks
        for (let i = 1; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE
          const end = Math.min(start + CHUNK_SIZE, dataBytes.length)
          const chunk = dataBytes.slice(start, end)
          await p2pService.sendMediaData(peerId, chunk)
        }

        // Success — record the hash to avoid resending
        this.sentAvatarHashes.set(peerId, avatarHash)
        const successMsg = `[ChatService] Avatar sent: ${totalChunks} chunks successfully, target=${target}`
        console.log(successMsg)
        try { window.asgard.debugLog(successMsg) } catch {}
        return // Done
      } catch (err) {
        if (attempt < maxAttempts) {
          // Exponential backoff: 1s, 3s
          const backoff = attempt * 2000 - 1000
          console.warn(`[ChatService] Avatar send failed (attempt ${attempt}): ${err} — retrying in ${backoff}ms`)
          await new Promise((resolve) => setTimeout(resolve, backoff))
        } else {
          const errMsg = `[ChatService] Failed to send avatar after ${maxAttempts} attempts: ${err}`
          console.warn(errMsg)
          try { window.asgard.debugLog(errMsg) } catch {}
        }
      }
    }
  }

  /**
   * Load message history from Hyperbee storage for a conversation.
   * Called when opening a conversation to restore message history.
   * OPTIMIZATION: Uses reverse pagination to load latest messages first.
   */
  async loadMessages(conversationId: string, limit = 50): Promise<Message[]> {
    try {
      // OPTIMIZATION: Load latest messages in reverse order (newest first)
      // This is much faster than loading all messages and sorting
      const messages = await storageService.getLastMessages(conversationId, limit)
      if (messages.length > 0) {
        // Messages are returned newest-first from storage, reverse for display
        const sorted = messages.reverse()
        useMessageStore.getState().addMessages(conversationId, sorted)
      }
      return messages
    } catch (err) {
      console.error('[ChatService] Failed to load messages:', err)
      return []
    }
  }

  /**
   * Load older messages before a given timestamp (pagination).
   * OPTIMIZATION: Uses Hyperbee range queries for efficient pagination.
   */
  async loadOlderMessages(conversationId: string, beforeTimestamp: number, limit = 50): Promise<Message[]> {
    try {
      const messages = await storageService.getMessages(conversationId, {
        before: beforeTimestamp,
        limit,
        reverse: true, // Get the most recent ones before the timestamp
      })
      if (messages.length > 0) {
        useMessageStore.getState().addMessages(conversationId, messages)
      }
      return messages
    } catch (err) {
      console.error('[ChatService] Failed to load older messages:', err)
      return []
    }
  }

  /**
   * Search messages in a conversation by content.
   * OPTIMIZATION: Uses Hyperbee range scan with early termination in main process.
   */
  async searchMessages(conversationId: string, query: string, limit = 50): Promise<Message[]> {
    try {
      return await storageService.searchMessages(conversationId, query, limit)
    } catch (err) {
      console.error('[ChatService] Failed to search messages:', err)
      return []
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /**
   * Ensure a direct conversation exists for a peer.
   * Creates it if missing (e.g. incoming message from a new contact).
   */
  private ensureConversation(conversationId: string, peerId: string, lastMessage?: Message): void {
    const store = useConversationStore.getState()
    const existing = store.getConversation(conversationId)
    if (existing) {
      store.updateConversation(conversationId, {
        // CRITICAL: Fix missing participantId on existing conversations
        ...(existing.participantId ? {} : { participantId: peerId }),
        lastMessage,
        updatedAt: Date.now(),
      })
    } else {
      store.addConversation({
        id: conversationId,
        type: 'direct',
        participantId: peerId,
        lastMessage,
        unreadCount: 0,
        muted: false,
        pinned: false,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
  }

  /**
   * Resolve a message a peer claims to act on inside the 1:1 conversation it
   * shares with us. The old handlers searched every loaded conversation: a
   * contact could edit, delete or react to group messages and to other
   * contacts' messages that happened to share an id.
   */
  private findDmMessage(from: string, messageId: unknown): { conversationId: string; message: Message } | null {
    if (typeof messageId !== 'string' || !messageId || !from) return null
    const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
    if (!myPk) return null
    const conversationId = cryptoService.deriveConversationId(myPk, from)
    const message = useMessageStore.getState().getMessage(messageId, conversationId)
    return message ? { conversationId, message } : null
  }

  private handleChatEdit(msg: ProtocolMessage): void {
    const { messageId, newContent } = msg.payload as EditPayload
    if (typeof newContent !== 'string' || newContent.length === 0 || newContent.length > 20_000) return
    const found = this.findDmMessage(msg.from, messageId)
    // Only the author may rewrite a message.
    if (!found || found.message.senderId !== msg.from) return
    useMessageStore.getState().editMessage(messageId, found.conversationId, newContent)
    const edited = useMessageStore.getState().getMessage(messageId, found.conversationId)
    if (edited) storageService.saveMessage(found.conversationId, edited).catch(() => {})
  }

  private handleChatDelete(msg: ProtocolMessage): void {
    const { messageId } = msg.payload as DeletePayload
    const found = this.findDmMessage(msg.from, messageId)
    // A delete request means "delete my message", never someone else's.
    if (!found || found.message.senderId !== msg.from) return
    useMessageStore.getState().deleteMessagePermanently(messageId, found.conversationId)
    storageService.deleteMessage(found.conversationId, messageId).catch(() => {})
  }

  private handleChatReaction(msg: ProtocolMessage): void {
    const { messageId, emoji, action } = msg.payload as ReactionPayload
    if (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > 16) return
    if (action !== 'add' && action !== 'remove') return
    const found = this.findDmMessage(msg.from, messageId)
    if (!found) return
    const store = useMessageStore.getState()
    if (action === 'add') {
      store.addReaction(messageId, found.conversationId, emoji, msg.from)
    } else {
      store.removeReaction(messageId, found.conversationId, emoji, msg.from)
    }
    // Sans cette écriture, la réaction reçue n'existe qu'en mémoire et meurt au redémarrage.
    const updated = store.getMessage(messageId, found.conversationId)
    if (updated) storageService.saveMessage(found.conversationId, updated).catch(() => {})
  }

  private handleChatRead(msg: ProtocolMessage): void {
    const payload = msg.payload as { messageIds?: string[]; messageId?: string }
    const ids = payload.messageIds ?? (payload.messageId ? [payload.messageId] : [])
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 1000) return
    const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
    if (!myPk) return
    const conversationId = cryptoService.deriveConversationId(myPk, msg.from)
    const store = useMessageStore.getState()
    for (const id of ids) {
      // A read marker only applies to messages we sent in this conversation.
      const message = store.getMessage(id, conversationId)
      if (message?.senderId !== myPk) continue
      store.markMessageRead(id, msg.from)
    }
  }

  private handleChatReceipt(msg: ProtocolMessage): void {
    const payload = msg.payload as { messageIds: string[]; status: 'delivered' | 'read' }
    if (!Array.isArray(payload.messageIds) || payload.messageIds.length === 0 || payload.messageIds.length > 1000) return
    if (payload.status !== 'delivered' && payload.status !== 'read') return
    const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
    if (!myPk) return
    const conversationId = cryptoService.deriveConversationId(myPk, msg.from)
    const store = useMessageStore.getState()
    const messages = store.messages[conversationId]
    if (!messages) return

    for (const messageId of payload.messageIds) {
      const m = messages.find((message) => message.id === messageId)
      // Only our own messages can be acknowledged, and never downgraded.
      if (!m || m.senderId !== myPk) continue
      const order = { sending: 0, sent: 1, delivered: 2, read: 3, failed: 0, scheduled: 0 }
      if ((order[payload.status] ?? 0) > (order[m.status] ?? 0)) {
        store.updateStatus(messageId, conversationId, payload.status)
      }
    }
  }

  private handleChatRecall(msg: ProtocolMessage): void {
    const { messageId, reason } = msg.payload as RecallPayload
    const found = this.findDmMessage(msg.from, messageId)
    // Only the author can recall a message.
    if (!found || found.message.senderId !== msg.from) return
    useMessageStore.getState().recallMessage(
      messageId,
      found.conversationId,
      typeof reason === 'string' ? reason.slice(0, 500) : undefined,
    )
    storageService.deleteMessage(found.conversationId, messageId).catch(() => {})
  }

  /**
   * Un message 1:1 entrant n'est retenu que pour ses champs d'affichage.
   * Réactions, accusés, modifications, pièces jointes et statut sont un état
   * local alimenté par leurs propres messages : les recopier depuis le fil
   * laisserait l'expéditeur planter une bulle déjà « lue » ou un fichier
   * fantôme. Le devis de réponse est relu dans la conversation locale.
   */
  private sanitizeIncomingDmMessage(
    raw: Message,
    from: string,
    conversationId: string,
  ): Message | null {
    if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > ChatService.MAX_INCOMING_ID) return null
    if (typeof raw.content !== 'string' || raw.content.length > ChatService.MAX_INCOMING_CHARS) return null
    if (typeof raw.timestamp !== 'number' || !Number.isFinite(raw.timestamp) || raw.timestamp <= 0) return null
    if (typeof raw.senderId !== 'string' || raw.senderId !== from) return null

    const timestamp = Math.min(raw.timestamp, Date.now() + 86_400_000)
    const mentions: Mention[] = Array.isArray(raw.mentions)
      ? raw.mentions.slice(0, ChatService.MAX_INCOMING_MENTIONS).flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const mention = value as unknown as Record<string, unknown>
        if (typeof mention.publicKey !== 'string'
          || mention.publicKey.length === 0
          || mention.publicKey.length > ChatService.MAX_INCOMING_ID) return []
        const startIndex = typeof mention.startIndex === 'number'
          && Number.isInteger(mention.startIndex) && mention.startIndex >= 0
          ? Math.min(mention.startIndex, raw.content.length)
          : 0
        const endIndex = typeof mention.endIndex === 'number'
          && Number.isInteger(mention.endIndex) && mention.endIndex >= startIndex
          ? Math.min(mention.endIndex, raw.content.length)
          : startIndex
        return [{
          publicKey: mention.publicKey,
          displayName: typeof mention.displayName === 'string'
            ? mention.displayName.slice(0, ChatService.MAX_PROFILE_NAME)
            : '',
          startIndex,
          endIndex,
        }]
      })
      : []

    let replyTo: Message['replyTo']
    const rawReply = raw.replyTo
    if (rawReply && typeof rawReply === 'object'
      && typeof rawReply.id === 'string'
      && rawReply.id.length > 0
      && rawReply.id.length <= ChatService.MAX_INCOMING_ID) {
      const quoted = useMessageStore.getState().getMessage(rawReply.id, conversationId)
      if (quoted) {
        replyTo = {
          id: quoted.id,
          senderId: quoted.senderId,
          content: quoted.content,
          type: quoted.type,
        }
      }
    }

    return {
      id: raw.id,
      conversationId,
      senderId: from,
      type: raw.type === 'mention' ? 'mention' : 'text',
      content: raw.content,
      timestamp,
      status: 'delivered',
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(typeof raw.signature === 'string' && raw.signature.length <= ChatService.MAX_INCOMING_SIGNATURE
        ? { signature: raw.signature }
        : {}),
    }
  }

  private async handleIncomingMessage(msg: ProtocolMessage): Promise<void> {
    const message = msg.payload as Message | null
    if (!msg.from || !message || typeof message !== 'object') return

    const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
    const resolvedId = myPk
      ? cryptoService.deriveConversationId(myPk, msg.from)
      : message.conversationId

    // DIAGNOSTIC: Log key info
    console.log('[ChatService] INCOMING MSG | from:', msg.from?.slice(0, 20), '| myPk:', myPk?.slice(0, 20), '| resolvedId:', resolvedId?.slice(0, 16), '| msgConvId:', message?.conversationId?.slice(0, 16))
    try { window.asgard.debugLog('[ChatService] INCOMING MSG resolvedId:' + resolvedId?.slice(0, 16) + ' msgConvId:' + message?.conversationId?.slice(0, 16)) } catch {}

    // Check if the sender is blocked
    const contact = useContactStore.getState().getContact(msg.from)
    if (contact?.relation === 'blocked') return

    // Un contenu ou un identifiant démesuré ne va pas plus loin : la
    // vérification de signature sérialise déjà le contenu.
    if (typeof message.id !== 'string' || message.id.length === 0 || message.id.length > ChatService.MAX_INCOMING_ID) return
    if (typeof message.content !== 'string' || message.content.length > ChatService.MAX_INCOMING_CHARS) return
    if (typeof message.timestamp !== 'number' || !Number.isFinite(message.timestamp) || message.timestamp <= 0) return
    if (typeof message.senderId !== 'string' || message.senderId !== msg.from) return

    // HOLEPUNCH SECURITY: Verify the Ed25519 message-level signature.
    // The sender signs { id, content, timestamp, senderId } with their private key.
    // This ensures the message content hasn't been tampered with and
    // cryptographically proves the sender's identity.
    // Without this, a malicious peer could forge or alter messages.
    if (typeof message.signature !== 'string'
      || message.signature.length === 0
      || message.signature.length > ChatService.MAX_INCOMING_SIGNATURE) {
      // HOLEPUNCH SECURITY: Messages without signatures are rejected for integrity.
      // All chat messages must be signed by the sender.
      console.warn('[ChatService] !!! UNSIGNED MESSAGE from:', msg.from?.slice(0, 32), '— rejecting')
      return
    }
    try {
      const isValid = await cryptoService.verify(
        { id: message.id, content: message.content, timestamp: message.timestamp, senderId: message.senderId },
        message.signature,
        msg.from
      )
      if (!isValid) {
        console.warn('[ChatService] !!! INVALID MESSAGE SIGNATURE from:', msg.from?.slice(0, 32), '| msgId:', message.id?.slice(0, 8))
        try { window.asgard.debugLog('[ChatService] INVALID SIGNATURE rejected from: ' + msg.from?.slice(0, 32)) } catch {}
        return // Reject forged/tampered messages
      }
    } catch (err) {
      console.warn('[ChatService] Signature verification error:', err)
      return // Reject on verification failure
    }

    // CRITICAL: Mark sender as online when we receive any message from them.
    // This is a fallback presence mechanism — even if presence:update was missed,
    // receiving a message proves the peer is online.
    this.markPeerActive(msg.from)

    // Le pair nous a répondu : notre demande sortante est confirmée. Pas
    // d'accept en écho — sa réponse suffit, et une acceptation renvoyée
    // l'ajouterait chez lui alors que ce n'est pas ce qu'il a demandé.
    confirmPendingContact(msg.from, 'outgoing', false)

    // Seuls les champs d'affichage sont conservés, dans la conversation
    // dérivée de l'identité signataire.
    const correctedMessage = this.sanitizeIncomingDmMessage(message, msg.from, resolvedId)
    if (!correctedMessage) return

    // Add message to store
    useMessageStore.getState().addMessage(correctedMessage)

    // Persist message to Hyperbee storage
    storageService.saveMessage(resolvedId, correctedMessage).catch(console.error)

    // RECEIPT: Send a delivery receipt to the sender so their status icon updates
    // from ✓ (sent) to ✓✓ (delivered). Best-effort, non-blocking.
    this.sendDeliveryReceipt(msg.from, [correctedMessage.id]).catch(() => {})

    // CRITICAL: Auto-create conversation if it doesn't exist (new contact messaging us)
    this.ensureConversation(resolvedId, msg.from, correctedMessage)

    // Update unread count
    const convStore = useConversationStore.getState()
    const activeId = convStore.activeConversationId
    // L'identifiant sélectionné survit à la navigation : seul un ChatView
    // monté prouve que le fil est sous les yeux de l'utilisateur.
    const viewingConversation = convStore.chatViewVisible && activeId === resolvedId
    if (!viewingConversation) {
      convStore.incrementUnread(resolvedId)
    }

    // Show notification if not active conversation AND notifications are allowed
    if (!viewingConversation) {
      const muted = convStore.getConversation(resolvedId)?.muted ?? false
      const notifSettings = useUIStore.getState().settings.notifications
      const a11ySettings = useUIStore.getState().settings.accessibility
      if (!muted && notifSettings.enabled && !notifSettings.dndMode) {
        const senderName = contact?.displayName ?? msg.from.slice(0, 8)
        const content = correctedMessage.content ?? ''
        // NOTIFICATION SETTINGS (mentionsOnly): only notify when the message
        // mentions us — @displayName, @all or @here.
        if (!notifSettings.mentionsOnly || this.isMentioned(content)) {
          const body = notifSettings.showPreview
            ? content.slice(0, 100)
            : i18n.t('notifications.newMessage')
          window.asgard.notifications.show(senderName, body, { conversationId: resolvedId })
          // NOTIFICATION SETTINGS (sound): short beep alongside the notification
          if (notifSettings.sound) ringtoneService.playBeep(660, 120)
          // ACCESSIBILITY SETTINGS (ttsEnabled): read the message aloud
          if (a11ySettings.ttsEnabled) speakText(`${senderName}. ${body}`)
        }
      }
    }
  }

  /**
   * NOTIFICATION SETTINGS (mentionsOnly): detect whether a message mentions the
   * local user — @displayName (case-insensitive), @all or @here.
   */
  private isMentioned(content: string): boolean {
    const lower = content.toLowerCase()
    if (lower.includes('@all') || lower.includes('@here')) return true
    const myName = useIdentityStore.getState().identity?.profile.displayName?.trim().toLowerCase()
    if (!myName || myName.length < 2) return false
    return lower.includes(`@${myName}`)
  }

  /**
   * Ajoute un pair par sa clé publique et ouvre sa conversation.
   *
   * La relation naît « en attente » : le pair doit répondre dans la conversation
   * pour confirmer l'ajout — aucune acceptation automatique de part et d'autre.
   * Retourne l'identifiant de conversation à ouvrir. Si une demande entrante du
   * même pair existe déjà, ajouter sa clé vaut acceptation : la relation passe
   * immédiatement à « contact ».
   */
  async registerContact(publicKey: string, displayName?: string): Promise<string> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')
    if (publicKey === identity.keyPair.publicKey) throw new Error('Cannot add yourself')

    const store = useContactStore.getState()
    const existing = store.getContact(publicKey)
    if (existing?.relation === 'blocked') throw new Error('Contact is blocked')

    const name = displayName?.trim()
    const conversationId = cryptoService.deriveConversationId(
      identity.keyPair.publicKey,
      publicKey
    )

    if (!existing) {
      const contact: Contact = {
        publicKey,
        displayName: name || `User-${publicKey.slice(24, 32)}`,
        status: 'offline',
        relation: 'pending',
        requestDirection: 'outgoing',
        verified: false,
        addedAt: Date.now(),
      }
      store.addContact(contact)
      storageService.saveContact(contact).catch((err) => {
        console.warn('[ChatService] Failed to persist contact request:', err)
      })
    } else if (existing.relation === 'pending') {
      if (name) store.updateContact(publicKey, { displayName: name })
      if (existing.requestDirection === 'incoming') {
        confirmPendingContact(publicKey, 'incoming', true)
      }
    }

    // La conversation existe même pendant l'attente : c'est là que la réponse
    // qui confirme l'ajout sera écrite.
    this.ensureConversation(conversationId, publicKey)

    // Les deux chemins de découverte courent ensemble : composer l'adresse Noise
    // ne doit pas attendre les annonces de topic (plusieurs secondes).
    if (!p2pService.isPeerConnected(publicKey)) {
      void this.redial(publicKey)
    }
    // Le contact vient d'être ajouté : son statut DHT (s'il est en ligne) doit
    // s'afficher sans attendre la boucle de refresh de 30 s. L'ordre P2P
    // prioritaire est appliqué par applyDhtProfile.
    void this.refreshDhtPresence(publicKey)

    try {
      const topic = await cryptoService.deriveConversationTopic(
        identity.keyPair.publicKey,
        publicKey
      )
      await p2pService.joinTopic(topic)
    } catch (err) {
      // L'ajout local reste valide ; le heartbeat retentera la connexion.
      console.warn('[ChatService] Failed to join conversation topic:', err)
    }

    const contact = useContactStore.getState().getContact(publicKey)
    if (
      contact?.relation === 'pending' &&
      contact.requestDirection === 'outgoing' &&
      p2pService.isPeerConnected(publicKey)
    ) {
      this.contactRequestsSent.add(publicKey)
      p2pService
        .sendMessage(publicKey, 'contact:request', {
          displayName: identity.profile.displayName,
        })
        .catch((err) => {
          this.contactRequestsSent.delete(publicKey)
          console.warn('[ChatService] Failed to send contact request:', err)
        })
    }

    return conversationId
  }

  /**
   * Handle incoming contact request.
   *
   * Une demande ne confirme jamais l'ajout : elle crée (ou rafraîchit) une
   * relation « pending » / `incoming`, et c'est la réponse de l'utilisateur
   * dans la conversation qui enverra contact:accept. L'ancien code acceptait
   * automatiquement, ce qui rouvrait même les contacts bloqués.
   */
  private handleContactRequest(msg: ProtocolMessage): void {
    const payload = msg.payload as { displayName?: unknown; avatar?: unknown } | null
    if (!msg.from || !payload || typeof payload !== 'object') return
    const displayName = ChatService.declaredName(payload.displayName)
    const avatar = ChatService.declaredAvatar(payload.avatar)
    const store = useContactStore.getState()
    const existing = store.getContact(msg.from)

    // Bloqué : la demande ne rouvre rien et ne doit pas déclencher d'accept.
    if (existing?.relation === 'blocked') return

    // Activité, pas déclaration : c'est markPeerActive() qui décide de montrer le
    // pair « en ligne », et il respecte un « absent » / « occupé » / « invisible »
    // fraîchement déclaré — un pair caché ne doit pas être révélé par sa demande.
    // Pour un contact encore inconnu, il ne fait qu'enregistrer l'horodatage.
    this.markPeerActive(msg.from)

    // Les deux pairs ont ajouté la clé de l'autre : intentions réciproques. Une
    // demande ne circule désormais que depuis un ajout volontaire (voir
    // handleIdentifiedPeer), donc la recevoir alors que notre propre demande
    // est sortante confirme les deux côtés.
    const mutual = existing?.relation === 'pending' && existing.requestDirection === 'outgoing'

    if (!existing) {
      // New contact — pending until we reply. Aucun pair jamais atteint n'a de
      // déclaration en poche : « online » est ici exactement ce que
      // markPeerActive() aurait décidé.
      const contact: Contact = {
        publicKey: msg.from,
        displayName: displayName ?? msg.from.slice(0, 8),
        avatar,
        status: 'online',
        relation: 'pending',
        requestDirection: 'incoming',
        verified: false,
        addedAt: Date.now(),
      }
      store.addContact(contact)
      storageService.saveContact(contact).catch((err) => {
        console.warn('[ChatService] Failed to persist incoming contact request:', err)
      })
    } else {
      // Champs déclaratifs repris sans toucher à la relation : une demande
      // reçue ne promeut ni un favori ni une demande déjà en attente.
      store.updateContact(msg.from, {
        displayName: displayName ?? existing.displayName,
        avatar: avatar ?? existing.avatar,
        lastSeen: Date.now(),
        ...(existing.relation === 'pending' && !existing.requestDirection
          ? { requestDirection: 'incoming' as const }
          : {}),
      })
      if (mutual) confirmPendingContact(msg.from, 'outgoing', true)
    }

    // CRITICAL: Auto-create conversation so we can navigate to it
    const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
    if (myPk) {
      const convId = cryptoService.deriveConversationId(myPk, msg.from)
      this.ensureConversation(convId, msg.from)

      // CRITICAL: Join the conversation topic so we're discoverable on it.
      // This ensures bidirectional discovery: even if we hadn't added this
      // contact yet, we now join their conversation topic for future connections.
      cryptoService.deriveConversationTopic(myPk, msg.from)
        .then((topic) => p2pService.joinTopic(topic))
        .catch(() => {})
    }

    const identity = useIdentityStore.getState().identity
    if (identity) {
      // Un contact DÉJÀ confirmé (ou confirmé à l'instant par un ajout croisé)
      // reçoit l'accept. Une demande encore en attente n'en reçoit pas : seule
      // la réponse de l'utilisateur confirme l'ajout. On annonce simplement
      // notre présence, sans avatar tant que le contact n'est pas confirmé.
      const current = useContactStore.getState().getContact(msg.from)
      if (current && (current.relation === 'contact' || current.relation === 'favorite')) {
        if (!mutual) {
          p2pService.sendMessage(msg.from, 'contact:accept', {
            displayName: identity.profile.displayName,
          }).catch(err => {
            console.warn('[ChatService] Failed to send contact:accept to:', msg.from.slice(0, 16), err)
          })
        }
        this.sendAvatarViaMedia(msg.from, identity.profile.avatar).catch(() => {})
      }

      // Also send our presence so they know we're online
      const status = this.outgoingPresence()
      p2pService.sendMessage(msg.from, 'presence:update', {
        status,
        displayName: identity.profile.displayName,
        // PERFORMANCE: No avatar in signed message
      }).catch(() => {})
    }

    this.flushPendingPresence()
  }

  /**
   * Handle incoming contact acceptance.
   *
   * Une acceptation reçue confirme une demande sortante ; elle ne doit jamais
   * débloquer un pair bloqué ni écraser un favori (l'ancien code forçait
   * `relation: 'contact'` dans tous les cas).
   */
  private handleContactAccept(msg: ProtocolMessage): void {
    const payload = msg.payload as { displayName?: unknown } | null
    if (!msg.from || !payload || typeof payload !== 'object') return
    const displayName = ChatService.declaredName(payload.displayName)
    const store = useContactStore.getState()
    const existing = store.getContact(msg.from)

    if (existing?.relation === 'blocked') return

    if (!existing) {
      // Ils nous acceptent sans que nous les ayons ajoutés : la relation est
      // confirmée des deux côtés par l'acceptation elle-même.
      const contact: Contact = {
        publicKey: msg.from,
        displayName: displayName ?? msg.from.slice(0, 8),
        status: 'online',
        relation: 'contact',
        verified: false,
        addedAt: Date.now(),
      }
      store.addContact(contact)
      storageService.saveContact(contact).catch((err) => {
        console.warn('[ChatService] Failed to persist accepted contact:', err)
      })
    } else {
      if (displayName) store.updateContact(msg.from, { displayName })
      // pending (les deux sens) → contact ; contact/favori inchangés.
      confirmPendingContact(msg.from, 'any', false)
      store.updateContact(msg.from, { lastSeen: Date.now() })
    }

    // CRITICAL: Update activity timestamp — receiving accept proves the peer is there,
    // nothing more. L'acceptation est une activité, pas une déclaration : c'est
    // markPeerActive() qui tranche, pour ne pas effacer un « absent » / « occupé » /
    // « invisible » que ce pair vient de nous annoncer.
    this.markPeerActive(msg.from)

    // CRITICAL: Auto-create conversation so user can navigate to it
    const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
    if (myPk) {
      const convId = cryptoService.deriveConversationId(myPk, msg.from)
      this.ensureConversation(convId, msg.from)
    }

    // CRITICAL FIX: Send our presence back so the peer knows we're online.
    // Without this, the peer sees us as "online" only because of the contact:request
    // flow, but if that presence was lost (init gap, race condition), the peer
    // never learns our status. Sending presence on contact:accept closes this gap.
    const identity = useIdentityStore.getState().identity
    if (identity) {
      const status = this.outgoingPresence()
      p2pService.sendMessage(msg.from, 'presence:update', {
        status,
        displayName: identity.profile.displayName,
        customStatus: identity.profile.customStatus,
      }).catch(() => {})
    }

    // PERFORMANCE: Send avatar via binary media channel (doesn't block signing)
    if (identity?.profile.avatar) {
      this.sendAvatarViaMedia(msg.from, identity.profile.avatar).catch(() => {})
    }

    this.flushPendingPresence()
  }

  /**
   * Handle incoming contact removal — peer removed us from their contacts.
   * We respect their choice and remove them from ours too.
   */
  private handleContactRemove(msg: ProtocolMessage): void {
    const existing = useContactStore.getState().getContact(msg.from)
    // Un bloqué ne pilote plus notre carnet : sinon un contact:remove reçu
    // effaçait le blocage et rouvrait la conversation.
    if (existing?.relation === 'blocked') return
    if (existing) {
      useContactStore.getState().removeContact(msg.from)
      this.peerLastActivity.delete(msg.from)
      this.pendingPresenceUpdates.delete(msg.from)
      this.pendingIdentifiedPeers.delete(msg.from)
      this.lastPresenceStatus.delete(msg.from)
      this.presenceDeclaredAt.delete(msg.from)
      console.log('[ChatService] Contact removed by peer:', msg.from.slice(0, 16))
    }
  }

  /**
   * Remove a contact and notify them via P2P.
   * Bidirectional: sends contact:remove so the peer also removes us.
   */
  async removeContact(publicKey: string): Promise<void> {
    // Remove from local store first
    useContactStore.getState().removeContact(publicKey)

    // Notify the peer so they can remove us too
    try {
      await p2pService.sendMessage(publicKey, 'contact:remove', {})
    } catch {
      // Peer might not be connected — that's fine, removal is still local
      console.warn('[ChatService] Could not notify peer of removal:', publicKey.slice(0, 16))
    }
  }

  /**
   * Destroy the service and clean up timers
   */
  destroy(): void {
    this.stopHeartbeat()
    this.stopEphemeralCleanup()
    this.ephemeralTimers.forEach((timer) => clearTimeout(timer))
    this.ephemeralTimers.clear()
    this.ephemeralMessages.clear()
    this.peerLastActivity.clear()
    this.contactRequestsSent.clear()
    this.typingTimers.forEach((timer) => clearTimeout(timer))
    this.typingTimers.clear()
    this.pendingOfflineTimers.forEach((timer) => clearTimeout(timer))
    this.pendingOfflineTimers.clear()
    this.pendingPresenceUpdates.clear()
    this.pendingIdentifiedPeers.clear()
    this.lastPresenceStatus.clear()
    this.presenceDeclaredAt.clear()
    this.pendingConnectedPeers.clear()
    this.pendingMessages.clear()
    this.pendingReceipts.clear()
    this.avatarBuffers.clear()
    this.ed25519ToNoiseMap.clear()
    this.noiseKeyCache.clear()
    this.redialInFlight.clear()
    this.lastRedialAt.clear()
    this.lastProbeAt.clear()
    this.lastTypingSent.clear()
  }

  // ─── Ephemeral Messages (Hypercore-inspired) ───────────────────────────

  private ephemeralMessages: Map<string, EphemeralMessage> = new Map()
  private ephemeralTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  /**
   * Send an ephemeral message that disappears after a timeout.
   */
  async sendEphemeralMessage(
    conversationId: string,
    content: string,
    ttl: number = 30000 // 30 seconds default
  ): Promise<Message> {
    const message: Message = {
      id: generateId(),
      conversationId,
      senderId: useIdentityStore.getState().identity?.keyPair.publicKey ?? '',
      content,
      timestamp: Date.now(),
      type: 'text',
      status: 'sent',
      expiresAt: Date.now() + ttl,
    }

    // Store locally
    useMessageStore.getState().addMessage(message)
    this.ephemeralMessages.set(message.id, {
      message,
      ttl,
      createdAt: Date.now(),
    })

    // Send to peer
    await p2pService.sendMessage(conversationId, 'message:ephemeral', {
      messageId: message.id,
      content,
      ttl,
      conversationId,
    })

    // Schedule deletion
    this.scheduleEphemeralDeletion(message.id, ttl)

    return message
  }

  /**
   * Schedule deletion of an ephemeral message.
   */
  private scheduleEphemeralDeletion(messageId: string, ttl: number): void {
    const timer = setTimeout(() => {
      this.deleteEphemeralMessage(messageId)
    }, ttl)
    this.ephemeralTimers.set(messageId, timer)
  }

  /**
   * Delete an ephemeral message.
   */
  deleteEphemeralMessage(messageId: string): void {
    this.ephemeralMessages.delete(messageId)
    const timer = this.ephemeralTimers.get(messageId)
    if (timer) {
      clearTimeout(timer)
      this.ephemeralTimers.delete(messageId)
    }
    useMessageStore.getState().removeMessage(messageId)
    console.log(`[ChatService] Ephemeral message deleted: ${messageId}`)
  }

  /**
   * Get all ephemeral messages.
   */
  getEphemeralMessages(): EphemeralMessage[] {
    return Array.from(this.ephemeralMessages.values())
  }

  /**
   * Check if a message is ephemeral.
   */
  isEphemeral(messageId: string): boolean {
    return this.ephemeralMessages.has(messageId)
  }

  // ─── Message Threads (Hyperbee-inspired) ───────────────────────────────

  private threads: Map<string, ThreadInfo> = new Map()

  /**
   * Create a thread from a message.
   */
  createThread(parentMessageId: string, conversationId: string): ThreadInfo {
    const thread: ThreadInfo = {
      id: `thread-${parentMessageId}`,
      parentMessageId,
      conversationId,
      messages: [],
      createdAt: Date.now(),
      participants: new Set(),
    }
    this.threads.set(thread.id, thread)
    console.log(`[ChatService] Thread created: ${thread.id}`)
    return thread
  }

  /**
   * Add a message to a thread.
   */
  async addThreadMessage(
    threadId: string,
    content: string,
    senderId: string
  ): Promise<Message> {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`)
    }

    const message: Message = {
      id: generateId(),
      conversationId: thread.conversationId,
      senderId,
      content,
      timestamp: Date.now(),
      type: 'text',
      status: 'sent',
      thread: {
        parentMessageId: threadId,
        replyCount: thread.messages.length + 1,
      },
    }

    thread.messages.push(message)
    thread.participants.add(senderId)

    useMessageStore.getState().addMessage(message)

    // Notify thread participants
    for (const participant of thread.participants) {
      await p2pService.sendMessage(participant, 'message:thread', {
        threadId,
        message,
      })
    }

    return message
  }

  /**
   * Get a thread by ID.
   */
  getThread(threadId: string): ThreadInfo | null {
    return this.threads.get(threadId) || null
  }

  /**
   * Get all threads for a conversation.
   */
  getConversationThreads(conversationId: string): ThreadInfo[] {
    return Array.from(this.threads.values()).filter(
      t => t.conversationId === conversationId
    )
  }

  /**
   * Delete a thread.
   */
  deleteThread(threadId: string): void {
    const thread = this.threads.get(threadId)
    if (thread) {
      // Delete all thread messages
      for (const msg of thread.messages) {
        useMessageStore.getState().removeMessage(msg.id)
      }
      this.threads.delete(threadId)
      console.log(`[ChatService] Thread deleted: ${threadId}`)
    }
  }

  /**
   * Get thread statistics.
   */
  getThreadStats(): {
    totalThreads: number
    totalMessages: number
    activeThreads: number
  } {
    const threads = Array.from(this.threads.values())
    return {
      totalThreads: threads.length,
      totalMessages: threads.reduce((sum, t) => sum + t.messages.length, 0),
      activeThreads: threads.filter(t => t.messages.length > 0).length,
    }
  }

  // ─── Message Reactions (Hypercore-inspired) ────────────────────────────

  private reactions: Map<string, Set<string>> = new Map() // messageId -> Set<emoji>

  /**
   * Add a reaction to a message.
   */
  async addReaction(messageId: string, emoji: string): Promise<void> {
    if (!this.reactions.has(messageId)) {
      this.reactions.set(messageId, new Set())
    }
    this.reactions.get(messageId)!.add(emoji)

    // Notify peers
    const allMessages = useMessageStore.getState().messages
    const message = Object.values(allMessages).flat().find((m: Message) => m.id === messageId)
    if (message) {
      await p2pService.sendMessage(message.conversationId, 'message:reaction', {
        messageId,
        emoji,
        action: 'add',
      })
    }
  }

  /**
   * Remove a reaction from a message.
   */
  async removeReaction(messageId: string, emoji: string): Promise<void> {
    const reactions = this.reactions.get(messageId)
    if (reactions) {
      reactions.delete(emoji)
    }

    // Notify peers
    const allMessages2 = useMessageStore.getState().messages
    const message = Object.values(allMessages2).flat().find((m: Message) => m.id === messageId)
    if (message) {
      await p2pService.sendMessage(message.conversationId, 'message:reaction', {
        messageId,
        emoji,
        action: 'remove',
      })
    }
  }

  /**
   * Get all reactions for a message.
   */
  getMessageReactions(messageId: string): string[] {
    return Array.from(this.reactions.get(messageId) || [])
  }

  /**
   * Clear all reactions for a message.
   */
  clearMessageReactions(messageId: string): void {
    this.reactions.delete(messageId)
  }

  /**
   * Get reaction statistics.
   */
  getReactionStats(): {
    totalReactions: number
    messagesWithReactions: number
    topEmojis: { emoji: string; count: number }[]
  } {
    const allReactions = Array.from(this.reactions.values()).flatMap(s => Array.from(s))
    const emojiCounts = new Map<string, number>()
    for (const emoji of allReactions) {
      emojiCounts.set(emoji, (emojiCounts.get(emoji) || 0) + 1)
    }
    const topEmojis = Array.from(emojiCounts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      totalReactions: allReactions.length,
      messagesWithReactions: this.reactions.size,
      topEmojis,
    }
  }

  // ─── Advanced Search (Hyperbee-inspired) ───────────────────────────────

  private searchIndex: Map<string, SearchIndexEntry> = new Map()
  private searchHistory: SearchQuery[] = []

  /**
   * Index a message for search.
   */
  indexMessage(message: Message): void {
    const words = message.content.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const uniqueWords = [...new Set(words)]

    for (const word of uniqueWords) {
      const key = `${message.id}:${word}`
      this.searchIndex.set(key, {
        messageId: message.id,
        word,
        conversationId: message.conversationId,
        timestamp: message.timestamp,
      })
    }
  }

  /**
   * Advanced search messages by query with indexing.
   */
  advancedSearchMessages(query: string, options: SearchOptions = {}): Message[] {
    const { conversationId, limit = 50, senderId } = options
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)

    if (queryWords.length === 0) return []

    // Record search
    this.searchHistory.push({
      query,
      timestamp: Date.now(),
      results: 0,
    })

    // Find matching message IDs
    const matchingIds = new Set<string>()
    for (const [_entry, entry] of this.searchIndex.entries()) {
      const matchesQuery = queryWords.some(w => entry.word.includes(w))
      if (!matchesQuery) continue
      if (conversationId && entry.conversationId !== conversationId) continue
      matchingIds.add(entry.messageId)
    }

    // Get actual messages — messages is Record<string, Message[]>
    const allMsgs = Object.values(useMessageStore.getState().messages).flat()
    const messages = allMsgs.filter((m: Message) => {
      if (!matchingIds.has(m.id)) return false
      if (conversationId && m.conversationId !== conversationId) return false
      if (senderId && m.senderId !== senderId) return false
      return true
    })

    // Sort by timestamp (newest first)
    const sorted = messages.sort((a: Message, b: Message) => b.timestamp - a.timestamp)

    // Update search history
    if (this.searchHistory.length > 0) {
      this.searchHistory[this.searchHistory.length - 1].results = sorted.length
    }

    return sorted.slice(0, limit)
  }

  /**
   * Get search history.
   */
  getSearchHistory(): SearchQuery[] {
    return [...this.searchHistory]
  }

  /**
   * Clear search history.
   */
  clearSearchHistory(): void {
    this.searchHistory = []
  }

  /**
   * Get search statistics.
   */
  getSearchStats(): {
    indexedWords: number
    indexedMessages: number
    totalSearches: number
    averageResults: number
  } {
    const indexedMessages = new Set(
      Array.from(this.searchIndex.values()).map(e => e.messageId)
    )
    const totalSearches = this.searchHistory.length
    const averageResults = totalSearches > 0
      ? this.searchHistory.reduce((sum, q) => sum + q.results, 0) / totalSearches
      : 0

    return {
      indexedWords: this.searchIndex.size,
      indexedMessages: indexedMessages.size,
      totalSearches,
      averageResults,
    }
  }

  // ─── Mentions & Notifications (Hyperbee-inspired) ──────────────────────

  private mentions: Map<string, MentionInfo> = new Map()
  private mentionNotifications: MentionNotification[] = []

  /**
   * Parse mentions from message content.
   */
  parseMentions(content: string): string[] {
    const mentionRegex = /@(\w+)/g
    const mentions: string[] = []
    let match
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1])
    }
    return mentions
  }

  /**
   * Record a mention.
   */
  recordMention(messageId: string, mentionedUserId: string, conversationId: string): void {
    const mention: MentionInfo = {
      messageId,
      mentionedUserId,
      conversationId,
      timestamp: Date.now(),
      read: false,
    }
    this.mentions.set(`${messageId}:${mentionedUserId}`, mention)

    // Create notification
    this.mentionNotifications.push({
      id: `mention-${Date.now()}`,
      messageId,
      mentionedUserId,
      conversationId,
      timestamp: Date.now(),
      read: false,
    })
  }

  /**
   * Get all mentions for a user.
   */
  getUserMentions(userId: string): MentionInfo[] {
    return Array.from(this.mentions.values()).filter(m => m.mentionedUserId === userId)
  }

  /**
   * Get unread mentions for a user.
   */
  getUnreadMentions(userId: string): MentionInfo[] {
    return this.getUserMentions(userId).filter(m => !m.read)
  }

  /**
   * Mark mentions as read.
   */
  markMentionsRead(userId: string, messageIds?: string[]): void {
    for (const mention of this.mentions.values()) {
      if (mention.mentionedUserId !== userId) continue
      if (messageIds && !messageIds.includes(mention.messageId)) continue
      mention.read = true
    }

    for (const notification of this.mentionNotifications) {
      if (notification.mentionedUserId !== userId) continue
      if (messageIds && !messageIds.includes(notification.messageId)) continue
      notification.read = true
    }
  }

  /**
   * Get mention notifications.
   */
  getMentionNotifications(userId: string, unreadOnly: boolean = false): MentionNotification[] {
    return this.mentionNotifications.filter(n => {
      if (n.mentionedUserId !== userId) return false
      if (unreadOnly && n.read) return false
      return true
    })
  }

  /**
   * Get unread mention count.
   */
  getUnreadMentionCount(userId: string): number {
    return this.getUnreadMentions(userId).length
  }

  /**
   * Clear all mention notifications.
   */
  clearMentionNotifications(userId: string): void {
    this.mentionNotifications = this.mentionNotifications.filter(
      n => n.mentionedUserId !== userId
    )
  }

  /**
   * Get mention statistics.
   */
  getMentionStats(userId: string): {
    totalMentions: number
    unreadMentions: number
    recentMentions: number
  } {
    const userMentions = this.getUserMentions(userId)
    const unread = userMentions.filter(m => !m.read)
    const recent = userMentions.filter(m => Date.now() - m.timestamp < 86400000) // Last 24h

    return {
      totalMentions: userMentions.length,
      unreadMentions: unread.length,
      recentMentions: recent.length,
    }
  }
}

// ─── Payload types ───────────────────────────────────────────────────────────

interface EditPayload {
  messageId: string
  conversationId: string
  newContent: string
}

interface DeletePayload {
  messageId: string
  conversationId: string
}

interface ReactionPayload {
  messageId: string
  conversationId: string
  emoji: string
  action: 'add' | 'remove'
}

interface PresencePayload {
  status: string
  displayName?: string
  avatar?: string
  customStatus?: string
}

interface RecallPayload {
  messageId: string
  conversationId: string
  reason?: string
}

interface EphemeralMessage {
  message: Message
  ttl: number
  createdAt: number
}

interface ThreadInfo {
  id: string
  parentMessageId: string
  conversationId: string
  messages: Message[]
  createdAt: number
  participants: Set<string>
}

interface SearchIndexEntry {
  messageId: string
  word: string
  conversationId: string
  timestamp: number
}

interface SearchOptions {
  conversationId?: string
  senderId?: string
  limit?: number
}

interface SearchQuery {
  query: string
  timestamp: number
  results: number
}

interface MentionInfo {
  messageId: string
  mentionedUserId: string
  conversationId: string
  timestamp: number
  read: boolean
}

interface MentionNotification {
  id: string
  messageId: string
  mentionedUserId: string
  conversationId: string
  timestamp: number
  read: boolean
}

export const chatService = ChatService.getInstance()
