/**
 * Demande de contact : ajout en attente, confirmation par réponse.
 *
 * Contrat demandé : A ajoute la clé de B ; B n'a plus qu'à répondre dans la
 * conversation pour confirmer l'ajout. Aucune acceptation automatique ne doit
 * se produire dans l'intervalle — ni à la réception de la demande, ni au
 * contact:request que les deux clients échangent en se connectant. Les tests
 * passent par le bus P2P réel, comme en production.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { chatService } from '@/services/ChatService'
import { cryptoService } from '@/services/CryptoService'
import { p2pService } from '@/services/P2PService'
import { storageService } from '@/services/StorageService'
import { confirmPendingContact, hasPendingContact } from '@/services/contactRequests'
import { useIdentityStore } from '@/stores/identityStore'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import type { Contact, ProtocolMessage } from '@/types'

const ME = 'a'.repeat(64)

let peerSeq = 0
function newPeer(): string {
  peerSeq += 1
  return peerSeq.toString(16).padStart(2, '0').repeat(32)
}

function seedContact(peer: string, relation: Contact['relation'], direction?: Contact['requestDirection']): Contact {
  const contact: Contact = {
    publicKey: peer,
    displayName: 'Pair',
    status: 'offline',
    relation,
    requestDirection: direction,
    verified: false,
    addedAt: Date.now() - 1000,
  }
  useContactStore.getState().addContact(contact)
  return contact
}

/** Reproduction de la remise P2PService : événement typé puis générique. */
function dispatch(type: string, payload: unknown, from: string): void {
  const msg = { id: 'm1', from, to: 'self', type, payload, timestamp: Date.now() } as unknown as ProtocolMessage
  p2pService.emit(`message:${type}`, msg)
  p2pService.emit('message', msg)
}

const relationOf = (peer: string) => useContactStore.getState().getContact(peer)?.relation
const directionOf = (peer: string) => useContactStore.getState().getContact(peer)?.requestDirection

const acceptCalls = () =>
  vi.mocked(p2pService.sendMessage).mock.calls.filter(([, type]) => type === 'contact:accept')

beforeAll(() => {
  chatService.initialize()
})

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'b'.repeat(128) },
      profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useContactStore.setState({ contacts: {}, searchQuery: '' })
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
  vi.spyOn(storageService, 'saveContact').mockResolvedValue(undefined)
  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'joinTopic').mockResolvedValue(undefined)
})

afterEach(() => {
  // Restore only the spies created above. vi.restoreAllMocks() also wiped the
  // implementations of the global vi.fn() mocks from setup.ts (fetchProfile
  // returned undefined, so refreshDhtPresence threw on `.catch`).
  vi.mocked(storageService.saveContact).mockRestore()
  vi.mocked(storageService.saveMessage).mockRestore()
  vi.mocked(p2pService.sendMessage).mockRestore()
  vi.mocked(p2pService.joinTopic).mockRestore()
})

describe('contactRequests — transition pending → contact', () => {
  it('confirme une demande entrante du bon sens et persiste le contact', () => {
    const peer = newPeer()
    seedContact(peer, 'pending', 'incoming')

    expect(confirmPendingContact(peer, 'incoming', false)).toBe(true)

    expect(relationOf(peer)).toBe('contact')
    expect(directionOf(peer)).toBeUndefined()
    expect(storageService.saveContact).toHaveBeenCalledTimes(1)
  })

  it('ne confirme pas le mauvais sens d\'un échange croisé', () => {
    const peer = newPeer()
    seedContact(peer, 'pending', 'outgoing')

    expect(confirmPendingContact(peer, 'incoming', false)).toBe(false)
    expect(relationOf(peer)).toBe('pending')
    expect(directionOf(peer)).toBe('outgoing')
  })

  it('ne rouvre jamais un contact bloqué', () => {
    const peer = newPeer()
    seedContact(peer, 'blocked')

    expect(confirmPendingContact(peer, 'any', true)).toBe(false)
    expect(relationOf(peer)).toBe('blocked')
    expect(acceptCalls()).toHaveLength(0)
  })

  it('notifie le pair d\'une acceptation quand demandé', () => {
    const peer = newPeer()
    seedContact(peer, 'pending', 'incoming')

    confirmPendingContact(peer, 'incoming', true)

    expect(acceptCalls()).toHaveLength(1)
    expect(acceptCalls()[0][0]).toBe(peer)
  })

  it('hasPendingContact filtre le sens de la demande', () => {
    const peer = newPeer()
    seedContact(peer, 'pending', 'incoming')

    expect(hasPendingContact(peer)).toBe(true)
    expect(hasPendingContact(peer, 'incoming')).toBe(true)
    expect(hasPendingContact(peer, 'outgoing')).toBe(false)
  })
})

describe('ChatService — demande entrante', () => {
  it('crée une relation en attente (et non un contact confirmé), sans envoyer d\'accept', () => {
    const peer = newPeer()

    dispatch('contact:request', { displayName: 'Inconnu' }, peer)

    expect(relationOf(peer)).toBe('pending')
    expect(directionOf(peer)).toBe('incoming')
    expect(useContactStore.getState().getContact(peer)?.displayName).toBe('Inconnu')
    // La conversation existe déjà pour pouvoir répondre.
    expect(useConversationStore.getState().conversations[cryptoService.deriveConversationId(ME, peer)]).toBeDefined()
    // Un contact:request automatique en se connectant ne confirme rien.
    expect(acceptCalls()).toHaveLength(0)
  })

  it('une demande entrante alors que la nôtre est déjà sortante confirme les deux', () => {
    const peer = newPeer()
    seedContact(peer, 'pending', 'outgoing')

    dispatch('contact:request', { displayName: 'Pair' }, peer)

    expect(relationOf(peer)).toBe('contact')
    expect(directionOf(peer)).toBeUndefined()
    expect(acceptCalls()).toHaveLength(1)
  })

  it('une demande entrante ne confirme pas une demande entrante déjà en attente', () => {
    const peer = newPeer()
    seedContact(peer, 'pending', 'incoming')

    dispatch('contact:request', { displayName: 'Pair' }, peer)

    expect(relationOf(peer)).toBe('pending')
    expect(directionOf(peer)).toBe('incoming')
    expect(acceptCalls()).toHaveLength(0)
  })

  it('répondre dans la conversation confirme la demande et envoie l\'accept', async () => {
    const peer = newPeer()
    seedContact(peer, 'pending', 'incoming')
    vi.spyOn(cryptoService, 'sign').mockResolvedValue('sig')
    vi.spyOn(p2pService, 'sendRawMessage').mockResolvedValue(undefined)

    await chatService.sendMessage(
      { conversationId: 'ignored', type: 'text', content: 'bonjour' },
      cryptoService.deriveConversationId(ME, peer),
      peer
    )

    expect(relationOf(peer)).toBe('contact')
    expect(directionOf(peer)).toBeUndefined()
    expect(acceptCalls()).toHaveLength(1)
  })
})

describe('ChatService — demande sortante', () => {
  it('registerContact ajoute en attente et ouvre la conversation', async () => {
    const peer = newPeer()

    const convId = await chatService.registerContact(peer, 'Ami')

    expect(convId).toBe(cryptoService.deriveConversationId(ME, peer))
    expect(relationOf(peer)).toBe('pending')
    expect(directionOf(peer)).toBe('outgoing')
    expect(useConversationStore.getState().conversations[convId]).toBeDefined()
    expect(acceptCalls()).toHaveLength(0)
  })

  it('la réponse du pair confirme la demande sortante, sans accept en écho', async () => {
    const peer = newPeer()
    seedContact(peer, 'pending', 'outgoing')
    const convId = cryptoService.deriveConversationId(ME, peer)
    useConversationStore.setState({ activeConversationId: convId })
    vi.spyOn(cryptoService, 'verify').mockResolvedValue(true)

    dispatch(
      'chat:message',
      {
        id: 'msg-1',
        conversationId: convId,
        senderId: peer,
        content: 'salut',
        timestamp: Date.now(),
        type: 'text',
        status: 'sent',
        signature: 'sig',
      },
      peer
    )

    await vi.waitFor(() => expect(relationOf(peer)).toBe('contact'))
    expect(directionOf(peer)).toBeUndefined()
    expect(acceptCalls()).toHaveLength(0)
  })

  it('ajouter la clé d\'un pair qui nous avait déjà ajoutés vaut acceptation', async () => {
    const peer = newPeer()
    seedContact(peer, 'pending', 'incoming')

    await chatService.registerContact(peer, 'Ami')

    expect(relationOf(peer)).toBe('contact')
    expect(acceptCalls()).toHaveLength(1)
  })

  it('refuse d\'ajouter un pair bloqué ou soi-même', async () => {
    const blocked = newPeer()
    seedContact(blocked, 'blocked')

    await expect(chatService.registerContact(blocked)).rejects.toThrow('blocked')
    await expect(chatService.registerContact(ME)).rejects.toThrow('yourself')
    expect(relationOf(blocked)).toBe('blocked')
  })
})

describe('ChatService — acceptations tardives', () => {
  it('une acceptation ne débloque pas un contact bloqué', () => {
    const peer = newPeer()
    seedContact(peer, 'blocked')

    dispatch('contact:accept', { displayName: 'Pair' }, peer)

    expect(relationOf(peer)).toBe('blocked')
  })

  it('une acceptation confirme une demande sortante et préserve un favori', () => {
    const pendingPeer = newPeer()
    seedContact(pendingPeer, 'pending', 'outgoing')
    const favoritePeer = newPeer()
    seedContact(favoritePeer, 'favorite')

    dispatch('contact:accept', { displayName: 'Pair' }, pendingPeer)
    dispatch('contact:accept', { displayName: 'Favori' }, favoritePeer)

    expect(relationOf(pendingPeer)).toBe('contact')
    expect(relationOf(favoritePeer)).toBe('favorite')
  })
})
