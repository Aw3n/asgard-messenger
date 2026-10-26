/**
 * Charge utile des annonces de présence et des demandes de contact.
 *
 * Le pair signe son enveloppe, pas les champs qu'elle transporte : un nom de
 * 500 caractères, un avatar `javascript:` ou un identifiant de conversation
 * choisi librement s'installaient tels quels dans les stores et l'interface.
 * Ces tests fixent les bornes et la règle d'adressage de la frappe.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { chatService } from '@/services/ChatService'
import { p2pService } from '@/services/P2PService'
import { cryptoService } from '@/services/CryptoService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useContactStore } from '@/stores/contactStore'
import { useMessageStore } from '@/stores/messageStore'
import { useNetworkStore } from '@/stores/networkStore'
import type { Contact, Message, ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)
const D = 'd'.repeat(64)

const contact = (publicKey: string, overrides: Partial<Contact> = {}): Contact => ({
  publicKey,
  displayName: `Nom-${publicKey.slice(0, 4)}`,
  status: 'online',
  relation: 'contact',
  verified: false,
  addedAt: 1,
  ...overrides,
})

function dispatch(type: string, payload: unknown, from: string): void {
  const msg = { id: 'm1', from, to: A, type, payload, timestamp: Date.now() } as unknown as ProtocolMessage
  p2pService.emit(`message:${type}`, msg)
}

const contactOf = (key: string) => useContactStore.getState().getContact(key)

beforeAll(() => {
  chatService.initialize()
})

afterAll(() => {
  chatService.destroy()
})

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: A, secretKey: 'f'.repeat(128) },
      profile: { publicKey: A, displayName: 'Alice', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useContactStore.setState({ contacts: {}, searchQuery: '' })
  useMessageStore.setState({
    messages: {},
    loading: {},
    hasMore: {},
    pending: {},
    drafts: {},
    scheduledMessages: [],
    templates: [],
  })
  useNetworkStore.setState({
    status: {
      state: 'disconnected',
      peers: 0,
      topics: [],
      bandwidth: { up: 0, down: 0 },
      connecting: 0,
      peerLatency: {},
    },
    peers: {},
    typingUsers: {},
    swarmSuspended: false,
  })

  useContactStore.getState().addContact(contact(B))
  vi.spyOn(storageService, 'saveContact').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('présence', () => {
  it('borne le nom, la devise et n’installe pas un avatar non-image', () => {
    useContactStore.getState().addContact(contact(B, { avatar: undefined }))
    dispatch('presence:update', {
      status: 'away',
      displayName: 'N'.repeat(500),
      customStatus: 'C'.repeat(500),
      avatar: 'javascript:alert(1)',
    }, B)

    const stored = contactOf(B)!
    expect(stored.status).toBe('away')
    expect(stored.displayName).toHaveLength(200)
    expect(stored.customStatus).toHaveLength(200)
    expect(stored.avatar).toBeUndefined()
  })

  it('refuse un statut inconnu sans écraser le statut courant', () => {
    dispatch('presence:update', { status: 'root' }, B)
    expect(contactOf(B)?.status).toBe('online')
  })

  it('ignore une charge utile vide sans lever', () => {
    dispatch('presence:update', null, B)
    expect(contactOf(B)?.status).toBe('online')
  })

  it('ignore la présence d’un contact bloqué', () => {
    useContactStore.getState().addContact(contact(C, { relation: 'blocked', displayName: 'Bloqué' }))
    dispatch('presence:update', { status: 'away', displayName: 'Renommé' }, C)

    expect(contactOf(C)?.displayName).toBe('Bloqué')
    expect(contactOf(C)?.status).toBe('online')
  })

  it('ne mesure une latence que sur un horodatage plausible', () => {
    dispatch('presence:pong', { timestamp: 'hier' }, B)
    expect(useNetworkStore.getState().status.peerLatency?.[B]).toBeUndefined()

    dispatch('presence:pong', { timestamp: Date.now() + 60_000 }, B)
    expect(useNetworkStore.getState().status.peerLatency?.[B]).toBeUndefined()

    dispatch('presence:pong', { timestamp: Date.now() - 42 }, B)
    expect(useNetworkStore.getState().status.peerLatency?.[B]).toBeGreaterThanOrEqual(42)
  })

  it('répond à un ping même si son horodatage est malformé', () => {
    dispatch('presence:ping', { timestamp: 'hier' }, B)
    expect(p2pService.sendMessage).toHaveBeenCalledWith(B, 'presence:pong', {
      timestamp: expect.any(Number),
    })
  })
})

describe('indicateur de frappe', () => {
  const convB = () => cryptoService.deriveConversationId(A, B)
  const typingOf = (conversationId: string) =>
    useNetworkStore.getState().typingUsers[conversationId]?.has(B) ?? false

  it('accepte la conversation dérivée du pair', () => {
    dispatch('presence:typing', { conversationId: convB(), typing: true }, B)
    expect(typingOf(convB())).toBe(true)

    dispatch('presence:typing', { conversationId: convB(), typing: false }, B)
    expect(typingOf(convB())).toBe(false)
  })

  it('refuse une conversation qui n’appartient pas au pair', () => {
    const convWithC = cryptoService.deriveConversationId(A, C)
    dispatch('presence:typing', { conversationId: convWithC, typing: true }, B)
    expect(typingOf(convWithC)).toBe(false)
    expect(typingOf(convB())).toBe(false)
  })

  it('refuse une valeur de frappe qui n’est pas un booléen', () => {
    dispatch('presence:typing', { conversationId: convB(), typing: 'oui' }, B)
    expect(typingOf(convB())).toBe(false)
  })

  it('ignore un contact bloqué et un pair inconnu', () => {
    useContactStore.getState().addContact(contact(C, { relation: 'blocked' }))
    dispatch('presence:typing', { conversationId: cryptoService.deriveConversationId(A, C), typing: true }, C)
    dispatch('presence:typing', { conversationId: cryptoService.deriveConversationId(A, D), typing: true }, D)

    expect(useNetworkStore.getState().typingUsers[cryptoService.deriveConversationId(A, C)]).toBeUndefined()
    expect(useNetworkStore.getState().typingUsers[cryptoService.deriveConversationId(A, D)]).toBeUndefined()
  })
})

describe('durée de vie éphémère', () => {
  const seedPeerMessage = (): Message => {
    const message: Message = {
      id: 'peer-1',
      conversationId: 'claimed',
      senderId: B,
      type: 'text',
      content: 'secret',
      timestamp: 1,
      status: 'delivered',
    }
    useMessageStore.setState({
      messages: { [cryptoService.deriveConversationId(A, B)]: [message] },
    } as never)
    return message
  }

  it('plafonne une expiration annoncée à trente jours', () => {
    seedPeerMessage()
    const before = Date.now()
    dispatch('chat:ephemeral', { expiresAt: before + 999 * 24 * 60 * 60 * 1000 }, B)

    const stored = useMessageStore.getState().messages[cryptoService.deriveConversationId(A, B)][0]
    expect(stored.expiresAt).toBeDefined()
    expect(stored.expiresAt!).toBeLessThanOrEqual(Date.now() + 30 * 24 * 60 * 60 * 1000)
    expect(stored.expiresAt!).toBeGreaterThan(before)
  })

  it('ignore un horodatage absent, textuel ou négatif', () => {
    seedPeerMessage()
    for (const expiresAt of [undefined, 'demain', -5, Number.NaN]) {
      dispatch('chat:ephemeral', { expiresAt }, B)
    }
    const stored = useMessageStore.getState().messages[cryptoService.deriveConversationId(A, B)][0]
    expect(stored.expiresAt).toBeUndefined()
  })
})

describe('demandes de contact', () => {
  it('borne le nom et l’avatar d’une demande entrante', () => {
    dispatch('contact:request', { displayName: 'X'.repeat(500), avatar: 'data:text/html,<script>' }, D)

    const created = contactOf(D)!
    expect(created.relation).toBe('pending')
    expect(created.displayName).toHaveLength(200)
    expect(created.avatar).toBeUndefined()
  })

  it('ignore la demande d’un pair bloqué', () => {
    useContactStore.getState().addContact(contact(D, { relation: 'blocked', displayName: 'Bloqué' }))
    dispatch('contact:request', { displayName: 'Nouveau nom' }, D)

    expect(contactOf(D)?.displayName).toBe('Bloqué')
    expect(contactOf(D)?.relation).toBe('blocked')
  })

  it('borne le nom porté par une acceptation', () => {
    useContactStore.getState().addContact(contact(C, { relation: 'pending', requestDirection: 'outgoing' }))
    dispatch('contact:accept', { displayName: 'Y'.repeat(500) }, C)

    expect(contactOf(C)?.displayName).toHaveLength(200)
    expect(contactOf(C)?.relation).toBe('contact')
  })
})
