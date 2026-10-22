/**
 * Autorisation des mises à jour de groupe côté réception.
 *
 * Une signature prouve qui parle, pas ce que l'expéditeur a le droit de faire.
 * Ces tests fixent la règle : métadonnées, rôles, exclusions, canaux, mutes et
 * messages ne s'appliquent que si l'émetteur est le membre concerné ou un
 * administrateur du groupe local.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { groupService } from '@/services/GroupService'
import { p2pService } from '@/services/P2PService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useGroupStore } from '@/stores/groupStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import type { GroupMember, Message, ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)
const D = '9'.repeat(64)
const E = 'e'.repeat(64)
const F = 'f'.repeat(64)

function member(publicKey: string, displayName: string, role: GroupMember['role']): GroupMember {
  return { publicKey, displayName, role, joinedAt: 1_700_000_000_000, canPost: true }
}

type Handler =
  | 'handleGroupUpdate'
  | 'handleGroupMessage'
  | 'handleGroupReceipt'
  | 'handleGroupTyping'
  | 'handleGroupRead'
  | 'handleGroupPin'

const dispatch = (
  handler: Handler,
  payload: Record<string, unknown>,
  from: string,
  type = 'group:update',
): void => {
  const fn = (groupService as unknown as Record<Handler, (msg: ProtocolMessage) => void>)[handler].bind(groupService)
  fn({ id: 'envelope-1', from, to: A, type, timestamp: Date.now(), payload } as unknown as ProtocolMessage)
}

let groupId = ''
let channelId = ''
const group = () => useGroupStore.getState().getGroup(groupId)!
const roleOf = (key: string) => group().members.find((m) => m.publicKey === key)?.role

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: A, secretKey: 'f'.repeat(128) },
      profile: { publicKey: A, displayName: 'Alice', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
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

  const created = useGroupStore.getState().createGroup({
    name: 'Équipe',
    ownerId: A,
    ownerDisplayName: 'Alice',
  })
  groupId = created.id
  channelId = created.channels[0].id
  // Un second canal : le store refuse de supprimer le dernier.
  useGroupStore.getState().addChannel(created.id, { name: 'projets', type: 'text' })
  useGroupStore.getState().addMember(created.id, member(B, 'Bob', 'admin'))
  useGroupStore.getState().addMember(created.id, member(C, 'Carol', 'member'))

  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'broadcastToPeers').mockResolvedValue({ sent: 1, failed: 0, unmapped: 0 })
  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.mocked(p2pService.sendMessage).mockRestore()
  vi.mocked(p2pService.broadcastToPeers).mockRestore()
  vi.mocked(storageService.saveMessage).mockRestore()
})

describe('métadonnées', () => {
  it('ignore une modification venue d’un simple membre', () => {
    dispatch('handleGroupUpdate', { action: 'metadata:update', groupId, updates: { name: 'Renommé' } }, C)
    expect(group().name).toBe('Équipe')
  })

  it('applique les champs éditables d’un admin sans laisser réécrire l’effectif ni le propriétaire', () => {
    dispatch('handleGroupUpdate', {
      action: 'metadata:update',
      groupId,
      updates: { name: 'Renommé', isPublic: true, ownerId: D, members: [], inviteKey: 'volé' },
    }, B)

    const updated = group()
    expect(updated.name).toBe('Renommé')
    expect(updated.isPublic).toBe(true)
    expect(updated.ownerId).toBe(A)
    expect(updated.inviteKey).not.toBe('volé')
    expect(updated.members).toHaveLength(3)
  })
})

describe('rôles et effectif', () => {
  it('refuse une auto-promotion', () => {
    dispatch('handleGroupUpdate', { action: 'member:role', groupId, targetPublicKey: C, newRole: 'admin' }, C)
    expect(roleOf(C)).toBe('member')
  })

  it('accepte une promotion d’admin mais jamais la propriété', () => {
    dispatch('handleGroupUpdate', { action: 'member:role', groupId, targetPublicKey: C, newRole: 'admin' }, B)
    expect(roleOf(C)).toBe('admin')

    dispatch('handleGroupUpdate', { action: 'member:role', groupId, targetPublicKey: C, newRole: 'owner' }, A)
    expect(roleOf(C)).toBe('admin')
    expect(group().ownerId).toBe(A)
  })

  it('refuse une exclusion demandée par un membre non admin', () => {
    dispatch('handleGroupUpdate', { action: 'member:removed', groupId, targetPublicKey: B }, C)
    expect(group().members.some((m) => m.publicKey === B)).toBe(true)
  })

  it('applique une exclusion demandée par un admin', () => {
    dispatch('handleGroupUpdate', { action: 'member:removed', groupId, targetPublicKey: C }, B)
    expect(group().members.some((m) => m.publicKey === C)).toBe(false)
  })

  it('applique un kick reçu sans cible et quitte le groupe', () => {
    useConversationStore.getState().addConversation({
      id: groupId,
      type: 'group',
      groupId,
      unreadCount: 0,
      muted: false,
      pinned: false,
      archived: false,
      createdAt: 1,
      updatedAt: 1,
    })

    dispatch('handleGroupUpdate', { action: 'member:kicked', groupId }, B)

    expect(useGroupStore.getState().getGroup(groupId)).toBeUndefined()
    expect(useConversationStore.getState().getConversation(groupId)).toBeUndefined()
  })

  it('n’accepte un départ qu’au nom du partant', () => {
    dispatch('handleGroupUpdate', { action: 'member:left', groupId, publicKey: B }, C)
    expect(group().members.some((m) => m.publicKey === B)).toBe(true)

    dispatch('handleGroupUpdate', { action: 'member:left', groupId, publicKey: C }, C)
    expect(group().members.some((m) => m.publicKey === C)).toBe(false)
  })

  it('n’accepte un join que du rejoignant ou d’un membre qui le relaie', () => {
    dispatch('handleGroupUpdate', {
      action: 'member:joined',
      groupId,
      member: { ...member(E, 'Eve', 'member') },
    }, D)
    expect(group().members.some((m) => m.publicKey === E)).toBe(false)

    dispatch('handleGroupUpdate', {
      action: 'member:joined',
      groupId,
      member: { ...member(E, 'Eve', 'owner') },
    }, E)
    expect(group().members.find((m) => m.publicKey === E)?.role).toBe('member')

    dispatch('handleGroupUpdate', {
      action: 'member:joined',
      groupId,
      member: { ...member(F, 'Frank', 'admin') },
    }, B)
    expect(group().members.find((m) => m.publicKey === F)?.role).toBe('member')
  })
})

describe('canaux', () => {
  it('refuse ajout et suppression à un simple membre', () => {
    dispatch('handleGroupUpdate', {
      action: 'channel:add',
      groupId,
      channel: {
        id: 'chan-intrus', groupId, name: 'intrus', type: 'text', position: 9,
        permissions: { send: ['member'], read: ['member'], manage: ['member'] },
        unreadCount: 0,
      },
    }, C)
    expect(group().channels.some((ch) => ch.id === 'chan-intrus')).toBe(false)

    const extra = group().channels[1].id
    dispatch('handleGroupUpdate', { action: 'channel:remove', groupId, channelId: extra }, C)
    expect(group().channels.some((ch) => ch.id === extra)).toBe(true)
  })

  it('assainit le canal créé par un admin', () => {
    dispatch('handleGroupUpdate', {
      action: 'channel:add',
      groupId,
      channel: {
        id: 'chan-veille', groupId, name: 'veille', type: 'inconnu', position: 3,
        permissions: { send: ['root'], read: ['member'], manage: ['admin'] },
        unreadCount: 99,
      },
    }, B)

    const channel = group().channels.find((ch) => ch.id === 'chan-veille')!
    expect(channel).toBeDefined()
    expect(channel.type).toBe('text')
    expect(channel.permissions.send).toEqual([])
    expect(channel.unreadCount).toBe(0)
  })

  it('applique la suppression demandée par un admin', () => {
    const extra = group().channels[1].id
    dispatch('handleGroupUpdate', { action: 'channel:remove', groupId, channelId: extra }, B)
    expect(group().channels.some((ch) => ch.id === extra)).toBe(false)
  })
})

describe('mute', () => {
  it('refuse un mute venu d’un membre', () => {
    dispatch('handleGroupUpdate', { action: 'member:muted', groupId, targetPublicKey: B, mutedBy: C }, C)
    expect(group().members.find((m) => m.publicKey === B)?.canPost).toBe(true)
  })

  it('applique un mute d’admin en attribuant l’auteur réel', () => {
    dispatch('handleGroupUpdate', { action: 'member:muted', groupId, targetPublicKey: C, mutedBy: D }, B)
    const target = group().members.find((m) => m.publicKey === C)!
    expect(target.canPost).toBe(false)
    expect(target.mutedBy).toBe(B)
  })
})

describe('messages et accusés', () => {
  it('refuse un message d’un non-membre ou signé au nom d’un autre', () => {
    const base = {
      id: 'm-forged', conversationId: channelId, type: 'text', content: 'usurpé', timestamp: 1, status: 'sent',
    }
    dispatch('handleGroupMessage', {
      groupId, channelId, message: { ...base, senderId: D },
    }, D, 'group:message')
    dispatch('handleGroupMessage', {
      groupId, channelId, message: { ...base, id: 'm-forged-2', senderId: B },
    }, C, 'group:message')

    expect(useMessageStore.getState().messages[channelId]).toBeUndefined()
  })

  it('accepte un message de membre et le range dans le canal', () => {
    dispatch('handleGroupMessage', {
      groupId,
      channelId,
      message: {
        id: 'm-ok', conversationId: channelId, senderId: C, type: 'text', content: 'bonjour', timestamp: 1, status: 'sent',
      },
    }, C, 'group:message')

    expect(useMessageStore.getState().messages[channelId]?.some((m: Message) => m.id === 'm-ok')).toBe(true)
  })

  it('n’accepte un accusé que dans le nom de son émetteur', () => {
    useMessageStore.getState().addMessage({
      id: 'm1',
      conversationId: channelId,
      senderId: A,
      type: 'text',
      content: 'coucou',
      timestamp: 1,
      status: 'sent',
    } as Message)

    dispatch('handleGroupReceipt', {
      groupId, channelId, messageIds: ['m1'], status: 'delivered', readerPublicKey: B, timestamp: Date.now(),
    }, C, 'group:receipt')
    dispatch('handleGroupReceipt', {
      groupId, channelId, messageIds: ['m1'], status: 'delivered', readerPublicKey: C, timestamp: Date.now(),
    }, C, 'group:receipt')

    const stored = useMessageStore.getState().messages[channelId].find((m) => m.id === 'm1')!
    expect(stored.deliveryReceipts?.[B]).toBeUndefined()
    expect(stored.deliveryReceipts?.[C]).toBe('delivered')
  })
})

describe('indicateurs et épingles', () => {
  it('n’affiche pas un « en train d’écrire » usurpé', () => {
    dispatch('handleGroupTyping', {
      groupId, channelId, publicKey: B, displayName: 'Usurpateur', isTyping: true,
    }, C, 'group:typing')

    expect(useGroupStore.getState().channelTyping[groupId]?.[channelId]?.[B]).toBeUndefined()

    dispatch('handleGroupTyping', {
      groupId, channelId, publicKey: C, displayName: 'Faux nom', isTyping: true,
    }, C, 'group:typing')

    expect(useGroupStore.getState().channelTyping[groupId][channelId][C].displayName).toBe('Carol')
  })

  it('réserve l’épingle aux rôles de modération', () => {
    dispatch('handleGroupPin', { groupId, channelId, messageId: 'm1', action: 'pin' }, C, 'group:pin')
    expect(group().channels.find((ch) => ch.id === channelId)?.pinnedMessageIds ?? []).not.toContain('m1')

    dispatch('handleGroupPin', { groupId, channelId, messageId: 'm1', action: 'pin' }, B, 'group:pin')
    expect(group().channels.find((ch) => ch.id === channelId)?.pinnedMessageIds).toContain('m1')
  })
})
