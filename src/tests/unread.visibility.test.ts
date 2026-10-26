/**
 * Un fil n'est « lu » que s'il est réellement à l'écran.
 *
 * `activeConversationId` est posé au clic et persiste quand on passe sur une
 * autre page (ou après un redémarrage) : le garde de non-lus le prenait pour
 * une preuve de présence, si bien que le dernier fil ouvert ne comptait plus
 * jamais ses messages entrants. Le drapeau est désormais porté par le montage
 * de ChatView.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chatService } from '@/services/ChatService'
import { p2pService } from '@/services/P2PService'
import { cryptoService } from '@/services/CryptoService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useMessageStore } from '@/stores/messageStore'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import type { ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const C = 'c'.repeat(64)

const deliver = (id: string, content: string): Promise<void> => {
  const fn = (chatService as unknown as {
    handleIncomingMessage: (msg: ProtocolMessage) => Promise<void>
  }).handleIncomingMessage.bind(chatService)
  return fn({
    id: `envelope-${id}`,
    from: C,
    to: A,
    type: 'chat:message',
    timestamp: Date.now(),
    payload: {
      id,
      conversationId: 'claimed',
      senderId: C,
      type: 'text',
      content,
      timestamp: Date.now(),
      status: 'sent',
      signature: 'sig',
    },
  } as unknown as ProtocolMessage)
}

let conversationId = ''

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: A, secretKey: 'f'.repeat(128) },
      profile: { publicKey: A, displayName: 'Alice', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useMessageStore.setState({
    messages: {},
    loading: {},
    hasMore: {},
    pending: {},
    drafts: {},
    scheduledMessages: [],
    templates: [],
  })
  useContactStore.setState({ contacts: {}, searchQuery: '' })

  conversationId = cryptoService.deriveConversationId(A, C)
  useConversationStore.setState({
    conversations: {
      [conversationId]: {
        id: conversationId,
        type: 'direct',
        participantId: C,
        unreadCount: 0,
        muted: false,
        pinned: false,
        archived: false,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    activeConversationId: conversationId,
    chatViewVisible: false,
  })

  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
  vi.spyOn(cryptoService, 'verify').mockResolvedValue(true)
})

afterEach(() => {
  vi.mocked(storageService.saveMessage).mockRestore()
  vi.mocked(p2pService.sendMessage).mockRestore()
  vi.mocked(cryptoService.verify).mockRestore()
})

describe('non-lus et visibilité du fil', () => {
  it('incrémente alors que l’identifiant est actif mais que le fil n’est pas monté', async () => {
    await deliver('vis-1', 'hors écran')

    expect(useConversationStore.getState().conversations[conversationId].unreadCount).toBe(1)
  })

  it('n’incrémente pas quand ChatView affiche le fil', async () => {
    useConversationStore.getState().setChatViewVisible(true)

    await deliver('vis-2', 'sous les yeux')

    expect(useConversationStore.getState().conversations[conversationId].unreadCount).toBe(0)
  })
})
