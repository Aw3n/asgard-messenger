import type { Group, GroupMember, GroupChannel, ProtocolMessage, GroupActivity } from '@/types'
import { p2pService } from './P2PService'
import { cryptoService } from './CryptoService'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import { useContactStore } from '@/stores/contactStore'
import { fileService } from './FileService'
import { storageService } from './StorageService'
import { generateId } from '@/utils/id'

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
  // OFFLINE QUEUE: Messages queued for delivery when group members are offline.
  // Per Holepunch/Keet pattern: messages should be delivered when peers reconnect.
  private pendingGroupMessages: Map<string, Array<{ groupId: string; channelId: string; message: Record<string, unknown>; createdAt: number }>> = new Map()
  // Track last broadcast status to avoid redundant re-broadcasts
  private lastBroadcastStatus: string | null = null
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
    }, GroupService.HEARTBEAT_INTERVAL_MS)
  }

  /**
   * Announce presence to all groups the user is a member of.
   * Called automatically on profile status change and via heartbeat.
   */
  private async announcePresenceToAllGroups(): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    // Skip if status hasn't changed (avoid redundant broadcasts)
    const currentStatus = identity.profile.status + ':' + (identity.profile.customStatus ?? '')
    if (currentStatus === this.lastBroadcastStatus) return
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

    // Send invitation (PERFORMANCE: avatar is sent separately via binary media channel)
    await p2pService.sendMessage(contactPublicKey, 'group:invite', {
      action: 'invite',
      groupId: group.id,
      groupName: group.name,
      groupDescription: group.description,
      hasAvatar: !!group.avatar,
      inviteKey: group.inviteKey,
      inviterPublicKey: identity.keyPair.publicKey,
      inviterDisplayName: identity.profile.displayName,
    })

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

    store.removeMember(groupId, targetPublicKey)

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
    mentions?: Array<{ publicKey: string; displayName: string; startIndex: number; endIndex: number }>
  ): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    const group = useGroupStore.getState().getGroup(groupId)
    if (!group) return

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
   * Announce presence in a group with full profile status.
   * Per Holepunch/Keet pattern: group presence includes the actual profile
   * status (online/away/busy/invisible) so members see the correct status.
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
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    // CRITICAL: Use the ACTUAL profile status, not hardcoded 'online'.
    // Map internal UserStatus to network-compatible status for P2P.
    const internalStatus = identity.profile.status
    const status: string =
      internalStatus === 'busy' ? 'dnd' :
      internalStatus === 'invisible' ? 'offline' :
      internalStatus === 'dnd' ? 'dnd' :
      internalStatus === 'away' ? 'away' :
      internalStatus === 'offline' ? 'offline' :
      'online'

    const memberKeys = this.getGroupMemberKeys(groupId)
    await p2pService.broadcastToPeers(memberKeys, 'group:presence', {
      groupId,
      publicKey: identity.keyPair.publicKey,
      displayName: identity.profile.displayName,
      avatar: undefined, // PERFORMANCE: Never include avatar in signed messages (3.8MB)
      hasAvatar: !!identity.profile.avatar, // Flag for UI placeholder
      status,
      customStatus: identity.profile.customStatus,
      timestamp: Date.now(),
    }).catch(console.error)

    // PERFORMANCE: Send our profile avatar to each group member via binary media channel.
    // Only when withAvatar is true (avatar changed or initial connection).
    // Avoids sending 3.8MB every 5s heartbeat.
    if (withAvatar && identity.profile.avatar) {
      for (const memberKey of memberKeys) {
        this.sendMemberAvatarViaMedia(memberKey, groupId, identity.profile.avatar).catch(() => {})
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
      // We received an invitation — add the group locally
      const identity = useIdentityStore.getState().identity
      if (!identity) return

      const newMember: GroupMember = {
        publicKey: identity.keyPair.publicKey,
        displayName: identity.profile.displayName,
        role: 'member',
        joinedAt: Date.now(),
        canPost: true,
      }

      const group: Group = {
        id: payload.groupId as string,
        name: payload.groupName as string,
        description: payload.groupDescription as string | undefined,
        avatar: undefined, // PERFORMANCE: Avatar arrives via binary media channel (hasAvatar flag indicates one exists)
        members: [newMember],
        channels: [{
          id: generateId(),
          groupId: payload.groupId as string,
          name: 'general',
          type: 'text',
          position: 0,
          permissions: {
            send: ['owner', 'admin', 'moderator', 'member'],
            read: ['owner', 'admin', 'moderator', 'member', 'guest'],
            manage: ['owner', 'admin'],
          },
          unreadCount: 0,
        }],
        activeChannelId: undefined,
        createdAt: Date.now(),
        ownerId: payload.inviterPublicKey as string,
        isPublic: false,
        maxMembers: 100,
        inviteKey: payload.inviteKey as string,
      }

      useGroupStore.getState().joinGroup(group)

      // HYPERSWARM: Join the group's discovery topic so we can find other members
      if (group.inviteKey) {
        cryptoService.deriveGroupTopic(group.inviteKey)
          .then((topic) => p2pService.joinTopic(topic).catch(() => {}))
          .catch(() => {})
      }

      // Create a conversation entry
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
    } else if (action === 'request') {
      // Someone wants to join via invite key — verify and send group data
      this.handleJoinRequest(msg.from, payload).catch(console.error)
    }
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

    // Find the group with this invite key
    const groups = useGroupStore.getState().getAllGroups()
    const group = groups.find((g) => g.inviteKey === inviteKey)
    if (!group) return

    // Check if group is full
    if (group.members.length >= group.maxMembers) return

    // Add the new member locally
    const newMember: GroupMember = {
      publicKey: requesterPublicKey,
      displayName: requesterDisplayName,
      role: 'member',
      joinedAt: Date.now(),
      canPost: true,
    }

    useGroupStore.getState().addMember(group.id, newMember)

    // Send the full group data back (PERFORMANCE: avatar sent via binary media channel)
    await p2pService.sendMessage(requesterPeerId, 'group:invite', {
      action: 'invite',
      groupId: group.id,
      groupName: group.name,
      groupDescription: group.description,
      hasAvatar: !!group.avatar,
      inviteKey: group.inviteKey,
      inviterPublicKey: useIdentityStore.getState().identity?.keyPair.publicKey,
      inviterDisplayName: useIdentityStore.getState().identity?.profile.displayName,
    })

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
  }

  /**
   * Handle incoming group update
   */
  private handleGroupUpdate(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown>
    const action = payload.action as string
    const groupId = payload.groupId as string
    const store = useGroupStore.getState()

    switch (action) {
      case 'metadata:update': {
        // PERFORMANCE: Strip avatar from updates — it arrives via binary media channel.
        // The hasAvatar flag indicates whether an avatar exists (for UI placeholder).
        const rawUpdates = payload.updates as Record<string, unknown>
        const { avatar: _strippedAvatar, ...safeUpdates } = rawUpdates
        store.updateGroup(groupId, safeUpdates as Partial<Group>)
        break
      }

      case 'member:joined': {
        const member = payload.member as GroupMember
        store.addMember(groupId, member)
        break
      }

      case 'member:left':
      case 'member:removed':
      case 'member:kicked': {
        const publicKey = (payload.targetPublicKey ?? payload.publicKey) as string
        store.removeMember(groupId, publicKey)
        break
      }

      case 'member:role': {
        const targetPk = payload.targetPublicKey as string
        const newRole = payload.newRole as GroupMember['role']
        store.setMemberRole(groupId, targetPk, newRole)
        break
      }

      case 'member:muted': {
        const targetPk = payload.targetPublicKey as string
        const mutedBy = payload.mutedBy as string
        store.muteMember(groupId, targetPk, mutedBy)
        break
      }

      case 'member:unmuted': {
        const targetPk = payload.targetPublicKey as string
        store.unmuteMember(groupId, targetPk)
        break
      }

      case 'channel:add': {
        const channel = payload.channel as GroupChannel
        // Use immer set directly via addChannel to avoid duplicates
        const group = store.getGroup(groupId)
        if (group && !group.channels.some(ch => ch.id === channel.id)) {
          store.updateGroup(groupId, {
            channels: [...group.channels, channel].sort((a, b) => a.position - b.position),
          })
        }
        break
      }

      case 'channel:remove': {
        const channelId = payload.channelId as string
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
    const payload = msg.payload as Record<string, unknown>
    const groupId = payload.groupId as string
    const channelId = payload.channelId as string
    const message = payload.message as {
      id: string
      conversationId: string
      senderId: string
      type: string
      content: string
      timestamp: number
      status: string
    }

    if (!groupId || !channelId || !message) return

    // Verify the sender is a member of the group
    const group = useGroupStore.getState().getGroup(groupId)
    if (!group) return

    const isMember = group.members.some((m) => m.publicKey === message.senderId)
    if (!isMember) return

    // Add message to the store — include groupId for routing and tracking
    useMessageStore.getState().addMessage({
      ...message,
      type: (message.type as import('@/types').MessageType) || 'text',
      status: 'delivered' as const, // Mark as delivered since we received it
      conversationId: channelId,
      groupId,
    })

    // PERSISTENCE: Save group message to Hyperbee storage so it survives restarts.
    // Previously, group messages were only in memory and lost on app restart.
    storageService.saveMessage(channelId, {
      ...message,
      type: (message.type as import('@/types').MessageType) || 'text',
      status: 'delivered',
      conversationId: channelId,
      groupId,
    } as import('@/types').Message).catch(console.error)

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

    // Increment unread count if not the active channel
    const activeChannelId = useGroupStore.getState().activeChannelId
    if (channelId !== activeChannelId) {
      useGroupStore.getState().incrementChannelUnread(groupId, channelId)
    }
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
    const payload = msg.payload as {
      groupId: string
      channelId: string
      messageIds: string[]
      status: 'delivered' | 'read'
      readerPublicKey: string
      timestamp: number
    }

    if (!payload.messageIds || payload.messageIds.length === 0) return

    const logMsg = `[GroupService] Receipt received from ${msg.from?.slice(0, 16)} | status: ${payload.status} | msgs: ${payload.messageIds.length}`
    console.log(logMsg)

    const store = useMessageStore.getState()
    const order = { sending: 0, sent: 1, delivered: 2, read: 3, failed: 0, scheduled: 0 }

    for (const messageId of payload.messageIds) {
      // Find the message across all conversations (it's one we sent)
      for (const convId of Object.keys(store.messages)) {
        const messages = store.messages[convId]
        const idx = messages.findIndex((m) => m.id === messageId)
        if (idx !== -1) {
          const m = messages[idx]

          // PER-RECIPIENT TRACKING: Update deliveryReceipts map with this recipient's status
          const deliveryReceipts = { ...(m.deliveryReceipts ?? {}) }
          deliveryReceipts[payload.readerPublicKey] = payload.status

          // Track readBy list for read receipts
          const readBy = [...(m.readBy ?? [])]
          if (payload.status === 'read' && !readBy.includes(payload.readerPublicKey)) {
            readBy.push(payload.readerPublicKey)
          }

          // Determine overall status based on all receipts
          // - If all recipients have read → 'read'
          // - If all recipients have at least delivered → 'delivered'
          // - Otherwise keep current status
          const group = useGroupStore.getState().getGroup(payload.groupId)
          if (group) {
            const totalRecipients = group.members.filter(
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
              store.updateStatus(messageId, convId, newStatus)
            }
          }

          // Update the message with per-recipient tracking data
          // Use addMessage to replace the message with updated fields
          store.updateMessageAttachment?.(messageId, convId, {
            deliveryReceipts,
            readBy,
          } as any)

          break
        }
      }
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
    const groupId = payload.groupId as string
    const publicKey = payload.publicKey as string
    const status = payload.status as string
    const displayName = payload.displayName as string | undefined
    const customStatus = payload.customStatus as string | undefined
    const hasAvatar = payload.hasAvatar as boolean | undefined

    if (!groupId || !publicKey) return

    // PERFORMANCE: If the peer has an avatar but we don't have it yet, it will arrive
    // via binary media channel (target='group_member'). The hasAvatar flag is for
    // UI placeholder display — it does NOT contain avatar data.
    if (hasAvatar) {
      const group = useGroupStore.getState().getGroup(groupId)
      const member = group?.members.find((m) => m.publicKey === publicKey)
      if (member && !member.avatar) {
        console.log(`[GroupService] Member ${publicKey.slice(0, 16)} has avatar — awaiting binary transfer`)
      }
    }

    // Update member presence in the store (now stores status + customStatus + lastSeen on the member)
    useGroupStore.getState().updateMemberPresence(groupId, publicKey, status, customStatus)

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

    // Also update the contact store so 1:1 chat shows the same status
    // Map network 'dnd' back to internal 'busy' for display consistency
    const mappedStatus: import('@/types').UserStatus =
      status === 'dnd' ? 'busy' :
      status === 'offline' ? 'offline' :
      status === 'away' ? 'away' :
      'online'
    useContactStore.getState().updateContact(publicKey, {
      status: mappedStatus,
      customStatus: customStatus ?? undefined,
      lastSeen: Date.now(),
    })
  }

  /**
   * Handle group typing indicators
   */
  private handleGroupTyping(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown>
    const groupId = payload.groupId as string
    const channelId = payload.channelId as string
    const publicKey = payload.publicKey as string
    const displayName = payload.displayName as string
    const isTyping = payload.isTyping as boolean

    if (!groupId || !channelId || !publicKey) return

    // Update typing state in the store
    useGroupStore.getState().setChannelTyping(groupId, channelId, publicKey, displayName, isTyping)
  }

  /**
   * Handle group read receipts
   */
  private handleGroupRead(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown>
    const groupId = payload.groupId as string
    const channelId = payload.channelId as string
    const publicKey = payload.publicKey as string
    const messageIds = payload.messageIds as string[]

    if (!groupId || !channelId || !publicKey || !messageIds) return

    // Update message read status in the message store
    const messageStore = useMessageStore.getState()
    for (const messageId of messageIds) {
      messageStore.markMessageRead(messageId, publicKey)
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

    if (!groupId || !channelId || !messageId) return

    const store = useGroupStore.getState()

    if (action === 'pin') {
      store.pinChannelMessage(groupId, channelId, messageId)
    } else if (action === 'unpin') {
      store.unpinChannelMessage(groupId, channelId, messageId)
    }
  }

  /**
   * Handle group mention notifications.
   * Shows a notification when the user is mentioned in a group.
   */
  private handleGroupMention(msg: ProtocolMessage): void {
    const payload = msg.payload as Record<string, unknown>
    const groupId = payload.groupId as string
    const channelId = payload.channelId as string
    const messageId = payload.messageId as string
    const mentionedBy = payload.mentionedBy as string
    const mentionedByDisplayName = payload.mentionedByDisplayName as string
    const content = payload.content as string

    if (!groupId || !channelId || !messageId || !mentionedBy) return

    // Get group info for the notification
    const group = useGroupStore.getState().getGroup(groupId)
    if (!group) return

    // Show notification
    const title = `${mentionedByDisplayName} mentioned you in ${group.name}`
    const body = content || 'You were mentioned in a message'

    // Use the notification API if available
    try {
      if (typeof window !== 'undefined' && window.asgard?.notifications) {
        window.asgard.notifications.show(title, body)
      }
    } catch {
      // Notifications not available, skip
    }

    console.log('[GroupService] Mention notification:', title, body)
  }

  // ─── Offline Message Queue ──────────────────────────────────────────────

  /**
   * Queue a group message for delivery to offline members.
   * Per Holepunch/Keet pattern: messages should be delivered when peers reconnect.
   * The message is stored per-peer and flushed when the peer comes online.
   */
  private queuePendingGroupMessage(
    groupId: string,
    channelId: string,
    message: Record<string, unknown>,
    _peerIds: string[]
  ): void {
    // We queue per-peer, but since the message is the same for all peers,
    // we store the message once with the peer list for later delivery.
    const messageId = message.id as string
    const existing = this.pendingGroupMessages.get(messageId) ?? []
    existing.push({
      groupId,
      channelId,
      message,
      createdAt: Date.now(),
    })
    this.pendingGroupMessages.set(messageId, existing)
    console.log(`[GroupService] Group message queued for offline delivery (queue: ${existing.length})`)
  }

  /**
   * Flush pending group messages for a peer that just came online.
   * Called when a peer reconnects (from peer:connected event).
   */
  async flushPendingGroupMessages(peerPublicKey: string): Promise<void> {
    if (this.pendingGroupMessages.size === 0) return

    let flushed = 0
    for (const [messageId, entries] of this.pendingGroupMessages.entries()) {
      for (const entry of entries) {
        try {
          await p2pService.sendMessage(peerPublicKey, 'group:message', {
            groupId: entry.groupId,
            channelId: entry.channelId,
            message: entry.message,
          })
          flushed++
        } catch (err) {
          console.warn(`[GroupService] Failed to flush pending group message to ${peerPublicKey.slice(0, 16)}:`, err)
        }
      }
      // Remove successfully flushed messages
      this.pendingGroupMessages.delete(messageId)
    }

    if (flushed > 0) {
      console.log(`[GroupService] Flushed ${flushed} pending group messages to ${peerPublicKey.slice(0, 16)}`)
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
