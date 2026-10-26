/**
 * Fil 1:1 : « supprimer pour tous » pouvait rester local sans le dire.
 *
 * Le message disparaît de cet appareil avant que le service prévienne le pair.
 * Si l'envoi échoue, le contact garde le message, et l'utilisateur croyait
 * l'avoir effacé pour tout le monde. L'échec se dit désormais ; une suppression
 * acceptée reste silencieuse.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conversation, Message } from '@/types'
import type { DeleteMode } from '@/hooks/useDeleteConfirmation'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-virtuoso', async () => {
  const ReactModule = await import('react')
  const Virtuoso = ReactModule.forwardRef((props: {
    data: Message[]
    itemContent: (index: number, message: Message) => React.ReactNode
  }, ref: React.Ref<unknown>) => {
    ReactModule.useImperativeHandle(ref, () => ({ scrollToIndex: vi.fn() }))
    return ReactModule.createElement(
      'div',
      { 'data-testid': 'virtual-list' },
      props.data.map((message, index) =>
        ReactModule.createElement(
          'div',
          { key: message.id, 'data-index': index },
          props.itemContent(index, message),
        ),
      ),
    )
  })
  return { Virtuoso }
})

// La bulle de test expose les modes de suppression que le fil lui confie.
vi.mock('@/features/chat/components/MessageBubble', () => ({
  MessageBubble: (props: {
    message: Message
    onDelete?: (message: Message, mode: DeleteMode) => void
    deleteModes?: DeleteMode[]
  }) =>
    React.createElement(
      'div',
      { 'data-testid': `bubble-${props.message.id}` },
      (props.deleteModes ?? []).map((mode) =>
        React.createElement(
          'button',
          { key: mode, onClick: () => props.onDelete?.(props.message, mode) },
          `delete-${mode}`,
        ),
      ),
    ),
}))

vi.mock('@/features/chat/components/MessageInput', () => ({
  MessageInput: () => React.createElement('div', { 'data-testid': 'composer' }),
}))

vi.mock('@/features/chat/components/ActiveTransfersWidget', () => ({ ActiveTransfersWidget: () => null }))
vi.mock('@/features/chat/components/PendingContactBanner', () => ({ PendingContactBanner: () => null }))
vi.mock('@/features/chat/components/ForwardModal', () => ({ ForwardModal: () => null }))
vi.mock('@/components/panels/RightPanel', () => ({ RightPanel: () => null }))

vi.mock('@/services/ChatService', () => ({
  chatService: {
    loadMessages: vi.fn(),
    loadOlderMessages: vi.fn(async () => [] as Message[]),
    loadMessageContext: vi.fn(),
    loadNewerMessages: vi.fn(),
    probeContact: vi.fn(async () => null),
    sendReadReceipt: vi.fn(async () => {}),
    sendTyping: vi.fn(async () => {}),
    deleteMessage: vi.fn(),
    deleteMessagePermanently: vi.fn(),
  },
}))

vi.mock('@/services/CryptoService', () => ({
  cryptoService: {
    deriveConversationId: () => 'conv-1',
    deriveConversationTopic: async () => 'topic',
  },
}))
vi.mock('@/services/P2PService', () => ({ p2pService: { joinTopic: vi.fn(async () => {}) } }))
vi.mock('@/services/CallService', () => ({ callService: { startCall: vi.fn() } }))
vi.mock('@/services/FileService', () => ({
  fileService: { sendFiles: vi.fn() },
  PeerUnreachableError: class extends Error {},
  TransferCancelledError: class extends Error {},
}))

import { ChatView } from '@/features/chat/ChatView'
import { chatService } from '@/services/ChatService'
import { useConversationStore } from '@/stores/conversationStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)
const CONVERSATION_ID = 'conv-1'

const conversation: Conversation = {
  id: CONVERSATION_ID,
  type: 'direct',
  participantId: PEER,
  unreadCount: 0,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt: 2,
}

const ownMessage = (): Message => ({
  id: 'm1',
  conversationId: CONVERSATION_ID,
  senderId: ME,
  type: 'text',
  content: 'à supprimer',
  timestamp: 5_000,
  status: 'delivered',
})

const toasts = () => useUIStore.getState().toasts

/** Ouvre le fil, demande le mode de suppression et acquiesce. */
const confirmDelete = async (mode: 'forEveryone' | 'permanently', confirmLabel: string) => {
  render(
    <MemoryRouter initialEntries={[`/conversations/${CONVERSATION_ID}`]}>
      <Routes>
        <Route path="/conversations/:conversationId" element={<ChatView />} />
      </Routes>
    </MemoryRouter>,
  )

  fireEvent.click(await screen.findByRole('button', { name: `delete-${mode}` }))
  const dialog = await screen.findByRole('dialog', { name: 'chat.deleteMessageConfirm' })
  fireEvent.click(within(dialog).getByRole('button', { name: confirmLabel }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  window.scrollTo = () => {}
  useMessageStore.setState({ messages: {} })
  useUIStore.setState({ toasts: [] })
  useConversationStore.setState({
    conversations: { [CONVERSATION_ID]: { ...conversation } },
    activeConversationId: CONVERSATION_ID,
  })
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'c'.repeat(128) },
      profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })

  const messages = [ownMessage()]
  vi.mocked(chatService.loadMessages).mockImplementation(async (conversationId: string) => {
    useMessageStore.getState().addMessages(conversationId, messages)
    return messages
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('supprimer un message pour tous en 1:1', () => {
  it('un avis au contact raté se dit, sans prétendre au succès', async () => {
    vi.mocked(chatService.deleteMessage).mockRejectedValueOnce(new Error('pair injoignable'))
    await confirmDelete('forEveryone', 'chat.deleteForEveryone')

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'chat.deleteForEveryoneFailed')
      expect(toast?.type).toBe('error')
    })
    expect(chatService.deleteMessage).toHaveBeenCalledWith('m1', CONVERSATION_ID, PEER)
  })

  it('une suppression acceptée reste silencieuse', async () => {
    vi.mocked(chatService.deleteMessage).mockResolvedValueOnce(undefined)
    await confirmDelete('forEveryone', 'chat.deleteForEveryone')

    await waitFor(() => expect(chatService.deleteMessage).toHaveBeenCalledTimes(1))
    expect(toasts().some((entry) => entry.title === 'chat.deleteForEveryoneFailed')).toBe(false)
  })

  it('la suppression définitive prévient aussi quand l’avis au contact échoue', async () => {
    vi.mocked(chatService.deleteMessagePermanently).mockRejectedValueOnce(new Error('pair injoignable'))
    await confirmDelete('permanently', 'chat.deletePermanently')

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'chat.deleteForEveryoneFailed')
      expect(toast?.type).toBe('error')
    })
    expect(chatService.deleteMessagePermanently).toHaveBeenCalledWith('m1', CONVERSATION_ID, PEER)
  })
})
