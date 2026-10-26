/**
 * Frappe dans la liste des canaux d'un groupe.
 *
 * La liste 1:1 et l'aperçu de groupe signalaient déjà la frappe, mais le
 * panneau des canaux restait muet : il fallait ouvrir chaque canal pour voir
 * qu'un membre écrivait ailleurs. Chaque canal doit porter son propre indice,
 * sans jamais afficher une frappe expirée (> 5 s).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { ChannelList } from '@/features/groups/components/ChannelList'
import { useGroupStore } from '@/stores/groupStore'
import type { Group } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
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

const seedTyping = (channelId: string, timestamp: number): void => {
  useGroupStore.setState({
    channelTyping: {
      [GROUP_ID]: {
        [channelId]: {
          [PEER]: { displayName: 'Pair', isTyping: true, timestamp },
        },
      },
    },
  })
}

describe('frappe dans la liste des canaux', () => {
  beforeEach(() => {
    cleanup()
    useGroupStore.setState({
      groups: { [GROUP_ID]: group },
      activeGroupId: GROUP_ID,
      activeChannelId: 'ch-general',
      channelTyping: {},
    })
  })

  it('affiche l’indice sur le seul canal concerné, puis le retire', () => {
    render(<ChannelList />)

    expect(screen.queryByTestId('channel-typing-ch-random')).toBeNull()
    expect(screen.queryByText('chat.typing')).toBeNull()

    act(() => seedTyping('ch-random', Date.now()))

    expect(screen.getByTestId('channel-typing-ch-random')).toBeInTheDocument()
    expect(screen.queryByTestId('channel-typing-ch-general')).toBeNull()
    expect(screen.getByText('chat.typing')).toBeInTheDocument()

    act(() => useGroupStore.setState({ channelTyping: {} }))

    expect(screen.queryByTestId('channel-typing-ch-random')).toBeNull()
    expect(screen.queryByText('chat.typing')).toBeNull()
  })

  it('ignore une frappe expirée', () => {
    seedTyping('ch-random', Date.now() - 6000)
    render(<ChannelList />)

    expect(screen.queryByTestId('channel-typing-ch-random')).toBeNull()
    expect(screen.queryByText('chat.typing')).toBeNull()
  })

  it('suit le canal actif comme les autres', () => {
    seedTyping('ch-general', Date.now())
    render(<ChannelList />)

    expect(screen.getByTestId('channel-typing-ch-general')).toBeInTheDocument()
    expect(screen.queryByTestId('channel-typing-ch-random')).toBeNull()
  })
})
