/**
 * Sourdine d'un groupe dans la liste.
 *
 * GroupService savait déjà couper l'alerte, mais la conversation de groupe
 * n'exposait aucun commutateur et la pastille de non-lus restait éclatante.
 * Une conversation muette doit afficher sa cloche barrée et un point neutre,
 * comme la liste 1:1, et suivre le store sans remontage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { GroupItem } from '@/features/groups/components/GroupItem'
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
  channels: [{
    id: 'ch-general',
    groupId: GROUP_ID,
    name: 'général',
    type: 'text',
    position: 0,
    permissions: { send: ['member'], read: ['member'], manage: ['admin'] },
    unreadCount: 3,
  }],
  createdAt: 1,
  ownerId: 'a'.repeat(64),
  isPublic: false,
  maxMembers: 100,
}

const seedConversation = (muted: boolean): void => {
  useConversationStore.setState({
    conversations: {
      [GROUP_ID]: {
        id: GROUP_ID,
        type: 'group',
        groupId: GROUP_ID,
        unreadCount: 3,
        muted,
        pinned: false,
        archived: false,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  })
}

describe('sourdine dans la liste des groupes', () => {
  beforeEach(() => {
    cleanup()
    seedConversation(false)
  })

  it('affiche le compteur vif puis la cloche barrée et un point neutre', () => {
    render(<GroupItem group={group} isActive={false} onClick={() => {}} />)

    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByTestId('group-muted')).toBeNull()

    act(() => seedConversation(true))

    expect(screen.getByTestId('group-muted')).toBeInTheDocument()
    expect(screen.getByTestId('group-unread-muted')).toBeInTheDocument()
    expect(screen.queryByText('3')).toBeNull()
  })
})
