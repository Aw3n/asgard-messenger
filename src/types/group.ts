/**
 * Group types — group chats with channels and roles
 */

export type MemberRole = 'owner' | 'admin' | 'moderator' | 'member' | 'guest'

export type ChannelType = 'text' | 'announcement' | 'voice' | 'readonly'

export type ActivityType =
  | 'member:joined'
  | 'member:left'
  | 'member:kicked'
  | 'member:muted'
  | 'member:unmuted'
  | 'channel:created'
  | 'channel:deleted'
  | 'message:pinned'
  | 'message:unpinned'
  | 'group:updated'

export interface GroupActivity {
  id: string
  groupId: string
  type: ActivityType
  actorPublicKey: string
  actorDisplayName: string
  targetPublicKey?: string
  targetDisplayName?: string
  channelId?: string
  channelName?: string
  messageId?: string
  messageContent?: string
  timestamp: number
}

export interface GroupMember {
  publicKey: string
  displayName: string
  avatar?: string
  role: MemberRole
  joinedAt: number
  /** Whether this member can post in the channel */
  canPost: boolean
  /** Whether this member is muted by an admin */
  mutedBy?: string
  /** Network presence status (online/away/dnd/offline) — updated via group:presence */
  status?: string
  /** Custom status message (e.g., "In a meeting") */
  customStatus?: string
  /** Timestamp of last presence update or activity */
  lastSeen?: number
}

export interface GroupChannel {
  id: string
  groupId: string
  name: string
  description?: string
  type: ChannelType
  /** Position in the channel list */
  position: number
  /** Who can send messages */
  permissions: {
    send: MemberRole[]
    read: MemberRole[]
    manage: MemberRole[]
  }
  /** Unread count for current user */
  unreadCount: number
  lastActivity?: number
  /** Pinned message IDs in this channel */
  pinnedMessageIds?: string[]
}

export interface Group {
  /** Unique group ID (Hypercore feed key) */
  id: string
  /** Group display name */
  name: string
  /** Group description */
  description?: string
  /** Group avatar (base64 or blob key) */
  avatar?: string
  /** All members */
  members: GroupMember[]
  /** All channels */
  channels: GroupChannel[]
  /** Active channel ID */
  activeChannelId?: string
  /** Group creation timestamp */
  createdAt: number
  /** Last update timestamp — used for CAS (Compare-And-Swap) conflict detection */
  updatedAt?: number
  /** Public key of the group owner */
  ownerId: string
  /** Whether the group is public (discoverable) */
  isPublic: boolean
  /** Max members */
  maxMembers: number
  /** Group invite link / key */
  inviteKey?: string
  /** Activity log for the group */
  activityLog?: GroupActivity[]
}
