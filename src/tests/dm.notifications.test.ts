/**
 * Notifications d'un message direct : le réglage « mentions uniquement » ne
 * vaut que pour les groupes. Sa description, dans les 25 langues, promet les
 * messages directs ; les étouffer contredisait le libellé affiché.
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
import { useUIStore } from '@/stores/uiStore'
import type { ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

type NotifSettings = ReturnType<typeof useUIStore.getState>['settings']['notifications']

const setNotifications = (patch: Partial<NotifSettings>): void => {
  useUIStore.setState((state) => ({
    settings: { ...state.settings, notifications: { ...state.settings.notifications, ...patch } },
  }))
}

const show = () => vi.mocked(window.asgard.notifications.show)

const deliver = async (id: string, content: string): Promise<void> => {
  const fn = (chatService as unknown as {
    handleIncomingMessage: (msg: ProtocolMessage) => Promise<void>
  }).handleIncomingMessage.bind(chatService)
  await fn({
    id: 'envelope',
    from: B,
    to: A,
    type: 'chat:message',
    timestamp: Date.now(),
    payload: { id, conversationId: 'ignored', senderId: B, type: 'text', content, timestamp: Date.now(), signature: 'sig' },
  } as unknown as ProtocolMessage)
}

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
  setNotifications({
    enabled: true, sound: false, dndMode: false, showPreview: true, mentionsOnly: false,
    scheduledDnd: false, dndFrom: undefined, dndTo: undefined,
  })
  show().mockClear()

  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
  vi.spyOn(cryptoService, 'verify').mockResolvedValue(true)
})

afterEach(() => {
  vi.mocked(storageService.saveMessage).mockRestore()
  vi.mocked(p2pService.sendMessage).mockRestore()
  vi.mocked(cryptoService.verify).mockRestore()
})

describe('notifications d’un message direct', () => {
  it('notifie un message sans mention même avec « mentions uniquement »', async () => {
    setNotifications({ mentionsOnly: true })

    await deliver('dm-1', 'tu es là ?')

    expect(show()).toHaveBeenCalledTimes(1)
    expect(show()).toHaveBeenCalledWith('b'.repeat(8), 'tu es là ?', {
      conversationId: cryptoService.deriveConversationId(A, B),
    })
  })

  it('notifie encore quand le réglage est désactivé', async () => {
    await deliver('dm-2', 'bonjour')

    expect(show()).toHaveBeenCalledTimes(1)
  })

  it('ne notifie pas quand les notifications sont coupées', async () => {
    setNotifications({ enabled: false })

    await deliver('dm-3', 'coupé')

    expect(show()).not.toHaveBeenCalled()
  })

  it('ne notifie pas la conversation affichée', async () => {
    useConversationStore.setState({
      activeConversationId: cryptoService.deriveConversationId(A, B),
      chatViewVisible: true,
    })

    await deliver('dm-4', 'vu en direct')

    expect(show()).not.toHaveBeenCalled()
  })
})
