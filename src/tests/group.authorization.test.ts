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
import { useUIStore } from '@/stores/uiStore'
import i18n from '@/i18n/config'
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
  | 'handleGroupReaction'
  | 'handleGroupEdit'
  | 'handleGroupDelete'
  | 'handleGroupMention'

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
  // Pas de Web Audio en jsdom : le son des notifications n'est pas testé ici.
  useUIStore.setState((state) => ({
    settings: { ...state.settings, notifications: { ...state.settings.notifications, sound: false } },
  }))

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
  vi.spyOn(storageService, 'deleteMessage').mockResolvedValue(true)
})

afterEach(() => {
  vi.mocked(p2pService.sendMessage).mockRestore()
  vi.mocked(p2pService.broadcastToPeers).mockRestore()
  vi.mocked(storageService.saveMessage).mockRestore()
  vi.mocked(storageService.deleteMessage).mockRestore()
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

  it('ignore un kick adressé au propriétaire', () => {
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

    expect(group().members.some((m) => m.publicKey === A)).toBe(true)
    expect(useGroupStore.getState().getGroup(groupId)).toBeDefined()
    expect(useConversationStore.getState().getConversation(groupId)).toBeDefined()
  })

  it('applique un kick reçu sans cible et quitte le groupe', () => {
    const identity = useIdentityStore.getState().identity!
    useIdentityStore.setState({
      identity: { ...identity, keyPair: { ...identity.keyPair, publicKey: C } },
    })
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

  it('kickMember refuse le propriétaire sans envoyer de kick', async () => {
    await expect(groupService.kickMember(groupId, A)).rejects.toThrow()
    expect(p2pService.sendMessage).not.toHaveBeenCalled()
    expect(group().members.some((m) => m.publicKey === A)).toBe(true)
  })

  it('kickMember inscrit une exclusion que le join ne contourne pas', async () => {
    await groupService.kickMember(groupId, C)

    expect(group().members.some((m) => m.publicKey === C)).toBe(false)
    expect(group().kickedMembers).toContain(C)

    dispatch('handleGroupUpdate', {
      action: 'member:joined',
      groupId,
      member: member(C, 'Carol', 'member'),
    }, C)
    expect(group().members.some((m) => m.publicKey === C)).toBe(false)
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

  it('borne la liste des épingles et ignore une action ou un id hors format', () => {
    for (let index = 0; index < 150; index++) {
      dispatch('handleGroupPin', {
        groupId, channelId, messageId: `p${index}`, action: 'pin',
      }, B, 'group:pin')
    }
    const pins = group().channels.find((ch) => ch.id === channelId)!.pinnedMessageIds!
    expect(pins).toHaveLength(100)
    expect(pins).not.toContain('p0')
    expect(pins).toContain('p149')

    dispatch('handleGroupPin', { groupId, channelId, messageId: 'efface', action: 'erase' }, B, 'group:pin')
    dispatch('handleGroupPin', {
      groupId, channelId, messageId: 'k'.repeat(200), action: 'pin',
    }, B, 'group:pin')
    const after = group().channels.find((ch) => ch.id === channelId)!.pinnedMessageIds!
    expect(after).not.toContain('efface')
    expect(after).not.toContain('k'.repeat(200))
  })
})

describe('réactions', () => {
  const seedMessage = (id: string, conversationId = channelId) => {
    useMessageStore.getState().addMessage({
      id,
      conversationId,
      senderId: A,
      type: 'text',
      content: 'salut',
      timestamp: 1,
      status: 'sent',
    } as Message)
  }
  const reactionsOf = (id: string, conversationId = channelId) =>
    useMessageStore.getState().getMessage(id, conversationId)?.reactions ?? []

  it('applique la réaction d’un membre et la persiste', () => {
    seedMessage('m-react')

    dispatch('handleGroupReaction', {
      groupId, channelId, messageId: 'm-react', emoji: '👍', action: 'add',
    }, C, 'group:reaction')

    expect(reactionsOf('m-react')).toEqual([{ emoji: '👍', users: [C], count: 1 }])
    expect(storageService.saveMessage).toHaveBeenCalled()
  })

  it('ignore une réaction d’un non-membre', () => {
    seedMessage('m-react')

    dispatch('handleGroupReaction', {
      groupId, channelId, messageId: 'm-react', emoji: '👍', action: 'add',
    }, D, 'group:reaction')

    expect(reactionsOf('m-react')).toHaveLength(0)
  })

  it('n’atteint pas un message d’un autre canal', () => {
    seedMessage('m-dm', 'dm-cross')

    dispatch('handleGroupReaction', {
      groupId, channelId, messageId: 'm-dm', emoji: '👍', action: 'add',
    }, C, 'group:reaction')

    expect(reactionsOf('m-dm', 'dm-cross')).toHaveLength(0)
  })

  it('borne l’emoji et refuse une action inconnue', () => {
    seedMessage('m-react')

    dispatch('handleGroupReaction', {
      groupId, channelId, messageId: 'm-react', emoji: 'x'.repeat(17), action: 'add',
    }, C, 'group:reaction')
    dispatch('handleGroupReaction', {
      groupId, channelId, messageId: 'm-react', emoji: '👍', action: 'toggle',
    }, C, 'group:reaction')

    expect(reactionsOf('m-react')).toHaveLength(0)
  })

  it('toggleGroupReaction ajoute puis retire, et diffuse chaque étape', async () => {
    seedMessage('m-react')

    await groupService.toggleGroupReaction(groupId, channelId, 'm-react', '🔥')
    expect(reactionsOf('m-react')).toEqual([{ emoji: '🔥', users: [A], count: 1 }])
    expect(p2pService.broadcastToPeers).toHaveBeenLastCalledWith(
      expect.arrayContaining([B, C]),
      'group:reaction',
      expect.objectContaining({ groupId, channelId, messageId: 'm-react', emoji: '🔥', action: 'add' }),
    )

    await groupService.toggleGroupReaction(groupId, channelId, 'm-react', '🔥')
    expect(reactionsOf('m-react')).toHaveLength(0)
    expect(p2pService.broadcastToPeers).toHaveBeenLastCalledWith(
      expect.any(Array),
      'group:reaction',
      expect.objectContaining({ emoji: '🔥', action: 'remove' }),
    )
  })
})

describe('réponses citées', () => {
  const seed = (id: string, senderId = B) => {
    useMessageStore.getState().addMessage({
      id,
      conversationId: channelId,
      senderId,
      type: 'text',
      content: 'message d’origine',
      timestamp: 1,
      status: 'sent',
    } as Message)
  }

  it('résout la citation dans notre copie du canal, pas dans le payload', () => {
    seed('m-origin')

    dispatch('handleGroupMessage', {
      groupId,
      channelId,
      message: {
        id: 'm-reply',
        senderId: C,
        content: 'ma réponse',
        timestamp: Date.now(),
        type: 'text',
        replyTo: { id: 'm-origin', senderId: D, content: 'contenu falsifié', type: 'text' },
      },
    }, C, 'group:message')

    expect(useMessageStore.getState().getMessage('m-reply', channelId)?.replyTo).toEqual({
      id: 'm-origin',
      senderId: B,
      content: 'message d’origine',
      type: 'text',
    })
  })

  it('ignore une citation introuvable ou supprimée', () => {
    seed('m-deleted')
    useMessageStore.getState().deleteMessage('m-deleted', channelId)

    for (const quoteId of ['m-deleted', 'm-absent']) {
      dispatch('handleGroupMessage', {
        groupId,
        channelId,
        message: {
          id: `m-reply-${quoteId}`,
          senderId: C,
          content: 'réponse',
          timestamp: Date.now(),
          type: 'text',
          replyTo: { id: quoteId },
        },
      }, C, 'group:message')
      expect(useMessageStore.getState().getMessage(`m-reply-${quoteId}`, channelId)?.replyTo).toBeUndefined()
    }
  })

  it('attache l’aperçu de la citation envoyée et le diffuse', async () => {
    seed('m-origin')

    await groupService.sendGroupMessage(groupId, channelId, 'ma réponse', undefined, undefined, 'm-origin')

    const sent = useMessageStore.getState().messages[channelId].at(-1)!
    expect(sent.senderId).toBe(A)
    expect(sent.replyTo).toEqual({
      id: 'm-origin',
      senderId: B,
      content: 'message d’origine',
      type: 'text',
    })
    expect(p2pService.broadcastToPeers).toHaveBeenLastCalledWith(
      expect.arrayContaining([B, C]),
      'group:message',
      expect.objectContaining({
        message: expect.objectContaining({ replyTo: expect.objectContaining({ id: 'm-origin' }) }),
      }),
    )
  })
})

describe('modification et suppression de message', () => {
  const seed = (id: string, senderId: string) => {
    useMessageStore.getState().addMessage({
      id,
      conversationId: channelId,
      senderId,
      type: 'text',
      content: 'texte initial',
      timestamp: 1,
      status: 'sent',
      groupId,
    } as Message)
  }
  const textOf = (id: string) =>
    useMessageStore.getState().getMessage(id, channelId)?.content

  it('n’accepte une édition que de son auteur', () => {
    seed('m-edit', A)

    dispatch('handleGroupEdit', {
      groupId, channelId, messageId: 'm-edit', newContent: 'réécrit par Carol',
    }, C, 'group:edit')

    expect(textOf('m-edit')).toBe('texte initial')
  })

  it('applique et persiste l’édition de l’auteur', () => {
    seed('m-edit', C)

    dispatch('handleGroupEdit', {
      groupId, channelId, messageId: 'm-edit', newContent: 'réécrit par Carol',
    }, C, 'group:edit')

    expect(textOf('m-edit')).toBe('réécrit par Carol')
    expect(storageService.saveMessage).toHaveBeenCalled()
  })

  it('refuse un contenu vide ou au-delà de la borne', () => {
    seed('m-edit', C)

    dispatch('handleGroupEdit', {
      groupId, channelId, messageId: 'm-edit', newContent: '   ',
    }, C, 'group:edit')
    expect(textOf('m-edit')).toBe('texte initial')

    dispatch('handleGroupEdit', {
      groupId, channelId, messageId: 'm-edit', newContent: 'x'.repeat(100_001),
    }, C, 'group:edit')
    expect(textOf('m-edit')).toBe('texte initial')
  })

  it('supprime le message à la demande de son auteur, et à celle d’une modération', () => {
    seed('m-own', C)
    seed('m-other', A)

    // Carol (membre) ne peut pas retirer le message d'Alice.
    dispatch('handleGroupDelete', { groupId, channelId, messageId: 'm-other' }, C, 'group:delete')
    expect(useMessageStore.getState().getMessage('m-other', channelId)).toBeDefined()

    // Bob (admin) le peut ; Carol peut retirer le sien.
    dispatch('handleGroupDelete', { groupId, channelId, messageId: 'm-other' }, B, 'group:delete')
    expect(useMessageStore.getState().getMessage('m-other', channelId)).toBeUndefined()

    dispatch('handleGroupDelete', { groupId, channelId, messageId: 'm-own' }, C, 'group:delete')
    expect(useMessageStore.getState().getMessage('m-own', channelId)).toBeUndefined()
  })

  it('ignore une suppression venue d’un non-membre', () => {
    seed('m-target', C)

    dispatch('handleGroupDelete', { groupId, channelId, messageId: 'm-target' }, D, 'group:delete')

    expect(useMessageStore.getState().getMessage('m-target', channelId)).toBeDefined()
  })

  it('editGroupMessage n’édite que ses propres messages et diffuse', async () => {
    seed('m-mine', A)
    seed('m-theirs', C)

    await groupService.editGroupMessage(groupId, channelId, 'm-theirs', 'volé')
    expect(textOf('m-theirs')).toBe('texte initial')
    expect(p2pService.broadcastToPeers).not.toHaveBeenCalledWith(
      expect.any(Array), 'group:edit', expect.anything(),
    )

    await groupService.editGroupMessage(groupId, channelId, 'm-mine', 'ma correction')
    expect(textOf('m-mine')).toBe('ma correction')
    expect(p2pService.broadcastToPeers).toHaveBeenLastCalledWith(
      expect.arrayContaining([B, C]),
      'group:edit',
      expect.objectContaining({ groupId, channelId, messageId: 'm-mine', newContent: 'ma correction' }),
    )
  })

  it('supprime pour tous ou pour soi, avec le bon périmètre réseau', async () => {
    seed('m-mine', A)
    seed('m-local', A)

    await groupService.deleteGroupMessage(groupId, channelId, 'm-mine')
    expect(useMessageStore.getState().getMessage('m-mine', channelId)?.deleted).toBe(true)
    expect(p2pService.broadcastToPeers).toHaveBeenLastCalledWith(
      expect.any(Array),
      'group:delete',
      expect.objectContaining({ groupId, channelId, messageId: 'm-mine' }),
    )

    const calls = vi.mocked(p2pService.broadcastToPeers).mock.calls.length
    await groupService.deleteGroupMessageForMe(groupId, channelId, 'm-local')
    expect(useMessageStore.getState().getMessage('m-local', channelId)).toBeUndefined()
    expect(vi.mocked(p2pService.broadcastToPeers).mock.calls).toHaveLength(calls)
  })
})

describe('accusé de lecture d’un message vu en direct', () => {
  const receive = (id: string): void => {
    dispatch('handleGroupMessage', {
      groupId,
      channelId,
      message: { id, senderId: B, content: 'vu', timestamp: Date.now(), type: 'text' },
    }, B, 'group:message')
  }
  const readReceiptSent = (): boolean => vi.mocked(p2pService.sendMessage).mock.calls.some(
    ([, type, payload]) => type === 'group:receipt'
      && (payload as Record<string, unknown>).status === 'read',
  )
  const setReadReceipts = (enabled: boolean): void => {
    useUIStore.setState((state) => ({
      settings: { ...state.settings, privacy: { ...state.settings.privacy, readReceipts: enabled } },
    }))
  }

  it('accuse lecture quand le canal est affiché, sans incrémenter de non-lu', () => {
    useGroupStore.getState().setActiveGroup(groupId)
    useGroupStore.getState().setGroupViewVisible(true)
    setReadReceipts(true)

    receive('live-1')

    expect(readReceiptSent()).toBe(true)
    expect(group().channels[0].unreadCount).toBe(0)
  })

  it('n’accuse pas lecture quand les reçus de lecture sont désactivés', () => {
    useGroupStore.getState().setActiveGroup(groupId)
    useGroupStore.getState().setGroupViewVisible(true)
    setReadReceipts(false)

    receive('live-2')

    expect(readReceiptSent()).toBe(false)
    expect(useMessageStore.getState().getMessage('live-2', channelId)).toBeDefined()
  })

  it('compte comme non lu quand la page de groupe n’est pas montée', () => {
    useGroupStore.getState().setActiveGroup(groupId)
    useGroupStore.getState().setGroupViewVisible(false)

    receive('live-3')

    expect(readReceiptSent()).toBe(false)
    expect(group().channels[0].unreadCount).toBe(1)
  })
})

describe('notifications de groupe', () => {
  type NotifSettings = ReturnType<typeof useUIStore.getState>['settings']['notifications']
  const setNotifications = (patch: Partial<NotifSettings>): void => {
    useUIStore.setState((state) => ({
      settings: { ...state.settings, notifications: { ...state.settings.notifications, ...patch } },
    }))
  }
  const show = () => vi.mocked(window.asgard.notifications.show)
  const receive = (
    id: string,
    content: string,
    mentions?: Array<{ publicKey: string; displayName: string; startIndex: number; endIndex: number }>,
  ): void => {
    dispatch('handleGroupMessage', {
      groupId,
      channelId,
      message: {
        id,
        senderId: B,
        content,
        timestamp: Date.now(),
        type: mentions ? 'mention' : 'text',
        ...(mentions ? { mentions } : {}),
      },
    }, B, 'group:message')
  }
  const mention = (messageId: string, content: string): void => {
    dispatch('handleGroupMention', {
      groupId,
      channelId,
      messageId,
      mentionedBy: B,
      content,
      timestamp: Date.now(),
    }, B, 'group:mention')
  }

  beforeEach(() => {
    useGroupStore.getState().setGroupViewVisible(false)
    setNotifications({ enabled: true, sound: false, dndMode: false, showPreview: true, mentionsOnly: false })
    show().mockClear()
  })

  it('notifie un message d’un canal non affiché', () => {
    receive('notif-1', 'Bonjour à tous')

    expect(show()).toHaveBeenCalledTimes(1)
    expect(show()).toHaveBeenCalledWith('Bob · Équipe', 'Bonjour à tous', { groupId, channelId })
    expect(group().channels[0].unreadCount).toBe(1)
  })

  it('ne notifie ni quand les notifications sont coupées ni en ne pas déranger', () => {
    setNotifications({ enabled: false })
    receive('notif-2', 'coupé')
    setNotifications({ enabled: true, dndMode: true })
    receive('notif-3', 'silencieux')

    expect(show()).not.toHaveBeenCalled()
    expect(group().channels[0].unreadCount).toBe(2)
  })

  it('respecte « mentions uniquement »', () => {
    setNotifications({ mentionsOnly: true })
    receive('notif-4', 'Sans mention')
    expect(show()).not.toHaveBeenCalled()

    receive('notif-5', '@Alice coucou', [
      { publicKey: A, displayName: 'Alice', startIndex: 0, endIndex: 6 },
    ])
    expect(show()).toHaveBeenCalledTimes(1)
  })

  it('masque l’aperçu quand demandé', () => {
    setNotifications({ showPreview: false })
    receive('notif-6', 'contenu privé')

    expect(show()).toHaveBeenCalledWith('Bob · Équipe', i18n.t('notifications.newMessage'), { groupId, channelId })
    expect(show()).not.toHaveBeenCalledWith('Bob · Équipe', 'contenu privé')
  })

  it('ne notifie pas un canal affiché', () => {
    useGroupStore.getState().setActiveGroup(groupId)
    useGroupStore.getState().setGroupViewVisible(true)
    receive('notif-7', 'vu en direct')

    expect(show()).not.toHaveBeenCalled()
    expect(group().channels[0].unreadCount).toBe(0)
  })

  it('notifie une mention reçue avant son message, une seule fois', () => {
    mention('notif-8', 'Salut @Alice')
    expect(show()).toHaveBeenCalledTimes(1)
    expect(show()).toHaveBeenCalledWith('Bob · Équipe', 'Salut @Alice', { groupId, channelId })

    receive('notif-8', 'Salut @Alice', [
      { publicKey: A, displayName: 'Alice', startIndex: 0, endIndex: 6 },
    ])
    expect(show()).toHaveBeenCalledTimes(1)
  })

  it('ignore une notification de mention pour un message déjà affiché', () => {
    useGroupStore.getState().setActiveGroup(groupId)
    useGroupStore.getState().setGroupViewVisible(true)
    receive('notif-9', '@Alice coucou', [
      { publicKey: A, displayName: 'Alice', startIndex: 0, endIndex: 6 },
    ])
    useGroupStore.getState().setGroupViewVisible(false)

    mention('notif-9', '@Alice coucou')

    expect(show()).not.toHaveBeenCalled()
  })

  it('respecte les réglages pour une notification de mention', () => {
    setNotifications({ enabled: false })
    mention('notif-10', '@Alice')
    setNotifications({ enabled: true, dndMode: true })
    mention('notif-11', '@Alice')

    expect(show()).not.toHaveBeenCalled()
  })

  it('respecte la sourdine de la conversation de groupe', () => {
    useConversationStore.getState().addConversation({
      id: groupId,
      type: 'group',
      groupId,
      unreadCount: 0,
      muted: true,
      pinned: false,
      archived: false,
      createdAt: 1,
      updatedAt: 1,
    })

    receive('notif-12', 'silencieux')
    mention('notif-13', '@Alice')

    expect(show()).not.toHaveBeenCalled()
    expect(group().channels[0].unreadCount).toBe(1)
  })
})
