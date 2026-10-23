/**
 * Group invites carry a full snapshot of the group. The old invite only sent
 * the name, so the joiner rebuilt the group with a locally generated « general »
 * channel whose id matched nobody else's: every message the joiner sent landed
 * in a channel the other members had never heard of, and the inviter never
 * learned the invitee had joined.
 */
import type { Group, GroupChannel, GroupMember, MemberRole, ChannelType } from '@/types'

const ROLES: readonly MemberRole[] = ['owner', 'admin', 'moderator', 'member', 'guest']
const CHANNEL_TYPES: readonly ChannelType[] = ['text', 'announcement', 'voice', 'readonly']

const DEFAULT_PERMISSIONS: GroupChannel['permissions'] = {
  send: ['owner', 'admin', 'moderator', 'member'],
  read: ['owner', 'admin', 'moderator', 'member', 'guest'],
  manage: ['owner', 'admin'],
}

const isRole = (value: unknown): value is MemberRole =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value)

/** Same cap as the store: an exclusion list must stay bounded. */
const MAX_KICKED = 256

const isChannelType = (value: unknown): value is ChannelType =>
  typeof value === 'string' && (CHANNEL_TYPES as readonly string[]).includes(value)

const asString = (value: unknown, maxLength: number): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : undefined

const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export interface InviteRecipient {
  publicKey: string
  displayName: string
}

/**
 * Payload sent over `group:invite { action: 'invite' }`. Avatars never travel
 * in signed messages — the group icon keeps going through the binary channel.
 */
export function buildGroupInvitePayload(group: Group, inviter: InviteRecipient): Record<string, unknown> {
  return {
    action: 'invite',
    groupId: group.id,
    groupName: group.name,
    groupDescription: group.description,
    hasAvatar: !!group.avatar,
    inviteKey: group.inviteKey,
    inviterPublicKey: inviter.publicKey,
    inviterDisplayName: inviter.displayName,
    ownerId: group.ownerId,
    createdAt: group.createdAt,
    isPublic: group.isPublic,
    maxMembers: group.maxMembers,
    activeChannelId: group.activeChannelId,
    kickedMembers: (group.kickedMembers ?? []).slice(-MAX_KICKED),
    members: group.members.map((member) => ({
      publicKey: member.publicKey,
      displayName: member.displayName,
      role: member.role,
      joinedAt: member.joinedAt,
      canPost: member.canPost,
    })),
    channels: group.channels.map((channel) => ({
      id: channel.id,
      groupId: channel.groupId,
      name: channel.name,
      description: channel.description,
      type: channel.type,
      position: channel.position,
      permissions: channel.permissions,
    })),
  }
}

function defaultChannel(groupId: string): GroupChannel {
  return {
    id: `general-${groupId}`,
    groupId,
    name: 'general',
    type: 'text',
    position: 0,
    permissions: {
      send: [...DEFAULT_PERMISSIONS.send],
      read: [...DEFAULT_PERMISSIONS.read],
      manage: [...DEFAULT_PERMISSIONS.manage],
    },
    unreadCount: 0,
  }
}

function normalizePermissions(raw: unknown): GroupChannel['permissions'] {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const pick = (key: 'send' | 'read' | 'manage'): MemberRole[] => {
    const value = source[key]
    if (!Array.isArray(value)) return [...DEFAULT_PERMISSIONS[key]]
    return value.filter(isRole)
  }
  return { send: pick('send'), read: pick('read'), manage: pick('manage') }
}

/**
 * Rebuilds the group a joiner should see from an invite payload. Returns null
 * for a payload missing the identity of the group itself.
 */
export function groupFromInvite(
  payload: Record<string, unknown>,
  self: InviteRecipient,
): Group | null {
  const id = asString(payload.groupId, 128)
  const name = asString(payload.groupName, 200)
  if (!id || !name) return null

  const kickedMembers: string[] = []
  if (Array.isArray(payload.kickedMembers)) {
    for (const raw of payload.kickedMembers.slice(-MAX_KICKED)) {
      const publicKey = asString(raw, 256)
      if (publicKey && !kickedMembers.includes(publicKey)) kickedMembers.push(publicKey)
    }
  }
  // A stale invite must not resurrect a member an admin removed.
  if (kickedMembers.includes(self.publicKey)) return null

  const members: GroupMember[] = []
  const seenMembers = new Set<string>()
  const rawMembers = Array.isArray(payload.members) ? payload.members : []
  for (const raw of rawMembers.slice(0, 1000)) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Record<string, unknown>
    const publicKey = asString(entry.publicKey, 256)
    if (!publicKey || seenMembers.has(publicKey)) continue
    // The roster in a snapshot may lag behind a kick: the tombstone wins.
    if (kickedMembers.includes(publicKey)) continue
    seenMembers.add(publicKey)
    members.push({
      publicKey,
      displayName: asString(entry.displayName, 200) ?? publicKey.slice(0, 8),
      role: isRole(entry.role) ? entry.role : 'member',
      joinedAt: asFiniteNumber(entry.joinedAt) ?? Date.now(),
      canPost: entry.canPost !== false,
    })
  }

  // The invite is addressed to us: it makes us a member, never an admin.
  const selfEntry = members.find((member) => member.publicKey === self.publicKey)
  if (selfEntry) {
    selfEntry.role = 'member'
    selfEntry.canPost = true
    if (self.displayName) selfEntry.displayName = self.displayName
  } else {
    members.push({
      publicKey: self.publicKey,
      displayName: self.displayName,
      role: 'member',
      joinedAt: Date.now(),
      canPost: true,
    })
  }

  const ownerId =
    asString(payload.ownerId, 256) ??
    asString(payload.inviterPublicKey, 256) ??
    members.find((member) => member.role === 'owner')?.publicKey
  if (!ownerId) return null

  // A snapshot must not mint a second owner: only the declared one keeps it.
  for (const member of members) {
    if (member.publicKey !== ownerId && member.role === 'owner') member.role = 'admin'
  }

  const channels: GroupChannel[] = []
  const seenChannels = new Set<string>()
  const rawChannels = Array.isArray(payload.channels) ? payload.channels : []
  for (const raw of rawChannels.slice(0, 100)) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Record<string, unknown>
    const channelId = asString(entry.id, 256)
    if (!channelId || seenChannels.has(channelId)) continue
    seenChannels.add(channelId)
    channels.push({
      id: channelId,
      groupId: id,
      name: asString(entry.name, 100) ?? 'general',
      description: asString(entry.description, 500),
      type: isChannelType(entry.type) ? entry.type : 'text',
      position: asFiniteNumber(entry.position) ?? channels.length,
      permissions: normalizePermissions(entry.permissions),
      unreadCount: 0,
    })
  }
  if (channels.length === 0) channels.push(defaultChannel(id))
  channels.sort((a, b) => a.position - b.position)
  channels.forEach((channel, index) => { channel.position = index })

  const requestedActive = asString(payload.activeChannelId, 256)
  const activeChannelId =
    requestedActive && channels.some((channel) => channel.id === requestedActive)
      ? requestedActive
      : channels[0].id

  const maxMembers = Math.max(
    Math.min(Math.max(1, Math.floor(asFiniteNumber(payload.maxMembers) ?? 100)), 10_000),
    members.length,
  )

  return {
    id,
    name,
    description: asString(payload.groupDescription, 2000),
    avatar: undefined,
    members,
    channels,
    activeChannelId,
    createdAt: asFiniteNumber(payload.createdAt) ?? Date.now(),
    ownerId,
    isPublic: payload.isPublic === true,
    maxMembers,
    inviteKey: asString(payload.inviteKey, 256),
    ...(kickedMembers.length > 0 ? { kickedMembers } : {}),
  }
}
