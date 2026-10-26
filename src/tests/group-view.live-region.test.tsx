/**
 * Réglage « lecteur d'écran » : comme le fil 1:1, les nouveaux messages d'un
 * canal de groupe doivent être annoncés (aria-live) — et pas du tout quand le
 * réglage est éteint.
 */
import React from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Group, Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-virtuoso', async () => {
  const ReactModule = await import('react')
  const Virtuoso = ReactModule.forwardRef((props: {
    data: Message[]
    itemContent: (index: number, message: Message) => React.ReactNode
  }, _ref: React.Ref<unknown>) =>
    ReactModule.createElement(
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
  )
  return { Virtuoso }
})

vi.mock('@/features/chat/components/MessageBubble', () => ({
  MessageBubble: ({ message }: { message: Message }) =>
    React.createElement('div', { 'data-testid': `bubble-${message.id}` }),
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

class IntersectionObserverStub {
  observe() {}
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

function renderGroupView() {
  return render(
    <MemoryRouter initialEntries={[`/groups/${GROUP_ID}/channels/${CHANNEL_ID}`]}>
      <GroupView />
    </MemoryRouter>
  )
}

/** Région aria-live qui entoure la liste : celle du fil, pas celle des toasts. */
function liveRegionOfList(): HTMLElement | null {
  return screen.getByTestId('virtual-list').closest('[aria-live]')
}

beforeEach(() => {
  useMessageStore.setState({ messages: {} })
  useUIStore.setState({
    toasts: [],
    settings: {
      ...useUIStore.getState().settings,
      accessibility: { ...useUIStore.getState().settings.accessibility, screenReader: false },
    },
  })
  useGroupStore.setState({
    groups: { [GROUP_ID]: { ...group } },
    activeGroupId: GROUP_ID,
    activeChannelId: CHANNEL_ID,
    groupViewVisible: true,
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
})

afterEach(() => {
  cleanup()
})

describe('GroupView : annonce des nouveaux messages', () => {
  it('garde la région muette quand le réglage lecteur d’écran est éteint', async () => {
    renderGroupView()

    await waitFor(() => expect(screen.getByTestId('virtual-list')).toBeInTheDocument())
    const region = liveRegionOfList()
    expect(region).not.toBeNull()
    expect(region).toHaveAttribute('aria-live', 'off')
    expect(region).toHaveAttribute('aria-relevant', 'additions')
  })

  it('passe la région en annonce polie dès que le réglage est activé', async () => {
    renderGroupView()

    await waitFor(() => expect(screen.getByTestId('virtual-list')).toBeInTheDocument())
    expect(liveRegionOfList()).toHaveAttribute('aria-live', 'off')

    act(() => {
      const { settings } = useUIStore.getState()
      useUIStore.getState().updateSettings({
        accessibility: { ...settings.accessibility, screenReader: true },
      })
    })

    expect(liveRegionOfList()).toHaveAttribute('aria-live', 'polite')
    expect(liveRegionOfList()).toHaveAttribute('aria-relevant', 'additions')
  })
})
