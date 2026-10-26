/**
 * Actions de message en 1:1 : un pair ne peut agir que sur la conversation
 * qu'il partage avec nous, et seulement sur ses propres messages pour
 * l'édition, la suppression et le rappel. Les anciens gestionnaires
 * cherchaient l'identifiant dans toutes les conversations chargées.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chatService } from '@/services/ChatService'
import { p2pService } from '@/services/P2PService'
import { cryptoService } from '@/services/CryptoService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useMessageStore } from '@/stores/messageStore'
import { useContactStore } from '@/stores/contactStore'
import type { Message, ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const C = 'c'.repeat(64)
const D = '9'.repeat(64)

type Handler = 'handleChatEdit' | 'handleChatDelete' | 'handleChatReaction'
  | 'handleChatRead' | 'handleChatReceipt' | 'handleChatRecall'

const dispatch = (handler: Handler, payload: Record<string, unknown>, from: string): void => {
  const fn = (chatService as unknown as Record<Handler, (msg: ProtocolMessage) => void>)[handler].bind(chatService)
  fn({ id: 'envelope', from, to: A, type: 'chat:x', timestamp: Date.now(), payload } as unknown as ProtocolMessage)
}

const message = (id: string, senderId: string, content = 'bonjour'): Message => ({
  id,
  conversationId: 'claimed',
  senderId,
  type: 'text',
  content,
  timestamp: 1,
  status: 'sent',
})

let convC = ''
let convD = ''

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

  convC = cryptoService.deriveConversationId(A, C)
  convD = cryptoService.deriveConversationId(A, D)
  useMessageStore.setState({
    messages: {
      [convC]: [message('own-1', A), message('peer-1', C, 'salut')],
      [convD]: [message('other-1', D, 'ailleurs')],
    },
  } as never)

  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
  vi.spyOn(storageService, 'deleteMessage').mockResolvedValue(true)
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
  vi.spyOn(cryptoService, 'verify').mockResolvedValue(true)
})

afterEach(() => {
  vi.mocked(storageService.saveMessage).mockRestore()
  vi.mocked(storageService.deleteMessage).mockRestore()
  vi.mocked(p2pService.sendMessage).mockRestore()
  vi.mocked(cryptoService.verify).mockRestore()
})

const stored = (id: string, conv = convC) =>
  useMessageStore.getState().messages[conv].find((m) => m.id === id)!

describe('édition', () => {
  it('accepte l’édition de son propre message', () => {
    dispatch('handleChatEdit', { messageId: 'peer-1', newContent: 'corrigé' }, C)
    expect(stored('peer-1').content).toBe('corrigé')
  })

  it('refuse d’éditer le message d’autrui, même dans notre conversation', () => {
    dispatch('handleChatEdit', { messageId: 'own-1', newContent: 'piraté' }, C)
    expect(stored('own-1').content).toBe('bonjour')
  })

  it('refuse d’éditer un message d’une autre conversation', () => {
    dispatch('handleChatEdit', { messageId: 'other-1', newContent: 'piraté' }, C)
    expect(stored('other-1', convD).content).toBe('ailleurs')
  })
})

describe('suppression et rappel', () => {
  it('refuse de supprimer le message d’autrui', () => {
    dispatch('handleChatDelete', { messageId: 'own-1' }, C)
    expect(stored('own-1')).toBeDefined()
  })

  it('refuse de supprimer hors de sa conversation', () => {
    dispatch('handleChatDelete', { messageId: 'other-1' }, C)
    expect(stored('other-1', convD)).toBeDefined()
  })

  it('supprime son propre message', () => {
    dispatch('handleChatDelete', { messageId: 'peer-1' }, C)
    expect(useMessageStore.getState().messages[convC].some((m) => m.id === 'peer-1')).toBe(false)
  })

  it('n’accepte le rappel que de l’auteur', () => {
    dispatch('handleChatRecall', { messageId: 'own-1' }, C)
    expect(stored('own-1').recalled).toBeUndefined()

    dispatch('handleChatRecall', { messageId: 'peer-1' }, C)
    expect(stored('peer-1').recalled).toBe(true)
  })
})

describe('réactions', () => {
  it('accepte une réaction sur un message de sa conversation', () => {
    dispatch('handleChatReaction', { messageId: 'own-1', emoji: '👍', action: 'add' }, C)
    expect(stored('own-1').reactions?.[0]?.users).toContain(C)
  })

  it('refuse une réaction hors de sa conversation', () => {
    dispatch('handleChatReaction', { messageId: 'other-1', emoji: '👍', action: 'add' }, C)
    expect(stored('other-1', convD).reactions).toBeUndefined()
  })
})

describe('accusés', () => {
  it('marque lu uniquement nos messages de la conversation', () => {
    dispatch('handleChatRead', { messageIds: ['own-1', 'other-1'] }, C)
    expect(stored('own-1').status).toBe('read')
    expect(stored('other-1', convD).status).toBe('sent')
  })

  it('n’applique un statut qu’à nos propres messages', () => {
    dispatch('handleChatReceipt', { messageIds: ['own-1'], status: 'read' }, C)
    expect(stored('own-1').status).toBe('read')

    dispatch('handleChatReceipt', { messageIds: ['peer-1'], status: 'read' }, C)
    expect(stored('peer-1').status).toBe('sent')

    dispatch('handleChatReceipt', { messageIds: ['other-1'], status: 'read' }, C)
    expect(stored('other-1', convD).status).toBe('sent')
  })
})

describe('message entrant', () => {
  it('refuse un message dont le payload nomme un autre expéditeur', async () => {
    const deliver = (chatService as unknown as {
      handleIncomingMessage: (msg: ProtocolMessage) => Promise<void>
    }).handleIncomingMessage.bind(chatService)

    await deliver({
      id: 'envelope', from: C, to: A, type: 'chat:message', timestamp: Date.now(),
      payload: { ...message('spoof-1', D), signature: 'sig' },
    } as unknown as ProtocolMessage)

    expect(useMessageStore.getState().messages[convC]?.some((m) => m.id === 'spoof-1')).toBeFalsy()

    await deliver({
      id: 'envelope-2', from: C, to: A, type: 'chat:message', timestamp: Date.now(),
      payload: { ...message('ok-1', C), signature: 'sig' },
    } as unknown as ProtocolMessage)

    expect(useMessageStore.getState().messages[convC]?.some((m) => m.id === 'ok-1')).toBe(true)
  })
})
