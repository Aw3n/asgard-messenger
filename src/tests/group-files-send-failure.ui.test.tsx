/**
 * Groupe : joindre un fichier pouvait échouer sans un mot.
 *
 * `handleFiles` appelait `sendFilesToGroup` et n'en gardait que le
 * `console.error` : le composeur se vidait, aucun transfert n'apparaissait,
 * et rien ne distinguait un envoi lent d'un envoi perdu. Ce test fait
 * parler l'échec, et vérifie qu'un envoi réussi reste silencieux.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Group } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-virtuoso', async () => {
  const ReactModule = await import('react')
  const Virtuoso = ReactModule.forwardRef((props: { data: unknown[] }, ref: React.Ref<unknown>) => {
    ReactModule.useImperativeHandle(ref, () => ({ scrollToIndex: vi.fn() }))
    return ReactModule.createElement('div', { 'data-testid': 'virtual-list', 'data-count': props.data.length })
  })
  return { Virtuoso }
})

// Le composeur réel ouvre un sélecteur natif : ici un bouton suffit à livrer
// les fichiers au même `onFiles` que celui utilisé par le glisser-déposer.
vi.mock('@/features/chat/components/MessageInput', () => ({
  MessageInput: (props: { onFiles?: (files: File[]) => void }) =>
    React.createElement(
      'button',
      { onClick: () => props.onFiles?.([new File(['x'], 'note.txt')]) },
      'envoyer-fichiers',
    ),
}))

vi.mock('@/features/chat/components/ActiveTransfersWidget', () => ({ ActiveTransfersWidget: () => null }))
vi.mock('@/features/chat/components/ForwardModal', () => ({ ForwardModal: () => null }))
vi.mock('@/features/groups/components/ChannelList', () => ({ ChannelList: () => null }))
vi.mock('@/features/groups/components/MemberList', () => ({ MemberList: () => null }))
vi.mock('@/features/groups/components/GroupSettings', () => ({ GroupSettings: () => null }))

vi.mock('@/services/GroupService', () => ({
  groupService: {
    loadChannelMessages: vi.fn(async () => []),
    loadOlderChannelMessages: vi.fn(async () => []),
    loadChannelMessageContext: vi.fn(async () => []),
    loadNewerChannelMessages: vi.fn(async () => []),
    announceGroupPresence: vi.fn(),
    sendTypingIndicator: vi.fn(async () => {}),
    markAsRead: vi.fn(async () => {}),
    sendFilesToGroup: vi.fn(async () => {}),
  },
}))

import { GroupView } from '@/features/groups/components/GroupView'
import { groupService } from '@/services/GroupService'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'

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

const toasts = () => useUIStore.getState().toasts

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
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
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const view = () => render(
  <MemoryRouter>
    <GroupView />
  </MemoryRouter>,
)

describe('envoyer des fichiers dans un groupe', () => {
  it('un échec se dit au lieu de laisser le composeur muet', async () => {
    vi.mocked(groupService.sendFilesToGroup).mockRejectedValueOnce(new Error('transfert interrompu'))
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'envoyer-fichiers' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'groups.filesSendFailed')
      expect(toast?.type).toBe('error')
    })
    expect(groupService.sendFilesToGroup).toHaveBeenCalledWith(expect.any(Array), GROUP_ID, CHANNEL_ID)
  })

  it('un envoi accepté ne signale aucune panne', async () => {
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'envoyer-fichiers' }))

    await waitFor(() => expect(groupService.sendFilesToGroup).toHaveBeenCalledTimes(1))
    expect(toasts().some((entry) => entry.title === 'groups.filesSendFailed')).toBe(false)
  })
})
