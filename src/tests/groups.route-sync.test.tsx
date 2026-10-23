/**
 * Une URL de groupe doit sélectionner ce groupe et son canal.
 *
 * GroupView lit le groupe actif du store, pas les paramètres de route : sans
 * synchronisation, un lien de recherche ou de notification vers
 * /groups/<id>/channels/<id> laissait la vue sur le groupe précédent.
 */
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Group } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/features/groups/components/GroupList', () => ({
  GroupList: () => null,
}))
vi.mock('@/features/groups/components/GroupView', () => ({
  GroupView: () => null,
}))
vi.mock('@/features/groups/components/CreateGroupModal', () => ({
  CreateGroupModal: () => null,
}))

import { GroupsPage } from '@/features/groups/GroupsPage'
import { useGroupStore } from '@/stores/groupStore'

const GROUP_ID = 'group-1'
const OTHER_ID = 'group-2'
const GENERAL_ID = 'channel-general'
const RANDOM_ID = 'channel-random'

function makeGroup(id: string, name: string, channelIds: string[]): Group {
  return {
    id,
    name,
    members: [],
    channels: channelIds.map((channelId, position) => ({
      id: channelId,
      groupId: id,
      name: channelId,
      type: 'text' as const,
      position,
      permissions: { send: ['member' as const], read: ['member' as const], manage: ['owner' as const] },
      unreadCount: 0,
    })),
    createdAt: 0,
    ownerId: 'owner',
    isPublic: false,
    maxMembers: 50,
  }
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/groups/:groupId" element={<GroupsPage />} />
        <Route path="/groups/:groupId/channels/:channelId" element={<GroupsPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  useGroupStore.setState({
    groups: {
      [GROUP_ID]: makeGroup(GROUP_ID, 'Équipe', [GENERAL_ID, RANDOM_ID]),
      [OTHER_ID]: makeGroup(OTHER_ID, 'Autre', ['channel-other']),
    },
    activeGroupId: null,
    activeChannelId: null,
    groupViewVisible: false,
  })
})

afterEach(cleanup)

describe('synchronisation route → groupe actif', () => {
  it('sélectionne le groupe et le canal nommés par l’URL', () => {
    renderAt(`/groups/${GROUP_ID}/channels/${RANDOM_ID}`)

    expect(useGroupStore.getState().activeGroupId).toBe(GROUP_ID)
    expect(useGroupStore.getState().activeChannelId).toBe(RANDOM_ID)
  })

  it('sélectionne le groupe dès qu’un groupe est actif et bascule si l’URL change', () => {
    renderAt(`/groups/${GROUP_ID}`)
    expect(useGroupStore.getState().activeGroupId).toBe(GROUP_ID)
    expect(useGroupStore.getState().activeChannelId).toBe(GENERAL_ID)

    cleanup()
    renderAt(`/groups/${OTHER_ID}/channels/channel-other`)
    expect(useGroupStore.getState().activeGroupId).toBe(OTHER_ID)
    expect(useGroupStore.getState().activeChannelId).toBe('channel-other')
  })

  it('ignore un groupe ou un canal inconnu', () => {
    renderAt('/groups/inconnu/channels/inconnu')

    expect(useGroupStore.getState().activeGroupId).toBeNull()
    expect(useGroupStore.getState().activeChannelId).toBeNull()
  })
})
