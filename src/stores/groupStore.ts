import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { Group, GroupMember, GroupChannel, MemberRole, ChannelType, GroupActivity } from '@/types'
import { generateId } from '@/utils/id'

interface GroupState {
  /** All groups indexed by ID */
  groups: Record<string, Group>
  /** Currently active (selected) group ID */
  activeGroupId: string | null
  /** Currently active channel within the active group */
  activeChannelId: string | null
  /** Search query for filtering groups */
  searchQuery: string
  /** Group member presence: groupId -> publicKey -> status */
  groupPresence: Record<string, Record<string, string>>
  /** Group channel typing: groupId -> channelId -> publicKey -> { displayName, isTyping, timestamp } */
  channelTyping: Record<string, Record<string, Record<string, { displayName: string; isTyping: boolean; timestamp: number }>>>

  // ─── Group Actions ───────────────────────────────────────────────────────
  /** Create a new group and set the current user as owner */
  createGroup: (params: {
    name: string
    description?: string
    avatar?: string
    ownerId: string
    ownerDisplayName: string
    isPublic?: boolean
    maxMembers?: number
  }) => Group

  /** Join an existing group via invite key */
  joinGroup: (group: Group) => void

  /** Leave a group and remove it from local state */
  leaveGroup: (groupId: string) => void

  /** Update group metadata (name, description, avatar, etc.) */
  updateGroup: (groupId: string, updates: Partial<Group>) => void

  /** Set the active group and optionally its active channel */
  setActiveGroup: (groupId: string | null, channelId?: string | null) => void

  // ─── Member Actions ──────────────────────────────────────────────────────
  /** Add a member to a group */
  addMember: (groupId: string, member: GroupMember) => void

  /** Remove a member from a group */
  removeMember: (groupId: string, publicKey: string) => void

  /** Update a member's role or properties */
  updateMember: (groupId: string, publicKey: string, updates: Partial<GroupMember>) => void

  /** Change a member's role */
  setMemberRole: (groupId: string, publicKey: string, role: MemberRole) => void

  /** Mute a member in a group */
  muteMember: (groupId: string, publicKey: string, mutedBy: string) => void

  /** Unmute a member in a group */
  unmuteMember: (groupId: string, publicKey: string) => void

  // ─── Channel Actions ─────────────────────────────────────────────────────
  /** Add a new channel to a group */
  addChannel: (groupId: string, params: {
    name: string
    description?: string
    type: ChannelType
    permissions?: GroupChannel['permissions']
  }) => GroupChannel | null

  /** Remove a channel from a group */
  removeChannel: (groupId: string, channelId: string) => void

  /** Update a channel's properties */
  updateChannel: (groupId: string, channelId: string, updates: Partial<GroupChannel>) => void

  /** Set the active channel within the active group */
  setActiveChannel: (channelId: string | null) => void

  /** Update channel unread count */
  incrementChannelUnread: (groupId: string, channelId: string) => void

  /** Clear channel unread count */
  clearChannelUnread: (groupId: string, channelId: string) => void

  /** Pin a message in a channel */
  pinChannelMessage: (groupId: string, channelId: string, messageId: string) => void

  /** Unpin a message in a channel */
  unpinChannelMessage: (groupId: string, channelId: string, messageId: string) => void

  /** Set typing indicator for a channel */
  setChannelTyping: (groupId: string, channelId: string, publicKey: string, displayName: string, isTyping: boolean) => void

  /** Get typing users in a channel */
  getChannelTypingUsers: (groupId: string, channelId: string) => Array<{ publicKey: string; displayName: string }>

  // ─── Activity Actions ────────────────────────────────────────────────────
  /** Add an activity entry to the group's activity log */
  addGroupActivity: (groupId: string, activity: GroupActivity) => void

  /** Get activity log for a group */
  getGroupActivity: (groupId: string, limit?: number) => GroupActivity[]

  // ─── Invite Actions ──────────────────────────────────────────────────────
  /** Generate and store an invite key for a group */
  generateInviteKey: (groupId: string) => string

  // ─── Selectors ───────────────────────────────────────────────────────────
  /** Get a group by ID */
  getGroup: (groupId: string) => Group | undefined

  /** Get all groups sorted by creation date (newest first) */
  getAllGroups: () => Group[]

  /** Get filtered groups based on search query */
  getFilteredGroups: () => Group[]

  /** Get the active group */
  getActiveGroup: () => Group | undefined

  /** Get members of a group */
  getMembers: (groupId: string) => GroupMember[]

  /** Get channels of a group sorted by position */
  getChannels: (groupId: string) => GroupChannel[]

  /** Get the active channel */
  getActiveChannel: () => GroupChannel | undefined

  /** Check if the current user is an admin/owner of a group */
  isAdmin: (groupId: string, publicKey: string) => boolean

  /** Update member presence status in a group (also updates member fields) */
  updateMemberPresence: (groupId: string, publicKey: string, status: string, customStatus?: string) => void

  /** Get online members in a group */
  getOnlineMembers: (groupId: string) => string[]
}

/**
 * Group store — manages all group conversations, members, channels, and roles.
 * Uses immer for efficient immutable updates and persist for local storage.
 */
export const useGroupStore = create<GroupState>()(
  persist(
    immer((set, get) => ({
      groups: {},
      activeGroupId: null,
      activeChannelId: null,
      searchQuery: '',
      groupPresence: {},
      channelTyping: {},

      // ─── Group Actions ─────────────────────────────────────────────────

      createGroup: (params) => {
        const groupId = generateId()
        const defaultChannelId = generateId()
        const now = Date.now()

        const defaultChannel: GroupChannel = {
          id: defaultChannelId,
          groupId,
          name: 'general',
          description: 'General discussion',
          type: 'text',
          position: 0,
          permissions: {
            send: ['owner', 'admin', 'moderator', 'member'],
            read: ['owner', 'admin', 'moderator', 'member', 'guest'],
            manage: ['owner', 'admin'],
          },
          unreadCount: 0,
          lastActivity: now,
        }

        const ownerMember: GroupMember = {
          publicKey: params.ownerId,
          displayName: params.ownerDisplayName,
          role: 'owner',
          joinedAt: now,
          canPost: true,
        }

        const group: Group = {
          id: groupId,
          name: params.name,
          description: params.description,
          avatar: params.avatar,
          members: [ownerMember],
          channels: [defaultChannel],
          activeChannelId: defaultChannelId,
          createdAt: now,
          ownerId: params.ownerId,
          isPublic: params.isPublic ?? false,
          maxMembers: params.maxMembers ?? 100,
          inviteKey: undefined,
        }

        set((state) => {
          state.groups[groupId] = group
          state.activeGroupId = groupId
          state.activeChannelId = defaultChannelId
        })

        return group
      },

      joinGroup: (group) => {
        set((state) => {
          state.groups[group.id] = group
        })
      },

      leaveGroup: (groupId) => {
        set((state) => {
          delete state.groups[groupId]
          if (state.activeGroupId === groupId) {
            state.activeGroupId = null
            state.activeChannelId = null
          }
        })
      },

      updateGroup: (groupId, updates) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          Object.assign(group, updates, { updatedAt: Date.now() })
        })
      },

      setActiveGroup: (groupId, channelId) => {
        set((state) => {
          state.activeGroupId = groupId
          if (channelId !== undefined) {
            state.activeChannelId = channelId
          } else if (groupId) {
            const group = state.groups[groupId]
            if (group && group.channels.length > 0) {
              state.activeChannelId = group.activeChannelId ?? group.channels[0].id
            }
          } else {
            state.activeChannelId = null
          }
        })
      },

      // ─── Member Actions ────────────────────────────────────────────────

      addMember: (groupId, member) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          if (group.members.length >= group.maxMembers) return
          const exists = group.members.some((m) => m.publicKey === member.publicKey)
          if (exists) return
          group.members.push(member)
          group.updatedAt = Date.now()
        })
      },

      removeMember: (groupId, publicKey) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          if (group.ownerId === publicKey) return // Can't remove owner
          group.members = group.members.filter((m) => m.publicKey !== publicKey)
          group.updatedAt = Date.now()
        })
      },

      updateMember: (groupId, publicKey, updates) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          const member = group.members.find((m) => m.publicKey === publicKey)
          if (!member) return
          Object.assign(member, updates)
        })
      },

      setMemberRole: (groupId, publicKey, role) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          const member = group.members.find((m) => m.publicKey === publicKey)
          if (!member) return
          // Only owner can assign 'owner' role
          if (role === 'owner' && group.ownerId !== publicKey) return
          member.role = role
        })
      },

      muteMember: (groupId, publicKey, mutedBy) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          const member = group.members.find((m) => m.publicKey === publicKey)
          if (!member) return
          member.mutedBy = mutedBy
          member.canPost = false
        })
      },

      unmuteMember: (groupId, publicKey) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          const member = group.members.find((m) => m.publicKey === publicKey)
          if (!member) return
          member.mutedBy = undefined
          member.canPost = true
        })
      },

      // ─── Channel Actions ───────────────────────────────────────────────

      addChannel: (groupId, params) => {
        const channelId = generateId()
        let newChannel: GroupChannel | null = null

        set((state) => {
          const group = state.groups[groupId]
          if (!group) return

          const maxPosition = group.channels.reduce((max, ch) => Math.max(max, ch.position), -1)

          newChannel = {
            id: channelId,
            groupId,
            name: params.name.toLowerCase().replace(/\s+/g, '-'),
            description: params.description,
            type: params.type,
            position: maxPosition + 1,
            permissions: params.permissions ?? {
              send: ['owner', 'admin', 'moderator', 'member'],
              read: ['owner', 'admin', 'moderator', 'member', 'guest'],
              manage: ['owner', 'admin'],
            },
            unreadCount: 0,
          }

          group.channels.push(newChannel)
        })

        return newChannel
      },

      removeChannel: (groupId, channelId) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          // Don't remove the last channel
          if (group.channels.length <= 1) return
          group.channels = group.channels.filter((ch) => ch.id !== channelId)
          // If we removed the active channel, switch to the first one
          if (state.activeChannelId === channelId) {
            state.activeChannelId = group.channels[0]?.id ?? null
          }
          // Re-index positions
          group.channels.forEach((ch, idx) => {
            ch.position = idx
          })
        })
      },

      updateChannel: (groupId, channelId, updates) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          const channel = group.channels.find((ch) => ch.id === channelId)
          if (!channel) return
          Object.assign(channel, updates)
        })
      },

      setActiveChannel: (channelId) => {
        set((state) => {
          state.activeChannelId = channelId
          // Also update the group's activeChannelId
          if (state.activeGroupId) {
            const group = state.groups[state.activeGroupId]
            if (group) {
              group.activeChannelId = channelId ?? undefined
            }
          }
        })
      },

      incrementChannelUnread: (groupId, channelId) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          const channel = group.channels.find((ch) => ch.id === channelId)
          if (!channel) return
          // Don't increment if this is the active channel
          if (state.activeGroupId === groupId && state.activeChannelId === channelId) return
          channel.unreadCount += 1
          channel.lastActivity = Date.now()
        })
      },

      clearChannelUnread: (groupId, channelId) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          const channel = group.channels.find((ch) => ch.id === channelId)
          if (!channel) return
          channel.unreadCount = 0
        })
      },

      pinChannelMessage: (groupId, channelId, messageId) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          const channel = group.channels.find((ch) => ch.id === channelId)
          if (!channel) return
          if (!channel.pinnedMessageIds) {
            channel.pinnedMessageIds = []
          }
          if (!channel.pinnedMessageIds.includes(messageId)) {
            channel.pinnedMessageIds.push(messageId)
          }
        })
      },

      unpinChannelMessage: (groupId, channelId, messageId) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          const channel = group.channels.find((ch) => ch.id === channelId)
          if (!channel) return
          if (channel.pinnedMessageIds) {
            channel.pinnedMessageIds = channel.pinnedMessageIds.filter((id) => id !== messageId)
          }
        })
      },

      setChannelTyping: (groupId, channelId, publicKey, displayName, isTyping) => {
        set((state) => {
          if (!state.channelTyping[groupId]) {
            state.channelTyping[groupId] = {}
          }
          if (!state.channelTyping[groupId][channelId]) {
            state.channelTyping[groupId][channelId] = {}
          }
          if (isTyping) {
            state.channelTyping[groupId][channelId][publicKey] = {
              displayName,
              isTyping: true,
              timestamp: Date.now(),
            }
          } else {
            delete state.channelTyping[groupId][channelId][publicKey]
          }
        })
      },

      getChannelTypingUsers: (groupId, channelId) => {
        const typing = get().channelTyping[groupId]?.[channelId]
        if (!typing) return []
        // Filter out entries older than 5 seconds
        const now = Date.now()
        return Object.entries(typing)
          .filter(([_, data]) => data.isTyping && now - data.timestamp < 5000)
          .map(([publicKey, data]) => ({ publicKey, displayName: data.displayName }))
      },

      addGroupActivity: (groupId, activity) => {
        set((state) => {
          const group = state.groups[groupId]
          if (!group) return
          if (!group.activityLog) {
            group.activityLog = []
          }
          group.activityLog.unshift(activity)
          // Keep only the last 100 activities
          if (group.activityLog.length > 100) {
            group.activityLog = group.activityLog.slice(0, 100)
          }
        })
      },

      getGroupActivity: (groupId, limit = 50) => {
        const group = get().groups[groupId]
        if (!group || !group.activityLog) return []
        return group.activityLog.slice(0, limit)
      },

      // ─── Invite Actions ────────────────────────────────────────────────

      generateInviteKey: (groupId) => {
        const bytes = new Uint8Array(24)
        crypto.getRandomValues(bytes)
        const inviteKey = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')

        set((state) => {
          const group = state.groups[groupId]
          if (group) {
            group.inviteKey = inviteKey
          }
        })

        return inviteKey
      },

      // ─── Selectors ─────────────────────────────────────────────────────

      getGroup: (groupId) => get().groups[groupId],

      getAllGroups: () => {
        return Object.values(get().groups).sort((a, b) => b.createdAt - a.createdAt)
      },

      getFilteredGroups: () => {
        const { groups, searchQuery } = get()
        let list = Object.values(groups)

        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          list = list.filter(
            (g) =>
              g.name.toLowerCase().includes(q) ||
              g.description?.toLowerCase().includes(q)
          )
        }

        return list.sort((a, b) => b.createdAt - a.createdAt)
      },

      getActiveGroup: () => {
        const { activeGroupId, groups } = get()
        return activeGroupId ? groups[activeGroupId] : undefined
      },

      getMembers: (groupId) => {
        const group = get().groups[groupId]
        if (!group) return []
        // Sort by role hierarchy: owner > admin > moderator > member > guest
        const roleOrder: Record<string, number> = {
          owner: 0,
          admin: 1,
          moderator: 2,
          member: 3,
          guest: 4,
        }
        return [...group.members].sort(
          (a, b) => (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5)
        )
      },

      getChannels: (groupId) => {
        const group = get().groups[groupId]
        if (!group) return []
        return [...group.channels].sort((a, b) => a.position - b.position)
      },

      getActiveChannel: () => {
        const { activeGroupId, activeChannelId, groups } = get()
        if (!activeGroupId || !activeChannelId) return undefined
        const group = groups[activeGroupId]
        if (!group) return undefined
        return group.channels.find((ch) => ch.id === activeChannelId)
      },

      isAdmin: (groupId, publicKey) => {
        const group = get().groups[groupId]
        if (!group) return false
        if (group.ownerId === publicKey) return true
        const member = group.members.find((m) => m.publicKey === publicKey)
        return member?.role === 'admin' || member?.role === 'owner'
      },

      updateMemberPresence: (groupId, publicKey, status, customStatus) => {
        set((state) => {
          if (!state.groupPresence[groupId]) {
            state.groupPresence[groupId] = {}
          }
          state.groupPresence[groupId][publicKey] = status

          // Also update the member's status fields directly on the GroupMember object
          const group = state.groups[groupId]
          if (group) {
            const member = group.members.find((m) => m.publicKey === publicKey)
            if (member) {
              member.status = status
              member.lastSeen = Date.now()
              if (customStatus !== undefined) {
                member.customStatus = customStatus
              }
            }
          }
        })
      },

      getOnlineMembers: (groupId) => {
        const presence = get().groupPresence[groupId]
        if (!presence) return []
        return Object.entries(presence)
          .filter(([_, status]) => status === 'online')
          .map(([publicKey]) => publicKey)
      },
    })),
    {
      name: 'asgard-groups',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
