/**
 * Ouverture d'un fil sur un résultat de recherche.
 *
 * ChatView doit charger le contexte d'un message absent de la page récente,
 * puis le centrer et le surligner — sans quoi la recherche ouvre le fil au
 * mauvais endroit. Et une page qui ne vient pas doit se voir sans fermer la
 * pagination : la panne était prise pour une fin d'historique.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
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

// La bulle de test porte l'identifiant de rangée et le focus, comme le vrai
// composant : c'est ainsi qu'un geste réglé sait sur quel message il porte.
vi.mock('@/features/chat/components/MessageBubble', () => ({
  MessageBubble: ({ message, highlighted }: { message: Message; highlighted?: boolean }) =>
    React.createElement('div', {
      'data-testid': `bubble-${message.id}`,
      'data-message-id': message.id,
      tabIndex: 0,
      'data-highlighted': highlighted ? 'true' : 'false',
    }),
}))

// Le composeur de test rend visible la cible qu'on lui passe : réponse en cours
// ou message en édition, sinon rien de ce que décide le fil ne serait observable.
vi.mock('@/features/chat/components/MessageInput', () => ({
  MessageInput: (props: { replyTo?: Message; editingMessage?: Message }) =>
    React.createElement('div', {
      'data-testid': 'composer',
      'data-reply': props.replyTo?.id ?? '',
      'data-edit': props.editingMessage?.id ?? '',
    }),
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
    loadOlderMessages: vi.fn(async () => [] as Message[]),
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
import { useUIStore } from '@/stores/uiStore'

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

const baselineShortcuts = { ...useUIStore.getState().settings.keyboardShortcuts }

const setShortcut = (name: keyof typeof baselineShortcuts, combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, [name]: combo } })
}

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
  setShortcut('replyToMessage', 'Ctrl+R')
  setShortcut('editLastMessage', 'Ctrl+E')
  vi.mocked(chatService.loadOlderMessages).mockClear()
  vi.mocked(chatService.loadMessages).mockClear()
  for (const key of Object.keys(virtuosoProps)) delete virtuosoProps[key]
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
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...baselineShortcuts } })
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

const toastTitles = () => useUIStore.getState().toasts.map((toast) => toast.title)

describe('ChatView : barre des messages épinglés', () => {
  it('est libellée dans la langue affichée, sans accord de nombre bricolé', async () => {
    renderThread()
    await waitFor(() => expect(screen.getByTestId('bubble-recent-1')).toBeInTheDocument())

    act(() => {
      useMessageStore.getState().pinMessage('recent-1', CONVERSATION_ID)
      useMessageStore.getState().pinMessage('recent-2', CONVERSATION_ID)
    })

    // La barre était du français codé en dur avec un « s » de pluriel choisi en
    // JSX : l'en-tête est traduit et le nombre juxtaposé, donc rien n'accorde.
    expect(screen.getByText('chat.pinnedMessages · 2')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/épinglé/)
  })
})

function renderThread() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/conversations/${CONVERSATION_ID}` }]}>
      <Routes>
        <Route path="/conversations/:conversationId" element={<ChatView />} />
      </Routes>
    </MemoryRouter>,
  )
}

function olderPage(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => makeMessage(`ancien-${index}`, 1_000 + index))
}

describe('ChatView : panne de lecture de l’historique', () => {
  it('annonce la panne et laisse la pagination se retenter', async () => {
    vi.mocked(chatService.loadOlderMessages).mockResolvedValue(null)

    renderThread()
    await waitFor(() => expect(screen.getByTestId('bubble-recent-1')).toBeInTheDocument())

    const startReached = virtuosoProps.startReached as () => void
    act(() => { startReached() })
    await waitFor(() => expect(chatService.loadOlderMessages).toHaveBeenCalledWith(
      CONVERSATION_ID,
      5_001,
      50,
    ))
    expect(toastTitles()).toEqual(['chat.historyLoadFailed'])

    // Un bord haut suivant relit la même page : la panne n'a pas fermé la
    // pagination — et n'a pas empilé un second toast pour la même panne.
    act(() => { startReached() })
    await waitFor(() => expect(chatService.loadOlderMessages).toHaveBeenCalledTimes(2))
    expect(chatService.loadOlderMessages).toHaveBeenLastCalledWith(CONVERSATION_ID, 5_001, 50)
    expect(toastTitles()).toEqual(['chat.historyLoadFailed'])
  })

  it('n’annonce rien quand la page ancienne arrive', async () => {
    vi.mocked(chatService.loadOlderMessages).mockImplementation(async (conversationId) => {
      const page = olderPage(50)
      useMessageStore.getState().addMessages(conversationId, page)
      return page
    })

    renderThread()
    await waitFor(() => expect(screen.getByTestId('bubble-recent-1')).toBeInTheDocument())

    act(() => { (virtuosoProps.startReached as () => void)() })
    await waitFor(() => expect(screen.getByTestId('bubble-ancien-49')).toBeInTheDocument())
    expect(toastTitles()).toEqual([])
  })

  it('annonce la panne du contexte d’un saut', async () => {
    vi.mocked(chatService.loadMessageContext).mockResolvedValue(null)

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
      </MemoryRouter>,
    )

    // Le saut ne montre ni la cible ni un trou silencieux : l'échec se voit.
    await waitFor(() => expect(chatService.loadMessageContext).toHaveBeenCalled())
    expect(toastTitles()).toEqual(['chat.historyLoadFailed'])
    expect(screen.queryByTestId('bubble-cible')).not.toBeInTheDocument()
  })

  it('annonce un fil dont la page de démarrage ne vient pas', async () => {
    vi.mocked(chatService.loadMessages).mockResolvedValue(null)

    renderThread()

    await waitFor(() => expect(toastTitles()).toEqual(['chat.historyLoadFailed']))
    // Le fil doit rester affichable malgré la panne : la liste vide doit
    // partager une référence stable, sinon la vue se relance sans fin.
    expect(screen.queryByText(/chat\.sendToStart/)).not.toBeInTheDocument()
    // Un fil vide parce qu'il n'a rien chargé n'est pas un fil vide : la panne
    // reste à l'écran quand le toast s'est effacé.
    expect(screen.getByRole('alert')).toHaveTextContent('chat.historyLoadFailed')
  })

  it('rejoue la panne de démarrage depuis l’écran', async () => {
    const recent = [makeMessage('recent-1', 5_000), makeMessage('recent-2', 5_001)]
    vi.mocked(chatService.loadMessages)
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async (conversationId: string) => {
        useMessageStore.getState().addMessages(conversationId, recent)
        return recent
      })

    renderThread()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(chatService.loadMessages).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))

    await waitFor(() => expect(chatService.loadMessages).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByTestId('bubble-recent-1')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('n’annonce rien sur un fil vraiment vide', async () => {
    vi.mocked(chatService.loadMessages).mockResolvedValue([])

    renderThread()

    await waitFor(() => expect(screen.getByText(/chat\.sendToStart/)).toBeInTheDocument())
    expect(toastTitles()).toEqual([])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('ChatView : retour au bas annoncé', () => {
  it('nomme le nombre de messages reçus sous la lecture', async () => {
    renderThread()
    await waitFor(() => expect(screen.getByTestId('bubble-recent-2')).toBeInTheDocument())

    act(() => { (virtuosoProps.atBottomStateChange as (atBottom: boolean) => void)(false) })
    act(() => {
      useMessageStore.getState().addMessages(CONVERSATION_ID, [
        { ...makeMessage('peer-1', 6_000), senderId: PEER },
      ])
    })

    // La pastille « 1 » est masquée au lecteur d'écran : c'est le nom
    // accessible du bouton qui doit porter le compte.
    const button = await screen.findByRole('button', {
      name: 'chat.scrollToLatest, nav.unreadCount:1',
    })
    expect(button).toHaveAttribute('title', 'chat.scrollToLatest')
  })
})

describe('ChatView : gestes réglés branchés sur le fil', () => {
  /** Frappe jouée depuis la rangée, comme une touche physique sur le focus. */
  const pressOn = (element: Element, key: string, modifiers: Record<string, boolean> = {}) => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...modifiers })
    act(() => { element.dispatchEvent(event) })
    return event
  }

  const composerReply = () => screen.getByTestId('composer').getAttribute('data-reply')

  it('donne à la réponse réglée la rangée sous le focus', async () => {
    renderThread()
    await waitFor(() => expect(screen.getByTestId('bubble-recent-2')).toBeInTheDocument())

    const row = screen.getByTestId('bubble-recent-2')
    act(() => { row.focus() })
    pressOn(row, 'r', { ctrlKey: true })

    expect(composerReply()).toBe('recent-2')
  })

  it('édite le dernier message à soi, même sans rangée focalisée', async () => {
    renderThread()
    await waitFor(() => expect(screen.getByTestId('bubble-recent-2')).toBeInTheDocument())

    pressOn(document.body, 'e', { ctrlKey: true })

    expect(screen.getByTestId('composer').getAttribute('data-edit')).toBe('recent-2')
  })

  it('suit la combinaison écrite, pas un geste de menu', async () => {
    setShortcut('replyToMessage', 'Ctrl+Alt+V')
    renderThread()
    await waitFor(() => expect(screen.getByTestId('bubble-recent-1')).toBeInTheDocument())

    const row = screen.getByTestId('bubble-recent-1')
    act(() => { row.focus() })
    pressOn(row, 'r', { ctrlKey: true })
    expect(composerReply()).toBe('')

    pressOn(row, 'v', { ctrlKey: true, altKey: true })
    expect(composerReply()).toBe('recent-1')
  })
})
