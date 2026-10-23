/**
 * La liste Messages ne contient que des conversations 1:1.
 *
 * Les groupes ont leur page et leur liste. Leur entrée dans le ConversationStore
 * sert au tri et à l'aperçu, mais la rendre ici affichait un identifiant brut
 * (le groupe n'a pas de participantId) et ouvrait ChatView sans destinataire :
 * un fil vide, incapable d'envoyer quoi que ce soit.
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

import { ConversationList } from '@/features/chat/components/ConversationList'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'

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

const group: Conversation = {
  id: 'groupe-abcdef123456',
  type: 'group',
  groupId: 'groupe-abcdef123456',
  unreadCount: 0,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
}

const contact: Contact = {
  publicKey: PEER,
  displayName: 'Bob',
  status: 'online',
  relation: 'contact',
  verified: true,
  addedAt: 1,
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  useConversationStore.setState({
    conversations: { [direct.id]: direct, [group.id]: group },
    activeConversationId: null,
    filter: {},
  })
  useContactStore.setState({ contacts: { [PEER]: contact } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('liste des conversations', () => {
  it('affiche le contact 1:1 et pas l’entrée de groupe', () => {
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('groupe-abcdef12')).toBeNull()
  })
})
