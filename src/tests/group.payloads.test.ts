/**
 * Frontière des charges utiles de groupe.
 *
 * Une enveloppe signée authentifie l'émetteur, mais tout ce qu'elle transporte
 * reste choisi par lui. Ces tests fixent ce que le récepteur accepte de croire :
 * champs d'affichage seuls pour un message, canal réellement rattaché au groupe,
 * accusés et marqueurs de lecture limités à leur canal, présence et mentions
 * bornées, notification signée du nom du membre connu.
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

function member(publicKey: string, displayName: string, role: GroupMember['role']): GroupMember {
  return { publicKey, displayName, role, joinedAt: 1_700_000_000_000, canPost: true }
}

type Handler =
  | 'handleGroupMessage'
  | 'handleGroupReceipt'
  | 'handleGroupRead'
  | 'handleGroupPresence'
  | 'handleGroupTyping'
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

function seedMessage(overrides: Partial<Message> & { id: string; conversationId: string }): void {
  useMessageStore.getState().addMessage({
    senderId: A,
    type: 'text',
    content: 'germe',
    timestamp: 1,
    status: 'sent',
    ...overrides,
  } as Message)
}

let groupId = ''
let channelId = ''
const group = () => useGroupStore.getState().getGroup(groupId)!
const storedMessage = (id: string, conversation = channelId) =>
  useMessageStore.getState().messages[conversation]?.find((m) => m.id === id)

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
  vi.restoreAllMocks()
})

describe('messages entrants', () => {
  it('ne garde que les champs d’affichage, pas l’état local imposé par l’expéditeur', () => {
    dispatch('handleGroupMessage', {
      groupId,
      channelId,
      message: {
        id: 'm-planted',
        conversationId: 'ailleurs',
        senderId: C,
        type: 'text',
        content: 'coucou',
        timestamp: 1_700_000_000_000,
        status: 'read',
        readBy: [A, B],
        reactions: [{ emoji: '🔥', senderId: C }],
        attachments: [{ id: 'x', type: 'image', name: 'x.png', size: 1, mimeType: 'image/png', data: 'blob' }],
        blobKey: 'volé',
      },
    }, C, 'group:message')

    const stored = storedMessage('m-planted')!
    expect(stored).toBeDefined()
    expect(stored.conversationId).toBe(channelId)
    expect(stored.senderId).toBe(C)
    expect(stored.status).toBe('delivered')
    expect((stored as unknown as Record<string, unknown>).readBy).toBeUndefined()
    expect((stored as unknown as Record<string, unknown>).reactions).toBeUndefined()
    expect((stored as unknown as Record<string, unknown>).attachments).toBeUndefined()
    expect((stored as unknown as Record<string, unknown>).blobKey).toBeUndefined()
  })

  it('refuse un contenu ou un identifiant démesuré', () => {
    dispatch('handleGroupMessage', {
      groupId,
      channelId,
      message: { id: 'm-big', senderId: C, type: 'text', content: 'x'.repeat(100_001), timestamp: 1 },
    }, C, 'group:message')

    dispatch('handleGroupMessage', {
      groupId,
      channelId,
      message: { id: 'm'.repeat(129), senderId: C, type: 'text', content: 'ok', timestamp: 1 },
    }, C, 'group:message')

    expect(useMessageStore.getState().messages[channelId] ?? []).toHaveLength(0)
  })

  it('refuse un canal qui n’appartient pas au groupe', () => {
    dispatch('handleGroupMessage', {
      groupId,
      channelId: 'canal-fantôme',
      message: { id: 'm-ghost', senderId: C, type: 'text', content: 'hors canal', timestamp: 1 },
    }, C, 'group:message')

    expect(useMessageStore.getState().messages['canal-fantôme']).toBeUndefined()
  })

  it('ramène un horodatage non fini à maintenant et borne les mentions', () => {
    const before = Date.now()
    dispatch('handleGroupMessage', {
      groupId,
      channelId,
      message: {
        id: 'm-mentions',
        senderId: C,
        type: 'text',
        content: 'salut',
        timestamp: Number.NaN,
        mentions: Array.from({ length: 40 }, () => ({
          publicKey: B,
          displayName: 'N'.repeat(500),
          startIndex: 999,
          endIndex: 2_000,
        })),
      },
    }, C, 'group:message')

    const stored = storedMessage('m-mentions')!
    expect(stored.timestamp).toBeGreaterThanOrEqual(before)
    expect(stored.timestamp).toBeLessThanOrEqual(Date.now())
    expect(stored.mentions).toHaveLength(32)
    for (const mention of stored.mentions ?? []) {
      expect(mention.startIndex).toBeLessThanOrEqual(stored.content.length)
      expect(mention.endIndex).toBeLessThanOrEqual(stored.content.length)
      expect(mention.endIndex).toBeGreaterThanOrEqual(mention.startIndex)
      expect(mention.displayName.length).toBeLessThanOrEqual(200)
    }
  })
})

describe('accusés et lectures', () => {
  it('n’applique un accusé qu’aux messages du canal du groupe', () => {
    seedMessage({ id: 'm-shared', conversationId: 'dm-cross', status: 'sent' })
    seedMessage({ id: 'm-group', conversationId: channelId, senderId: A, status: 'sent' })

    dispatch('handleGroupReceipt', {
      groupId, channelId, messageIds: ['m-shared'], status: 'read', readerPublicKey: C, timestamp: Date.now(),
    }, C, 'group:receipt')

    expect(storedMessage('m-shared', 'dm-cross')!.status).toBe('sent')
    expect(storedMessage('m-group')!.status).toBe('sent')
  })

  it('ignore un statut inconnu et les identifiants non textuels', () => {
    seedMessage({ id: 'm-status', conversationId: channelId, senderId: A, status: 'sent' })

    dispatch('handleGroupReceipt', {
      groupId, channelId, messageIds: ['m-status', 42, null], status: 'read-everything', readerPublicKey: C,
    }, C, 'group:receipt')

    expect(storedMessage('m-status')!.status).toBe('sent')
  })

  it('ne marque comme lu que les messages existants de ce canal', () => {
    seedMessage({ id: 'm-dm', conversationId: 'dm-cross', status: 'sent' })
    seedMessage({ id: 'm-read', conversationId: channelId, senderId: A, status: 'sent' })
    seedMessage({ id: 'm-own', conversationId: channelId, senderId: C, status: 'sent' })

    dispatch('handleGroupRead', {
      groupId, channelId, publicKey: C, messageIds: ['m-dm', 'm-read', 'm-own', 'm-absent'],
    }, C, 'group:read')

    expect(storedMessage('m-dm', 'dm-cross')!.status).toBe('sent')
    expect(storedMessage('m-read')!.status).toBe('read')
    expect(storedMessage('m-own')!.status).toBe('sent')
  })

  it('refuse un marqueur de lecture hors du canal du groupe', () => {
    seedMessage({ id: 'm-elsewhere', conversationId: channelId, status: 'sent' })

    dispatch('handleGroupRead', {
      groupId, channelId: 'canal-fantôme', publicKey: C, messageIds: ['m-elsewhere'],
    }, C, 'group:read')

    expect(storedMessage('m-elsewhere')!.status).toBe('sent')
  })
})

describe('présence, saisie et mentions', () => {
  it('borne le nom et le statut libre d’une présence', () => {
    dispatch('handleGroupPresence', {
      groupId,
      publicKey: B,
      status: 'online',
      displayName: 'N'.repeat(500),
      customStatus: 'S'.repeat(500),
    }, B, 'group:presence')

    const bob = group().members.find((m) => m.publicKey === B)!
    expect(bob.displayName).toHaveLength(200)
    expect(bob.customStatus).toHaveLength(200)
  })

  it('ignore un nom de présence qui n’est pas une chaîne', () => {
    dispatch('handleGroupPresence', {
      groupId, publicKey: B, status: 'online', displayName: { evil: true },
    }, B, 'group:presence')

    expect(group().members.find((m) => m.publicKey === B)!.displayName).toBe('Bob')
  })

  it('refuse une saisie sur un canal absent ou avec un drapeau non booléen', () => {
    dispatch('handleGroupTyping', {
      groupId, channelId: 'canal-fantôme', publicKey: C, displayName: 'Carol', isTyping: true,
    }, C, 'group:typing')
    expect(useGroupStore.getState().channelTyping[groupId]).toBeUndefined()

    dispatch('handleGroupTyping', {
      groupId, channelId, publicKey: C, displayName: 'Carol', isTyping: 'oui',
    }, C, 'group:typing')
    expect(useGroupStore.getState().channelTyping[groupId]?.[channelId]?.[C]).toBeUndefined()
  })

  it('signe la mention du nom du membre connu et borne l’aperçu', () => {
    const show = vi.spyOn(window.asgard.notifications, 'show')
    dispatch('handleGroupMention', {
      groupId,
      channelId,
      messageId: 'm-mention',
      mentionedBy: C,
      mentionedByDisplayName: 'Administrateur',
      content: 'x'.repeat(1_000),
    }, C, 'group:mention')

    expect(show).toHaveBeenCalledTimes(1)
    const [title, body] = show.mock.calls[0]
    expect(title).toContain('Carol')
    expect(title).not.toContain('Administrateur')
    expect(body).toHaveLength(300)
  })

  it('refuse une mention hors du canal du groupe', () => {
    const show = vi.spyOn(window.asgard.notifications, 'show')
    dispatch('handleGroupMention', {
      groupId,
      channelId: 'canal-fantôme',
      messageId: 'm-mention',
      mentionedBy: C,
      content: 'salut',
    }, C, 'group:mention')

    expect(show).not.toHaveBeenCalled()
  })
})
