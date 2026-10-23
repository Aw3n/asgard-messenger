/**
 * Un clic qui fait la même chose qu’une touche réglée doit la nommer.
 *
 * L’écran « Raccourcis » liste les quinze combinaisons, mais quatre actions se
 * font aussi bien à la souris qu’au clavier : escamoter le panneau de liste,
 * ouvrir les réglages, ouvrir son profil, envoyer le message, chercher dans le
 * fil. Aucun de ces clics ne disait la touche, et une combinaison changée
 * restait invisible là où l’on clique. L’indice vient donc du réglage, au
 * présent : `aria-keyshortcuts` pour le lecteur d’écran, l’infobulle pour l’œil.
 *
 * Deux règles se vérifient ici. Un geste éteint n’annonce rien — une promesse
 * vide serait pire qu’un silence. Et le bouton d’envoi n’annonce « Entrée » que
 * quand cette touche envoie vraiment : `chat.sendOnEnter` l’y autorise ou l’en
 * empêche.
 */
import React from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, Conversation } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Virtuoso ne mesure pas de hauteur en jsdom : les deux listes rendent leurs lignes.
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent }: {
    data: unknown[]
    itemContent: (index: number, item: unknown) => React.ReactNode
  }) => React.createElement(
    'div',
    null,
    data.map((item, index) => React.createElement('div', { key: index }, itemContent(index, item))),
  ),
}))

vi.mock('@/components/panels/RightPanel', () => ({ RightPanel: () => null }))
vi.mock('@/features/chat/components/ActiveTransfersWidget', () => ({ ActiveTransfersWidget: () => null }))
vi.mock('@/features/chat/components/PendingContactBanner', () => ({ PendingContactBanner: () => null }))
vi.mock('@/features/chat/components/ForwardModal', () => ({ ForwardModal: () => null }))

vi.mock('@/services/ChatService', () => ({
  chatService: {
    loadMessages: vi.fn(async () => []),
    loadOlderMessages: vi.fn(async () => []),
    loadNewerMessages: vi.fn(async () => []),
    loadMessageContext: vi.fn(async () => []),
    probeContact: vi.fn(),
    sendReadReceipt: vi.fn(async () => {}),
    sendTyping: vi.fn(async () => {}),
  },
}))

vi.mock('@/services/CryptoService', () => ({
  cryptoService: {
    deriveConversationId: () => 'conv-gesture',
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

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

import { Sidebar } from '@/components/layout/Sidebar'
import { ChatView } from '@/features/chat/ChatView'
import { ConversationsPage } from '@/features/chat/ConversationsPage'
import { MessageInput } from '@/features/chat/components/MessageInput'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useMessageStore } from '@/stores/messageStore'
import { useNetworkStore } from '@/stores/networkStore'
import { useUIStore } from '@/stores/uiStore'
import type { ShortcutName } from '@/utils/shortcuts'

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)
const CONVERSATION_ID = 'conv-gesture'

const direct: Conversation = {
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

const contact: Contact = {
  publicKey: PEER,
  displayName: 'Bob',
  status: 'online',
  relation: 'contact',
  verified: true,
  addedAt: 1,
}

const baselineShortcuts = { ...useUIStore.getState().settings.keyboardShortcuts }
const sendOnEnterBaseline = useUIStore.getState().settings.chat.sendOnEnter

const setShortcut = (name: ShortcutName, combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  // `act` : l’indice se lit par sélecteur, il ne parvient au bouton qu’au rendu
  // suivant — comme pour un réglage changé à l’écran sans rien remonter.
  act(() => { useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, [name]: combo } }) })
}

const setSendOnEnter = (value: boolean) => {
  const settings = useUIStore.getState().settings
  act(() => { useUIStore.getState().updateSettings({ chat: { ...settings.chat, sendOnEnter: value } }) })
}

/** Le nom accessible reste l’action ; l’indice se lit dans les deux canaux. */
const announced = (name: string, aria: string, shown: string) => {
  const button = screen.getByRole('button', { name })
  expect(button).toHaveAttribute('aria-keyshortcuts', aria)
  expect(button.getAttribute('title') ?? '').toContain(`— ${shown}`)
}

/** Le rail n’a pas d’infobulle native : son indice se lit dans son bulle à lui. */
const announcedInTooltip = (name: string, aria: string, shown: string) => {
  const button = screen.getByRole('button', { name })
  expect(button).toHaveAttribute('aria-keyshortcuts', aria)
  expect((button.parentElement as HTMLElement).textContent).toContain(shown)
}

/** Un bouton sans geste réglé — ou au geste éteint — ne doit rien promettre. */
const silent = (name: string) => {
  const button = screen.getByRole('button', { name })
  expect(button).not.toHaveAttribute('aria-keyshortcuts')
  expect(button.getAttribute('title') ?? '').not.toMatch(/Ctrl|Alt|Shift|Cmd|Meta|Enter/)
}

const listPage = () => render(
  <MemoryRouter initialEntries={[`/conversations/${CONVERSATION_ID}`]}>
    <Routes>
      <Route path="/conversations" element={<ConversationsPage />}>
        <Route path=":conversationId" element={<div data-testid="fil" />} />
      </Route>
    </Routes>
  </MemoryRouter>,
)

/** Sonde de route : ce que le clic donne à voir, pas seulement ce qu’il appelle. */
function Where() {
  const location = useLocation()
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>
}

const renderRail = () => render(
  <MemoryRouter initialEntries={['/conversations']}>
    <Sidebar />
    <Where />
  </MemoryRouter>,
)

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  useUIStore.setState({ sidebarCollapsed: false })
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...baselineShortcuts } })
  setSendOnEnter(true)
  useConversationStore.setState({
    conversations: { [direct.id]: direct },
    drafts: {},
    activeConversationId: direct.id,
    filter: {},
  })
  useContactStore.setState({ contacts: { [PEER]: contact } })
  useGroupStore.setState({ groups: {} })
  useNetworkStore.setState({ typingUsers: {} })
  useMessageStore.setState({ messages: {} })
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'c'.repeat(128) },
      profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useUIStore.getState().updateSettings({
    keyboardShortcuts: { ...baselineShortcuts },
    chat: { ...useUIStore.getState().settings.chat, sendOnEnter: sendOnEnterBaseline },
  })
})

describe('garde du panneau de liste', () => {
  it('nomme la touche qui masque comme le clic', () => {
    listPage()
    announced('common.hide — nav.messages', 'Control+B', 'Ctrl + B')
  })

  it('suit la combinaison réglée sans remonter la page', () => {
    listPage()
    setShortcut('toggleSidebar', 'Ctrl+Alt+B')
    announced('common.hide — nav.messages', 'Control+Alt+B', 'Ctrl + Alt + B')
  })

  it('se tait quand le geste est éteint', () => {
    setShortcut('toggleSidebar', '')
    listPage()
    silent('common.hide — nav.messages')
  })
})

describe('rail', () => {
  it('annonce la touche des réglages, sur l’onglet et dans son infobulle', () => {
    renderRail()
    announcedInTooltip('nav.settings', 'Control+,', 'Ctrl + ,')
  })

  it('annonce la touche du profil et ouvre bien la section visée', () => {
    renderRail()
    announced('nav.myProfile', 'Control+P', 'Ctrl + P')
    fireEvent.click(screen.getByRole('button', { name: 'nav.myProfile' }))
    // `Ctrl+P` mène à la section profil : le clic qui porte le même nom ne peut
    // pas mener ailleurs, sinon l’indice double-promet.
    expect(screen.getByTestId('where').textContent).toBe('/settings?section=profile')
  })

  it('n’invente aucun geste pour les quatre onglets sans combinaison', () => {
    renderRail()
    for (const name of ['nav.messages', 'nav.contacts', 'nav.groups', 'nav.calls']) silent(name)
  })

  it('suit la combinaison réglée des réglages', () => {
    renderRail()
    setShortcut('openSettings', 'Ctrl+Alt+,')
    announcedInTooltip('nav.settings', 'Control+Alt+,', 'Ctrl + Alt + ,')
  })
})

describe('bouton d’envoi du composeur', () => {
  const renderComposer = () => render(<MessageInput conversationId={CONVERSATION_ID} onSend={() => {}} />)

  it('annonce la touche qui envoie', () => {
    renderComposer()
    announced('messageInput.send', 'Enter', 'Enter')
  })

  it('ne l’annonce pas quand « Entrée » est éteinte au composeur', () => {
    setSendOnEnter(false)
    renderComposer()
    silent('messageInput.send')
  })

  it('l’annonce quand la touche réglée nomme un modificateur, bascule éteinte', () => {
    // « Ctrl+Entrée » ne rencontre jamais `sendOnEnter` : elle envoie toujours.
    setShortcut('sendMessage', 'Ctrl+Enter')
    setSendOnEnter(false)
    renderComposer()
    announced('messageInput.send', 'Control+Enter', 'Ctrl + Enter')
  })

  it('suit la combinaison réglée et se tait si elle disparaît', () => {
    renderComposer()
    setShortcut('sendMessage', 'Ctrl+Alt+S')
    announced('messageInput.send', 'Control+Alt+S', 'Ctrl + Alt + S')
    setShortcut('sendMessage', '')
    silent('messageInput.send')
  })
})

describe('recherche du fil', () => {
  it('annonce la touche qui ouvre la recherche, et son changement', async () => {
    render(
      <MemoryRouter initialEntries={[`/conversations/${CONVERSATION_ID}`]}>
        <Routes>
          <Route path="/conversations/:conversationId" element={<ChatView />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'chat.searchMessages' })).toBeInTheDocument())
    announced('chat.searchMessages', 'Control+K', 'Ctrl + K')

    setShortcut('openSearch', 'Ctrl+Alt+K')
    announced('chat.searchMessages', 'Control+Alt+K', 'Ctrl + Alt + K')
  })
})
