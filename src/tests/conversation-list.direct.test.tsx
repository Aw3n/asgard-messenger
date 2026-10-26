/**
 * La liste Messages ne contient que des conversations 1:1.
 *
 * Les groupes ont leur page et leur liste. Leur entrée dans le ConversationStore
 * sert au tri et à l'aperçu, mais la rendre ici affichait un identifiant brut
 * (le groupe n'a pas de participantId) et ouvrait ChatView sans destinataire :
 * un fil vide, incapable d'envoyer quoi que ce soit.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, Conversation, Group } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (typeof options?.text === 'string') return `${key} ${options.text}`
      if (typeof options?.count === 'number') return `${key}:${options.count}`
      return key
    },
  }),
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
import { useGroupStore } from '@/stores/groupStore'
import { useNetworkStore } from '@/stores/networkStore'

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
    drafts: {},
    activeConversationId: null,
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

  it('nomme le champ de recherche pour le lecteur d’écran', () => {
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    // Le placeholder disparaît à la première frappe : il ne peut pas servir
    // de nom au champ.
    expect(screen.getByLabelText('search.placeholder')).toHaveAttribute('placeholder', 'search.placeholder')
  })

  it('coupe puis rétablit la sourdine depuis le menu contextuel', () => {
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
    fireEvent.click(screen.getByText('chat.muteConversation'))
    expect(useConversationStore.getState().conversations[direct.id].muted).toBe(true)

    fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
    fireEvent.click(screen.getByText('chat.unmuteConversation'))
    expect(useConversationStore.getState().conversations[direct.id].muted).toBe(false)
  })

  it('programme une sourdine d’une heure', () => {
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    const before = Date.now()
    fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
    for (const label of ['chat.muteFor1Hour', 'chat.muteFor8Hours', 'chat.muteFor1Week']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    fireEvent.click(screen.getByText('chat.muteFor1Hour'))

    const conv = useConversationStore.getState().conversations[direct.id]
    expect(conv.muted).toBe(true)
    expect(conv.mutedUntil).toBeGreaterThanOrEqual(before + 60 * 60 * 1000)
    expect(conv.mutedUntil).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000)

    // Lève la minuterie d'une heure laissée par ce test.
    act(() => {
      useConversationStore.getState().muteConversation(direct.id, false)
    })
  })

  it('marque lu puis non lu depuis le menu contextuel', () => {
    useConversationStore.setState({
      conversations: { [direct.id]: { ...direct, unreadCount: 3 } },
    })
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
    fireEvent.click(screen.getByText('chat.markAsRead'))
    expect(useConversationStore.getState().conversations[direct.id].unreadCount).toBe(0)

    fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
    fireEvent.click(screen.getByText('chat.markAsUnread'))
    expect(useConversationStore.getState().conversations[direct.id].unreadCount).toBe(1)
  })

  it('épingle puis désépingle depuis le menu contextuel', () => {
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
    fireEvent.click(screen.getByText('chat.pinConversation'))
    expect(useConversationStore.getState().conversations[direct.id].pinned).toBe(true)

    fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
    fireEvent.click(screen.getByText('chat.unpinConversation'))
    expect(useConversationStore.getState().conversations[direct.id].pinned).toBe(false)
  })

  it('archive, montre la vue archivée puis désarchive', () => {
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
    fireEvent.click(screen.getByText('chat.archiveConversation'))
    expect(useConversationStore.getState().conversations[direct.id].archived).toBe(true)
    expect(screen.queryByText('Bob')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'chat.archived' }))
    expect(screen.getByText('Bob')).toBeInTheDocument()

    fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
    fireEvent.click(screen.getByText('chat.unarchiveConversation'))
    expect(useConversationStore.getState().conversations[direct.id].archived).toBe(false)
    expect(screen.queryByText('Bob')).toBeNull()
  })

  it('affiche le brouillon à la place du dernier message', () => {
    useConversationStore.setState({ drafts: { [direct.id]: 'brouillon local' } })
    const { rerender } = render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    expect(screen.getByText('chat.draft brouillon local')).toBeInTheDocument()

    act(() => {
      useConversationStore.getState().setDraft(direct.id, '')
    })
    rerender(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )
    expect(screen.queryByText('chat.draft brouillon local')).toBeNull()
    expect(screen.getByText('chat.startConversation')).toBeInTheDocument()
  })

  it('annonce les non-lus et la sourdine dans le nom de la ligne', () => {
    useConversationStore.setState({
      conversations: { [direct.id]: { ...direct, unreadCount: 3, muted: true } },
    })
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    // La pastille vive et le point de sourdine sont aria-hidden : sans ces
    // textes, la ligne ne disait ni combien de messages attendaient ni qu'elle
    // était muette.
    const row = screen.getByRole('button', { name: /Bob/ })
    expect(row).toHaveAccessibleName(/nav\.unreadCount:3/)
    expect(row).toHaveAccessibleName(/chat\.mutedConversation/)
    expect(row).not.toHaveAccessibleName(/chat\.pinnedConversation/)
  })

  it('annonce une conversation épinglée dans le nom de la ligne', () => {
    useConversationStore.setState({
      conversations: { [direct.id]: { ...direct, pinned: true } },
    })
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    // La punaise est une icône aria-hidden : sans ce mot, la ligne ne dit pas
    // qu'elle est remontée en tête de liste.
    expect(screen.getByRole('button', { name: /Bob/ }))
      .toHaveAccessibleName(/chat\.pinnedConversation/)
  })

  it('annonce la présence d’un contact joignable, pas celle d’un contact absent', () => {
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    // La pastille de l'avatar reste un point muet : la rangée doit dire si le
    // contact est là, et seulement s'il l'est.
    expect(screen.getByRole('button', { name: /Bob/ })).toHaveAccessibleName(/common\.online/)

    act(() => {
      useContactStore.setState({ contacts: { [PEER]: { ...contact, status: 'offline' } } })
    })
    expect(screen.getByRole('button', { name: /Bob/ })).not.toHaveAccessibleName(/common\.(online|away|busy)/)
  })

  it('marque toutes les conversations comme lues', () => {
    const groupUnread: Group = {
      id: group.id,
      name: 'Équipe',
      members: [],
      channels: [{
        id: 'ch-general',
        groupId: group.id,
        name: 'général',
        type: 'text',
        position: 0,
        permissions: { send: ['member'], read: ['member'], manage: ['admin'] },
        unreadCount: 4,
      }],
      createdAt: 1,
      ownerId: 'a'.repeat(64),
      isPublic: false,
      maxMembers: 100,
    }
    useConversationStore.setState({
      conversations: {
        [direct.id]: { ...direct, unreadCount: 2 },
        [group.id]: { ...group, unreadCount: 1 },
      },
    })
    useGroupStore.setState({ groups: { [group.id]: groupUnread } })
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    const button = screen.getByRole('button', { name: 'chat.markAllAsRead' })
    expect(button).toBeEnabled()
    fireEvent.click(button)

    expect(useConversationStore.getState().conversations[direct.id].unreadCount).toBe(0)
    expect(useConversationStore.getState().conversations[group.id].unreadCount).toBe(0)
    expect(useGroupStore.getState().groups[group.id].channels[0].unreadCount).toBe(0)
    expect(button).toBeDisabled()
  })

  it('affiche la frappe du contact à la place de l’aperçu', () => {
    useNetworkStore.setState({ typingUsers: { [direct.id]: new Set([PEER]) } })
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    expect(screen.getByText('chat.typing')).toBeInTheDocument()

    act(() => {
      useNetworkStore.getState().setTyping(direct.id, PEER, false)
    })
    expect(screen.queryByText('chat.typing')).toBeNull()
    expect(screen.getByText('chat.startConversation')).toBeInTheDocument()
  })

  it('ouvre le menu au clavier, navigue et le referme par Échap', async () => {
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    const row = screen.getByRole('button', { name: /Bob/ })
    expect(row).toHaveAttribute('aria-haspopup', 'menu')
    row.focus()
    fireEvent.keyDown(row, { key: 'F10', shiftKey: true })

    expect(screen.getByRole('menu')).toBeInTheDocument()
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(9)
    expect(document.activeElement).toBe(items[0])

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(window, { key: 'End' })
    expect(document.activeElement).toBe(items[items.length - 1])
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(items[0])

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).toBe(row)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})
