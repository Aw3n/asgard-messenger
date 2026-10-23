/**
 * Badges du rail : deux compteurs, deux sources.
 *
 * Les conversations de groupe sont suivies canal par canal dans le GroupStore
 * et la page Messages ne liste que les 1:1. Le badge Messages ne doit donc pas
 * additionner les entrées de groupe (elles compteraient deux fois le jour où
 * elles seraient incrémentées), et l'activité des groupes doit rester visible
 * sur le rail même quand on n'ouvre pas leur page.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conversation, Group } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}))

import { Sidebar } from '@/components/layout/Sidebar'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'

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
  unreadCount: 2,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
}

const groupConversation: Conversation = {
  id: 'groupe-conversation',
  type: 'group',
  groupId: 'groupe-conversation',
  unreadCount: 9,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
}

const group = {
  id: 'groupe-1',
  name: 'Équipe',
  members: [],
  channels: [
    { id: 'c-1', groupId: 'groupe-1', name: 'général', type: 'text', position: 0, unreadCount: 3 },
    { id: 'c-2', groupId: 'groupe-1', name: 'projets', type: 'text', position: 1, unreadCount: 1 },
  ],
  createdAt: 1,
} as unknown as Group

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  useConversationStore.setState({
    conversations: { [direct.id]: direct, [groupConversation.id]: groupConversation },
    activeConversationId: null,
  })
  useGroupStore.setState({ groups: { [group.id]: group } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('badges du rail', () => {
  it('ne compte que les 1:1 sur Messages et agrège les canaux sur Groupes', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )

    const messages = screen.getByRole('button', { name: /^nav\.messages/ })
    const groups = screen.getByRole('button', { name: /^nav\.groups/ })
    expect(within(messages).getByText('2')).toBeInTheDocument()
    expect(within(messages).queryByText('9')).toBeNull()
    expect(within(groups).getByText('4')).toBeInTheDocument()
  })

  it('masque les badges quand tout est lu', () => {
    useConversationStore.setState({
      conversations: { [direct.id]: { ...direct, unreadCount: 0 } },
    })
    useGroupStore.setState({
      groups: {
        [group.id]: {
          ...group,
          channels: group.channels.map((channel) => ({ ...channel, unreadCount: 0 })),
        } as unknown as Group,
      },
    })

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )

    const messages = screen.getByRole('button', { name: 'nav.messages' })
    const groups = screen.getByRole('button', { name: 'nav.groups' })
    expect(within(messages).queryByText(/\d/)).toBeNull()
    expect(within(groups).queryByText(/\d/)).toBeNull()
  })

  it('annonce le compte non lu et la page courante dans le nom accessible', () => {
    render(
      <MemoryRouter initialEntries={['/conversations']}>
        <Sidebar />
      </MemoryRouter>,
    )

    const messages = screen.getByRole('button', { name: 'nav.messages, nav.unreadCount:2' })
    expect(messages).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /^nav\.groups/ })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'nav.contacts' })).not.toHaveAttribute('aria-current')
  })

  it('annonce le compte exact même quand la pastille plafonne à 99+', () => {
    useConversationStore.setState({
      conversations: { [direct.id]: { ...direct, unreadCount: 150 } },
    })

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )

    const messages = screen.getByRole('button', { name: 'nav.messages, nav.unreadCount:150' })
    expect(within(messages).getByText('99+')).toBeInTheDocument()
  })

  it('marque les paramètres quand leur page est ouverte', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Sidebar />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'nav.settings' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /^nav\.messages/ })).not.toHaveAttribute('aria-current')
  })
})
