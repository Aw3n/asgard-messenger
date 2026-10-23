/**
 * File d'envoi hors ligne de ChatService.
 *
 * Le défaut d'origine : `sendMessage` avalait l'échec réseau, puis
 * `flushPendingMessages` appelait `sendMessage` de nouveau — qui re-créait un
 * message (doublon) et ré-empilait la file, donc `attempts` n'augmentait
 * jamais et le statut « failed » était inatteignable. Ces tests fixent le
 * contrat : le message signé est réutilisé, les tentatives sont bornées et un
 * échec définitif est visible dans le store.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { chatService } from '@/services/ChatService'
import { cryptoService } from '@/services/CryptoService'
import { p2pService } from '@/services/P2PService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useMessageStore } from '@/stores/messageStore'
import { useConversationStore } from '@/stores/conversationStore'

const ME = 'a'.repeat(64)

function newPeer(seed: number): string {
  return seed.toString(16).padStart(2, '0').repeat(32)
}

function resetStores(): void {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'b'.repeat(128) },
      profile: {
        publicKey: ME,
        displayName: 'Moi',
        status: 'online',
        createdAt: 0,
        updatedAt: 0,
      },
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
  useConversationStore.setState({ conversations: {}, activeConversationId: null })
}

const convIdFor = (peer: string): string => cryptoService.deriveConversationId(ME, peer)

const outgoing = (content: string) => ({ conversationId: 'ignored', type: 'text' as const, content })

let saveSpy: MockInstance<typeof storageService.saveMessage>

beforeEach(() => {
  resetStores()
  vi.spyOn(cryptoService, 'sign').mockResolvedValue('signature')
  saveSpy = vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChatService — file d’envoi hors ligne', () => {
  it('hors ligne : un seul message en file, statut « sending », aucun doublon', async () => {
    const peer = newPeer(1)
    const sendSpy = vi.spyOn(p2pService, 'sendRawMessage').mockRejectedValue(new Error('peer offline'))
    const convId = convIdFor(peer)

    const outcome = await chatService.sendMessage(outgoing('bonjour'), convId, peer)

    expect(outcome).toBe('queued')
    expect(chatService.getPendingCount(peer)).toBe(1)
    const messages = useMessageStore.getState().messages[convId]
    expect(messages).toHaveLength(1)
    expect(messages[0].status).toBe('sending')
    expect(sendSpy).toHaveBeenCalledTimes(1)

    // Reconnexion : le message signé est renvoyé tel quel, sans re-création.
    sendSpy.mockResolvedValue(undefined)
    await chatService.flushPendingMessages(peer)

    const after = useMessageStore.getState().messages[convId]
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(messages[0].id)
    expect(after[0].status).toBe('sent')
    expect(chatService.getPendingCount(peer)).toBe(0)
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it('après trois échecs de renvoi, le message passe à « failed » et quitte la file', async () => {
    const peer = newPeer(2)
    const convId = convIdFor(peer)
    vi.spyOn(p2pService, 'sendRawMessage').mockRejectedValue(new Error('still offline'))

    await chatService.sendMessage(outgoing('perdu ?'), convId, peer)
    expect(chatService.getPendingCount(peer)).toBe(1)

    await chatService.flushPendingMessages(peer) // tentative 1
    expect(useMessageStore.getState().messages[convId][0].status).toBe('sending')
    await chatService.flushPendingMessages(peer) // tentative 2
    expect(useMessageStore.getState().messages[convId][0].status).toBe('sending')
    await chatService.flushPendingMessages(peer) // tentative 3 → abandon

    expect(useMessageStore.getState().messages[convId][0].status).toBe('failed')
    expect(chatService.getPendingCount(peer)).toBe(0)
  })

  it('un échec local de signature marque le message « failed » et propage l’erreur', async () => {
    const peer = newPeer(3)
    const convId = convIdFor(peer)
    const sendSpy = vi.spyOn(p2pService, 'sendRawMessage').mockResolvedValue(undefined)
    vi.spyOn(cryptoService, 'sign').mockRejectedValue(new Error('sign failed'))

    await expect(chatService.sendMessage(outgoing('cassé'), convId, peer)).rejects.toThrow('sign failed')

    expect(useMessageStore.getState().messages[convId][0].status).toBe('failed')
    expect(chatService.getPendingCount(peer)).toBe(0)
    expect(sendSpy).not.toHaveBeenCalled()
  })
})
