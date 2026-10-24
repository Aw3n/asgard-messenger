/**
 * Deux confirmations étaient restées hors du système des dialogues : « supprimer
 * la conversation » en haut du fil et « supprimer le fichier » sur une pièce
 * jointe. Fond sombre pleine fenêtre, bouton « Annuler », et pourtant la touche
 * réglée `closeModal` n’y pouvait rien, le focus restait derrière le voile et un
 * lecteur d’écran ne savait pas ce qui venait de s’ouvrir.
 *
 * Elles sont maintenant des dialogues comme les autres : nommés, modaux, focus
 * pris à l’ouverture et rendu au déclencheur, refermés par la combinaison de
 * l’utilisateur — et leur « Annuler » la nomme, la suit, et se tait quand le
 * geste est éteint.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { Conversation, Message, MessageAttachment } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr', changeLanguage: vi.fn() } }),
}))

vi.mock('react-virtuoso', async () => {
  const ReactModule = await import('react')
  return {
    Virtuoso: ({ data }: { data: Message[] }) =>
      ReactModule.createElement('div', { 'data-testid': 'virtual-list' }, data.map((m) =>
        ReactModule.createElement('div', { key: m.id }, m.content),
      )),
  }
})

vi.mock('@/features/chat/components/MessageBubble', () => ({
  MessageBubble: ({ message }: { message: Message }) =>
    React.createElement('div', { 'data-testid': `bubble-${message.id}` }),
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
    loadMessages: vi.fn(async () => [] as Message[]),
    loadOlderMessages: vi.fn(async () => [] as Message[]),
    loadMessageContext: vi.fn(async () => [] as Message[]),
    loadNewerMessages: vi.fn(async () => [] as Message[]),
    probeContact: vi.fn(async () => null),
    sendReadReceipt: vi.fn(async () => {}),
    sendTyping: vi.fn(async () => {}),
    deleteConversation: vi.fn(async () => {}),
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

import { ChatView } from '@/features/chat/ChatView'
import { FileAttachment } from '@/features/chat/components/FileAttachment'
import { chatService } from '@/services/ChatService'
import { fileService } from '@/services/FileService'
import { useConversationStore } from '@/stores/conversationStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'
import { DEFAULT_KEYBOARD_SHORTCUTS } from '@/utils/shortcuts'

// L'avatar du bandeau d'en-tête se charge à l'entrée dans le champ de vision :
// jsdom n'a pas cette horloge et la montée de l'effet ferait planter le rendu.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)
const CONVERSATION_ID = 'conv-1'
const REBOUND = 'Ctrl+Shift+X'

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

const documentAttachment = (over: Partial<MessageAttachment> = {}): MessageAttachment => ({
  id: 'att-1',
  type: 'document',
  name: 'report.pdf',
  size: 2048,
  mimeType: 'application/pdf',
  blobKey: 'blob-1',
  ...over,
})

const bindCloseKey = (combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  act(() => {
    useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, closeModal: combo } })
  })
}

const announced = (button: HTMLElement, aria: string, shown: string) => {
  expect(button).toHaveAttribute('aria-keyshortcuts', aria)
  expect(button.getAttribute('title') ?? '').toBe(`common.cancel — ${shown}`)
}

const mute = (button: HTMLElement) => {
  expect(button).not.toHaveAttribute('aria-keyshortcuts')
  expect(button.getAttribute('title') ?? '').toBe('common.cancel')
}

/** Une surface et la façon d’y atteindre sa confirmation. */
interface Surface {
  label: string
  open: () => HTMLElement
  dialog: () => HTMLElement
  cancel: () => HTMLElement
  gone: () => boolean
  erased: () => boolean
}

/**
 * Un vrai clic pose le focus sur le bouton touché ; jsdom ne le fait pas, et
 * sans cette ligne le dialogue n’aurait rien à rendre et l’assertion du retour
 * de focus passerait à vide.
 */
const press = (trigger: HTMLElement) => {
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}

const surfaces: Surface[] = [
  {
    label: 'suppression de la conversation',
    open: () => {
      render(
        <MemoryRouter initialEntries={[{ pathname: `/conversations/${CONVERSATION_ID}` }]}>
          <Routes>
            <Route path="/conversations/:conversationId" element={<ChatView />} />
          </Routes>
        </MemoryRouter>,
      )
      return press(screen.getByRole('button', { name: 'chat.deleteConversation' }))
    },
    dialog: () => screen.getByRole('dialog', { name: 'chat.deleteConversation' }),
    cancel: () => within(screen.getByRole('dialog', { name: 'chat.deleteConversation' })).getByRole('button', { name: 'common.cancel' }),
    gone: () => screen.queryByRole('dialog', { name: 'chat.deleteConversation' }) === null,
    erased: () => vi.mocked(chatService.deleteConversation).mock.calls.length > 0,
  },
  {
    label: 'suppression d’un fichier joint',
    open: () => {
      render(<FileAttachment attachment={documentAttachment()} isOwn messageId="m1" conversationId={CONVERSATION_ID} />)
      return press(screen.getByRole('button', { name: 'chat.deleteFile' }))
    },
    dialog: () => screen.getByRole('dialog', { name: 'chat.deleteFileConfirm' }),
    cancel: () => within(screen.getByRole('dialog', { name: 'chat.deleteFileConfirm' })).getByRole('button', { name: 'common.cancel' }),
    gone: () => screen.queryByRole('dialog', { name: 'chat.deleteFileConfirm' }) === null,
    erased: () => vi.mocked(useMessageStore.getState().deleteFileAttachment).mock.calls.length > 0,
  },
]

const realDeleteFileAttachment = useMessageStore.getState().deleteFileAttachment

/** Le seul espion de ce fichier : la restauration se fait à la main, pas en bloc. */
let liveUrl: MockInstance<typeof fileService.isLiveUrl>

beforeEach(() => {
  window.scrollTo = () => {}
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  liveUrl = vi.spyOn(fileService, 'isLiveUrl').mockReturnValue(true)
  vi.mocked(chatService.deleteConversation).mockClear()
  useMessageStore.setState({ deleteFileAttachment: vi.fn(async () => true), messages: {} })
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
  bindCloseKey(DEFAULT_KEYBOARD_SHORTCUTS.closeModal)
})

afterEach(() => {
  cleanup()
  // Pas de `vi.restoreAllMocks()` ici : il effacerait les implémentations des
  // `vi.fn()` de `window.asgard` posées par setup.ts, et le prochain rendu d’une
  // vue qui lit le pont Electron planterait sur un `undefined.then()`.
  liveUrl.mockRestore()
  vi.unstubAllGlobals()
  useMessageStore.setState({ deleteFileAttachment: realDeleteFileAttachment })
  bindCloseKey(DEFAULT_KEYBOARD_SHORTCUTS.closeModal)
})

describe.each(surfaces)('$label', (surface) => {
  it('s’ouvre comme un dialogue nommé et en prend le focus', () => {
    surface.open()
    // Sans le focus, la touche réglée partirait du corps de page et un lecteur
    // d’écran ne dirait pas ce qui vient de couvrir l’écran.
    expect(screen.getByRole('dialog', { name: /chat\./ })).toHaveAttribute('aria-modal', 'true')
    expect(surface.dialog()).toHaveFocus()
  })

  it('son Annuler nomme la touche réglée', () => {
    surface.open()
    announced(surface.cancel(), 'Escape', 'Escape')
  })

  it('suit le réglage : la touche annoncée est celle qui referme', () => {
    surface.open()
    bindCloseKey(REBOUND)
    announced(surface.cancel(), 'Control+Shift+X', 'Ctrl + Shift + X')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(surface.gone()).toBe(false)

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true })
    return waitFor(() => expect(surface.gone()).toBe(true))
  })

  it('geste éteint : plus aucune annonce, Annuler referme toujours', () => {
    surface.open()
    bindCloseKey('')
    mute(surface.cancel())

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(surface.gone()).toBe(false)

    fireEvent.click(surface.cancel())
    return waitFor(() => expect(surface.gone()).toBe(true))
  })

  it('referme sans rien effacer, et rend le focus à ce qui a ouvert', async () => {
    const trigger = surface.open()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(surface.gone()).toBe(true))
    expect(surface.erased()).toBe(false)
    expect(trigger).toHaveFocus()
  })

  it('laisse seule une frappe en cours de composition', () => {
    surface.open()
    bindCloseKey(REBOUND)
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true, isComposing: true })
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true, keyCode: 229 })
    expect(surface.gone()).toBe(false)
    expect(surface.erased()).toBe(false)
  })

  it('ne détruit qu’à la confirmation explicite', async () => {
    surface.open()
    fireEvent.click(within(surface.dialog()).getByRole('button', { name: /delete/ }))
    await waitFor(() => expect(surface.erased()).toBe(true))
  })
})

describe('échec de la suppression depuis le fil', () => {
  it('annonce l’échec au lieu de refermer en silence', async () => {
    vi.mocked(chatService.deleteConversation).mockRejectedValueOnce(new Error('journal verrouillé'))
    useUIStore.setState({ toasts: [] })
    render(
      <MemoryRouter initialEntries={[{ pathname: `/conversations/${CONVERSATION_ID}` }]}>
        <Routes>
          <Route path="/conversations/:conversationId" element={<ChatView />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'chat.deleteConversation' }))
    const dialog = screen.getByRole('dialog', { name: 'chat.deleteConversation' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'chat.deletePermanently' }))

    await waitFor(() => {
      expect(useUIStore.getState().toasts.map((toast) => toast.title)).toEqual(['chat.deleteConversationFailed'])
    })
  })
})
