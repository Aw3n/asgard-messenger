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
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { channelPermissionsFor } from '@/utils/groupPermissions'
import type { GroupChannel, Message } from '@/types'

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
  useUIStore.setState({ toasts: [] })
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'c'.repeat(128) },
      profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
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

  // Le canal actif peut être une annonce : le transfert doit chercher ailleurs
  // plutôt que d'échouer sur un canal où le membre n'a pas le droit d'écrire.
  function setGroupChannels(
    channels: GroupChannel[],
    activeChannelId: string,
  ): string {
    const group = useGroupStore.getState().getAllGroups()[0]
    useGroupStore.setState({
      groups: {
        [group.id]: {
          ...group,
          ownerId: PEER,
          activeChannelId,
          channels,
          members: [{ publicKey: ME, displayName: 'Moi', role: 'member', joinedAt: 0, canPost: true }],
        },
      },
    })
    return group.id
  }

  const channel = (groupId: string, id: string, name: string, type: GroupChannel['type']): GroupChannel => ({
    id,
    groupId,
    name,
    type,
    position: 0,
    permissions: channelPermissionsFor(type),
    unreadCount: 0,
  })

  it('transfère dans un canal ouvert à l’écriture, pas dans le canal actif fermé', async () => {
    const groupId = setGroupChannels([
      channel('group-annonces', 'chan-annonces', 'annonces', 'announcement'),
      channel('group-annonces', 'chan-general', 'général', 'text'),
    ], 'chan-annonces')
    const send = vi.spyOn(groupService, 'sendGroupMessage').mockResolvedValue(undefined)
    render(<ForwardModal message={message} onClose={() => {}} />)

    fireEvent.click(screen.getByText('Équipe'))

    await waitFor(() => expect(send).toHaveBeenCalledWith(
      groupId,
      'chan-general',
      'chat.forwardedMessageTemplate',
    ))
  })

  it('annonce l’échec quand aucun canal du groupe n’est ouvert à l’écriture', async () => {
    setGroupChannels([
      channel('group-annonces', 'chan-annonces', 'annonces', 'announcement'),
    ], 'chan-annonces')
    const send = vi.spyOn(groupService, 'sendGroupMessage').mockResolvedValue(undefined)
    render(<ForwardModal message={message} onClose={() => {}} />)

    fireEvent.click(screen.getByText('Équipe'))

    await waitFor(() => expect(
      useUIStore.getState().toasts.some((toast) => toast.title === 'chat.messageNotDelivered'),
    ).toBe(true))
    expect(send).not.toHaveBeenCalled()
  })

  it('nomme le champ de recherche des conversations', () => {
    render(<ForwardModal message={message} onClose={() => {}} />)

    expect(screen.getByLabelText('chat.searchConversations')).toHaveAttribute('placeholder', 'chat.searchConversations')
  })

  it('ne propose pas une conversation sans destinataire', () => {
    render(<ForwardModal message={message} onClose={() => {}} />)

    expect(screen.queryByText('orpheline')).not.toBeInTheDocument()
  })
})
