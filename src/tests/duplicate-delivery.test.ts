/**
 * Une livraison en double (renvoi de la file hors ligne, « réessayer ») porte
 * le même identifiant : la bulle est dédupliquée par le store, mais recompter
 * un non-lu et rejouer la notification donnaient deux alertes pour un seul
 * message. L'accusé de réception, lui, doit repartir : c'est précisément ce
 * que le pair attend en renvoyant.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chatService } from '@/services/ChatService'
import { groupService } from '@/services/GroupService'
import { p2pService } from '@/services/P2PService'
import { cryptoService } from '@/services/CryptoService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useMessageStore } from '@/stores/messageStore'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import { useUIStore } from '@/stores/uiStore'
import type { GroupMember, ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

const show = () => vi.mocked(window.asgard.notifications.show)

const deliverDm = async (id: string, content: string): Promise<void> => {
  const fn = (chatService as unknown as {
    handleIncomingMessage: (msg: ProtocolMessage) => Promise<void>
  }).handleIncomingMessage.bind(chatService)
  await fn({
    id: 'envelope',
    from: B,
    to: A,
    type: 'chat:message',
    timestamp: Date.now(),
    payload: {
      id,
      conversationId: 'ignored',
      senderId: B,
      type: 'text',
      content,
      timestamp: Date.now(),
      signature: 'sig',
    },
  } as unknown as ProtocolMessage)
}

const deliverGroup = (id: string, content: string): void => {
  const fn = (groupService as unknown as {
    handleGroupMessage: (msg: ProtocolMessage) => void
  }).handleGroupMessage.bind(groupService)
  fn({
    id: 'envelope',
    from: B,
    to: A,
    type: 'group:message',
    timestamp: Date.now(),
    payload: {
      groupId,
      channelId,
      message: { id, content, senderId: B, type: 'text', timestamp: Date.now() },
    },
  } as unknown as ProtocolMessage)
}

const receiptsOf = (type: string): number =>
  vi.mocked(p2pService.sendMessage).mock.calls.filter(([, kind]) => kind === type).length

const member = (publicKey: string, displayName: string, role: GroupMember['role']): GroupMember => ({
  publicKey,
  displayName,
  role,
  joinedAt: 1_700_000_000_000,
  canPost: true,
})

let groupId = ''
let channelId = ''

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: A, secretKey: 'f'.repeat(128) },
      profile: { publicKey: A, displayName: 'Alice', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useMessageStore.setState({ messages: {}, drafts: {} } as never)
  useContactStore.setState({ contacts: {}, searchQuery: '' })
  useConversationStore.setState({
    conversations: {},
    drafts: {},
    activeConversationId: null,
    chatViewVisible: false,
  })
  useGroupStore.setState({
    groups: {},
    activeGroupId: null,
    activeChannelId: null,
    searchQuery: '',
    groupPresence: {},
    channelTyping: {},
    groupViewVisible: false,
  })
  useUIStore.setState((state) => ({
    settings: { ...state.settings, notifications: { ...state.settings.notifications, sound: false } },
  }))
  show().mockClear()

  const created = useGroupStore.getState().createGroup({
    name: 'Équipe',
    ownerId: A,
    ownerDisplayName: 'Alice',
  })
  groupId = created.id
  channelId = created.channels[0].id
  useGroupStore.getState().addMember(created.id, member(B, 'Bob', 'member'))

  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
  vi.spyOn(cryptoService, 'verify').mockResolvedValue(true)
})

afterEach(() => {
  vi.mocked(storageService.saveMessage).mockRestore()
  vi.mocked(p2pService.sendMessage).mockRestore()
  vi.mocked(cryptoService.verify).mockRestore()
})

describe('livraison en double d’un message direct', () => {
  it('ne compte qu’un non-lu et ne notifie qu’une fois', async () => {
    await deliverDm('dm-dup', 'salut')
    await deliverDm('dm-dup', 'salut')

    const convId = cryptoService.deriveConversationId(A, B)
    expect(useMessageStore.getState().getMessages(convId)).toHaveLength(1)
    expect(useConversationStore.getState().getConversation(convId)?.unreadCount).toBe(1)
    expect(show()).toHaveBeenCalledTimes(1)
  })

  it('renvoie quand même l’accusé de réception', async () => {
    await deliverDm('dm-ack', 'tu me lis ?')
    await deliverDm('dm-ack', 'tu me lis ?')

    expect(receiptsOf('chat:receipt')).toBe(2)
  })
})

describe('livraison en double d’un message de groupe', () => {
  it('ne compte qu’un non-lu et ne notifie qu’une fois', () => {
    deliverGroup('group-dup', 'bonjour')
    deliverGroup('group-dup', 'bonjour')

    expect(useMessageStore.getState().getMessages(channelId)).toHaveLength(1)
    const channel = useGroupStore.getState().getGroup(groupId)?.channels.find((c) => c.id === channelId)
    expect(channel?.unreadCount).toBe(1)
    expect(show()).toHaveBeenCalledTimes(1)
  })

  it('renvoie quand même l’accusé de réception', () => {
    deliverGroup('group-ack', 'bien reçu ?')
    deliverGroup('group-ack', 'bien reçu ?')

    expect(receiptsOf('group:receipt')).toBe(2)
  })
})
