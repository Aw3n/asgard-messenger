/**
 * Supprimer ou effacer une conversation qui échoue doit se dire.
 *
 * Les deux actions fermaient le menu, avalaient l'erreur dans la console et
 * laissaient la liste inchangée : l'utilisateur ne pouvait pas distinguer un
 * échec d'un succès silencieux.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, Conversation } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.text === 'string' ? `${key} ${options.text}` : key,
  }),
}))

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

vi.mock('@/services/ChatService', () => ({
  chatService: {
    deleteConversation: vi.fn(),
    clearConversation: vi.fn(),
  },
}))

import { ConversationList } from '@/features/chat/components/ConversationList'
import { chatService } from '@/services/ChatService'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import { useNetworkStore } from '@/stores/networkStore'
import { useUIStore } from '@/stores/uiStore'

const PEER = 'b'.repeat(64)
const deleteConversation = vi.mocked(chatService.deleteConversation)
const clearConversation = vi.mocked(chatService.clearConversation)

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

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  deleteConversation.mockReset()
  clearConversation.mockReset()
  useConversationStore.setState({
    conversations: { [direct.id]: direct },
    drafts: {},
    activeConversationId: null,
    filter: {},
  })
  useContactStore.setState({ contacts: { [PEER]: contact } })
  useGroupStore.setState({ groups: {} })
  useNetworkStore.setState({ typingUsers: {} })
  useUIStore.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const openMenuItem = (label: string) => {
  fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
  fireEvent.click(screen.getByText(label))
}

/** La suppression passe par son dialogue : acquiescer déclenche l'appel. */
const confirmDelete = () => fireEvent.click(screen.getByText('chat.deletePermanently'))

/** L'effacement passe aussi par un dialogue : le bouton porte le même libellé que l'entrée. */
const confirmClear = () => fireEvent.click(
  within(screen.getByRole('dialog')).getByRole('button', { name: 'chat.clearMessages' }),
)

const errorToasts = () =>
  useUIStore.getState().toasts.filter((toast) => toast.type === 'error')

describe('échec de suppression ou d’effacement', () => {
  it('annonce l’échec de la suppression', async () => {
    deleteConversation.mockRejectedValue(new Error('disque plein'))
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    openMenuItem('chat.deleteConversation')
    confirmDelete()

    await waitFor(() => {
      expect(errorToasts().map((toast) => toast.title)).toEqual(['chat.deleteConversationFailed'])
    })
  })

  it('annonce l’échec de l’effacement', async () => {
    clearConversation.mockRejectedValue(new Error('journal verrouillé'))
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    openMenuItem('chat.clearMessages')
    confirmClear()

    await waitFor(() => {
      expect(errorToasts().map((toast) => toast.title)).toEqual(['chat.clearConversationFailed'])
    })
  })

  it('reste muet quand l’action réussit', async () => {
    deleteConversation.mockResolvedValue(undefined)
    clearConversation.mockResolvedValue(undefined)
    render(
      <MemoryRouter>
        <ConversationList />
      </MemoryRouter>,
    )

    openMenuItem('chat.deleteConversation')
    confirmDelete()
    await waitFor(() => expect(deleteConversation).toHaveBeenCalledWith(direct.id))

    openMenuItem('chat.clearMessages')
    confirmClear()
    await waitFor(() => expect(clearConversation).toHaveBeenCalledWith(direct.id))

    expect(errorToasts()).toHaveLength(0)
  })
})
