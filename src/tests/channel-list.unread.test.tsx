/**
 * Non-lus dans la liste des canaux.
 *
 * La pastille du canal est purement visuelle : sans texte réservé au lecteur
 * d'écran, une ligne de canal annonçait « général » sans dire qu'elle attendait
 * des messages.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ChannelList } from '@/features/groups/components/ChannelList'
import { useGroupStore } from '@/stores/groupStore'
import type { Group } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}))

const GROUP_ID = 'groupe-abcdef123456'

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
      unreadCount: 3,
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

describe('non-lus dans la liste des canaux', () => {
  beforeEach(() => {
    cleanup()
    useGroupStore.setState({
      groups: { [GROUP_ID]: group },
      activeGroupId: GROUP_ID,
      activeChannelId: 'ch-general',
      channelTyping: {},
    })
  })

  it('annonce le compte dans le nom du canal concerné, et rien sur un canal lu', () => {
    render(<ChannelList />)

    expect(screen.getByRole('button', { name: /général/ }))
      .toHaveAccessibleName(/nav\.unreadCount:3/)
    expect(screen.getByRole('button', { name: /aléatoire/ }))
      .not.toHaveAccessibleName(/nav\.unreadCount/)
  })
})
