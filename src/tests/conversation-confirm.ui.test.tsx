/**
 * Supprimer ou effacer une conversation depuis la liste demande d'abord.
 *
 * Le menu de la rangée appelait le service au premier clic, alors que le même
 * bouton dans l'en-tête du fil ouvrait un dialogue. La rangée nomme maintenant
 * son interlocuteur dans l'avertissement, et rien ne part avant l'acquiescement :
 * ni « Annuler », ni la touche de fermeture réglée.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { Contact, Conversation } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.name === 'string' ? `${key} ${options.name}` : key,
  }),
}))

vi.mock('@/components/ui/Avatar', () => ({
  Avatar: () => React.createElement('div', { 'data-testid': 'avatar' }),
}))

// Virtuoso ne mesure aucune hauteur en jsdom : les lignes se rendent à plat.
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
import { chatService } from '@/services/ChatService'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import { useNetworkStore } from '@/stores/networkStore'

const PEER = 'b'.repeat(64)

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

let deleteMock: MockInstance<typeof chatService.deleteConversation>
let clearMock: MockInstance<typeof chatService.clearConversation>

const renderList = () => render(
  <MemoryRouter>
    <ConversationList />
  </MemoryRouter>,
)

/** Ouvre le menu de la rangée puis l'entrée de suppression. */
const askDelete = () => {
  fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
  fireEvent.click(screen.getByText('chat.deleteConversation'))
}

beforeEach(() => {
  useConversationStore.setState({
    conversations: { [direct.id]: direct },
    drafts: {},
    activeConversationId: null,
    filter: {},
  })
  useContactStore.setState({ contacts: { [PEER]: contact } })
  useGroupStore.setState({ groups: {} })
  useNetworkStore.setState({ typingUsers: {} })
  deleteMock = vi.spyOn(chatService, 'deleteConversation').mockResolvedValue(undefined)
  clearMock = vi.spyOn(chatService, 'clearConversation').mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  deleteMock.mockRestore()
  clearMock.mockRestore()
})

describe('suppression depuis la liste', () => {
  it('ouvre un dialogue nommé et ne supprime rien avant l’acquiescement', async () => {
    renderList()
    askDelete()

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('chat.deleteConversation')
    expect(within(dialog).getByText('chat.deleteWarning Bob')).toBeInTheDocument()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('supprime après confirmation', async () => {
    renderList()
    askDelete()
    fireEvent.click(screen.getByText('chat.deletePermanently'))

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('conv-direct'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('annuler referme sans supprimer', async () => {
    renderList()
    askDelete()
    fireEvent.click(screen.getByText('common.cancel'))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('la touche de fermeture réglée referme sans supprimer', async () => {
    renderList()
    askDelete()
    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(deleteMock).not.toHaveBeenCalled()
  })
})

/** Ouvre le menu de la rangée puis l'entrée d'effacement. */
const askClear = () => {
  fireEvent.contextMenu(screen.getByRole('button', { name: /Bob/ }))
  fireEvent.click(screen.getByText('chat.clearMessages'))
}

describe('effacement des messages depuis la liste', () => {
  it('ouvre un dialogue nommé et n’efface rien avant l’acquiescement', async () => {
    renderList()
    askClear()

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('chat.clearMessages')
    expect(within(dialog).getByText('chat.clearWarning Bob')).toBeInTheDocument()
    expect(clearMock).not.toHaveBeenCalled()
  })

  it('efface après confirmation, sans supprimer la conversation', async () => {
    renderList()
    askClear()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'chat.clearMessages' }))

    await waitFor(() => expect(clearMock).toHaveBeenCalledWith('conv-direct'))
    expect(deleteMock).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
