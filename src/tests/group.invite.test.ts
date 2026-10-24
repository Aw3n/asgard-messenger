/**
 * Invitation de groupe de bout en bout : l'invitant envoie un instantané
 * complet (membres + canaux), le rejoint reconstruit le même groupe — mêmes
 * identifiants de canaux — puis s'annonce aux membres. L'ancien chemin ne
 * transmettait que le nom : le rejoint inventait un canal « general » local et
 * l'invitant n'apprenait jamais son arrivée.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { groupService } from '@/services/GroupService'
import { p2pService } from '@/services/P2PService'
import { cryptoService } from '@/services/CryptoService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useGroupStore } from '@/stores/groupStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import { buildGroupInvitePayload, groupFromInvite } from '@/utils/groupInvite'
import type { Group, GroupChannel, GroupMember, ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)
const D = '9'.repeat(64)

function member(publicKey: string, displayName: string, role: GroupMember['role']): GroupMember {
  return { publicKey, displayName, role, joinedAt: 1_700_000_000_000, canPost: true }
}

function channel(id: string, position: number): GroupChannel {
  return {
    id,
    groupId: 'group-1',
    name: position === 0 ? 'general' : 'projets',
    type: 'text',
    position,
    permissions: {
      send: ['owner', 'admin', 'moderator', 'member'],
      read: ['owner', 'admin', 'moderator', 'member', 'guest'],
      manage: ['owner', 'admin'],
    },
    unreadCount: 7,
    pinnedMessageIds: ['m1'],
  }
}

function fixtureGroup(): Group {
  return {
    id: 'group-1',
    name: 'Équipe',
    description: 'Le groupe de test',
    avatar: 'data:image/png;base64,AAAA',
    members: [member(A, 'Alice', 'owner'), member(C, 'Carol', 'member')],
    channels: [channel('chan-general', 0), channel('chan-projects', 1)],
    activeChannelId: 'chan-general',
    createdAt: 1_700_000_000_000,
    ownerId: A,
    isPublic: false,
    maxMembers: 42,
    inviteKey: 'invite-key-1',
  }
}

const seedIdentity = (publicKey: string, displayName: string) => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey, secretKey: 'f'.repeat(128) },
      profile: { publicKey, displayName, status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
}

const resetStores = () => {
  useGroupStore.setState({
    groups: {},
    activeGroupId: null,
    activeChannelId: null,
    searchQuery: '',
    groupPresence: {},
    channelTyping: {},
  })
  useConversationStore.setState({ conversations: {}, activeConversationId: null })
  useMessageStore.setState({
    messages: {},
    loading: {},
    hasMore: {},
    pending: {},
    drafts: {},
    scheduledMessages: [],
    templates: [],
  })
}

/** Accès au chemin privé d'application d'une invitation, pour l'attendre. */
const acceptInvite = (payload: Record<string, unknown>, sender: string): Promise<void> =>
  (groupService as unknown as {
    acceptGroupInvite: (payload: Record<string, unknown>, sender: string) => Promise<void>
  }).acceptGroupInvite(payload, sender)

const applyUpdate = (payload: Record<string, unknown>, from: string): void => {
  const handler = (groupService as unknown as {
    handleGroupUpdate: (msg: ProtocolMessage) => void
  }).handleGroupUpdate.bind(groupService)
  handler({ id: 'm1', from, to: 'self', type: 'group:update', payload, timestamp: Date.now() } as unknown as ProtocolMessage)
}

beforeEach(() => {
  seedIdentity(A, 'Alice')
  resetStores()
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'broadcastToPeers').mockResolvedValue({ sent: 1, failed: 0, unmapped: 0 })
  vi.spyOn(p2pService, 'joinTopic').mockResolvedValue(undefined)
  vi.spyOn(cryptoService, 'deriveGroupTopic').mockResolvedValue('d'.repeat(64))
  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.mocked(p2pService.sendMessage).mockRestore()
  vi.mocked(p2pService.broadcastToPeers).mockRestore()
  vi.mocked(p2pService.joinTopic).mockRestore()
  vi.mocked(cryptoService.deriveGroupTopic).mockRestore()
  vi.mocked(storageService.saveMessage).mockRestore()
})

describe('instantané d’invitation', () => {
  it('transporte membres et canaux, sans avatar ni compteurs locaux', () => {
    const payload = buildGroupInvitePayload(fixtureGroup(), { publicKey: A, displayName: 'Alice' })
    const members = payload.members as Array<Record<string, unknown>>
    const channels = payload.channels as Array<Record<string, unknown>>

    expect(members.map((m) => m.publicKey)).toEqual([A, C])
    expect(members[0].avatar).toBeUndefined()
    expect(channels.map((ch) => ch.id)).toEqual(['chan-general', 'chan-projects'])
    expect(channels[0].unreadCount).toBeUndefined()
    expect(channels[0].pinnedMessageIds).toBeUndefined()
    expect(payload.activeChannelId).toBe('chan-general')
    expect(payload.ownerId).toBe(A)
    expect(payload.maxMembers).toBe(42)
    expect(payload.hasAvatar).toBe(true)
  })

  it('reconstruit le groupe avec les mêmes canaux et ajoute le rejoint comme membre', () => {
    const payload = buildGroupInvitePayload(fixtureGroup(), { publicKey: A, displayName: 'Alice' })
    const group = groupFromInvite(payload, { publicKey: B, displayName: 'Bob' })

    expect(group).not.toBeNull()
    expect(group!.members.map((m) => `${m.publicKey.slice(0, 1)}:${m.role}`)).toEqual([
      'a:owner',
      'c:member',
      'b:member',
    ])
    expect(group!.channels.map((ch) => ch.id)).toEqual(['chan-general', 'chan-projects'])
    expect(group!.activeChannelId).toBe('chan-general')
    expect(group!.channels[0].unreadCount).toBe(0)
    expect(group!.channels[0].pinnedMessageIds).toBeUndefined()
  })

  it('transporte le mode diffusion pour que l’invité sache qu’il ne publie pas', () => {
    const payload = buildGroupInvitePayload(
      { ...fixtureGroup(), broadcastMode: true },
      { publicKey: A, displayName: 'Alice' },
    )
    const group = groupFromInvite(payload, { publicKey: B, displayName: 'Bob' })

    expect(payload.broadcastMode).toBe(true)
    expect(group!.broadcastMode).toBe(true)
  })

  it('ne laisse pas un instantané fabriquer un second propriétaire ni promouvoir le rejoint', () => {
    const payload = buildGroupInvitePayload(fixtureGroup(), { publicKey: A, displayName: 'Alice' })
    const members = (payload.members as Array<Record<string, unknown>>).map((m) =>
      m.publicKey === C ? { ...m, role: 'owner' } : m,
    )
    const withSelfPromoted = [...members, { publicKey: B, displayName: 'Bob', role: 'owner', canPost: false }]
    const group = groupFromInvite({ ...payload, members: withSelfPromoted }, { publicKey: B, displayName: 'Bob' })

    expect(group!.members.find((m) => m.publicKey === C)!.role).toBe('admin')
    expect(group!.members.find((m) => m.publicKey === B)!.role).toBe('member')
    expect(group!.members.find((m) => m.publicKey === B)!.canPost).toBe(true)
    expect(group!.ownerId).toBe(A)
  })

  it('refuse un payload sans identité ou sans propriétaire', () => {
    expect(groupFromInvite({ groupName: 'Sans id' }, { publicKey: B, displayName: 'Bob' })).toBeNull()
    expect(groupFromInvite({ groupId: 'g' }, { publicKey: B, displayName: 'Bob' })).toBeNull()
    expect(groupFromInvite(
      { groupId: 'g', groupName: 'Sans owner', members: [] },
      { publicKey: B, displayName: 'Bob' },
    )).toBeNull()
  })

  it('retombe sur un canal général déterministe et dédoublonne les entrées', () => {
    const payload = buildGroupInvitePayload(fixtureGroup(), { publicKey: A, displayName: 'Alice' })
    const duplicated = [...(payload.members as unknown[]), (payload.members as unknown[])[0]]
    const group = groupFromInvite(
      { ...payload, members: duplicated, channels: [], activeChannelId: 'inconnu' },
      { publicKey: B, displayName: 'Bob' },
    )

    expect(group!.members).toHaveLength(3)
    expect(group!.channels).toHaveLength(1)
    expect(group!.channels[0].id).toBe('general-group-1')
    expect(group!.activeChannelId).toBe('general-group-1')
  })

  it('transporte les exclusions sans les recréer comme membres', () => {
    const payload = buildGroupInvitePayload(
      { ...fixtureGroup(), kickedMembers: [C] },
      { publicKey: A, displayName: 'Alice' },
    )
    // Même si un instantané périmé liste encore l'exclu, la tombe gagne.
    const group = groupFromInvite(payload, { publicKey: B, displayName: 'Bob' })

    expect(group).not.toBeNull()
    expect(group!.members.map((m) => m.publicKey)).not.toContain(C)
    expect(group!.kickedMembers).toEqual([C])

    const compact = buildGroupInvitePayload(fixtureGroup(), { publicKey: A, displayName: 'Alice' })
    expect(compact.kickedMembers).toEqual([])
  })

  it('refuse une invitation qui nous liste comme exclu', async () => {
    const payload = buildGroupInvitePayload(
      { ...fixtureGroup(), kickedMembers: [B] },
      { publicKey: A, displayName: 'Alice' },
    )
    seedIdentity(B, 'Bob')
    resetStores()

    expect(groupFromInvite(payload, { publicKey: B, displayName: 'Bob' })).toBeNull()
    await acceptInvite(payload, A)
    expect(useGroupStore.getState().getGroup('group-1')).toBeUndefined()
  })

  it('inviteMember refuse de réinviter un contact exclu', async () => {
    const group = useGroupStore.getState().createGroup({
      name: 'Équipe',
      ownerId: A,
      ownerDisplayName: 'Alice',
    })
    useGroupStore.getState().markMemberKicked(group.id, B)

    await expect(groupService.inviteMember(group.id, B)).rejects.toThrow()
    expect(vi.mocked(p2pService.sendMessage).mock.calls.some(([, type]) => type === 'group:invite'))
      .toBe(false)
  })
})

describe('GroupService — invitation par contact', () => {
  it('envoie l’instantané complet et l’invité rejoint le même groupe', async () => {
    const group = useGroupStore.getState().createGroup({
      name: 'Équipe',
      ownerId: A,
      ownerDisplayName: 'Alice',
    })
    useGroupStore.getState().addMember(group.id, member(C, 'Carol', 'member'))
    useGroupStore.getState().generateInviteKey(group.id)
    const stored = useGroupStore.getState().getGroup(group.id)!
    const contactKey = B

    await groupService.inviteMember(group.id, contactKey)

    const sent = vi.mocked(p2pService.sendMessage).mock.calls.find(
      ([, type]) => type === 'group:invite',
    )
    expect(sent).toBeTruthy()
    expect(sent![0]).toBe(contactKey)
    const payload = sent![2] as Record<string, unknown>
    expect(payload.action).toBe('invite')
    expect((payload.members as unknown[]).length).toBe(2)
    expect((payload.channels as Array<Record<string, unknown>>).map((ch) => ch.id))
      .toEqual(stored.channels.map((ch) => ch.id))

    // Côté invité : la même identité de groupe, puis une annonce d'arrivée.
    seedIdentity(B, 'Bob')
    resetStores()
    vi.mocked(p2pService.broadcastToPeers).mockClear()

    await acceptInvite(payload, A)

    const joined = useGroupStore.getState().getGroup(stored.id)
    expect(joined).toBeTruthy()
    expect(joined!.members.map((m) => m.publicKey).sort()).toEqual([A, B, C].sort())
    expect(joined!.members.find((m) => m.publicKey === B)!.role).toBe('member')
    expect(joined!.channels.map((ch) => ch.id)).toEqual(stored.channels.map((ch) => ch.id))
    expect(joined!.activeChannelId).toBe(stored.activeChannelId)
    expect(useConversationStore.getState().getConversation(stored.id)).toBeTruthy()
    expect(cryptoService.deriveGroupTopic).toHaveBeenCalledWith(stored.inviteKey)

    const joinNotice = vi.mocked(p2pService.broadcastToPeers).mock.calls.find(
      ([, type, p]) => type === 'group:update' && (p as Record<string, unknown>).action === 'member:joined',
    )
    expect(joinNotice).toBeTruthy()
    expect((joinNotice![2] as { member: GroupMember }).member.publicKey).toBe(B)
  })

  it('n’écrase pas un groupe déjà connu lors d’une invitation répétée', async () => {
    const group = useGroupStore.getState().createGroup({
      name: 'Équipe',
      ownerId: A,
      ownerDisplayName: 'Alice',
    })
    useGroupStore.getState().addMember(group.id, member(C, 'Carol', 'member'))
    const payload = buildGroupInvitePayload(
      useGroupStore.getState().getGroup(group.id)!,
      { publicKey: A, displayName: 'Alice' },
    )

    seedIdentity(B, 'Bob')
    resetStores()
    await acceptInvite(payload, A)
    useGroupStore.getState().setMemberRole(group.id, C, 'admin')

    await acceptInvite(payload, A)

    const joined = useGroupStore.getState().getGroup(group.id)!
    expect(joined.members.find((m) => m.publicKey === C)!.role).toBe('admin')
    expect(joined.members.filter((m) => m.publicKey === B)).toHaveLength(1)
  })

  it('ignore une invitation dont l’expéditeur n’est pas dans le groupe annoncé', async () => {
    const payload = buildGroupInvitePayload(fixtureGroup(), { publicKey: A, displayName: 'Alice' })
    seedIdentity(B, 'Bob')
    resetStores()

    await acceptInvite(payload, D)

    expect(useGroupStore.getState().getGroup('group-1')).toBeUndefined()
  })

  it('applique un member:joined sans jamais accorder le rôle annoncé', () => {
    const group = useGroupStore.getState().createGroup({
      name: 'Équipe',
      ownerId: A,
      ownerDisplayName: 'Alice',
    })

    applyUpdate({
      action: 'member:joined',
      groupId: group.id,
      member: { ...member(B, 'Bob', 'owner'), canPost: true },
    }, B)

    expect(useGroupStore.getState().getGroup(group.id)!.members.find((m) => m.publicKey === B)!.role)
      .toBe('member')
  })
})
