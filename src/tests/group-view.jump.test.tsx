/**
 * Résultat de recherche dans un canal de groupe : GroupView doit charger le
 * contexte du message visé, puis le centrer et le surligner.
 */
import React from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Group, Message } from '@/types'

const { scrollToIndexMock, virtuosoProps } = vi.hoisted(() => ({
  scrollToIndexMock: vi.fn(),
  virtuosoProps: {} as Record<string, unknown>,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-virtuoso', async () => {
  const ReactModule = await import('react')
  const Virtuoso = ReactModule.forwardRef(
    (props: { data: Message[]; itemContent: (index: number, message: Message) => React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactModule.useImperativeHandle(ref, () => ({ scrollToIndex: scrollToIndexMock }))
      Object.assign(virtuosoProps, props)
      return ReactModule.createElement(
        'div',
        { 'data-testid': 'virtual-list' },
        props.data.map((message, index) =>
          ReactModule.createElement(
            'div',
            { key: message.id, 'data-index': index },
            props.itemContent(index, message),
          ),
        ),
      )
    },
  )
  return { Virtuoso }
})

vi.mock('@/features/chat/components/MessageBubble', () => ({
  MessageBubble: ({ message, highlighted }: { message: Message; highlighted?: boolean }) =>
    React.createElement('div', {
      'data-testid': `bubble-${message.id}`,
      'data-highlighted': highlighted ? 'true' : 'false',
    }),
}))

vi.mock('@/features/chat/components/MessageInput', () => ({
  MessageInput: () => React.createElement('div', { 'data-testid': 'composer' }),
}))

vi.mock('@/features/chat/components/ActiveTransfersWidget', () => ({
  ActiveTransfersWidget: () => null,
}))

vi.mock('@/features/chat/components/ForwardModal', () => ({
  ForwardModal: () => null,
}))

vi.mock('@/features/groups/components/ChannelList', () => ({ ChannelList: () => null }))
vi.mock('@/features/groups/components/MemberList', () => ({ MemberList: () => null }))
vi.mock('@/features/groups/components/GroupSettings', () => ({ GroupSettings: () => null }))

vi.mock('@/services/GroupService', () => ({
  groupService: {
    loadChannelMessages: vi.fn(),
    loadOlderChannelMessages: vi.fn(async () => [] as Message[]),
    loadChannelMessageContext: vi.fn(),
    loadNewerChannelMessages: vi.fn(),
    announceGroupPresence: vi.fn(),
    sendTypingIndicator: vi.fn(async () => {}),
    markAsRead: vi.fn(async () => {}),
  },
}))

import { GroupView } from '@/features/groups/components/GroupView'
import { groupService } from '@/services/GroupService'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'

class IntersectionObserverStub {  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

const ME = 'a'.repeat(64)
const GROUP_ID = 'group-1'
const CHANNEL_ID = 'chan-1'

const group: Group = {
  id: GROUP_ID,
  name: 'Équipe',
  members: [{ publicKey: ME, displayName: 'Moi', role: 'member', joinedAt: 0, canPost: true }],
  channels: [{
    id: CHANNEL_ID,
    groupId: GROUP_ID,
    name: 'général',
    type: 'text',
    position: 0,
    permissions: { send: ['member'], read: ['member'], manage: ['owner'] },
    unreadCount: 0,
  }],
  createdAt: 0,
  ownerId: ME,
  isPublic: false,
  maxMembers: 50,
}

function makeMessage(id: string, timestamp: number): Message {
  return {
    id,
    conversationId: CHANNEL_ID,
    senderId: ME,
    type: 'text',
    content: id,
    timestamp,
    status: 'delivered',
  }
}

beforeEach(() => {
  scrollToIndexMock.mockClear()
  vi.mocked(groupService.loadOlderChannelMessages).mockClear()
  for (const key of Object.keys(virtuosoProps)) delete virtuosoProps[key]
  useMessageStore.setState({ messages: {} })
  useUIStore.setState({ toasts: [] })
  useGroupStore.setState({
    groups: { [GROUP_ID]: { ...group } },
    activeGroupId: GROUP_ID,
    activeChannelId: CHANNEL_ID,
    groupViewVisible: false,
  })
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'c'.repeat(128) },
      profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })

  const recent = [makeMessage('recent-1', 5_000), makeMessage('recent-2', 5_001)]
  vi.mocked(groupService.loadChannelMessages).mockImplementation(async () => {
    useMessageStore.getState().addMessages(CHANNEL_ID, recent)
    return recent
  })
  vi.mocked(groupService.loadChannelMessageContext).mockImplementation(async () => {
    const contextMessages = [
      makeMessage('avant', 900),
      makeMessage('cible', 1_000),
      makeMessage('apres', 1_100),
    ]
    useMessageStore.getState().addMessages(CHANNEL_ID, contextMessages)
    return contextMessages
  })
})

afterEach(() => {
  cleanup()
})

describe('GroupView : saut vers un message', () => {
  it('charge le contexte du canal, centre et surligne le message visé', async () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: `/groups/${GROUP_ID}/channels/${CHANNEL_ID}`,
          state: { messageId: 'cible', messageTimestamp: 1_000, conversationId: CHANNEL_ID },
        }]}
      >
        <GroupView />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('bubble-cible')).toHaveAttribute('data-highlighted', 'true'))
    expect(groupService.loadChannelMessageContext).toHaveBeenCalledWith(GROUP_ID, CHANNEL_ID, 1_000)
    await waitFor(() => expect(scrollToIndexMock).toHaveBeenCalledWith({
      index: 100_000 - 3 + 1,
      align: 'center',
      behavior: 'auto',
    }))
  })

  it('comble la couture du canal vers la fenêtre récente', async () => {
    useGroupStore.setState({ groupViewVisible: true })
    const gapPage = [makeMessage('gap-1', 2_000), makeMessage('gap-2', 3_000)]
    vi.mocked(groupService.loadNewerChannelMessages).mockImplementation(async () => {
      useMessageStore.getState().addMessages(CHANNEL_ID, gapPage)
      return gapPage
    })

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: `/groups/${GROUP_ID}/channels/${CHANNEL_ID}`,
          state: { messageId: 'cible', messageTimestamp: 1_000, conversationId: CHANNEL_ID },
        }]}
      >
        <GroupView />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('bubble-cible')).toHaveAttribute('data-highlighted', 'true'))

    const notifyRange = virtuosoProps.rangeChanged as (range: { endIndex: number }) => void
    act(() => notifyRange({ endIndex: 4 }))

    await waitFor(() => expect(groupService.loadNewerChannelMessages).toHaveBeenCalledWith(
      GROUP_ID,
      CHANNEL_ID,
      1_100,
      'apres',
      50,
    ))
    await waitFor(() => expect(screen.getByTestId('bubble-gap-1')).toBeInTheDocument())
    expect(groupService.loadNewerChannelMessages).toHaveBeenCalledTimes(1)
    expect((virtuosoProps.followOutput as (atBottom: boolean) => unknown)(true)).toBe(false)
  })
})

const toastTitles = () => useUIStore.getState().toasts.map((toast) => toast.title)

function renderChannel() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/groups/${GROUP_ID}/channels/${CHANNEL_ID}` }]}>
      <GroupView />
    </MemoryRouter>,
  )
}

function olderPage(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => makeMessage(`ancien-${index}`, 1_000 + index))
}

describe('GroupView : panne de lecture du canal', () => {
  // jsdom rend document.hasFocus() faux : la vue se croit masquée, ne charge
  // aucun canal et annule la lecture déjà commencée. Sans ce stub, ni la panne
  // ni le vide ne seraient observables.
  function openChannelVisibly() {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    useGroupStore.setState({ groupViewVisible: true })
  }

  it('annonce la panne et laisse la pagination se retenter', async () => {
    useGroupStore.setState({ groupViewVisible: true })
    vi.mocked(groupService.loadOlderChannelMessages).mockResolvedValue(null)

    renderChannel()
    await waitFor(() => expect(screen.getByTestId('bubble-recent-1')).toBeInTheDocument())

    const startReached = virtuosoProps.startReached as () => void
    act(() => { startReached() })
    await waitFor(() => expect(groupService.loadOlderChannelMessages).toHaveBeenCalledWith(
      GROUP_ID,
      CHANNEL_ID,
      5_001,
      50,
    ))
    expect(toastTitles()).toEqual(['chat.historyLoadFailed'])

    // La panne n'a pas fermé la pagination et ne s'est pas répétée au bord haut
    // suivant : la même page est relue, une seule alerte reste à l'écran.
    act(() => { startReached() })
    await waitFor(() => expect(groupService.loadOlderChannelMessages).toHaveBeenCalledTimes(2))
    expect(toastTitles()).toEqual(['chat.historyLoadFailed'])
  })

  it('n’annonce rien quand la page ancienne arrive', async () => {
    useGroupStore.setState({ groupViewVisible: true })
    vi.mocked(groupService.loadOlderChannelMessages).mockImplementation(async (_groupId, _channelId) => {
      const page = olderPage(50)
      useMessageStore.getState().addMessages(CHANNEL_ID, page)
      return page
    })

    renderChannel()
    await waitFor(() => expect(screen.getByTestId('bubble-recent-1')).toBeInTheDocument())

    act(() => { (virtuosoProps.startReached as () => void)() })
    await waitFor(() => expect(screen.getByTestId('bubble-ancien-49')).toBeInTheDocument())
    expect(toastTitles()).toEqual([])
  })

  it('annonce un canal dont la page de démarrage ne vient pas', async () => {
    openChannelVisibly()
    vi.mocked(groupService.loadChannelMessages).mockResolvedValue(null)

    renderChannel()

    // Un canal vide et un canal illisible se ressemblaient à l'écran : le
    // second doit être dit.
    await waitFor(() => expect(toastTitles()).toEqual(['chat.historyLoadFailed']))
    // Et le canal reste affichable : la liste vide doit partager une référence
    // stable, sinon la vue se relance sans fin.
    expect(screen.getByText('groups.welcomeToChannel')).toBeInTheDocument()
  })

  it('n’annonce rien sur un canal vraiment vide', async () => {
    openChannelVisibly()
    vi.mocked(groupService.loadChannelMessages).mockResolvedValue([])

    renderChannel()

    await waitFor(() => expect(screen.getByText('groups.welcomeToChannel')).toBeInTheDocument())
    expect(toastTitles()).toEqual([])
  })
})
