/**
 * Transfert d'un message : la modale doit réellement envoyer, pas seulement
 * naviguer. On fixe les deux chemins (1:1 et groupe) et l'exclusion des
 * conversations sans destinataire joignable.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ForwardModal } from '@/features/chat/components/ForwardModal'
import { chatService } from '@/services/ChatService'
import { groupService } from '@/services/GroupService'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)

const message: Message = {
  id: 'm-source',
  conversationId: 'conv-source',
  senderId: PEER,
  type: 'text',
  content: 'à transférer',
  timestamp: 1_700_000_000_000,
  status: 'sent',
}

const directConversation = {
  id: 'conv-1',
  type: 'direct' as const,
  participantId: PEER,
  unreadCount: 0,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
}

// jsdom n'implémente pas IntersectionObserver, utilisé par l'avatar paresseux.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  useConversationStore.setState({
    conversations: {
      'conv-1': directConversation,
      orpheline: {
        ...directConversation,
        id: 'orpheline',
        type: 'channel',
        participantId: undefined,
      },
    },
    activeConversationId: null,
  })
  useGroupStore.setState({
    groups: {},
    activeGroupId: null,
    activeChannelId: null,
  })
  useGroupStore.getState().createGroup({ name: 'Équipe', ownerId: ME, ownerDisplayName: 'Moi' })
  const group = useGroupStore.getState().getAllGroups()[0]
  useConversationStore.setState((state) => ({
    conversations: {
      ...state.conversations,
      [group.id]: {
        id: group.id,
        type: 'group',
        groupId: group.id,
        unreadCount: 0,
        muted: false,
        pinned: false,
        archived: false,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ForwardModal', () => {
  it('envoie le message au contact choisi et ferme la modale', async () => {
    const send = vi.spyOn(chatService, 'sendMessage').mockResolvedValue('sent')
    const onClose = vi.fn()
    render(<ForwardModal message={message} onClose={onClose} />)

    fireEvent.click(screen.getByText('conv-1'))

    await waitFor(() => expect(send).toHaveBeenCalledWith(
      { conversationId: 'conv-1', type: 'text', content: 'chat.forwardedMessageTemplate' },
      'conv-1',
      PEER,
    ))
    expect(onClose).toHaveBeenCalled()
  })

  it('transfère dans le premier canal d’un groupe', async () => {
    const group = useGroupStore.getState().getAllGroups()[0]
    const send = vi.spyOn(groupService, 'sendGroupMessage').mockResolvedValue(undefined)
    render(<ForwardModal message={message} onClose={() => {}} />)

    fireEvent.click(screen.getByText('Équipe'))

    await waitFor(() => expect(send).toHaveBeenCalledWith(
      group.id,
      group.channels[0].id,
      'chat.forwardedMessageTemplate',
    ))
  })

  it('ne propose pas une conversation sans destinataire', () => {
    render(<ForwardModal message={message} onClose={() => {}} />)

    expect(screen.queryByText('orpheline')).not.toBeInTheDocument()
  })
})
