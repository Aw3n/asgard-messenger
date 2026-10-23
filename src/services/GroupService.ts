import type { Group, GroupMember, GroupChannel, Message, ProtocolMessage, GroupActivity } from '@/types'
import { p2pService } from './P2PService'
import { cryptoService } from './CryptoService'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import { useContactStore } from '@/stores/contactStore'
import { useUIStore } from '@/stores/uiStore'
import { fileService } from './FileService'
import { storageService } from './StorageService'
import { generateId } from '@/utils/id'
import { sortMessagesByCursor } from '@/utils/messageGap'
import { speakText } from '@/utils/speech'
import { ringtoneService } from './RingtoneService'
import i18n from '@/i18n/config'
import { buildGroupInvitePayload, groupFromInvite } from '@/utils/groupInvite'
import { toNetworkStatus, fromNetworkStatus, GROUP_PRESENCE_TIMEOUT, type NetworkStatus } from '@/utils/presence'

/**
 * GroupService — orchestrates group management over P2P.
 *
 * Handles:
 * - Group creation and discovery
 * - Member invitations and join/leave
 * - Channel management
 * - Group message routing
 * - Role and permission enforcement
 */
class GroupService {
  private static instance: GroupService
  private initialized = false
  // GROUP HEARTBEAT: Periodic presence broadcast to all groups.
  // Per Hyperswarm pattern: peers must periodically re-announce to stay visible.
  // This ensures members see our current status even after transient disconnects.
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private static readonly HEARTBEAT_INTERVAL_MS = 30_000 // 30s — balance between freshness and bandwidth
  /** Contenu d'un message de groupe : borne généreuse, mais pas illimitée. */
  private static readonly MAX_MESSAGE_CHARS = 100_000
  private static readonly MAX_MESSAGE_ID = 128
  private static readonly MAX_GROUP_FIELD = 128
  private static readonly MAX_PROFILE_NAME = 200
  private static readonly MAX_CUSTOM_STATUS = 200
  private static readonly MAX_MENTIONS = 32
  private static readonly MAX_MENTION_PREVIEW = 300
  /** Une réaction est un emoji, pas un texte : même borne que le 1:1. */
  private static readonly MAX_REACTION_CHARS = 16
  /** Effectif maximal échangé dans un seul snapshot d'effectif. */
  private static readonly MAX_ROSTER_SYNC = 256
  private static readonly MESSAGE_TYPES = new Set(['text', 'mention', 'image', 'file'])
  // OFFLINE QUEUE: Messages queued for delivery when group members are offline.
  // Per Holepunch/Keet pattern: messages should be delivered when peers reconnect.
  // Key format: 'messageId:peerPublicKey' for per-peer tracking.
  private pendingGroupMessages: Map<string, { groupId: string; channelId: string; message: Record<string, unknown>; createdAt: number }> = new Map()
  // Track last broadcast status to avoid redundant re-broadcasts
  private lastBroadcastStatus: string | null = null
  // Une mention notifiée avant l'arrivée de son message ne doit pas produire
  // une seconde notification quand le message la rejoint.
  private notifiedMentionIds = new Set<string>()
  // HEARTBEAT COUNTER: Force a re-broadcast every N heartbeats even if status
  // hasn't changed, so peers that missed our announcement eventually get it.
  // Derived from the presence lifetime instead of hardcoded: we must re-announce
  // at ~3/4 of GROUP_PRESENCE_TIMEOUT, i.e. BEFORE groupStore.cleanupStalePresence()
  // flips a never-changing member to 'offline'. The previous value (5 heartbeats =
  // 2.5 min) exceeded that 2 min lifetime, so every stable member blinked offline
  // for about 30 s on each cycle.
  private heartbeatCount = 0
  private static readonly FORCE_BROADCAST_EVERY = Math.max(
    1,
    Math.round((GROUP_PRESENCE_TIMEOUT / GroupService.HEARTBEAT_INTERVAL_MS) * 0.75),
  ) // 3 heartbeats = 90 s, inside the 120 s lifetime
  // DEDUPLICATION: Track sent group avatars to avoid resending identical data.
  // Key: peerId+groupId, Value: hash of the last sent avatar
  private sentGroupAvatarHashes: Map<string, string> = new Map()

  static getInstance(): GroupService {
    if (!GroupService.instance) {
      GroupService.instance = new GroupService()
    }
    return GroupService.instance
  }

  /**
   * Initialize group service listeners
   */
  initialize(): void {
    if (this.initialized) return
    this.initialized = true

    // PRESENCE: un pair identifié après notre dernière annonce ne verrait notre
    // statut de groupe qu'au prochain cycle forcé (90 s). On le lui envoie
    // immédiatement, sans rebroadcaster à tout le groupe.
    p2pService.on('peer:identified', (data: { publicKey: string }) => {
      this.announcePresenceToPeer(data.publicKey).catch(() => {})
      // ROSTER: un membre absent au moment d'une arrivée n'a jamais reçu le
      // member:joined (diffusion unique). En se recroisant, chacun échange son
      // effectif : les inconnus communs sont ajoutés, jamais de rôle.
      this.syncGroupRostersWithPeer(data.publicKey).catch(() => {})
    })

    // Listen for group invitations
    p2pService.on('message:group:invite', (msg: ProtocolMessage) => {
      this.handleGroupInvite(msg)
    })

    // Listen for group updates (member changes, channel changes, metadata)
    p2pService.on('message:group:update', (msg: ProtocolMessage) => {
      this.handleGroupUpdate(msg)
    })

    // Listen for group messages
    p2pService.on('message:group:message', (msg: ProtocolMessage) => {
      this.handleGroupMessage(msg)
    })

    // Listen for group presence
    p2pService.on('message:group:presence', (msg: ProtocolMessage) => {
      this.handleGroupPresence(msg)
    })

    // Listen for group typing indicators
    p2pService.on('message:group:typing', (msg: ProtocolMessage) => {
      this.handleGroupTyping(msg)
    })

    // Listen for group read receipts
    p2pService.on('message:group:read', (msg: ProtocolMessage) => {
      this.handleGroupRead(msg)
    })

    // Listen for group delivery/read receipts (unified receipt protocol)
    p2pService.on('message:group:receipt', (msg: ProtocolMessage) => {
      this.handleGroupReceipt(msg)
    })

    // Listen for group pin updates
    p2pService.on('message:group:pin', (msg: ProtocolMessage) => {
      this.handleGroupPin(msg)
    })

    // Listen for group message reactions
    p2pService.on('message:group:reaction', (msg: ProtocolMessage) => {
      this.handleGroupReaction(msg)
    })

    // Listen for group message edits and deletions
    p2pService.on('message:group:edit', (msg: ProtocolMessage) => {
      this.handleGroupEdit(msg)
    })
    p2pService.on('message:group:delete', (msg: ProtocolMessage) => {
      this.handleGroupDelete(msg)
    })

    // Listen for group mention notifications
    p2pService.on('message:group:mention', (msg: ProtocolMessage) => {
      this.handleGroupMention(msg)
    })

    // AUTO-PRESENCE: Watch for profile status changes and auto-announce to all groups.
    // Per Holepunch/Keet pattern: when a user changes their status, all group members
    // should see the updated status immediately.
    const identityStore = useIdentityStore.getState()
    let prevStatus = identityStore.identity?.profile.status
    let prevCustomStatus = identityStore.identity?.profile.customStatus
    let prevDisplayName = identityStore.identity?.profile.displayName
    useIdentityStore.subscribe((state) => {
      const newStatus = state.identity?.profile.status
      const newCustomStatus = state.identity?.profile.customStatus
      const newDisplayName = state.identity?.profile.displayName
      if (newStatus !== prevStatus || newCustomStatus !== prevCustomStatus || newDisplayName !== prevDisplayName) {
        prevStatus = newStatus
        prevCustomStatus = newCustomStatus
        prevDisplayName = newDisplayName
        this.announcePresenceToAllGroups().catch(() => {})
      }
    })

    // GROUP HEARTBEAT: Periodic presence broadcast to all groups.
    // This ensures our status stays fresh even if we miss a status change event.
    this.heartbeatInterval = setInterval(() => {
      this.announcePresenceToAllGroups().catch(() => {})
      // CRITICAL: Clean up stale presence entries in all groups.
      // Members who haven't sent presence in 2 minutes are marked offline.
      useGroupStore.getState().cleanupStalePresence()
    }, GroupService.HEARTBEAT_INTERVAL_MS)
  }

  /**
   * Rejoint le topic de découverte de chaque groupe déjà présent localement.
   * Sans cela, après un redémarrage, seuls les groupes créés, rejoints ou
   * ouverts dans la session courante étaient annoncés : un membre qui n'est
   * pas aussi un contact 1:1 restait introuvable jusqu'à la prochaine action.
   */
  async joinAllGroupTopics(): Promise<void> {
    const groups = useGroupStore.getState().getAllGroups().filter((g) => !!g.inviteKey)
    if (groups.length === 0) return
    const results = await Promise.allSettled(groups.map(async (group) => {
      const topic = await cryptoService.deriveGroupTopic(group.inviteKey!)
      await p2pService.joinTopic(topic)
    }))
    for (const r of results) {
      if (r.status === 'rejected') console.warn('[GroupService] Failed to join a group topic:', r.reason)
    }
    console.log('[GroupService] Joined discovery topics for', groups.length, 'groups')
  }

  /** Annonce immédiatement notre présence aux groupes déjà connectés. */
  announcePresenceNow(): void {
    this.announcePresenceToAllGroups().catch(() => {})
  }

  /**
   * Échange l'effectif des groupes partagés avec un pair qui vient d'être
   * identifié. Le member:joined n'est diffusé qu'une fois, au moment de
   * l'arrivée : un membre hors ligne à cet instant ne connaît jamais le
   * nouveau venu et rejetait ensuite ses messages comme ceux d'un inconnu.
   * Seuls des ajouts d'inconnus et les exclusions prononcées par un admin
   * circulent — jamais un rôle ni un propriétaire.
   */
  async syncGroupRostersWithPeer(peerPublicKey: string): Promise<void> {
    if (!peerPublicKey) return
    const identity = useIdentityStore.getState().identity
    if (!identity || identity.keyPair.publicKey === peerPublicKey) return

    for (const group of useGroupStore.getState().getAllGroups()) {
      const members = group.members
      if (members.length === 0 || members.length > GroupService.MAX_ROSTER_SYNC) continue
      if (!members.some((m) => m.publicKey === identity.keyPair.publicKey)) continue
      if (!members.some((m) => m.publicKey === peerPublicKey)) continue

      await p2pService.sendMessage(peerPublicKey, 'group:update', {
        action: 'roster:sync',
        groupId: group.id,
        members: members.map((m) => ({
          publicKey: m.publicKey,
          displayName: m.displayName,
          joinedAt: m.joinedAt,
        })),
        kickedMembers: (group.kickedMembers ?? []).slice(-GroupService.MAX_ROSTER_SYNC),
      }).catch(() => {})
    }
  }

  /**
   * Announce presence to all groups the user is a member of.
   * Called automatically on profile status change and via heartbeat.
   * FORCE RE-BROADCAST: Every N heartbeats, re-announces even if status unchanged
   * so peers that missed our announcement eventually get updated.
   */
  private async announcePresenceToAllGroups(): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    this.heartbeatCount++
    const forceBroadcast = this.heartbeatCount % GroupService.FORCE_BROADCAST_EVERY === 0

    // Skip key uses the OUTGOING status (mapping + privacy gate already applied),
    // so switching `privacy.onlineStatus` counts as a change: the new silence is
    // announced immediately instead of up to FORCE_BROADCAST_EVERY heartbeats later.
    const currentStatus = this.outgoingPresence() + ':' + (identity.profile.customStatus ?? '')
    if (!forceBroadcast && currentStatus === this.lastBroadcastStatus) return
    this.lastBroadcastStatus = currentStatus

    const groups = useGroupStore.getState().getAllGroups()
    for (const group of groups) {
      // Only announce if we're a member
      const isMember = group.members.some(m => m.publicKey === identity.keyPair.publicKey)
      if (isMember) {
        await this.announceGroupPresence(group.id, false).catch(() => {})
      }
    }
  }

  /**
   * Create a new group locally and broadcast to peers
   */
  async createGroup(params: {
    name: string
    description?: string
    avatar?: string
    isPublic?: boolean
    maxMembers?: number
  }): Promise<Group> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const store = useGroupStore.getState()
    const group = store.createGroup({
      name: params.name,
      description: params.description,
      avatar: params.avatar,
      ownerId: identity.keyPair.publicKey,
      ownerDisplayName: identity.profile.displayName,
      isPublic: params.isPublic,
      maxMembers: params.maxMembers,
    })

    // Generate an invite key for sharing
    store.generateInviteKey(group.id)

    // HYPERSWARM: Derive a topic from the invite key and join it so that
    // all group members can discover each other via DHT.
    // Per Hyperswarm docs: swarm.join(topic, { server: true, client: true })
    // enables both announcing and discovering for the group's topic.
    if (group.inviteKey) {
      cryptoService.deriveGroupTopic(group.inviteKey)
        .then((topic) => {
          p2pService.joinTopic(topic).catch((err) => {
            console.warn('[GroupService] Failed to join group topic:', err)
          })
        })
        .catch(() => {})
    }

    // Create a conversation entry for this group
    useConversationStore.getState().addConversation({
      id: group.id,
      type: 'group',
      groupId: group.id,
      unreadCount: 0,
      muted: false,
      pinned: false,
      archived: false,
      createdAt: group.createdAt,
      updatedAt: group.createdAt,
    })

    return group
  }

  /**
   * Join a group using an invite key
   */
  async joinGroup(inviteKey: string, peerId: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    // Request group info from the inviting peer
    await p2pService.sendMessage(peerId, 'group:invite', {
      action: 'request',
      inviteKey,
      requesterPublicKey: identity.keyPair.publicKey,
      requesterDisplayName: identity.profile.displayName,
    })
  }

  /**
   * Leave a group and notify members
   */
  async leaveGroup(groupId: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const group = useGroupStore.getState().getGroup(groupId)
    if (!group) return

    // Notify ALL group members (not just the owner) so everyone can update
    // their member list. Per Holepunch/Keet pattern, group state changes are
    // broadcast to all participants.
    const memberKeys = this.getGroupMemberKeys(groupId)
    if (memberKeys.length > 0) {
      await p2pService.broadcastToPeers(memberKeys, 'group:update', {
        action: 'member:left',
        groupId,
        publicKey: identity.keyPair.publicKey,
      }).catch(console.error)
    }

    // HYPERSWARM: Leave the group's discovery topic
    if (group.inviteKey) {
      cryptoService.deriveGroupTopic(group.inviteKey)
        .then((topic) => p2pService.leaveTopic(topic).catch(() => {}))
        .catch(() => {})
    }

    // Remove locally
    useGroupStore.getState().leaveGroup(groupId)
    useConversationStore.getState().removeConversation(groupId)
  }

  /**
   * Invite a contact to a group
   */
  async inviteMember(groupId: string, contactPublicKey: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) throw new Error('No identity')

    const group = useGroupStore.getState().getGroup(groupId)
    if (!group) throw new Error('Group not found')

    // Check permissions
    const store = useGroupStore.getState()
    if (!store.isAdmin(groupId, identity.keyPair.publicKey)) {
      throw new Error('Insufficient permissions')
    }

    // Check max members
    if (group.members.length >= group.maxMembers) {
      throw new Error('Group is full')
    }

    // Un exclu ne revient que si un futur « réintégrer » le décide : une
    // invitation directe contournerait sinon la pierre tombale.
    if (group.kickedMembers?.includes(contactPublicKey)) {
      throw new Error('Cannot invite a removed member')
    }

    // A group persisted before invite keys existed can still be shared: mint
    // the key here, otherwise the joiner has no topic to discover the others.
    let inviteKey = group.inviteKey
    if (!inviteKey) {
      inviteKey = useGroupStore.getState().generateInviteKey(group.id)
      cryptoService.deriveGroupTopic(inviteKey)
        .then((topic) => p2pService.joinTopic(topic).catch(() => {}))
        .catch(() => {})
    }

    // FULL SNAPSHOT: members and channels travel with the invite so the joiner
    // shares the same channel ids. Without them it invented its own « general »
    // channel and every message it sent was stored under an id nobody read.
    // PERFORMANCE: the avatar is still sent separately via the media channel.
    await p2pService.sendMessage(contactPublicKey, 'group:invite', buildGroupInvitePayload(
      { ...group, inviteKey },
      { publicKey: identity.keyPair.publicKey, displayName: identity.profile.displayName },
    ))

    // PERFORMANCE: Send group avatar via binary media channel (not in signed message)
    if (group.avatar) {
      this.sendGroupAvatarViaMedia(contactPublicKey, group.id, group.avatar).catch(() => {})
    }
  }

  /**
   * Add a channel to a group
   */
  async addChannel(groupId: string, params: {
    name: string
    description?: string
    type: GroupChannel['type']
  }): Promise<GroupChannel | null> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return null

    const store = useGroupStore.getState()
    if (!store.isAdmin(groupId, identity.keyPair.publicKey)) {
      throw new Error('Insufficient permissions')
    }

    const channel = store.addChannel(groupId, params)

    if (channel) {
      // Broadcast channel creation to group members only
      const memberKeys = this.getGroupMemberKeys(groupId)
      await p2pService.broadcastToPeers(memberKeys, 'group:update', {
        action: 'channel:add',
        groupId,
        channel,
      }).catch(console.error)
    }

    return channel
  }

  /**
   * Remove a channel from a group
   */
  async removeChannel(groupId: string, channelId: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const store = useGroupStore.getState()
    if (!store.isAdmin(groupId, identity.keyPair.publicKey)) {
      throw new Error('Insufficient permissions')
    }

    store.removeChannel(groupId, channelId)

    const memberKeys = this.getGroupMemberKeys(groupId)
    await p2pService.broadcastToPeers(memberKeys, 'group:update', {
      action: 'channel:remove',
      groupId,
      channelId,
    }).catch(console.error)
  }

  /**
   * Update group metadata (admin only)
   */
  async updateGroup(groupId: string, updates: Partial<Pick<Group, 'name' | 'description' | 'avatar' | 'isPublic'>>): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const store = useGroupStore.getState()
    if (!store.isAdmin(groupId, identity.keyPair.publicKey)) {
      throw new Error('Insufficient permissions')
    }

    store.updateGroup(groupId, updates)

    // PERFORMANCE: Strip avatar from signed payload — send via binary media channel instead.
    // The signed message carries only metadata (name, description, isPublic, hasAvatar flag).
    const { avatar: _avatar, ...metadataUpdates } = updates
    const memberKeys = this.getGroupMemberKeys(groupId)
    if (memberKeys.length > 0) {
      await p2pService.broadcastToPeers(memberKeys, 'group:update', {
        action: 'metadata:update',
        groupId,
        updates: { ...metadataUpdates, hasAvatar: !!updates.avatar },
      }).catch(console.error)
    }

    // PERFORMANCE: Send updated group avatar via binary media channel to all members
    if (updates.avatar) {
      for (const memberKey of memberKeys) {
        this.sendGroupAvatarViaMedia(memberKey, groupId, updates.avatar).catch(() => {})
      }
    }
  }

  /**
   * PERFORMANCE: Send group avatar via binary media channel.
   * Per Holepunch pattern, binary data (avatars) must never be included in signed messages.
   * Format: JSON header { t: 'avatar', target: 'group_icon', groupId, total: N } + null + data
   */
  private async sendGroupAvatarViaMedia(peerId: string, groupId: string, avatar: string): Promise<void> {
    if (!avatar) return

    // DEDUPLICATION: Skip if same avatar already sent to this peer for this group
    const dedupeKey = peerId + ':' + groupId + ':icon'
    let avatarHash = ''
    try {
      const sample = avatar.slice(0, 1024) + avatar.slice(-1024)
      let h = 0x811c9dc5
      for (let i = 0; i < sample.length; i++) { h ^= sample.charCodeAt(i); h = (h * 0x01000193) >>> 0 }
      avatarHash = h.toString(36) + ':' + avatar.length
    } catch { avatarHash = ':' + avatar.length }
    if (this.sentGroupAvatarHashes.get(dedupeKey) === avatarHash) return

    // POLLING: Wait for peer connection (max 10s) instead of fixed 1500ms
    const maxWait = 10000, pollInterval = 500
    let waited = 0
    while (waited < maxWait) {
      if (p2pService.getConnectedPeers().length > 0) break
      await new Promise((r) => setTimeout(r, pollInterval))
      waited += pollInterval
    }

    try {
      const CHUNK_SIZE = 16 * 1024
      const dataBytes = new TextEncoder().encode(avatar)
      const totalChunks = Math.ceil(dataBytes.length / CHUNK_SIZE)

      const header = JSON.stringify({ t: 'avatar', target: 'group_icon', groupId, total: totalChunks })
      const headerBytes = new TextEncoder().encode(header)
      const firstChunkSize = Math.min(CHUNK_SIZE, dataBytes.length)
      const firstChunk = new Uint8Array(headerBytes.length + 1 + firstChunkSize)
      firstChunk.set(headerBytes, 0)
      firstChunk[headerBytes.length] = 0
      firstChunk.set(dataBytes.slice(0, firstChunkSize), headerBytes.length + 1)
      await p2pService.sendMediaData(peerId, firstChunk)

      for (let i = 1; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, dataBytes.length)
        await p2pService.sendMediaData(peerId, dataBytes.slice(start, end))
      }

      this.sentGroupAvatarHashes.set(dedupeKey, avatarHash)
      console.log(`[GroupService] Group avatar sent: ${totalChunks} chunks for group ${groupId.slice(0, 16)}`)
    } catch (err) {
      console.warn(`[GroupService] Failed to send group avatar: ${err}`)
    }
  }

  /**
   * PERFORMANCE: Send our profile avatar to all members of a group via binary media channel.
   * Called during announceGroupPresence so group members receive our current avatar.
   * Format: JSON header { t: 'avatar', target: 'group_member', groupId, total: N } + null + data
   */
  private async sendMemberAvatarViaMedia(peerId: string, groupId: string, avatar: string): Promise<void> {
    if (!avatar) return

    // DEDUPLICATION: Skip if same avatar already sent to this peer for this group
    const dedupeKey = peerId + ':' + groupId + ':member'
    let avatarHash = ''
    try {
      const sample = avatar.slice(0, 1024) + avatar.slice(-1024)
      let h = 0x811c9dc5
      for (let i = 0; i < sample.length; i++) { h ^= sample.charCodeAt(i); h = (h * 0x01000193) >>> 0 }
      avatarHash = h.toString(36) + ':' + avatar.length
    } catch { avatarHash = ':' + avatar.length }
    if (this.sentGroupAvatarHashes.get(dedupeKey) === avatarHash) return

    // POLLING: Wait for peer connection (max 10s) instead of fixed 1500ms
    const maxWait = 10000, pollInterval = 500
    let waited = 0
    while (waited < maxWait) {
      if (p2pService.getConnectedPeers().length > 0) break
      await new Promise((r) => setTimeout(r, pollInterval))
      waited += pollInterval
    }

    try {
      const CHUNK_SIZE = 16 * 1024
      const dataBytes = new TextEncoder().encode(avatar)
      const totalChunks = Math.ceil(dataBytes.length / CHUNK_SIZE)

      const header = JSON.stringify({ t: 'avatar', target: 'group_member', groupId, total: totalChunks })
      const headerBytes = new TextEncoder().encode(header)
      const firstChunkSize = Math.min(CHUNK_SIZE, dataBytes.length)
      const firstChunk = new Uint8Array(headerBytes.length + 1 + firstChunkSize)
      firstChunk.set(headerBytes, 0)
      firstChunk[headerBytes.length] = 0
      firstChunk.set(dataBytes.slice(0, firstChunkSize), headerBytes.length + 1)
      await p2pService.sendMediaData(peerId, firstChunk)

      for (let i = 1; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, dataBytes.length)
        await p2pService.sendMediaData(peerId, dataBytes.slice(start, end))
      }

      this.sentGroupAvatarHashes.set(dedupeKey, avatarHash)
      console.log(`[GroupService] Member avatar sent: ${totalChunks} chunks`)
    } catch (err) {
      console.warn(`[GroupService] Failed to send member avatar: ${err}`)
    }
  }

  /**
   * Change a member's role (admin only)
   */
  async setMemberRole(groupId: string, targetPublicKey: string, newRole: GroupMember['role']): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const store = useGroupStore.getState()
    if (!store.isAdmin(groupId, identity.keyPair.publicKey)) {
      throw new Error('Insufficient permissions')
    }

    store.setMemberRole(groupId, targetPublicKey, newRole)

    const memberKeys = this.getGroupMemberKeys(groupId)
    await p2pService.broadcastToPeers(memberKeys, 'group:update', {
      action: 'member:role',
      groupId,
      targetPublicKey,
      newRole,
    }).catch(console.error)
  }

  /**
   * Kick a member from a group (admin only)
   */
  async kickMember(groupId: string, targetPublicKey: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const store = useGroupStore.getState()
    if (!store.isAdmin(groupId, identity.keyPair.publicKey)) {
      throw new Error('Insufficient permissions')
    }

    // Le propriétaire est irrévocable : `removeMember` le refuse déjà en
    // silence, mais le message de kick partait quand même et le sortait du
    // groupe chez lui. Un admin peut donc éjecter le fondateur.
    const group = store.getGroup(groupId)
    if (!group || group.ownerId === targetPublicKey) {
      throw new Error('Cannot remove the group owner')
    }

    // L'exclusion est aussi une pierre tombale : sans elle, l'exclu se
    // réannonçait par un simple member:joined et réintégrait le groupe.
    store.markMemberKicked(groupId, targetPublicKey)

    // Notify the kicked member
    await p2pService.sendMessage(targetPublicKey, 'group:update', {
      action: 'member:kicked',
      groupId,
    }).catch(console.error)

    // Broadcast to remaining group members
    const memberKeys = this.getGroupMemberKeys(groupId)
    await p2pService.broadcastToPeers(memberKeys, 'group:update', {
      action: 'member:removed',
      groupId,
      targetPublicKey,
    }).catch(console.error)
  }

  /**
   * Mute a member in a group (admin/moderator)
   */
  async muteMember(groupId: string, targetPublicKey: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const store = useGroupStore.getState()
    if (!store.isAdmin(groupId, identity.keyPair.publicKey)) {
      throw new Error('Insufficient permissions')
    }

    // Comme l'exclusion, la sourdine épargne le propriétaire : il ne peut pas
    // être réduit au silence par un admin.
    if (store.getGroup(groupId)?.ownerId === targetPublicKey) {
      throw new Error('Cannot mute the group owner')
    }

    store.muteMember(groupId, targetPublicKey, identity.keyPair.publicKey)

    const memberKeys = this.getGroupMemberKeys(groupId)
    await p2pService.broadcastToPeers(memberKeys, 'group:update', {
      action: 'member:muted',
      groupId,
      targetPublicKey,
      mutedBy: identity.keyPair.publicKey,
    }).catch(console.error)
  }

  /**
   * Unmute a member in a group (admin/moderator)
   */
  async unmuteMember(groupId: string, targetPublicKey: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const store = useGroupStore.getState()
    if (!store.isAdmin(groupId, identity.keyPair.publicKey)) {
      throw new Error('Insufficient permissions')
    }

    store.unmuteMember(groupId, targetPublicKey)

    const memberKeys = this.getGroupMemberKeys(groupId)
    await p2pService.broadcastToPeers(memberKeys, 'group:update', {
      action: 'member:unmuted',
      groupId,
      targetPublicKey,
    }).catch(console.error)
  }

  /**
   * Send a message to a group channel.
   * OPTIMIZATION: Only sends to group members instead of broadcasting to all peers.
   * Supports @mentions for notifying specific members.
   */
  async sendGroupMessage(
    groupId: string,
    channelId: string,
    content: string,
    type: 'text' | 'image' | 'file' = 'text',
    mentions?: Array<{ publicKey: string; displayName: string; startIndex: number; endIndex: number }>,
    replyToId?: string
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const group = useGroupStore.getState().getGroup(groupId)
    if (!group) return

    // Sourdine : un `canPost` false sur sa propre ligne du roster vient d'un
    // administrateur et a été diffusé au groupe entier. Sans ce garde, le
    // musellement restait une icône et le membre continuait de publier.
    if (group.members.some((m) => m.publicKey === identity.keyPair.publicKey && m.canPost === false)) {
      throw new Error('Muted in this group')
    }

    // Copie locale de la citation : le destinataire la résoudra par
    // identifiant, mais l'auteur doit voir l'aperçu immédiatement.
    const quoted = replyToId
      ? useMessageStore.getState().getMessage(replyToId, channelId)
      : undefined
    const replyTo = quoted && !quoted.deleted
      ? { id: quoted.id, senderId: quoted.senderId, content: quoted.content, type: quoted.type }
      : undefined

    // Create the message locally first
    // CRITICAL: Include groupId on the message for routing, offline sync, and tracking.
    // Initialize deliveryReceipts to track per-recipient delivery status.
    const messageId = generateId()
    const message = {
      id: messageId,
      conversationId: channelId,
      senderId: identity.keyPair.publicKey,
      type: (mentions && mentions.length > 0 ? 'mention' : type) as import('@/types').MessageType,
      content,
      timestamp: Date.now(),
      status: 'sent' as const,
      mentions,
      groupId,
      ...(replyTo ? { replyTo } : {}),
      // Per-recipient delivery tracking: initialized empty, filled as receipts arrive
      deliveryReceipts: {} as Record<string, 'delivered' | 'read'>,
      readBy: [] as string[],
    }

    // Add to local message store
    useMessageStore.getState().addMessage(message)

    // PERSISTENCE: Save group message to Hyperbee storage so it survives restarts.
    storageService.saveMessage(channelId, message as import('@/types').Message).catch(console.error)

    // Get member public keys (excluding self)
    const memberKeys = this.getGroupMemberKeys(groupId)

    // Send to all group members
    const result = await p2pService.broadcastToPeers(memberKeys, 'group:message', {
      groupId,
      channelId,
      message,
    }).catch(console.error)

    // OFFLINE QUEUE: Queue messages for peers that were unmapped (offline).
    // Per Holepunch/Keet pattern: messages should be delivered when peers reconnect.
    if (result && result.unmapped > 0) {
      this.queuePendingGroupMessage(groupId, channelId, message as Record<string, unknown>, memberKeys)
    }

    // Update message status based on delivery results
    if (result) {
      if (result.sent === memberKeys.length) {
        // All peers received — status stays 'sent' (will upgrade to 'delivered' on receipt)
        useMessageStore.getState().updateStatus(messageId, channelId, 'sent')
      } else if (result.sent === 0) {
        // No peers received — mark as 'sending' (pending)
        useMessageStore.getState().updateStatus(messageId, channelId, 'sending')
      }
      // Partial delivery: keep status as 'sent' (some peers received)
    }

    // If there are mentions, also send mention notifications
    if (mentions && mentions.length > 0) {
      for (const mention of mentions) {
        // Don't notify ourselves
        if (mention.publicKey === identity.keyPair.publicKey) continue
        
        // Send mention notification directly to the mentioned user
        await p2pService.sendMessage(mention.publicKey, 'group:mention', {
          groupId,
          channelId,
          messageId,
          mentionedBy: identity.keyPair.publicKey,
          mentionedByDisplayName: identity.profile.displayName,
          content: content.slice(0, 100), // Preview
          timestamp: Date.now(),
        }).catch(console.error)
      }
    }
  }

  /**
   * Our status as the network must see it — the same single rule ChatService
   * applies (src/utils/presence.ts): internal-to-network mapping plus the
   * `privacy.onlineStatus` gate. Group announcements bypassed the gate entirely,
   * so a user who had hidden their presence was still listed "en ligne" in every
   * group while their 1:1 chats said "hors ligne".
   */
  private outgoingPresence(): NetworkStatus {
    const identity = useIdentityStore.getState().identity
    if (!identity) return 'offline'
    const hidePresence = !useUIStore.getState().settings.privacy.onlineStatus
    return toNetworkStatus(identity.profile.status, hidePresence)
  }

  /**
   * Announce presence in a group with full profile status.
   * Per Holepunch/Keet pattern: group presence includes the actual profile
   * status, mapped to the network vocabulary by outgoingPresence().
   * Previously only sent 'online' regardless of actual status.
   *
   * PERFORMANCE: Avatar is NEVER included in the signed message.
   * When withAvatar is true, the avatar is sent separately via binary media channel
   * to each group member. This should only be used when the avatar has changed or
   * on initial connection — not on every heartbeat (too expensive).
   *
   * @param groupId - Group to announce presence in
   * @param withAvatar - If true, also push our avatar via binary media channel
   */
  async announceGroupPresence(groupId: string, withAvatar: boolean = false): Promise<void> {
    const payload = this.groupPresencePayload(groupId)
    if (!payload) return

    const memberKeys = this.getGroupMemberKeys(groupId)
    await p2pService.broadcastToPeers(memberKeys, 'group:presence', payload).catch(console.error)

    // PERFORMANCE: Send our profile avatar to each group member via binary media channel.
    // Only when withAvatar is true (avatar changed or initial connection).
    // Avoids sending 3.8MB every 5s heartbeat.
    if (withAvatar) {
      const avatar = useIdentityStore.getState().identity?.profile.avatar
      if (avatar) {
        for (const memberKey of memberKeys) {
          this.sendMemberAvatarViaMedia(memberKey, groupId, avatar).catch(() => {})
        }
      }
    }
  }

  /** Payload d'annonce de présence, partagé par le broadcast et l'envoi ciblé. */
  private groupPresencePayload(groupId: string): Record<string, unknown> | null {
    const identity = useIdentityStore.getState().identity
    if (!identity) return null
    return {
      groupId,
      publicKey: identity.keyPair.publicKey,
      displayName: identity.profile.displayName,
      avatar: undefined, // PERFORMANCE: Never include avatar in signed messages (3.8MB)
      hasAvatar: !!identity.profile.avatar, // Flag for UI placeholder
      status: this.outgoingPresence(),
      customStatus: identity.profile.customStatus,
      timestamp: Date.now(),
    }
  }

  /** Envoie notre présence de groupe au seul pair qui vient de se connecter. */
  private async announcePresenceToPeer(peerPublicKey: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return
    for (const group of useGroupStore.getState().getAllGroups()) {
      const iAmMember = group.members.some((m) => m.publicKey === identity.keyPair.publicKey)
      const peerIsMember = group.members.some((m) => m.publicKey === peerPublicKey)
      if (!iAmMember || !peerIsMember) continue
      const payload = this.groupPresencePayload(group.id)
      if (payload) {
        p2pService.sendMessage(peerPublicKey, 'group:presence', payload).catch(() => {})
      }
      // A member who just identified may never have received our profile
      // avatar (it only travelled at join time). One push per peer and avatar.
      if (identity.profile.avatar) {
        this.sendMemberAvatarViaMedia(peerPublicKey, group.id, identity.profile.avatar).catch(() => {})
      }
    }
  }

  /**
   * PERFORMANCE: Send a file to all members of a group.
   * Uses FileService's multicast for efficient delivery:
   * - Single blob storage
   * - Parallel delivery to all members
   * - Per-peer progress tracking
   * 
   * Based on Hyperblobs pattern: store once, distribute to many.
   */
  async sendFileToGroup(
    file: File,
    groupId: string,
    channelId: string,
    onProgress?: (peerId: string, progress: number) => void
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const group = useGroupStore.getState().getGroup(groupId)
    if (!group) return

    // Même garde que l'envoi de texte : une pièce jointe est une publication.
    if (group.members.some((m) => m.publicKey === identity.keyPair.publicKey && m.canPost === false)) {
      throw new Error('Muted in this group')
    }

    // Get member public keys (excluding self)
    const memberKeys = this.getGroupMemberKeys(groupId)
    if (memberKeys.length === 0) {
      console.warn('[GroupService] No members to send file to')
      return
    }

    // Use FileService's multicast for efficient delivery
    await fileService.sendFileToMulticast(file, groupId, memberKeys, channelId, onProgress)
  }

  /**
   * Send multiple files to a group.
   */
  async sendFilesToGroup(
    files: File[],
    groupId: string,
    channelId: string,
    onProgress?: (fileName: string, peerId: string, progress: number) => void
  ): Promise<void> {
    for (const file of files) {
      await this.sendFileToGroup(file, groupId, channelId, (peerId, progress) => {
        onProgress?.(file.name, peerId, progress)
      })
    }
  }

  /**
   * Send typing indicator to a group channel.
   * Debounced to avoid flooding the network.
   */
  async sendTypingIndicator(groupId: string, channelId: string, isTyping: boolean): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return
    // PRIVACY: même réglage que le fil 1:1 — la frappe est une présence.
    if (!useUIStore.getState().settings.privacy.typingIndicators) return

    const memberKeys = this.getGroupMemberKeys(groupId)
    await p2pService.broadcastToPeers(memberKeys, 'group:typing', {
      groupId,
      channelId,
      publicKey: identity.keyPair.publicKey,
      displayName: identity.profile.displayName,
      isTyping,
      timestamp: Date.now(),
    }).catch(console.error)
  }

  /**
   * Pin a message in a group channel (admin/moderator only).
   */
  async pinMessage(groupId: string, channelId: string, messageId: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const store = useGroupStore.getState()
    const group = store.getGroup(groupId)
    if (!group) return

    // Check permissions (admin/moderator/owner)
    const member = group.members.find(m => m.publicKey === identity.keyPair.publicKey)
    if (!member || !['owner', 'admin', 'moderator'].includes(member.role)) {
      throw new Error('Insufficient permissions to pin messages')
    }

    // Update locally
    store.pinChannelMessage(groupId, channelId, messageId)

    // Add activity log entry
    this.addActivity(groupId, {
      type: 'message:pinned',
      actorPublicKey: identity.keyPair.publicKey,
      actorDisplayName: identity.profile.displayName,
      channelId,
      messageId,
    })

    // Broadcast to group members
    const memberKeys = this.getGroupMemberKeys(groupId)
    await p2pService.broadcastToPeers(memberKeys, 'group:pin', {
      groupId,
      channelId,
      messageId,
      action: 'pin',
      actorPublicKey: identity.keyPair.publicKey,
    }).catch(console.error)
  }

  /**
   * Unpin a message in a group channel (admin/moderator only).
   */
  async unpinMessage(groupId: string, channelId: string, messageId: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const store = useGroupStore.getState()
    const group = store.getGroup(groupId)
    if (!group) return

    // Check permissions
    const member = group.members.find(m => m.publicKey === identity.keyPair.publicKey)
    if (!member || !['owner', 'admin', 'moderator'].includes(member.role)) {
      throw new Error('Insufficient permissions to unpin messages')
    }

    // Update locally
    store.unpinChannelMessage(groupId, channelId, messageId)

    // Add activity log entry
    this.addActivity(groupId, {
      type: 'message:unpinned',
      actorPublicKey: identity.keyPair.publicKey,
      actorDisplayName: identity.profile.displayName,
      channelId,
      messageId,
    })

    // Broadcast to group members
    const memberKeys = this.getGroupMemberKeys(groupId)
    await p2pService.broadcastToPeers(memberKeys, 'group:pin', {
      groupId,
      channelId,
      messageId,
      action: 'unpin',
      actorPublicKey: identity.keyPair.publicKey,
    }).catch(console.error)
  }

  /**
   * Toggle an emoji reaction on a group message: optimistic local update,
   * persisted, then broadcast to the group's members. Mirrors the 1:1 path so
   * a reaction survives a restart and reaches every connected member.
   */
  async toggleGroupReaction(groupId: string, channelId: string, messageId: string, emoji: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return
    if (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > GroupService.MAX_REACTION_CHARS) return

    const group = useGroupStore.getState().getGroup(groupId)
    if (!group?.members.some((member) => member.publicKey === identity.keyPair.publicKey)) return
    if (!group.channels.some((channel) => channel.id === channelId)) return

    const store = useMessageStore.getState()
    const message = store.getMessage(messageId, channelId)
    if (!message || message.deleted) return

    const hasReacted = message.reactions?.some(
      (reaction) => reaction.emoji === emoji && reaction.users.includes(identity.keyPair.publicKey),
    ) ?? false
    if (hasReacted) {
      store.removeReaction(messageId, channelId, emoji, identity.keyPair.publicKey)
    } else {
      store.addReaction(messageId, channelId, emoji, identity.keyPair.publicKey)
    }
    const updated = store.getMessage(messageId, channelId)
    if (updated) storageService.saveMessage(channelId, updated).catch(console.error)

    const memberKeys = this.getGroupMemberKeys(groupId)
    await p2pService.broadcastToPeers(memberKeys, 'group:reaction', {
      groupId,
      channelId,
      messageId,
      emoji,
      action: hasReacted ? 'remove' : 'add',
    }).catch(console.error)
  }

  /**
   * Vérifie qu'un message du canal appartient bien à l'utilisateur courant,
   * dans un groupe dont il est membre. Les actions d'édition et de suppression
   * ne doivent jamais s'appliquer au message d'un autre.
   */
  private findOwnGroupMessage(
    groupId: string,
    channelId: string,
    messageId: string,
  ): { memberKeys: string[] } | null {
    const identity = useIdentityStore.getState().identity
    if (!identity) return null
    const group = useGroupStore.getState().getGroup(groupId)
    if (!group?.members.some((member) => member.publicKey === identity.keyPair.publicKey)) return null
    if (!group.channels.some((channel) => channel.id === channelId)) return null
    const message = useMessageStore.getState().getMessage(messageId, channelId)
    if (!message || message.deleted || message.senderId !== identity.keyPair.publicKey) return null
    return { memberKeys: this.getGroupMemberKeys(groupId) }
  }

  /**
   * Modifie un message de groupe dont on est l'auteur, persiste la nouvelle
   * version puis la diffuse aux membres.
   */
  async editGroupMessage(
    groupId: string,
    channelId: string,
    messageId: string,
    newContent: string,
  ): Promise<void> {
    if (typeof newContent !== 'string' || newContent.trim().length === 0) return
    if (newContent.length > GroupService.MAX_MESSAGE_CHARS) return
    const target = this.findOwnGroupMessage(groupId, channelId, messageId)
    if (!target) return

    const store = useMessageStore.getState()
    store.editMessage(messageId, channelId, newContent)
    const edited = store.getMessage(messageId, channelId)
    if (edited) storageService.saveMessage(channelId, edited).catch(console.error)

    await p2pService.broadcastToPeers(target.memberKeys, 'group:edit', {
      groupId,
      channelId,
      messageId,
      newContent,
    }).catch(console.error)
  }

  /**
   * Supprime pour tout le monde un message de groupe dont on est l'auteur :
   * tombeau local persistant, puis demande de suppression aux membres.
   */
  async deleteGroupMessage(groupId: string, channelId: string, messageId: string): Promise<void> {
    const target = this.findOwnGroupMessage(groupId, channelId, messageId)
    if (!target) return

    const store = useMessageStore.getState()
    store.deleteMessage(messageId, channelId)
    const deleted = store.getMessage(messageId, channelId)
    if (deleted) storageService.saveMessage(channelId, deleted).catch(console.error)

    await p2pService.broadcastToPeers(target.memberKeys, 'group:delete', {
      groupId,
      channelId,
      messageId,
    }).catch(console.error)
  }

  /**
   * Supprime un message de groupe pour soi uniquement, sans rien diffuser.
   * Contrairement à l'édition, n'importe quel message du canal peut partir.
   */
  async deleteGroupMessageForMe(groupId: string, channelId: string, messageId: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return
    const group = useGroupStore.getState().getGroup(groupId)
    if (!group?.members.some((member) => member.publicKey === identity.keyPair.publicKey)) return
    if (!group.channels.some((channel) => channel.id === channelId)) return
    const message = useMessageStore.getState().getMessage(messageId, channelId)
    if (!message) return

    useMessageStore.getState().deleteMessagePermanently(messageId, channelId)
    storageService.deleteMessage(channelId, messageId).catch(console.error)
  }

  /**
   * Load a channel's persisted history into the message store.
   *
   * Group messages are saved under the channel id, but nothing ever read them
   * back: after a restart the channel looked empty while Hyperbee still held
   * every message. The membership/channel checks keep an id that no longer
   * belongs to a local group from being read from storage.
   */
  async loadChannelMessages(groupId: string, channelId: string, limit = 50): Promise<Message[] | null> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return []
    const group = useGroupStore.getState().getGroup(groupId)
    if (!group?.members.some((member) => member.publicKey === identity.keyPair.publicKey)) return []
    if (!group.channels.some((channel) => channel.id === channelId)) return []

    try {
      const stored = await storageService.getLastMessages(channelId, limit)
      if (stored.length === 0) return stored
      // Storage returns newest first; addMessages restores chronological order.
      useMessageStore.getState().addMessages(channelId, stored.reverse())
      return stored
    } catch (err) {
      console.error('[GroupService] Failed to load channel messages:', err)
      // `null` = panne de lecture : la vue ne doit pas la prendre pour un canal
      // vide, sinon plus rien ne se retente.
      return null
    }
  }

  /**
   * Remonte l'historique d'un canal avant une date (pagination).
   * Mêmes contrôles d'appartenance que le chargement initial : un canal
   * inconnu de ce client ne doit pas être lu depuis le stockage.
   */
  async loadOlderChannelMessages(
    groupId: string,
    channelId: string,
    beforeTimestamp: number,
    limit = 50,
  ): Promise<Message[] | null> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return []
    const group = useGroupStore.getState().getGroup(groupId)
    if (!group?.members.some((member) => member.publicKey === identity.keyPair.publicKey)) return []
    if (!group.channels.some((channel) => channel.id === channelId)) return []

    try {
      const stored = await storageService.getMessages(channelId, {
        before: beforeTimestamp,
        limit,
        reverse: true,
      })
      if (stored.length > 0) useMessageStore.getState().addMessages(channelId, stored)
      return stored
    } catch (err) {
      console.error('[GroupService] Failed to load older channel messages:', err)
      return null
    }
  }

  /**
   * Charge les messages autour d'une date pour ouvrir un résultat de recherche
   * profond dans son contexte. Mêmes contrôles d'appartenance que la pagination.
   */
  async loadChannelMessageContext(
    groupId: string,
    channelId: string,
    timestamp: number,
    limit = 50,
  ): Promise<Message[] | null> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return []
    const group = useGroupStore.getState().getGroup(groupId)
    if (!group?.members.some((member) => member.publicKey === identity.keyPair.publicKey)) return []
    if (!group.channels.some((channel) => channel.id === channelId)) return []

    try {
      const [before, after] = await Promise.all([
        storageService.getMessages(channelId, {
          before: timestamp + 1,
          limit,
          reverse: true,
        }),
        storageService.getMessages(channelId, {
          after: timestamp,
          limit,
        }),
      ])
      const merged = sortMessagesByCursor([...before, ...after])
      if (merged.length > 0) useMessageStore.getState().addMessages(channelId, merged)
      return merged
    } catch (err) {
      console.error('[GroupService] Failed to load channel message context:', err)
      return null
    }
  }

  /**
   * Charge la page qui suit une clé précise (couture après un saut profond).
   * Mêmes contrôles d'appartenance que la pagination vers le haut.
   */
  async loadNewerChannelMessages(
    groupId: string,
    channelId: string,
    afterTimestamp: number,
    afterId: string,
    limit = 50,
  ): Promise<Message[] | null> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return []
    const group = useGroupStore.getState().getGroup(groupId)
    if (!group?.members.some((member) => member.publicKey === identity.keyPair.publicKey)) return []
    if (!group.channels.some((channel) => channel.id === channelId)) return []

    try {
      const stored = await storageService.getMessages(channelId, {
        after: afterTimestamp,
        afterId,
        limit,
      })
      if (stored.length > 0) useMessageStore.getState().addMessages(channelId, stored)
      return stored
    } catch (err) {
      console.error('[GroupService] Failed to load newer channel messages:', err)
      return null
    }
  }

  /**
   * Mark messages as read in a group channel and notify peers.
   */
  async markAsRead(groupId: string, channelId: string, messageIds: string[]): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    // Clear unread count locally
    useGroupStore.getState().clearChannelUnread(groupId, channelId)

    // Notify group members with both protocols:
    // 1. group:read (legacy — for backward compatibility)
    // 2. group:receipt with status 'read' (unified receipt protocol)
    const memberKeys = this.getGroupMemberKeys(groupId)
    if (memberKeys.length > 0) {
      // Send unified receipt (read status)
      await p2pService.broadcastToPeers(memberKeys, 'group:receipt', {
        groupId,
        channelId,
        messageIds,
        status: 'read',
        readerPublicKey: identity.keyPair.publicKey,
        timestamp: Date.now(),
      }).catch(console.error)

      // Also send legacy group:read for backward compatibility
      await p2pService.broadcastToPeers(memberKeys, 'group:read', {
        groupId,
        channelId,
        publicKey: identity.keyPair.publicKey,
        messageIds,
        timestamp: Date.now(),
      }).catch(console.error)
    }
  }

  /**
   * Add an activity entry to the group's activity log.
   */
  private addActivity(groupId: string, params: Omit<GroupActivity, 'id' | 'groupId' | 'timestamp'>): void {
    const activity: GroupActivity = {
      id: generateId(),
      groupId,
      timestamp: Date.now(),
      ...params,
    }

    useGroupStore.getState().addGroupActivity(groupId, activity)
  }

  /**
   * Get the Ed25519 public keys of group members (excluding self)
   */
  private getGroupMemberKeys(groupId: string): string[] {
    const identity = useIdentityStore.getState().identity
    if (!identity) return []

    const group = useGroupStore.getState().getGroup(groupId)
    if (!group) return []

    return group.members
      .filter((m) => m.publicKey !== identity.keyPair.publicKey)
      .map((m) => m.publicKey)
  }

  // ─── Private Handlers ──────────────────────────────────────────────────

  /**
   * Handle incoming group invitation
   */
  private handleGroupInvite(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown>
    const action = payload.action as string

    if (action === 'invite') {
      this.acceptGroupInvite(payload, msg.from).catch(console.error)
    } else if (action === 'request') {
      // Someone wants to join via invite key — verify and send group data
      this.handleJoinRequest(msg.from, payload).catch(console.error)
    }
  }

  /**
   * Applied on the invitee's side: rebuild the group from the snapshot, join
   * its discovery topic, then introduce ourselves to every member. The old
   * handler only kept the name and a homemade channel id, and never told the
   * inviter we had joined.
   */
  private async acceptGroupInvite(
    payload: Record<string, unknown>,
    senderPublicKey: string,
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const incoming = groupFromInvite(payload, {
      publicKey: identity.keyPair.publicKey,
      displayName: identity.profile.displayName,
    })
    if (!incoming) {
      console.warn('[GroupService] Ignoring malformed group invite')
      return
    }

    // The snapshot is only as trustworthy as its bearer: an invite must come
    // from someone the payload itself lists as a member of that group.
    if (!incoming.members.some((member) => member.publicKey === senderPublicKey)) {
      console.warn('[GroupService] Ignoring group invite from a peer absent from the roster')
      return
    }

    const existing = useGroupStore.getState().getGroup(incoming.id)
    const alreadyMember = existing?.members.some(
      (member) => member.publicKey === identity.keyPair.publicKey,
    ) ?? false
    // A repeated invite must not roll the local group back to the snapshot:
    // local state holds role changes and channel edits made since the invite.
    const group = existing && alreadyMember ? existing : incoming
    if (group === incoming) {
      useGroupStore.getState().joinGroup(incoming)
    }

    if (!useConversationStore.getState().getConversation(group.id)) {
      useConversationStore.getState().addConversation({
        id: group.id,
        type: 'group',
        groupId: group.id,
        unreadCount: 0,
        muted: false,
        pinned: false,
        archived: false,
        createdAt: group.createdAt,
        updatedAt: group.createdAt,
      })
    }

    // HYPERSWARM: Join the group's discovery topic so we can find other members
    if (group.inviteKey) {
      cryptoService.deriveGroupTopic(group.inviteKey)
        .then((topic) => p2pService.joinTopic(topic).catch(() => {}))
        .catch(() => {})
    }

    // JOIN NOTICE: members apply addMember idempotently, so re-sending this on
    // a duplicate invite is harmless — and it is the only way the inviter's
    // roster learns about us.
    const selfMember = group.members.find(
      (member) => member.publicKey === identity.keyPair.publicKey,
    )
    if (selfMember) {
      const memberKeys = this.getGroupMemberKeys(group.id)
      if (memberKeys.length > 0) {
        await p2pService.broadcastToPeers(memberKeys, 'group:update', {
          action: 'member:joined',
          groupId: group.id,
          member: selfMember,
        }).catch(() => {})
      }
    }

    // PRESENCE: Announce our presence to existing group members immediately
    // so they see our status right away (and receive our avatar).
    this.announceGroupPresence(group.id, true).catch(() => {})
  }

  /**
   * Handle a join request from a peer
   */
  private async handleJoinRequest(
    requesterPeerId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const inviteKey = payload.inviteKey as string
    const requesterPublicKey = payload.requesterPublicKey as string
    const requesterDisplayName = payload.requesterDisplayName as string

    // The request is signed by the requester: it may only enrol itself.
    // A spoofed key used to add any third party to a group.
    if (!inviteKey || !requesterPublicKey || requesterPublicKey !== requesterPeerId) return

    // Find the group with this invite key
    const groups = useGroupStore.getState().getAllGroups()
    const group = groups.find((g) => g.inviteKey === inviteKey)
    if (!group) return

    // Connaître la clé ne rachète pas une exclusion : sinon un kick suivi
    // d'une demande d'adhésion rendait l'exclusion sans effet.
    if (group.kickedMembers?.includes(requesterPublicKey)) return

    // Check if group is full
    if (group.members.length >= group.maxMembers) return

    // Add the new member locally
    const newMember: GroupMember = {
      publicKey: requesterPublicKey,
      displayName: typeof requesterDisplayName === 'string' && requesterDisplayName.length > 0
        ? requesterDisplayName.slice(0, 200)
        : requesterPublicKey.slice(0, 12),
      role: 'member',
      joinedAt: Date.now(),
      canPost: true,
    }

    useGroupStore.getState().addMember(group.id, newMember)

    // Send the full group data back (PERFORMANCE: avatar sent via binary media
    // channel). Re-read the group: addMember wrote a fresh state object, and
    // the snapshot must include the requester we just added.
    const identity = useIdentityStore.getState().identity
    const current = useGroupStore.getState().getGroup(group.id) ?? group
    if (identity) {
      await p2pService.sendMessage(requesterPeerId, 'group:invite', buildGroupInvitePayload(
        current,
        { publicKey: identity.keyPair.publicKey, displayName: identity.profile.displayName },
      ))
    }

    // PERFORMANCE: Send group avatar via binary media channel
    if (group.avatar) {
      this.sendGroupAvatarViaMedia(requesterPeerId, group.id, group.avatar).catch(() => {})
    }

    // CRITICAL FIX: Broadcast member:joined only to group members, NOT all peers.
    // Previously used p2pService.broadcast() which sent to every connected peer,
    // leaking group membership info to non-members.
    const memberKeys = this.getGroupMemberKeys(group.id)
    if (memberKeys.length > 0) {
      await p2pService.broadcastToPeers(memberKeys, 'group:update', {
        action: 'member:joined',
        groupId: group.id,
        member: newMember,
      }).catch(console.error)
    }

    // PRESENCE: Announce our presence to the new member so they see our status.
    // Also, the new member will announce their own presence upon receiving the invite.
    this.announceGroupPresence(group.id, true).catch(() => {})
  }

  /**
   * Handle incoming group update.
   *
   * A signature proves who spoke, not what they may do in this group: every
   * branch checks the sender against the local roster before touching the
   * store. Without that, any peer knowing a group id could rename the group,
   * promote itself, kick members, or wipe its channels.
   */
  private handleGroupUpdate(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown>
    const action = payload.action as string
    const groupId = payload.groupId as string
    const sender = msg.from
    const store = useGroupStore.getState()
    const group = groupId ? store.getGroup(groupId) : undefined
    if (!group || !sender) return

    const senderMember = group.members.find((member) => member.publicKey === sender)
    const isAdmin = store.isAdmin(groupId, sender)
    const boundedKey = (value: unknown): string | undefined =>
      typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : undefined
    const boundedText = (value: unknown, max: number): string | undefined =>
      typeof value === 'string' && value.length > 0 ? value.slice(0, max) : undefined

    switch (action) {
      case 'metadata:update': {
        // Admin-only, and only the fields the UI edits are copied. Spreading
        // the payload used to let a peer rewrite ownerId, inviteKey, members
        // or channels. The avatar never travels here (binary media channel).
        if (!isAdmin) return
        const updates = payload.updates as Record<string, unknown> | undefined
        if (!updates) return
        const safe: Partial<Group> = {}
        const name = boundedText(updates.name, 200)
        if (name) safe.name = name
        if (typeof updates.description === 'string') safe.description = updates.description.slice(0, 2000)
        if (typeof updates.isPublic === 'boolean') safe.isPublic = updates.isPublic
        if (Object.keys(safe).length > 0) store.updateGroup(groupId, safe)
        break
      }

      case 'member:joined': {
        const member = payload.member as GroupMember | undefined
        const publicKey = boundedKey(member?.publicKey)
        if (!member || !publicKey) return
        // Two legitimate paths: the joiner introduces itself (its own signed
        // message) or an existing member relays a join it accepted. Anything
        // else is an outsider injecting a third party.
        if (publicKey !== sender && !senderMember) return
        // Une réannonciation ne ressuscite pas un membre exclu.
        if (group.kickedMembers?.includes(publicKey)) return
        // A join never grants a role: promotions go through member:role, which
        // only admins send. Otherwise a peer could self-announce as owner.
        store.addMember(groupId, {
          publicKey,
          displayName: boundedText(member.displayName, 200) ?? publicKey.slice(0, 12),
          role: 'member',
          joinedAt: typeof member.joinedAt === 'number' && Number.isFinite(member.joinedAt)
            ? member.joinedAt
            : Date.now(),
          canPost: true,
        })
        break
      }

      case 'roster:sync': {
        // Un membre connu atteste l'effectif qu'il connaît. On n'ajoute que
        // les inconnus, toujours comme simples membres : un snapshot ne
        // promeut ni ne rétrograde personne et ne retire personne.
        if (!senderMember) return
        const self = useIdentityStore.getState().identity?.keyPair.publicKey
        // Les exclusions ne circulent que par un admin : un simple membre ne
        // doit pas pouvoir faire disparaître quelqu'un d'un snapshot.
        const kicked = new Set(group.kickedMembers ?? [])
        if (isAdmin && Array.isArray(payload.kickedMembers)) {
          for (const raw of payload.kickedMembers.slice(0, GroupService.MAX_ROSTER_SYNC)) {
            const publicKey = boundedKey(raw)
            if (!publicKey || publicKey === group.ownerId) continue
            if (publicKey === self) {
              // Le kick direct s'est perdu alors que nous étions hors ligne.
              store.leaveGroup(groupId)
              useConversationStore.getState().removeConversation(groupId)
              return
            }
            kicked.add(publicKey)
            store.markMemberKicked(groupId, publicKey)
          }
        }
        const roster = payload.members
        if (!Array.isArray(roster) || roster.length === 0) return
        const known = new Set(group.members.map((member) => member.publicKey))
        for (const entry of roster.slice(0, GroupService.MAX_ROSTER_SYNC)) {
          if (!entry || typeof entry !== 'object') continue
          const record = entry as Record<string, unknown>
          const publicKey = boundedKey(record.publicKey)
          if (!publicKey || publicKey === self || known.has(publicKey) || kicked.has(publicKey)) continue
          store.addMember(groupId, {
            publicKey,
            displayName: boundedText(record.displayName, GroupService.MAX_PROFILE_NAME) ?? publicKey.slice(0, 12),
            role: 'member',
            joinedAt: typeof record.joinedAt === 'number' && Number.isFinite(record.joinedAt)
              ? record.joinedAt
              : Date.now(),
            canPost: true,
          })
          known.add(publicKey)
        }
        break
      }

      case 'member:left': {
        const leaving = boundedKey(payload.publicKey ?? payload.targetPublicKey)
        // Only the member itself may announce its departure.
        if (leaving !== sender) return
        store.removeMember(groupId, leaving)
        break
      }

      case 'member:removed':
      case 'member:kicked': {
        if (!isAdmin) return
        // A kick addressed to us carries no target: the addressee is the
        // target. Without this fallback the kicked member silently kept a
        // group it could no longer post to.
        const self = useIdentityStore.getState().identity?.keyPair.publicKey
        const target = boundedKey(payload.targetPublicKey ?? payload.publicKey)
          ?? (action === 'member:kicked' ? self : undefined)
        if (!target) return
        // Sans cette garde, le repli « message sans cible = moi » laissait un
        // admin sortir le propriétaire du groupe qu'il a créé.
        if (target === group.ownerId) return
        if (target === self) {
          useGroupStore.getState().leaveGroup(groupId)
          useConversationStore.getState().removeConversation(groupId)
          break
        }
        store.markMemberKicked(groupId, target)
        break
      }

      case 'member:role': {
        if (!isAdmin) return
        const target = boundedKey(payload.targetPublicKey)
        const newRole = payload.newRole
        // Ownership is not transferable over the wire, and guests are not a
        // role the UI can grant. Anything outside this list is dropped.
        if (!target || !['admin', 'moderator', 'member'].includes(newRole as string)) return
        const targetMember = group.members.find((member) => member.publicKey === target)
        if (!targetMember || targetMember.role === 'owner') return
        store.setMemberRole(groupId, target, newRole as GroupMember['role'])
        break
      }

      case 'member:muted': {
        if (!isAdmin) return
        const target = boundedKey(payload.targetPublicKey)
        if (!target) return
        // Le fondateur ne peut être réduit au silence par personne : la sourdine
        // arrêtant désormais la publication chez tout le groupe, un admin vérolé
        // aurait sinon fermé la bouche du propriétaire pour de bon.
        if (group.ownerId === target) return
        store.muteMember(groupId, target, sender)
        break
      }

      case 'member:unmuted': {
        if (!isAdmin) return
        const target = boundedKey(payload.targetPublicKey)
        if (!target) return
        store.unmuteMember(groupId, target)
        break
      }

      case 'channel:add': {
        if (!isAdmin) return
        const raw = payload.channel as Partial<GroupChannel> | undefined
        const id = boundedKey(raw?.id)
        const name = boundedText(raw?.name, 100)
        if (!raw || !id || !name) return
        if (group.channels.some((channel) => channel.id === id)) return
        const roles: GroupMember['role'][] = ['owner', 'admin', 'moderator', 'member', 'guest']
        const allowedRoles = (value: unknown): GroupMember['role'][] =>
          Array.isArray(value)
            ? value.filter((role): role is GroupMember['role'] =>
                typeof role === 'string' && roles.includes(role as GroupMember['role']))
            : []
        const types: GroupChannel['type'][] = ['text', 'announcement', 'voice', 'readonly']
        store.updateGroup(groupId, {
          channels: [...group.channels, {
            id,
            groupId,
            name,
            description: typeof raw.description === 'string' ? raw.description.slice(0, 500) : undefined,
            type: types.includes(raw.type as GroupChannel['type']) ? (raw.type as GroupChannel['type']) : 'text',
            position: typeof raw.position === 'number' && Number.isFinite(raw.position)
              ? raw.position
              : group.channels.length,
            permissions: {
              send: allowedRoles(raw.permissions?.send),
              read: allowedRoles(raw.permissions?.read),
              manage: allowedRoles(raw.permissions?.manage),
            },
            unreadCount: 0,
            pinnedMessageIds: [],
          }].sort((a, b) => a.position - b.position),
        })
        break
      }

      case 'channel:remove': {
        if (!isAdmin) return
        const channelId = boundedKey(payload.channelId)
        if (!channelId) return
        store.removeChannel(groupId, channelId)
        break
      }
    }
  }

  /**
   * Handle incoming group message.
   * CRITICAL: Send a delivery receipt back to the sender so they see ✓✓ (delivered).
   * Without this, group message status stays at 'sent' forever.
   */
  private handleGroupMessage(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown> | null
    if (!msg.from || !payload || typeof payload !== 'object') return
    const groupIdRaw = payload.groupId
    const channelIdRaw = payload.channelId
    const declared = payload.message
    if (typeof groupIdRaw !== 'string' || groupIdRaw.length === 0 || groupIdRaw.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof channelIdRaw !== 'string' || channelIdRaw.length === 0 || channelIdRaw.length > GroupService.MAX_GROUP_FIELD) return
    if (!declared || typeof declared !== 'object') return
    const groupId = groupIdRaw
    const channelId = channelIdRaw
    const raw = declared as Record<string, unknown>

    // The signed envelope authenticates the sender; without this check a
    // member could attribute its own message to another member.
    if (raw.senderId !== msg.from) return
    if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > GroupService.MAX_MESSAGE_ID) return
    if (typeof raw.content !== 'string' || raw.content.length > GroupService.MAX_MESSAGE_CHARS) return
    const content = raw.content

    // Verify the sender is a member of the group
    const group = useGroupStore.getState().getGroup(groupId)
    if (!group) return

    const sender = group.members.find((m) => m.publicKey === msg.from)
    if (!sender) return
    // Un membre mis en sourdine par un administrateur ne publie plus : son
    // propre client refuse déjà l'envoi, mais un client modifié passerait —
    // ici le message est écarté chez tout le reste du groupe.
    if (sender.canPost === false) return

    // LEGACY INVITES: a joiner used to invent its own « general » channel id.
    // Its first group message then referenced a channel missing from this
    // client and stayed invisible for ever. With a single local channel we can
    // safely re-key it to the id the rest of the group uses.
    if (!group.channels.some((channel) => channel.id === channelId) && group.channels.length === 1) {
      const previous = group.channels[0]
      useGroupStore.getState().updateGroup(groupId, {
        channels: [{ ...previous, id: channelId, groupId, unreadCount: 0, pinnedMessageIds: [] }],
        activeChannelId: channelId,
      })
      if (useGroupStore.getState().activeChannelId === previous.id) {
        useGroupStore.getState().setActiveChannel(channelId)
      }
    }
    // Après un éventuel re-key, le canal doit exister dans le groupe : un
    // membre ne choisit pas un channelId arbitraire pour déposer un message.
    if (!useGroupStore.getState().getGroup(groupId)?.channels.some((channel) => channel.id === channelId)) return

    // Ne recopie que les champs affichés : pièces jointes, réactions, accusés,
    // readBy et statut sont un état local que l'expéditeur n'a pas à imposer.
    const type = typeof raw.type === 'string' && GroupService.MESSAGE_TYPES.has(raw.type)
      ? raw.type as Message['type']
      : 'text'
    const declaredTimestamp = raw.timestamp
    const timestamp = typeof declaredTimestamp === 'number' && Number.isFinite(declaredTimestamp) && declaredTimestamp > 0
      ? Math.min(declaredTimestamp, Date.now() + 86_400_000)
      : Date.now()
    const mentions = Array.isArray(raw.mentions)
      ? raw.mentions.slice(0, GroupService.MAX_MENTIONS).flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const mention = value as Record<string, unknown>
        if (typeof mention.publicKey !== 'string' || mention.publicKey.length === 0 || mention.publicKey.length > GroupService.MAX_GROUP_FIELD) return []
        const startIndex = typeof mention.startIndex === 'number' && Number.isInteger(mention.startIndex) && mention.startIndex >= 0
          ? Math.min(mention.startIndex, content.length)
          : 0
        const endIndex = typeof mention.endIndex === 'number' && Number.isInteger(mention.endIndex) && mention.endIndex >= startIndex
          ? Math.min(mention.endIndex, content.length)
          : startIndex
        return [{
          publicKey: mention.publicKey,
          displayName: typeof mention.displayName === 'string' ? mention.displayName.slice(0, GroupService.MAX_PROFILE_NAME) : '',
          startIndex,
          endIndex,
        }]
      })
      : []

    // La citation est résolue dans notre propre copie du canal : le contenu
    // affiché ne peut pas être choisi par l'expéditeur.
    let replyTo: Message['replyTo']
    const rawReply = raw.replyTo
    if (rawReply && typeof rawReply === 'object') {
      const replyId = (rawReply as Record<string, unknown>).id
      if (typeof replyId === 'string' && replyId.length > 0 && replyId.length <= GroupService.MAX_MESSAGE_ID) {
        const quoted = useMessageStore.getState().getMessage(replyId, channelId)
        if (quoted && !quoted.deleted) {
          replyTo = { id: quoted.id, senderId: quoted.senderId, content: quoted.content, type: quoted.type }
        }
      }
    }

    const message: Message & { groupId: string } = {
      id: raw.id,
      conversationId: channelId,
      senderId: msg.from,
      type: mentions.length > 0 && type === 'text' ? 'mention' : type,
      content,
      timestamp,
      status: 'delivered',
      groupId,
      ...(replyTo ? { replyTo } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
    }

    // Add message to the store — include groupId for routing and tracking
    useMessageStore.getState().addMessage(message)

    // PERSISTENCE: Save group message to Hyperbee storage so it survives restarts.
    // Previously, group messages were only in memory and lost on app restart.
    storageService.saveMessage(channelId, message).catch(console.error)

    // Update conversation list with last message info for proper sorting and preview
    useConversationStore.getState().updateConversation(groupId, {
      lastMessage: {
        ...message,
        type: (message.type as import('@/types').MessageType) || 'text',
        status: 'delivered',
        conversationId: channelId,
      } as import('@/types').Message,
    })

    // DELIVERY RECEIPT: Send a group:receipt back to the sender so they know
    // the message was delivered. This is the unified receipt protocol matching
    // the 1:1 chat:receipt mechanism.
    const identity = useIdentityStore.getState().identity
    if (identity) {
      p2pService.sendMessage(message.senderId, 'group:receipt', {
        groupId,
        channelId,
        messageIds: [message.id],
        status: 'delivered',
        readerPublicKey: identity.keyPair.publicKey,
        timestamp: Date.now(),
      }).catch((err) => {
        console.warn('[GroupService] Failed to send delivery receipt:', err)
      })
    }

    // Un message n'est « non lu » que si son canal est réellement à l'écran :
    // l'identifiant actif survit à la navigation. Et un message lu en direct
    // mérite son accusé — sans cela l'expéditeur ne voyait que « remis ».
    const groupState = useGroupStore.getState()
    const viewingChannel = groupState.groupViewVisible
      && groupState.activeGroupId === groupId
      && groupState.activeChannelId === channelId
    if (!viewingChannel) {
      groupState.incrementChannelUnread(groupId, channelId)
      // Une mention déjà notifiée par son canal dédié ne se rejoue pas ; sinon
      // le message non affiché mérite une notification système, réglages respectés.
      if (!this.notifiedMentionIds.delete(message.id)) {
        this.notifyGroupMessage(group, message)
      }
    } else if (
      identity
      && message.senderId !== identity.keyPair.publicKey
      && useUIStore.getState().settings.privacy.readReceipts
    ) {
      p2pService.sendMessage(message.senderId, 'group:receipt', {
        groupId,
        channelId,
        messageIds: [message.id],
        status: 'read',
        readerPublicKey: identity.keyPair.publicKey,
        timestamp: Date.now(),
      }).catch((err) => {
        console.warn('[GroupService] Failed to send read receipt:', err)
      })
    }
  }

  /**
   * Notifie un message de groupe non affiché, dans les limites des réglages :
   * notifications coupées, ne pas déranger, aperçu, mentions seules, son et
   * synthèse vocale.
   */
  private notifyGroupMessage(group: Group, message: Message): void {
    const identity = useIdentityStore.getState().identity
    if (!identity || message.senderId === identity.keyPair.publicKey) return
    const settings = useUIStore.getState().settings
    const notif = settings.notifications
    if (!notif.enabled || notif.dndMode) return
    // Sourdine de la conversation de groupe (même marqueur que le 1:1) : les
    // non-lus et les accusés continuent, seule l'alerte est coupée.
    if (useConversationStore.getState().getConversation(group.id)?.muted) return
    const mentionsMe = message.mentions?.some(
      (mention) => mention.publicKey === identity.keyPair.publicKey,
    ) ?? false
    if (notif.mentionsOnly && !mentionsMe) return

    const senderName = group.members.find((member) => member.publicKey === message.senderId)?.displayName
      || message.senderId.slice(0, 8)
    const body = notif.showPreview
      ? message.content.slice(0, 100)
      : i18n.t('notifications.newMessage')
    try {
      window.asgard.notifications.show(`${senderName} · ${group.name}`, body, {
        groupId: group.id,
        channelId: message.conversationId,
      })
    } catch {
      return
    }
    if (notif.sound) ringtoneService.playBeep(660, 120)
    if (settings.accessibility.ttsEnabled) speakText(`${senderName}. ${body}`)
  }

  /**
   * Handle group delivery/read receipts.
   * CRITICAL: Track per-recipient delivery status using deliveryReceipts and readBy.
   * This enables the sender to see "delivered to 3/5, read by 2/5" for group messages.
   *
   * Per Holepunch/Keet pattern: each recipient sends their own receipt, and the sender
   * aggregates them to determine overall message status.
   */
  private handleGroupReceipt(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown> | null
    if (!msg.from || !payload || typeof payload !== 'object') return
    const groupId = payload.groupId
    const channelId = payload.channelId
    const readerPublicKey = payload.readerPublicKey
    const status = payload.status
    if (typeof groupId !== 'string' || typeof channelId !== 'string' || typeof readerPublicKey !== 'string') return
    if (status !== 'delivered' && status !== 'read') return
    if (!Array.isArray(payload.messageIds) || payload.messageIds.length === 0 || payload.messageIds.length > 1000) return
    const messageIds = payload.messageIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= GroupService.MAX_MESSAGE_ID,
    )
    if (messageIds.length === 0) return

    // A receipt is a self-declaration from a member: it cannot speak for
    // another reader, nor for a group it does not belong to.
    const receiptGroup = useGroupStore.getState().getGroup(groupId)
    if (!receiptGroup) return
    if (readerPublicKey !== msg.from) return
    if (!receiptGroup.members.some((member) => member.publicKey === msg.from)) return
    // Le canal doit être celui du groupe : un accusé ne traverse pas les
    // conversations et ne peut pas viser un message d'un autre groupe.
    if (!receiptGroup.channels.some((channel) => channel.id === channelId)) return

    const logMsg = `[GroupService] Receipt received from ${msg.from.slice(0, 16)} | status: ${status} | msgs: ${messageIds.length}`
    console.log(logMsg)

    const store = useMessageStore.getState()
    const order = { sending: 0, sent: 1, delivered: 2, read: 3, failed: 0, scheduled: 0 }

    for (const messageId of messageIds) {
      // Seuls les messages du canal cité sont concernés : un id valide d'une
      // autre conversation ne doit pas recevoir d'accusé de ce groupe.
      const messages = useMessageStore.getState().messages[channelId]
      if (!messages) continue
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) continue
      const m = messages[idx]
      if (m.senderId === readerPublicKey) continue

      // PER-RECIPIENT TRACKING: Update deliveryReceipts map with this recipient's status
      const deliveryReceipts = { ...(m.deliveryReceipts ?? {}) }
      // Un « remis » qui arrive après un « lu » (chemins distincts, rejeu) ne
      // doit pas faire reculer l'état de ce destinataire.
      if (deliveryReceipts[readerPublicKey] !== 'read') {
        deliveryReceipts[readerPublicKey] = status
      }

      // Track readBy list for read receipts
      const readBy = [...(m.readBy ?? [])]
      if (status === 'read' && !readBy.includes(readerPublicKey)) {
        readBy.push(readerPublicKey)
      }

      // Determine overall status based on all receipts
      // - If all recipients have read → 'read'
      // - If all recipients have at least delivered → 'delivered'
      // - Otherwise keep current status
      const totalRecipients = receiptGroup.members.filter(
        (mem) => mem.publicKey !== m.senderId
      ).length
      const deliveredCount = Object.values(deliveryReceipts).filter(
        (s) => s === 'delivered' || s === 'read'
      ).length
      const readCount = Object.values(deliveryReceipts).filter(
        (s) => s === 'read'
      ).length

      let newStatus = m.status
      if (totalRecipients > 0 && readCount >= totalRecipients) {
        newStatus = 'read'
      } else if (totalRecipients > 0 && deliveredCount >= totalRecipients) {
        newStatus = 'delivered'
      } else if (deliveredCount > 0 && (order[m.status] ?? 0) < order['delivered']) {
        newStatus = 'delivered'
      }

      // Only upgrade, never downgrade
      if ((order[newStatus] ?? 0) > (order[m.status] ?? 0)) {
        console.log(`[GroupService] Upgrading message ${messageId.slice(0, 16)} from ${m.status} to ${newStatus} (delivered: ${deliveredCount}/${totalRecipients}, read: ${readCount}/${totalRecipients})`)
        store.updateStatus(messageId, channelId, newStatus)
      }

      // Update the message with per-recipient tracking data
      // Use addMessage to replace the message with updated fields
      store.updateMessageAttachment?.(messageId, channelId, {
        deliveryReceipts,
        readBy,
      } as any)
    }
  }

  /**
   * Handle group presence updates.
   * CRITICAL: Update the member's full profile (displayName, avatar, status)
   * not just the presence string. Previously only stored a status string,
   * ignoring displayName and avatar updates.
   */
  private handleGroupPresence(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown>
    const groupId = payload.groupId
    const publicKey = payload.publicKey
    const status = typeof payload.status === 'string' ? payload.status : 'online'
    const displayName = typeof payload.displayName === 'string'
      ? payload.displayName.slice(0, GroupService.MAX_PROFILE_NAME)
      : undefined
    const customStatus = typeof payload.customStatus === 'string'
      ? payload.customStatus.slice(0, GroupService.MAX_CUSTOM_STATUS)
      : undefined
    const hasAvatar = payload.hasAvatar === true

    if (typeof groupId !== 'string' || !groupId || groupId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof publicKey !== 'string' || !publicKey) return

    // A presence is a self-declaration: the signed sender cannot speak for
    // another member, and a peer we don't know must not inflate the online
    // count by naming a groupId it happens to know.
    if (publicKey !== msg.from) return
    const groupBefore = useGroupStore.getState().getGroup(groupId)
    if (!groupBefore || !groupBefore.members.some((m) => m.publicKey === publicKey)) return

    // PERFORMANCE: If the peer has an avatar but we don't have it yet, it will arrive
    // via binary media channel (target='group_member'). The hasAvatar flag is for
    // UI placeholder display — it does NOT contain avatar data.
    if (hasAvatar) {
      const member = groupBefore.members.find((m) => m.publicKey === publicKey)
      if (member && !member.avatar) {
        console.log(`[GroupService] Member ${publicKey.slice(0, 16)} has avatar — awaiting binary transfer`)
      }
    }

    // GROUP ICON: a joiner may have missed the icon sent right after the invite
    // (separate media channel, no cross-channel ordering). Re-push it once per
    // peer and avatar; the dedupe table makes later heartbeats free.
    if (groupBefore.avatar) {
      this.sendGroupAvatarViaMedia(publicKey, groupId, groupBefore.avatar).catch(() => {})
    }

    // Normalize ONCE, then store the same internal value everywhere. The member
    // list used to keep the raw network token ('dnd') while the 1:1 contact got
    // 'busy' — the same person therefore carried two different labels depending
    // on where you looked, and neither store could feed the other.
    const memberStatus = fromNetworkStatus(status)

    // Update member presence in the store (now stores status + customStatus + lastSeen on the member)
    useGroupStore.getState().updateMemberPresence(groupId, publicKey, memberStatus, customStatus)

    // CRITICAL: Also update the member's profile in the group store so
    // displayName and status changes are reflected. This ensures group members
    // see the latest profile info when looking at the member list.
    const group = useGroupStore.getState().getGroup(groupId)
    if (group) {
      const member = group.members.find((m) => m.publicKey === publicKey)
      if (member && displayName) {
        // Update member display name if changed
        if (member.displayName !== displayName) {
          useGroupStore.getState().updateMember(groupId, publicKey, { displayName })
        }
      }
    }

    // Also update the contact store so 1:1 chat shows the SAME status as the
    // member list — same normalized value, no second mapping here.
    useContactStore.getState().updateContact(publicKey, {
      status: memberStatus,
      customStatus: customStatus ?? undefined,
      lastSeen: Date.now(),
    })
  }

  /**
   * Handle group typing indicators
   */
  private handleGroupTyping(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown>
    const groupId = payload.groupId
    const channelId = payload.channelId
    const publicKey = payload.publicKey
    const displayName = payload.displayName
    const isTyping = payload.isTyping

    if (typeof groupId !== 'string' || !groupId || groupId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof channelId !== 'string' || !channelId || channelId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof publicKey !== 'string' || !publicKey) return
    if (typeof isTyping !== 'boolean') return

    // Typing is a self-declaration from a member of that group, in one of
    // that group's own channels.
    if (publicKey !== msg.from) return
    const group = useGroupStore.getState().getGroup(groupId)
    const member = group?.members.find((m) => m.publicKey === publicKey)
    if (!group || !member) return
    if (!group.channels.some((c) => c.id === channelId)) return

    // Update typing state in the store
    useGroupStore.getState().setChannelTyping(
      groupId,
      channelId,
      publicKey,
      member.displayName || (typeof displayName === 'string' ? displayName.slice(0, GroupService.MAX_PROFILE_NAME) : ''),
      isTyping,
    )
  }

  /**
   * Handle group read receipts
   */
  private handleGroupRead(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown>
    const groupId = payload.groupId
    const channelId = payload.channelId
    const publicKey = payload.publicKey
    const messageIds = payload.messageIds

    if (typeof groupId !== 'string' || !groupId || groupId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof channelId !== 'string' || !channelId || channelId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof publicKey !== 'string' || !publicKey) return
    if (!Array.isArray(messageIds) || messageIds.length === 0 || messageIds.length > 1000) return
    if (!messageIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= GroupService.MAX_MESSAGE_ID)) return

    // A read marker is a self-declaration from a member of that group.
    if (publicKey !== msg.from) return
    const group = useGroupStore.getState().getGroup(groupId)
    if (!group?.members.some((m) => m.publicKey === publicKey)) return
    if (!group.channels.some((c) => c.id === channelId)) return

    // Only mark messages that actually live in this group channel: without
    // this, a marker naming an arbitrary id could target a 1:1 conversation
    // whose message happens to share the id.
    const messages = useMessageStore.getState().messages[channelId]
    if (!messages) return
    const store = useMessageStore.getState()
    for (const messageId of messageIds) {
      const target = messages.find((m) => m.id === messageId)
      if (!target || target.senderId === publicKey) continue
      store.updateStatus(messageId, channelId, 'read')
    }
  }

  /**
   * Handle group pin updates
   */
  private handleGroupPin(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown>
    const groupId = payload.groupId as string
    const channelId = payload.channelId as string
    const messageId = payload.messageId as string
    const action = payload.action as string

    if (typeof groupId !== 'string' || !groupId || groupId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof channelId !== 'string' || !channelId || channelId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof messageId !== 'string' || !messageId || messageId.length > GroupService.MAX_MESSAGE_ID) return
    if (action !== 'pin' && action !== 'unpin') return

    const store = useGroupStore.getState()
    const group = store.getGroup(groupId)
    const actor = group?.members.find((member) => member.publicKey === msg.from)
    if (!actor || !['owner', 'admin', 'moderator'].includes(actor.role)) return

    if (action === 'pin') {
      store.pinChannelMessage(groupId, channelId, messageId)
    } else if (action === 'unpin') {
      store.unpinChannelMessage(groupId, channelId, messageId)
    }
  }

  /**
   * Handle a reaction on a group message.
   *
   * A reaction is a self-declaration from a member, on a message that actually
   * lives in one of that group's own channels: a guessed message id must not
   * reach a 1:1 conversation or another group's channel.
   */
  private handleGroupReaction(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown> | null
    if (!msg.from || !payload || typeof payload !== 'object') return
    const groupId = payload.groupId
    const channelId = payload.channelId
    const messageId = payload.messageId
    const emoji = payload.emoji
    const action = payload.action

    if (typeof groupId !== 'string' || !groupId || groupId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof channelId !== 'string' || !channelId || channelId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof messageId !== 'string' || !messageId || messageId.length > GroupService.MAX_MESSAGE_ID) return
    if (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > GroupService.MAX_REACTION_CHARS) return
    if (action !== 'add' && action !== 'remove') return

    const group = useGroupStore.getState().getGroup(groupId)
    if (!group?.members.some((member) => member.publicKey === msg.from)) return
    if (!group.channels.some((channel) => channel.id === channelId)) return

    const store = useMessageStore.getState()
    const message = store.getMessage(messageId, channelId)
    if (!message || message.deleted) return

    if (action === 'add') {
      store.addReaction(messageId, channelId, emoji, msg.from)
    } else {
      store.removeReaction(messageId, channelId, emoji, msg.from)
    }
    const updated = store.getMessage(messageId, channelId)
    if (updated) storageService.saveMessage(channelId, updated).catch(console.error)
  }

  private handleGroupEdit(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown> | null
    if (!msg.from || !payload || typeof payload !== 'object') return
    const groupId = payload.groupId
    const channelId = payload.channelId
    const messageId = payload.messageId
    const newContent = payload.newContent

    if (typeof groupId !== 'string' || !groupId || groupId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof channelId !== 'string' || !channelId || channelId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof messageId !== 'string' || !messageId || messageId.length > GroupService.MAX_MESSAGE_ID) return
    if (typeof newContent !== 'string' || newContent.trim().length === 0) return
    if (newContent.length > GroupService.MAX_MESSAGE_CHARS) return

    const group = useGroupStore.getState().getGroup(groupId)
    if (!group?.members.some((member) => member.publicKey === msg.from)) return
    if (!group.channels.some((channel) => channel.id === channelId)) return

    const store = useMessageStore.getState()
    const message = store.getMessage(messageId, channelId)
    // Seul l'auteur du message peut le réécrire.
    if (!message || message.deleted || message.senderId !== msg.from) return

    store.editMessage(messageId, channelId, newContent)
    const edited = store.getMessage(messageId, channelId)
    if (edited) storageService.saveMessage(channelId, edited).catch(console.error)
  }

  private handleGroupDelete(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown> | null
    if (!msg.from || !payload || typeof payload !== 'object') return
    const groupId = payload.groupId
    const channelId = payload.channelId
    const messageId = payload.messageId

    if (typeof groupId !== 'string' || !groupId || groupId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof channelId !== 'string' || !channelId || channelId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof messageId !== 'string' || !messageId || messageId.length > GroupService.MAX_MESSAGE_ID) return

    const group = useGroupStore.getState().getGroup(groupId)
    if (!group) return
    const sender = group.members.find((member) => member.publicKey === msg.from)
    if (!sender) return
    if (!group.channels.some((channel) => channel.id === channelId)) return

    const store = useMessageStore.getState()
    const message = store.getMessage(messageId, channelId)
    if (!message) return
    // L'auteur peut retirer son message ; un rôle de modération peut retirer
    // celui d'un autre membre.
    const canModerate = ['owner', 'admin', 'moderator'].includes(sender.role)
    if (message.senderId !== msg.from && !canModerate) return

    store.deleteMessagePermanently(messageId, channelId)
    storageService.deleteMessage(channelId, messageId).catch(console.error)
  }

  /**
   * Handle group mention notifications.
   * Shows a notification when the user is mentioned in a group.
   */
  private handleGroupMention(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown>
    const groupId = payload.groupId
    const channelId = payload.channelId
    const messageId = payload.messageId
    const mentionedBy = payload.mentionedBy
    const content = payload.content

    if (typeof groupId !== 'string' || !groupId || groupId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof channelId !== 'string' || !channelId || channelId.length > GroupService.MAX_GROUP_FIELD) return
    if (typeof messageId !== 'string' || !messageId || messageId.length > GroupService.MAX_MESSAGE_ID) return
    if (typeof mentionedBy !== 'string' || !mentionedBy) return

    // Get group info for the notification. Only a member can raise a mention,
    // and it can only be raised in its own name.
    const group = useGroupStore.getState().getGroup(groupId)
    if (!group) return
    if (mentionedBy !== msg.from) return
    const author = group.members.find((m) => m.publicKey === msg.from)
    if (!author) return
    if (!group.channels.some((c) => c.id === channelId)) return

    // Un message affiché dans le canal est déjà vu ; un message déjà arrivé a
    // déjà été notifié par handleGroupMessage. Notifier l'un ou l'autre ici
    // produirait une alerte pour un fil sous les yeux, ou en double.
    const groupState = useGroupStore.getState()
    const viewingChannel = groupState.groupViewVisible
      && groupState.activeGroupId === groupId
      && groupState.activeChannelId === channelId
    if (viewingChannel) return
    if (useMessageStore.getState().getMessage(messageId, channelId)) return

    const settings = useUIStore.getState().settings
    const notif = settings.notifications
    if (!notif.enabled || notif.dndMode) return
    if (useConversationStore.getState().getConversation(group.id)?.muted) return

    // The notifier names itself with its roster profile, not with a string
    // carried by the wire: otherwise anyone could impersonate another member
    // in the notification.
    const authorName = author.displayName || mentionedBy.slice(0, 16)
    const preview = typeof content === 'string' ? content.trim().slice(0, GroupService.MAX_MENTION_PREVIEW) : ''
    const body = notif.showPreview && preview
      ? preview
      : i18n.t('notifications.mentionedYou', { name: authorName })

    try {
      if (typeof window !== 'undefined' && window.asgard?.notifications) {
        window.asgard.notifications.show(`${authorName} · ${group.name}`, body, {
          groupId,
          channelId,
        })
      }
    } catch {
      // Notifications not available, skip
    }
    if (notif.sound) ringtoneService.playBeep(660, 120)
    if (settings.accessibility.ttsEnabled) speakText(`${authorName}. ${body}`)

    // La notification de mention peut précéder son message : mémoriser l'id
    // évite que handleGroupMessage n'alerte une seconde fois.
    this.notifiedMentionIds.add(messageId)
    if (this.notifiedMentionIds.size > 200) {
      const oldest = this.notifiedMentionIds.values().next().value
      if (oldest) this.notifiedMentionIds.delete(oldest)
    }

    console.log('[GroupService] Mention notification:', group.name, body)
  }

  // ─── Offline Message Queue ──────────────────────────────────────────────

  /**
   * Queue a group message for delivery to offline members.
   * Per Holepunch/Keet pattern: messages should be delivered when peers reconnect.
   * FIX: Each peer gets its own queue entry so flushing for one peer doesn't
   * delete messages for other offline peers.
   */
  private queuePendingGroupMessage(
    groupId: string,
    channelId: string,
    message: Record<string, unknown>,
    peerIds: string[]
  ): void {
    const messageId = message.id as string
    let queued = 0
    for (const peerId of peerIds) {
      // Per-peer key: ensures flushing for peer A doesn't affect peer B's queue
      const key = messageId + ':' + peerId
      if (!this.pendingGroupMessages.has(key)) {
        this.pendingGroupMessages.set(key, {
          groupId,
          channelId,
          message,
          createdAt: Date.now(),
        })
        queued++
      }
    }
    if (queued > 0) {
      console.log(`[GroupService] Group message ${messageId.slice(0, 16)} queued for ${queued} offline peers (total queue: ${this.pendingGroupMessages.size})`)
    }
  }

  /**
   * Flush pending group messages for a peer that just came online.
   * Called when a peer reconnects (from peer:connected event).
   * FIX: Only removes entries for this specific peer, not for all peers.
   */
  async flushPendingGroupMessages(peerPublicKey: string): Promise<void> {
    if (this.pendingGroupMessages.size === 0) return

    let flushed = 0
    const keysToDelete: string[] = []

    for (const [key, entry] of this.pendingGroupMessages.entries()) {
      // Only flush entries for this specific peer (key format: messageId:peerPublicKey)
      if (!key.endsWith(':' + peerPublicKey)) continue

      try {
        await p2pService.sendMessage(peerPublicKey, 'group:message', {
          groupId: entry.groupId,
          channelId: entry.channelId,
          message: entry.message,
        })
        keysToDelete.push(key)
        flushed++
      } catch (err) {
        console.warn(`[GroupService] Failed to flush pending group message to ${peerPublicKey.slice(0, 16)}:`, err)
      }
    }

    // Only remove entries that were successfully flushed for THIS peer
    for (const key of keysToDelete) {
      this.pendingGroupMessages.delete(key)
    }

    if (flushed > 0) {
      console.log(`[GroupService] Flushed ${flushed} pending group messages to ${peerPublicKey.slice(0, 16)} (remaining queue: ${this.pendingGroupMessages.size})`)
    }
  }

  /**
   * Get count of pending group messages.
   */
  getPendingGroupMessageCount(): number {
    return this.pendingGroupMessages.size
  }

  /**
   * Clean up the group service — stop heartbeat and clear listeners.
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    this.initialized = false
    this.pendingGroupMessages.clear()
  }
}

export const groupService = GroupService.getInstance()
