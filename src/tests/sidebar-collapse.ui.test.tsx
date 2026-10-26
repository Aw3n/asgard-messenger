/**
 * Le panneau de liste Messages réellement escamotable.
 *
 * `sidebarCollapsed` était écrit par `toggleSidebar()`, persisté, et lu par zero
 * composant : le geste `Ctrl+B` faisait basculer un état invisible. La page le
 * consulte maintenant, et la garde reste à l'écran — un panneau que seul le
 * clavier pourrait rouvrir serait un piège.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Contact, Conversation } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Virtuoso ne mesure pas de hauteur en jsdom : on rend les lignes directement.
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

import { ConversationsPage } from '@/features/chat/ConversationsPage'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import { useNetworkStore } from '@/stores/networkStore'
import { useUIStore } from '@/stores/uiStore'

const PEER = 'b'.repeat(64)

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

const direct: Conversation = {
  id: 'conv-direct',
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/conversations/${direct.id}`]}>
      <Routes>
        <Route path="/conversations" element={<ConversationsPage />}>
          <Route path=":conversationId" element={<div data-testid="fil" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const toggle = () => screen.getByRole('button', { name: 'common.hide — nav.messages' })
const toggleBack = () => screen.getByRole('button', { name: 'common.show — nav.messages' })

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  useUIStore.setState({ sidebarCollapsed: false })
  useConversationStore.setState({
    conversations: { [direct.id]: direct },
    drafts: {},
    activeConversationId: direct.id,
    filter: {},
  })
  useContactStore.setState({ contacts: { [PEER]: contact } })
  useGroupStore.setState({ groups: {} })
  useNetworkStore.setState({ typingUsers: {} })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('garde du panneau de liste', () => {
  it('montre la liste et nomme le geste de masquage', () => {
    renderPage()
    expect(document.getElementById('conversation-list-pane')).not.toBeNull()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('désigne le panneau qu’il masque', () => {
    renderPage()
    expect(toggle()).toHaveAttribute('aria-controls', 'conversation-list-pane')
  })

  it('ôte la liste de l’écran au clic et annonce de la rendre', () => {
    renderPage()
    fireEvent.click(toggle())

    expect(document.getElementById('conversation-list-pane')).toBeNull()
    expect(screen.queryByText('Bob')).toBeNull()
    expect(toggleBack()).toHaveAttribute('aria-expanded', 'false')
    expect(toggleBack()).not.toHaveAttribute('aria-controls')
  })

  it('rend la liste quand le geste de retour est joué', () => {
    renderPage()
    fireEvent.click(toggle())
    fireEvent.click(toggleBack())

    expect(document.getElementById('conversation-list-pane')).not.toBeNull()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('respecte l’état déjà replié dans le store', () => {
    useUIStore.setState({ sidebarCollapsed: true })
    renderPage()
    expect(document.getElementById('conversation-list-pane')).toBeNull()
    expect(toggleBack()).toBeInTheDocument()
  })

  it('laisse le fil ouvert quand la liste est masquée', () => {
    renderPage()
    fireEvent.click(toggle())
    expect(screen.getByTestId('fil')).toBeInTheDocument()
  })

  it('laisse la page vide debout quand aucune conversation n’est ouverte', () => {
    useConversationStore.setState({ activeConversationId: null })
    render(
      <MemoryRouter initialEntries={['/conversations']}>
        <Routes>
          <Route path="/conversations" element={<ConversationsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(toggle())
    expect(document.getElementById('conversation-list-pane')).toBeNull()
    expect(toggleBack()).toBeInTheDocument()
  })
})
