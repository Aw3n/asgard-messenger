/**
 * Ouverture d'un fil sur un résultat de recherche.
 *
 * ChatView doit charger le contexte d'un message absent de la page récente,
 * puis le centrer et le surligner — sans quoi la recherche ouvre le fil au
 * mauvais endroit.
 */
import React from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conversation } from '@/types'
import type { Message } from '@/types'

const { scrollToIndexMock, virtuosoProps } = vi.hoisted(() => ({
  scrollToIndexMock: vi.fn(),
  virtuosoProps: {} as Record<string, unknown>,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-virtuoso', async () => {
  const ReactModule = await import('react')
  const Virtuoso = ReactModule.forwardRef(
    (props: { data: Message[]; itemContent: (index: number, message: Message) => React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactModule.useImperativeHandle(ref, () => ({ scrollToIndex: scrollToIndexMock }))
      Object.assign(virtuosoProps, props)
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
    },
  )
  return { Virtuoso }
})

vi.mock('@/features/chat/components/MessageBubble', () => ({
  MessageBubble: ({ message, highlighted }: { message: Message; highlighted?: boolean }) =>
    React.createElement('div', {
      'data-testid': `bubble-${message.id}`,
      'data-highlighted': highlighted ? 'true' : 'false',
    }),
}))

vi.mock('@/features/chat/components/MessageInput', () => ({
  MessageInput: () => React.createElement('div', { 'data-testid': 'composer' }),
}))

vi.mock('@/features/chat/components/ActiveTransfersWidget', () => ({
  ActiveTransfersWidget: () => null,
}))

vi.mock('@/features/chat/components/PendingContactBanner', () => ({
  PendingContactBanner: () => null,
}))

vi.mock('@/features/chat/components/ForwardModal', () => ({
  ForwardModal: () => null,
}))

vi.mock('@/components/panels/RightPanel', () => ({
  RightPanel: () => null,
}))

vi.mock('@/services/ChatService', () => ({
  chatService: {
    loadMessages: vi.fn(),
    loadMessageContext: vi.fn(),
    loadNewerMessages: vi.fn(),
    probeContact: vi.fn(),
    sendReadReceipt: vi.fn(async () => {}),
    sendTyping: vi.fn(async () => {}),
  },
}))

vi.mock('@/services/CryptoService', () => ({
  cryptoService: {
    deriveConversationId: () => 'conv-1',
    deriveConversationTopic: async () => 'topic',
  },
}))

vi.mock('@/services/P2PService', () => ({
  p2pService: { joinTopic: vi.fn(async () => {}) },
}))

vi.mock('@/services/CallService', () => ({
  callService: { startCall: vi.fn() },
}))

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

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

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

function makeMessage(id: string, timestamp: number): Message {
  return {
    id,
    conversationId: CONVERSATION_ID,
    senderId: ME,
    type: 'text',
    content: id,
    timestamp,
    status: 'delivered',
  }
}

beforeEach(() => {
  scrollToIndexMock.mockClear()
  for (const key of Object.keys(virtuosoProps)) delete virtuosoProps[key]
  useMessageStore.setState({ messages: {} })
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

  const recent = [makeMessage('recent-1', 5_000), makeMessage('recent-2', 5_001)]
  vi.mocked(chatService.loadMessages).mockImplementation(async (conversationId: string) => {
    useMessageStore.getState().addMessages(conversationId, recent)
    return recent
  })
  vi.mocked(chatService.loadMessageContext).mockImplementation(async (conversationId: string) => {
    const contextMessages = [
      makeMessage('avant', 900),
      makeMessage('cible', 1_000),
      makeMessage('apres', 1_100),
    ]
    useMessageStore.getState().addMessages(conversationId, contextMessages)
    return contextMessages
  })
})

afterEach(() => {
  cleanup()
})

describe('ChatView : saut vers un message', () => {
  it('charge le contexte, centre et surligne le message visé', async () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: `/conversations/${CONVERSATION_ID}`,
          state: { messageId: 'cible', messageTimestamp: 1_000, conversationId: CONVERSATION_ID },
        }]}
      >
        <Routes>
          <Route path="/conversations/:conversationId" element={<ChatView />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('bubble-cible')).toHaveAttribute('data-highlighted', 'true'))
    expect(chatService.loadMessageContext).toHaveBeenCalledWith(CONVERSATION_ID, 1_000)
    // Deux messages récents + trois de contexte : la cible est le 2e message
    // chargé et l'ancrage recule de trois.
    await waitFor(() => expect(scrollToIndexMock).toHaveBeenCalledWith({
      index: 100_000 - 3 + 1,
      align: 'center',
      behavior: 'auto',
    }))
  })

  it('comble la couture vers la fenêtre récente au défilement', async () => {
    const gapPage = [makeMessage('gap-1', 2_000), makeMessage('gap-2', 3_000)]
    vi.mocked(chatService.loadNewerMessages).mockImplementation(async (conversationId: string) => {
      useMessageStore.getState().addMessages(conversationId, gapPage)
      return gapPage
    })

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: `/conversations/${CONVERSATION_ID}`,
          state: { messageId: 'cible', messageTimestamp: 1_000, conversationId: CONVERSATION_ID },
        }]}
      >
        <Routes>
          <Route path="/conversations/:conversationId" element={<ChatView />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('bubble-cible')).toHaveAttribute('data-highlighted', 'true'))

    // Le contexte s'arrête à 1100 ; la fenêtre récente commence à 5000.
    const notifyRange = virtuosoProps.rangeChanged as (range: { endIndex: number }) => void
    act(() => notifyRange({ endIndex: 4 }))

    await waitFor(() => expect(chatService.loadNewerMessages).toHaveBeenCalledWith(
      CONVERSATION_ID,
      1_100,
      'apres',
      50,
    ))
    await waitFor(() => expect(screen.getByTestId('bubble-gap-1')).toBeInTheDocument())
    expect(chatService.loadNewerMessages).toHaveBeenCalledTimes(1)
    // La page ajoutée ne doit pas tirer la vue vers le bas pendant la couture.
    expect((virtuosoProps.followOutput as (atBottom: boolean) => unknown)(true)).toBe(false)
  })
})
