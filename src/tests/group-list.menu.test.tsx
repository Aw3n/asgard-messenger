/**
 * Menu contextuel d'un groupe.
 *
 * GroupService coupait déjà l'alerte d'un groupe muet, mais aucun geste dans
 * la liste ne permettait de le rendre muet ni de solder ses non-lus d'un
 * canal à l'autre. Le menu doit répondre au clic droit, à Maj+F10 et à la
 * touche Menu, rendre le focus avec Échap, et ne proposer « Marquer comme lu »
 * que lorsqu'il reste quelque chose à lire.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GroupList } from '@/features/groups/components/GroupList'
import { useGroupStore } from '@/stores/groupStore'
import { useConversationStore } from '@/stores/conversationStore'
import type { Group } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/ui/Avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
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
      unreadCount: 2,
    },
    {
      id: 'ch-random',
      groupId: GROUP_ID,
      name: 'aléatoire',
      type: 'text',
      position: 1,
      permissions: { send: ['member'], read: ['member'], manage: ['admin'] },
      unreadCount: 1,
    },
  ],
  createdAt: 1,
  ownerId: 'a'.repeat(64),
  isPublic: false,
  maxMembers: 100,
}

const groupButton = (): HTMLButtonElement =>
  screen.getByText('Équipe').closest('button') as HTMLButtonElement

const unreadOf = (channelId: string): number =>
  useGroupStore.getState().groups[GROUP_ID].channels.find((ch) => ch.id === channelId)?.unreadCount ?? -1

const isMuted = (): boolean =>
  useConversationStore.getState().conversations[GROUP_ID]?.muted ?? false

describe('menu contextuel des groupes', () => {
  beforeEach(() => {
    cleanup()
    useGroupStore.setState({
      groups: { [GROUP_ID]: group },
      activeGroupId: GROUP_ID,
      searchQuery: '',
      channelTyping: {},
    })
    useConversationStore.setState({
      conversations: {
        [GROUP_ID]: {
          id: GROUP_ID,
          type: 'group',
          groupId: GROUP_ID,
          unreadCount: 0,
          muted: false,
          pinned: false,
          archived: false,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    })
  })

  it('nomme le champ de recherche des groupes', () => {
    render(<GroupList onCreateGroup={() => {}} />)

    expect(screen.getByLabelText('groups.searchGroups')).toHaveAttribute('placeholder', 'groups.searchGroups')
  })

  it('solde tous les canaux non lus puis retire l’action', async () => {
    render(<GroupList onCreateGroup={() => {}} />)

    fireEvent.contextMenu(groupButton())
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'chat.markAsRead' }))

    expect(unreadOf('ch-general')).toBe(0)
    expect(unreadOf('ch-random')).toBe(0)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    fireEvent.contextMenu(groupButton())
    expect(screen.queryByRole('menuitem', { name: 'chat.markAsRead' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'chat.muteConversation' })).toBeInTheDocument()
  })

  it('bascule la sourdine et suit le libellé du menu', async () => {
    render(<GroupList onCreateGroup={() => {}} />)

    fireEvent.contextMenu(groupButton())
    fireEvent.click(screen.getByRole('menuitem', { name: 'chat.muteConversation' }))

    expect(isMuted()).toBe(true)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(screen.getByTestId('group-muted')).toBeInTheDocument()

    fireEvent.contextMenu(groupButton())
    fireEvent.click(screen.getByRole('menuitem', { name: 'chat.unmuteConversation' }))

    expect(isMuted()).toBe(false)
    await waitFor(() => expect(screen.queryByTestId('group-muted')).toBeNull())
  })

  it('propose les durées de sourdine et programme huit heures', async () => {
    render(<GroupList onCreateGroup={() => {}} />)

    fireEvent.contextMenu(groupButton())
    for (const label of ['chat.muteFor1Hour', 'chat.muteFor8Hours', 'chat.muteFor1Week']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument()
    }
    const before = Date.now()
    fireEvent.click(screen.getByRole('menuitem', { name: 'chat.muteFor8Hours' }))

    const conv = useConversationStore.getState().conversations[GROUP_ID]
    expect(conv.muted).toBe(true)
    expect(conv.mutedUntil).toBeGreaterThanOrEqual(before + 8 * 60 * 60 * 1000)
    expect(conv.mutedUntil).toBeLessThanOrEqual(Date.now() + 8 * 60 * 60 * 1000)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    // Lève la minuterie de huit heures laissée par ce test.
    act(() => {
      useConversationStore.getState().muteConversation(GROUP_ID, false)
    })
  })

  it('s’ouvre au clavier, place le focus et le rend avec Échap', async () => {
    render(<GroupList onCreateGroup={() => {}} />)
    const trigger = groupButton()
    trigger.focus()

    fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true })

    const item = screen.getAllByRole('menuitem')[0]
    expect(document.activeElement).toBe(item)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(document.activeElement).toBe(trigger)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})
