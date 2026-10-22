/**
 * Présence DHT : une copie plus ancienne ne doit jamais contredire un signal
 * P2P frais, et une sonde de conversation doit composer tout de suite le pair.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { chatService } from '@/services/ChatService'
import { p2pService } from '@/services/P2PService'
import { groupService } from '@/services/GroupService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useContactStore } from '@/stores/contactStore'
import { useNetworkStore } from '@/stores/networkStore'
import { useGroupStore } from '@/stores/groupStore'
import type { Contact, ProtocolMessage } from '@/types'

const ME = 'a'.repeat(64)

let peerSeq = 0
function newPeer(): string {
  peerSeq += 1
  return peerSeq.toString(16).padStart(2, '0').repeat(32)
}

function seedContact(peer: string, relation: Contact['relation'] = 'contact'): Contact {
  const contact: Contact = {
    publicKey: peer,
    displayName: 'Pair',
    status: 'offline',
    relation,
    verified: false,
    addedAt: Date.now() - 1000,
  }
  useContactStore.getState().addContact(contact)
  return contact
}

const statusOf = (peer: string) => useContactStore.getState().getContact(peer)?.status

function dispatch(type: string, payload: unknown, from: string): void {
  const msg = { id: 'm1', from, to: 'self', type, payload, timestamp: Date.now() } as unknown as ProtocolMessage
  p2pService.emit(`message:${type}`, msg)
}

beforeAll(() => {
  chatService.initialize()
  groupService.initialize()
})

beforeEach(() => {
  vi.clearAllMocks()
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'b'.repeat(128) },
      profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useContactStore.setState({ contacts: {}, searchQuery: '' })
  useNetworkStore.setState({ peers: {} })
  useGroupStore.setState({ groups: {}, groupPresence: {} })
  vi.spyOn(storageService, 'saveContact').mockResolvedValue(undefined)
})

describe('ChatService.applyDhtProfile — priorité des signaux', () => {
  it('applique un profil DHT frais et traduit dnd en occupé', () => {
    const peer = newPeer()
    seedContact(peer)

    expect(chatService.applyDhtProfile(peer, { status: 'dnd', timestamp: Date.now() })).toBe(true)
    expect(statusOf(peer)).toBe('busy')
  })

  it('passe hors ligne quand le record DHT est absent ou périmé', () => {
    const peer = newPeer()
    seedContact(peer)
    useContactStore.getState().updateContact(peer, { status: 'online' })

    expect(chatService.applyDhtProfile(peer, null)).toBe(true)
    expect(statusOf(peer)).toBe('offline')

    useContactStore.getState().updateContact(peer, { status: 'online' })
    expect(chatService.applyDhtProfile(peer, {
      status: 'online',
      timestamp: Date.now() - 10 * 60 * 1000,
    })).toBe(true)
    expect(statusOf(peer)).toBe('offline')
  })

  it('ignore un socket P2P ouvert, même si le DHT dit le contraire', () => {
    const peer = newPeer()
    seedContact(peer)
    useContactStore.getState().updateContact(peer, { status: 'online' })
    useNetworkStore.setState({
      peers: {
        [peer]: {
          id: peer,
          publicKey: peer,
          remotePublicKey: peer,
          connected: true,
          connectedAt: Date.now(),
        },
      },
    })

    expect(chatService.applyDhtProfile(peer, { status: 'away', timestamp: Date.now() })).toBe(false)
    expect(statusOf(peer)).toBe('online')
  })

  it('ignore le DHT après une déclaration P2P récente', () => {
    const peer = newPeer()
    seedContact(peer)
    dispatch('presence:update', { status: 'away' }, peer)

    expect(statusOf(peer)).toBe('away')
    expect(chatService.applyDhtProfile(peer, { status: 'online', timestamp: Date.now() })).toBe(false)
    expect(statusOf(peer)).toBe('away')
  })

  it('ne touche jamais un contact bloqué ni inconnu', () => {
    const blocked = newPeer()
    seedContact(blocked, 'blocked')
    useContactStore.getState().updateContact(blocked, { status: 'busy' })

    expect(chatService.applyDhtProfile(blocked, { status: 'online', timestamp: Date.now() })).toBe(false)
    expect(statusOf(blocked)).toBe('busy')
    expect(chatService.applyDhtProfile(newPeer(), { status: 'online', timestamp: Date.now() })).toBe(false)
  })

  it('ne signale aucun changement quand le statut est déjà le bon', () => {
    const peer = newPeer()
    seedContact(peer)
    useContactStore.getState().updateContact(peer, { status: 'away' })

    expect(chatService.applyDhtProfile(peer, { status: 'away', timestamp: Date.now() })).toBe(false)
  })
})

describe('ChatService.probeContact — découverte immédiate', () => {
  it('compose le pair et lit son profil au premier probe, puis se tait 8 s', async () => {
    const peer = newPeer()
    seedContact(peer)

    chatService.probeContact(peer)
    chatService.probeContact(peer)

    await vi.waitFor(() => expect(window.asgard.network.connectToContact).toHaveBeenCalledTimes(1))
    expect(window.asgard.network.deriveNoisePublicKey).toHaveBeenCalledTimes(1)
    expect(window.asgard.network.fetchProfile).toHaveBeenCalledTimes(1)
  })

  it('ne sonde jamais un contact bloqué', () => {
    const peer = newPeer()
    seedContact(peer, 'blocked')

    chatService.probeContact(peer)

    expect(window.asgard.network.deriveNoisePublicKey).not.toHaveBeenCalled()
    expect(window.asgard.network.fetchProfile).not.toHaveBeenCalled()
  })

  it('registerContact compose le pair sans attendre le topic', async () => {
    const peer = newPeer()

    await chatService.registerContact(peer, 'Ami')

    await vi.waitFor(() => expect(window.asgard.network.connectToContact).toHaveBeenCalledTimes(1))
    expect(window.asgard.network.connectToContact).toHaveBeenCalledWith('c'.repeat(64), true)
  })
})

describe('GroupService — découverte et présence après redémarrage', () => {
  function newGroup(name: string) {
    return useGroupStore.getState().createGroup({
      name,
      ownerId: ME,
      ownerDisplayName: 'Moi',
    })
  }

  it('rejoint le topic de chaque groupe qui a une clé d’invitation', async () => {
    const withKey = newGroup('Avec clé')
    useGroupStore.getState().generateInviteKey(withKey.id)
    newGroup('Sans clé')
    const joinTopic = vi.spyOn(p2pService, 'joinTopic').mockResolvedValue(undefined)

    await groupService.joinAllGroupTopics()

    expect(joinTopic).toHaveBeenCalledTimes(1)
    joinTopic.mockRestore()
  })

  it('envoie notre présence au pair identifié qui partage un groupe, à lui seul', async () => {
    const peer = newPeer()
    const group = newGroup('Commun')
    useGroupStore.getState().addMember(group.id, {
      publicKey: peer,
      displayName: 'Pair',
      role: 'member',
      joinedAt: Date.now(),
      canPost: true,
    })
    const other = newGroup('Autre')
    useGroupStore.getState().addMember(other.id, {
      publicKey: newPeer(),
      displayName: 'Autre',
      role: 'member',
      joinedAt: Date.now(),
      canPost: true,
    })
    const send = vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)

    p2pService.emit('peer:identified', { peerId: 'noise', publicKey: peer })

    await vi.waitFor(() =>
      expect(send.mock.calls.filter(([, type]) => type === 'group:presence')).toHaveLength(1))
    const presence = send.mock.calls.filter(([, type]) => type === 'group:presence')
    const [target, type, payload] = presence[0]
    expect(target).toBe(peer)
    expect(type).toBe('group:presence')
    expect((payload as { groupId: string }).groupId).toBe(group.id)

    // Le snapshot d'effectif suit le même chemin : au pair seul, et uniquement
    // pour le groupe qu'il partage.
    await vi.waitFor(() =>
      expect(send.mock.calls.filter(([, t]) => t === 'group:update')).toHaveLength(1))
    const [, , roster] = send.mock.calls.find(([, t]) => t === 'group:update')!
    expect((roster as { groupId: string }).groupId).toBe(group.id)
    expect((roster as { action: string }).action).toBe('roster:sync')
    send.mockRestore()
  })
})
