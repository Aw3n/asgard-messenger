/**
 * Modération des membres depuis l'interface.
 *
 * `GroupService.muteMember`/`unmuteMember` étaient implémentés, propagés au
 * groupe et appliqués au roster — mais aucune interface ne les appelait : la
 * sourdine d'un membre se réglait dans le code. Ces tests fixent le bouton et
 * son contraire, leur annonce, l'absence de prise sur soi-même et sur le
 * propriétaire, le libellé de rôle traduit, et le composeur fermé au membre
 * muselé.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Group, GroupMember } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Chaque méthode réclamée par les vues devient un spy partagé : la signature
// des appels et le chemin d'échec s'observent sans réseau ni Hypercore.
vi.mock('@/services/GroupService', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {}
  const service = new Proxy({}, {
    get: (_target, prop: string) => (fns[prop] ??= vi.fn(async () => {})),
  })
  return { groupService: service }
})

vi.mock('react-virtuoso', () => ({
  Virtuoso: React.forwardRef(() => React.createElement('div', { 'data-testid': 'virtual-list' })),
}))

// Le composeur réel est déjà testé ailleurs : ici on lit seulement ce que la
// vue lui passe — désactivé ou non, quel texte d'avertissement — et on rend
// l'envoi possible pour observer la garde du service.
vi.mock('@/features/chat/components/MessageInput', () => ({
  MessageInput: (props: { disabled?: boolean; placeholder?: string; onSend: (content: string) => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'composer' },
      React.createElement('textarea', {
        'data-testid': 'composer-field',
        disabled: props.disabled ? true : undefined,
        placeholder: props.placeholder,
      }),
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'composer-send', onClick: () => props.onSend('texte') },
        'envoyer',
      ),
    ),
}))

vi.mock('@/features/chat/components/MessageBubble', () => ({
  MessageBubble: () => React.createElement('div'),
}))
vi.mock('@/features/chat/components/ActiveTransfersWidget', () => ({ ActiveTransfersWidget: () => null }))
vi.mock('@/features/chat/components/ForwardModal', () => ({ ForwardModal: () => null }))
vi.mock('@/features/groups/components/ChannelList', () => ({ ChannelList: () => null }))
vi.mock('@/features/groups/components/MemberList', () => ({ MemberList: () => null }))

import { GroupSettings } from '@/features/groups/components/GroupSettings'
import { GroupView } from '@/features/groups/components/GroupView'
import { groupService } from '@/services/GroupService'
import { useConversationStore } from '@/stores/conversationStore'
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
const CAROL = 'c'.repeat(64)
const DAVE = 'd'.repeat(64)
const GROUP_ID = 'groupe-abcdef123456'
const CHANNEL_ID = 'chan-general'

function member(
  publicKey: string,
  displayName: string,
  role: GroupMember['role'],
  canPost = true,
): GroupMember {
  return { publicKey, displayName, role, joinedAt: 0, canPost, mutedBy: canPost ? undefined : ME }
}

const makeGroup = (members: GroupMember[]): Group => ({
  id: GROUP_ID,
  name: 'Équipe',
  members,
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
})

const setMembers = (...members: GroupMember[]) => {
  useGroupStore.setState({ groups: { [GROUP_ID]: makeGroup(members) } })
}

/** Le libellé de rôle est aussi une <option> du sélecteur : on vise le <p>. */
const roleLabel = (key: string): HTMLElement => screen.getByText(key, { selector: 'p' })
const toastTitles = () => useUIStore.getState().toasts.map((toast) => toast.title)

beforeEach(() => {
  vi.clearAllMocks()
  useUIStore.setState({ toasts: [] })
  useMessageStore.setState({ messages: {} })
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'b'.repeat(128) },
      profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useGroupStore.setState({
    groups: {},
    activeGroupId: GROUP_ID,
    activeChannelId: CHANNEL_ID,
    groupViewVisible: false,
    groupPresence: {},
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
        createdAt: 0,
        updatedAt: 0,
        broadcastMode: false,
      },
    },
    activeConversationId: GROUP_ID,
  })
  setMembers(member(ME, 'Moi', 'owner'), member(CAROL, 'Carol', 'member'))
})

afterEach(() => {
  cleanup()
})

describe('réglages de groupe — modération des membres', () => {
  it('donne une sourdine par membre, hors de soi et du propriétaire', () => {
    render(<GroupSettings onClose={() => {}} />)

    // Trois rôles affichés, une seule prise : Moi est propriétaire et la
    // ligne « soi » n'a jamais d'action.
    expect(screen.getAllByRole('button', { name: 'groups.muteMember' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'groups.unmuteMember' })).not.toBeInTheDocument()
    expect(roleLabel('common.member')).toBeInTheDocument()
    expect(roleLabel('common.owner')).toBeInTheDocument()
    // Plus aucun rôle rendu brut : « member » ou « owner » en anglais.
    expect(screen.queryByText('member')).not.toBeInTheDocument()
    expect(screen.queryByText('owner')).not.toBeInTheDocument()
  })

  it('met le membre en sourdine et l’annonce', async () => {
    render(<GroupSettings onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'groups.muteMember' }))

    expect(groupService.muteMember).toHaveBeenCalledWith(GROUP_ID, CAROL)
    await waitFor(() => expect(toastTitles()).toContain('groups.memberMuted'))
    expect(toastTitles()).not.toContain('groups.memberUnmuted')
  })

  it('propose de rétablir un membre déjà muselé et l’annonce', async () => {
    setMembers(member(ME, 'Moi', 'owner'), member(CAROL, 'Carol', 'member', false), member(DAVE, 'Dave', 'member'))

    render(<GroupSettings onClose={() => {}} />)

    const unmute = screen.getByRole('button', { name: 'groups.unmuteMember' })
    expect(unmute).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button', { name: 'groups.muteMember' })).toHaveLength(1)

    fireEvent.click(unmute)

    expect(groupService.unmuteMember).toHaveBeenCalledWith(GROUP_ID, CAROL)
    await waitFor(() => expect(toastTitles()).toContain('groups.memberUnmuted'))
  })

  it('annonce l’échec au lieu d’un succès silencieux', async () => {
    vi.mocked(groupService.muteMember).mockRejectedValueOnce(new Error('pair hors ligne'))

    render(<GroupSettings onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'groups.muteMember' }))

    await waitFor(() => expect(toastTitles()).toContain('groups.muteFailed'))
    expect(useUIStore.getState().toasts.at(-1)?.type).toBe('error')
  })

  it('traduit chaque rôle de l’effectif', () => {
    setMembers(member(ME, 'Moi', 'owner'), member(CAROL, 'Carol', 'moderator'), member(DAVE, 'Dave', 'guest'))

    render(<GroupSettings onClose={() => {}} />)

    expect(roleLabel('common.moderator')).toBeInTheDocument()
    expect(roleLabel('common.guest')).toBeInTheDocument()
  })
})

describe('composeur du membre en sourdine', () => {
  const renderView = () => render(
    <MemoryRouter initialEntries={[`/groups/${GROUP_ID}/channels/${CHANNEL_ID}`]}>
      <GroupView />
    </MemoryRouter>,
  )

  it('ferme le composeur et le dit', () => {
    setMembers(member(ME, 'Moi', 'member', false))

    renderView()

    expect(screen.getByTestId('composer-field')).toBeDisabled()
    expect(screen.getByTestId('composer-field')).toHaveAttribute('placeholder', 'groups.mutedInGroup')
  })

  it('laisse la parole au membre autorisé', () => {
    renderView()

    expect(screen.getByTestId('composer-field')).not.toBeDisabled()
    expect(screen.getByTestId('composer-field')).toHaveAttribute('placeholder', 'groups.messageChannel')
  })

  it('ne laisse pas l’échec d’envoi devenir une promesse non gérée', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(groupService.sendGroupMessage).mockRejectedValueOnce(new Error('Muted in this group'))

    renderView()
    fireEvent.click(screen.getByTestId('composer-send'))

    await waitFor(() => expect(groupService.sendGroupMessage).toHaveBeenCalled())
    await waitFor(() => expect(warn).toHaveBeenCalledWith(
      '[GroupView] sendGroupMessage failed:',
      expect.any(Error),
    ))
    warn.mockRestore()
  })
})
