/**
 * Menu contextuel des canaux.
 *
 * La liste 1:1 permettait déjà de marquer un fil lu/non lu au clic droit ;
 * les canaux de groupe n'offraient aucun raccourci équivalent. Le menu doit
 * répondre au clic droit, à Maj+F10 et à la touche Menu, et rendre le focus.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ChannelList } from '@/features/groups/components/ChannelList'
import { useGroupStore } from '@/stores/groupStore'
import type { Group } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
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

const channelButton = (name: string): HTMLButtonElement =>
  screen.getByText(name).closest('button') as HTMLButtonElement

const unreadOf = (channelId: string): number =>
  useGroupStore.getState().groups[GROUP_ID].channels.find((ch) => ch.id === channelId)?.unreadCount ?? -1

describe('menu contextuel des canaux', () => {
  beforeEach(() => {
    cleanup()
    useGroupStore.setState({
      groups: { [GROUP_ID]: group },
      activeGroupId: GROUP_ID,
      activeChannelId: 'ch-general',
      channelTyping: {},
    })
  })

  it('bascule lu / non lu au clic droit', async () => {
    render(<ChannelList />)

    fireEvent.contextMenu(channelButton('aléatoire'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'chat.markAsUnread' }))

    expect(unreadOf('ch-random')).toBe(1)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(channelButton('aléatoire')).toHaveTextContent('1')

    fireEvent.contextMenu(channelButton('aléatoire'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'chat.markAsRead' }))

    expect(unreadOf('ch-random')).toBe(0)
  })

  it('s’ouvre au clavier, place le focus et le rend avec Échap', async () => {
    render(<ChannelList />)
    const trigger = channelButton('général')
    trigger.focus()

    fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true })

    const item = screen.getByRole('menuitem')
    expect(document.activeElement).toBe(item)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(document.activeElement).toBe(trigger)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('expose le canal actif via aria-current', () => {
    render(<ChannelList />)

    expect(channelButton('général')).toHaveAttribute('aria-current', 'true')
    expect(channelButton('aléatoire')).not.toHaveAttribute('aria-current')
  })
})
