/**
 * Frontière des messages 1:1 entrants.
 *
 * L'enveloppe signée authentifie l'émetteur ; elle ne rend pas vrai tout ce
 * que le payload transporte. Ces tests fixent ce qui est conservé (affichage),
 * ce qui est recopié depuis l'état local (devis de réponse) et ce qui est
 * rejeté (identifiant ou contenu démesuré, horodatage non fini, champs
 * d'état plantés par l'expéditeur).
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
import type { Message, ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const C = 'c'.repeat(64)
const D = '9'.repeat(64)

let convC = ''

const deliver = async (payload: Record<string, unknown>, from = C): Promise<void> => {
  const fn = (chatService as unknown as {
    handleIncomingMessage: (msg: ProtocolMessage) => Promise<void>
  }).handleIncomingMessage.bind(chatService)
  await fn({
    id: 'envelope-1',
    from,
    to: A,
    type: 'chat:message',
    timestamp: Date.now(),
    payload,
  } as unknown as ProtocolMessage)
}

const incoming = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'm-1',
  conversationId: 'claimed',
  senderId: C,
  type: 'text',
  content: 'bonjour',
  timestamp: 1_700_000_000_000,
  status: 'sent',
  signature: 'sig',
  ...overrides,
})

const stored = (id: string): Message | undefined =>
  useMessageStore.getState().messages[convC]?.find((m) => m.id === id)

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
  useConversationStore.setState({ conversations: {}, activeConversationId: null })

  convC = cryptoService.deriveConversationId(A, C)
  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
  vi.spyOn(cryptoService, 'verify').mockResolvedValue(true)
})

afterEach(() => {
  vi.mocked(storageService.saveMessage).mockRestore()
  vi.mocked(p2pService.sendMessage).mockRestore()
  vi.mocked(cryptoService.verify).mockRestore()
})

describe('message entrant', () => {
  it('ne garde que les champs d’affichage, pas l’état local imposé', async () => {
    await deliver(incoming({
      status: 'read',
      readBy: [A],
      reactions: [{ emoji: '🔥', users: [C], count: 1 }],
      attachments: [{
        id: 'att-1', type: 'image', name: 'x.png', size: 1,
        mimeType: 'image/png', blobKey: 'volé', localUrl: 'file:///secret',
      }],
      edits: [{ editedAt: Date.now(), previousContent: 'ancien' }],
      recalled: true,
      deleted: false,
      pinned: true,
      expiresAt: Date.now() + 1_000,
    }))

    const message = stored('m-1')!
    expect(message).toBeDefined()
    expect(message.conversationId).toBe(convC)
    expect(message.senderId).toBe(C)
    expect(message.status).toBe('delivered')
    for (const field of ['readBy', 'reactions', 'attachments', 'edits', 'recalled', 'pinned', 'expiresAt']) {
      expect(message).not.toHaveProperty(field)
    }
  })

  it('refuse un identifiant ou un contenu démesuré', async () => {
    await deliver(incoming({ id: 'm'.repeat(129) }))
    await deliver(incoming({ id: 'm-big', content: 'x'.repeat(100_001) }))

    expect(useMessageStore.getState().messages[convC] ?? []).toHaveLength(0)
  })

  it('refuse un message sans signature ou à horodatage invalide', async () => {
    await deliver(incoming({ id: 'm-unsigned', signature: undefined }))
    await deliver(incoming({ id: 'm-bad-time', timestamp: Number.NaN }))
    await deliver(incoming({ id: 'm-string-time', timestamp: 'hier' }))

    expect(useMessageStore.getState().messages[convC] ?? []).toHaveLength(0)
  })

  it('ramène un horodatage lointain sous 24 h et neutralise les types riches', async () => {
    const before = Date.now()
    await deliver(incoming({
      id: 'm-rich',
      type: 'poll',
      poll: { question: 'piège', options: [] },
      timestamp: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    }))

    const message = stored('m-rich')!
    expect(message.type).toBe('text')
    expect(message).not.toHaveProperty('poll')
    expect(message.timestamp).toBeGreaterThanOrEqual(before)
    expect(message.timestamp).toBeLessThanOrEqual(Date.now() + 86_400_000)
  })

  it('borne les mentions et garde leur type', async () => {
    await deliver(incoming({
      id: 'm-mentions',
      type: 'mention',
      content: 'salut',
      mentions: Array.from({ length: 40 }, () => ({
        publicKey: C,
        displayName: 'N'.repeat(500),
        startIndex: 999,
        endIndex: 2_000,
      })),
    }))

    const message = stored('m-mentions')!
    expect(message.type).toBe('mention')
    expect(message.mentions).toHaveLength(32)
    for (const mention of message.mentions ?? []) {
      expect(mention.endIndex).toBeLessThanOrEqual(message.content.length)
      expect(mention.startIndex).toBeLessThanOrEqual(mention.endIndex)
      expect(mention.displayName.length).toBeLessThanOrEqual(200)
    }
  })

  it('relit le devis de réponse dans la conversation, pas dans le fil', async () => {
    useMessageStore.getState().addMessage({
      id: 'orig', conversationId: convC, senderId: C, type: 'text',
      content: 'le vrai texte', timestamp: 1, status: 'sent',
    })

    await deliver(incoming({
      id: 'm-reply',
      replyTo: { id: 'orig', senderId: D, content: 'texte inventé', type: 'text' },
    }))
    await deliver(incoming({
      id: 'm-reply-ghost',
      replyTo: { id: 'inconnu', senderId: D, content: 'fantôme', type: 'text' },
    }))

    const reply = stored('m-reply')!
    expect(reply.replyTo).toEqual({
      id: 'orig', senderId: C, content: 'le vrai texte', type: 'text',
    })
    expect(stored('m-reply-ghost')!.replyTo).toBeUndefined()
  })
})
