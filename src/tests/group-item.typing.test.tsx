/**
 * Frappe dans la liste des groupes.
 *
 * La liste 1:1 annonçait déjà le contact en train d'écrire, mais un groupe
 * restait muet : il fallait ouvrir chaque canal pour le savoir. L'aperçu du
 * groupe doit suivre la frappe d'un membre, quel que soit son canal, et
 * oublier une frappe expirée au bout de 5 s.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { GroupItem } from '@/features/groups/components/GroupItem'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import type { Group } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/ui/Avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}))

const GROUP_ID = 'groupe-abcdef123456'
const PEER = 'b'.repeat(64)

const group: Group = {
  id: GROUP_ID,
  name: 'Équipe',
  members: [],
  channels: [
    {
      id: 'ch-general',
      groupId: GROUP_ID,
      name: 'général',
      type: 'text',
      position: 0,
      permissions: { send: ['member'], read: ['member'], manage: ['admin'] },
      unreadCount: 0,
    },
    {
      id: 'ch-random',
      groupId: GROUP_ID,
      name: 'aléatoire',
      type: 'text',
      position: 1,
      permissions: { send: ['member'], read: ['member'], manage: ['admin'] },
      unreadCount: 0,
    },
  ],
  createdAt: 1,
  ownerId: 'a'.repeat(64),
  isPublic: false,
  maxMembers: 100,
}

const seedTyping = (timestamp: number): void => {
  useGroupStore.setState({
    channelTyping: {
      [GROUP_ID]: {
        'ch-random': {
          [PEER]: { displayName: 'Pair', isTyping: true, timestamp },
        },
      },
    },
  })
}

describe('frappe dans la liste des groupes', () => {
  beforeEach(() => {
    cleanup()
    useConversationStore.setState({ conversations: {} })
    useGroupStore.setState({ channelTyping: {} })
  })

  it('remplace l’aperçu par la frappe, dans n’importe quel canal', () => {
    render(<GroupItem group={group} isActive={false} onClick={() => {}} />)

    expect(screen.getByText('groups.memberCount')).toBeInTheDocument()
    expect(screen.queryByText('chat.typing')).toBeNull()

    act(() => seedTyping(Date.now()))

    expect(screen.getByText('chat.typing')).toBeInTheDocument()
    expect(screen.queryByText('groups.memberCount')).toBeNull()

    act(() => useGroupStore.setState({ channelTyping: {} }))

    expect(screen.queryByText('chat.typing')).toBeNull()
    expect(screen.getByText('groups.memberCount')).toBeInTheDocument()
  })

  it('ignore une frappe expirée', () => {
    seedTyping(Date.now() - 6000)
    render(<GroupItem group={group} isActive={false} onClick={() => {}} />)

    expect(screen.queryByText('chat.typing')).toBeNull()
    expect(screen.getByText('groups.memberCount')).toBeInTheDocument()
  })
})

describe('getChannelTypingUsers', () => {
  beforeEach(() => {
    useGroupStore.setState({ channelTyping: {} })
  })

  it('ne rend que les frappes fraîches', () => {
    seedTyping(Date.now())
    expect(useGroupStore.getState().getChannelTypingUsers(GROUP_ID, 'ch-random')).toHaveLength(1)

    seedTyping(Date.now() - 6000)
    expect(useGroupStore.getState().getChannelTypingUsers(GROUP_ID, 'ch-random')).toHaveLength(0)
  })
})
