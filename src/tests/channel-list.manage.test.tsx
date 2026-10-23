/**
 * Créer et supprimer un canal depuis la liste.
 *
 * `GroupService.addChannel`/`removeChannel` savaient faire, diffuser et poser
 * les rôles — mais la liste des canaux n'offrait aucun accès : les canaux
 * d'un groupe restaient figés à ceux de la création. L'entrée est réservée à
 * l'administrateur, le type choisi décide de qui pourra écrire, et le nom du
 * dialogue reprend les libellés de rôles déjà utilisés dans l'effectif.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Group, GroupChannel, MemberRole } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  // La phrase « qui peut écrire » porte une liste de rôles : le mock la rend
  // visible, sinon on vérifierait le dialogue sans voir ce qu'il promet.
  useTranslation: () => ({
    t: (key: string, options?: { roles?: string }) =>
      typeof options?.roles === 'string' ? `${key}[${options.roles}]` : key,
  }),
}))

vi.mock('@/services/GroupService', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {}
  const service = new Proxy({}, {
    get: (_target, prop: string) => (fns[prop] ??= vi.fn(async () => {})),
  })
  return { groupService: service }
})

import { ChannelList } from '@/features/groups/components/ChannelList'
import { groupService } from '@/services/GroupService'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { channelPermissionsFor } from '@/utils/groupPermissions'

const GROUP_ID = 'groupe-abcdef123456'
const ME = 'b'.repeat(64)
const CHANNELS: GroupChannel[] = [
  {
    id: 'ch-general',
    groupId: GROUP_ID,
    name: 'général',
    type: 'text',
    position: 0,
    permissions: channelPermissionsFor('text'),
    unreadCount: 0,
  },
  {
    id: 'ch-random',
    groupId: GROUP_ID,
    name: 'aléatoire',
    type: 'text',
    position: 1,
    permissions: channelPermissionsFor('text'),
    unreadCount: 0,
  },
]

const makeGroup = (role: MemberRole, channels = CHANNELS.map((ch) => ({ ...ch }))): Group => ({
  id: GROUP_ID,
  name: 'Équipe',
  members: [{ publicKey: ME, displayName: 'Moi', role, joinedAt: 0, canPost: true }],
  channels,
  createdAt: 0,
  ownerId: role === 'owner' ? ME : 'a'.repeat(64),
  isPublic: false,
  maxMembers: 50,
})

const toastTitles = () => useUIStore.getState().toasts.map((toast) => toast.title)
const dialog = () => screen.getByRole('dialog', { name: 'groups.createChannel' })

/** Ouvre la boîte de création, comme ne peut le faire qu'un admin. */
const openCreator = () => {
  fireEvent.click(screen.getByRole('button', { name: 'groups.addChannel' }))
  return dialog()
}

beforeEach(() => {
  vi.clearAllMocks()
  useUIStore.setState({ toasts: [] })
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
})

describe('entrée de création réservée à l’administrateur', () => {
  it('montre le « + » à un administrateur et le menu de suppression', () => {
    useGroupStore.setState({ groups: { [GROUP_ID]: makeGroup('admin') }, activeGroupId: GROUP_ID, activeChannelId: 'ch-general' })

    render(<ChannelList />)

    expect(screen.getByRole('button', { name: 'groups.addChannel' })).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByText('aléatoire').closest('button') as HTMLButtonElement)
    expect(screen.getByRole('menuitem', { name: 'groups.deleteChannel' })).toBeInTheDocument()
  })

  it('ne le propose pas à un simple membre', () => {
    useGroupStore.setState({ groups: { [GROUP_ID]: makeGroup('member') }, activeGroupId: GROUP_ID, activeChannelId: 'ch-general' })

    render(<ChannelList />)

    expect(screen.queryByRole('button', { name: 'groups.addChannel' })).not.toBeInTheDocument()
    fireEvent.contextMenu(screen.getByText('aléatoire').closest('button') as HTMLButtonElement)
    expect(screen.queryByRole('menuitem', { name: 'groups.deleteChannel' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'chat.markAsUnread' })).toBeInTheDocument()
  })

  it('propose l’entrée à la propriétaire du groupe', () => {
    useGroupStore.setState({ groups: { [GROUP_ID]: makeGroup('owner') }, activeGroupId: GROUP_ID, activeChannelId: 'ch-general' })

    render(<ChannelList />)

    expect(screen.getByRole('button', { name: 'groups.addChannel' })).toBeInTheDocument()
  })

  it('tait la suppression quand le groupe n’a plus qu’un canal', () => {
    useGroupStore.setState({
      groups: { [GROUP_ID]: makeGroup('admin', [{ ...CHANNELS[0] }]) },
      activeGroupId: GROUP_ID,
      activeChannelId: 'ch-general',
    })

    render(<ChannelList />)
    fireEvent.contextMenu(screen.getByText('général').closest('button') as HTMLButtonElement)

    expect(screen.queryByRole('menuitem', { name: 'groups.deleteChannel' })).not.toBeInTheDocument()
  })
})

describe('création d’un canal', () => {
  beforeEach(() => {
    useGroupStore.setState({ groups: { [GROUP_ID]: makeGroup('admin') }, activeGroupId: GROUP_ID, activeChannelId: 'ch-general' })
  })

  it('crée le canal du type choisi, le rend actif et l’annonce', async () => {
    const created: GroupChannel = { ...CHANNELS[0], id: 'ch-annonce', name: 'annonces', type: 'announcement' }
    vi.mocked(groupService.addChannel).mockResolvedValueOnce(created)

    render(<ChannelList />)
    const panel = openCreator()

    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'Grandes Annonces' } })
    fireEvent.click(within(panel).getByRole('radio', { name: /groups.channelTypeAnnouncement/ }))
    fireEvent.click(within(panel).getByRole('button', { name: 'common.create' }))

    await waitFor(() => expect(groupService.addChannel).toHaveBeenCalledWith(
      GROUP_ID,
      { name: 'Grandes Annonces', type: 'announcement' },
    ))
    await waitFor(() => expect(toastTitles()).toContain('groups.channelCreated'))
    expect(useGroupStore.getState().activeChannelId).toBe('ch-annonce')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('promet dans le dialogue les rôles qui pourront écrire', () => {
    render(<ChannelList />)
    const panel = openCreator()

    expect(within(panel).getByText('groups.channelTypeWhoWrites[common.owner, common.admin, common.moderator]')).toBeInTheDocument()
    expect(within(panel).getByText('groups.channelTypeWhoWrites[common.owner, common.admin]')).toBeInTheDocument()
    expect(within(panel).getByText('groups.channelTypeWhoWrites[common.owner, common.admin, common.moderator, common.member]')).toBeInTheDocument()
  })

  it('se ferme avec Échap pendant qu’on rédige le nom', async () => {
    render(<ChannelList />)
    openCreator()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(groupService.addChannel).not.toHaveBeenCalled()
  })

  it('refuse un nom déjà pris, sans appeler le service', async () => {
    render(<ChannelList />)
    const panel = openCreator()

    // « Aléatoire » : la casse et les accents ne font pas un second canal.
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: '  Aléatoire  ' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'common.create' }))

    await waitFor(() => expect(toastTitles()).toContain('groups.channelNameExists'))
    expect(groupService.addChannel).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('garde le dialogue ouvert et prévient quand la création échoue', async () => {
    vi.mocked(groupService.addChannel).mockRejectedValueOnce(new Error('pair hors ligne'))

    render(<ChannelList />)
    const panel = openCreator()
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'nouveau' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'common.create' }))

    await waitFor(() => expect(toastTitles()).toContain('groups.channelCreateFailed'))
    expect(useUIStore.getState().toasts.at(-1)?.type).toBe('error')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('signale un refus du service par un retour vide', async () => {
    render(<ChannelList />)
    const panel = openCreator()
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'nouveau' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'common.create' }))

    await waitFor(() => expect(toastTitles()).toContain('groups.channelCreateFailed'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('attend un nom avant d’ouvrir la création', () => {
    render(<ChannelList />)
    const panel = openCreator()

    expect(within(panel).getByRole('button', { name: 'common.create' })).toBeDisabled()
  })
})

describe('suppression d’un canal', () => {
  beforeEach(() => {
    useGroupStore.setState({ groups: { [GROUP_ID]: makeGroup('admin') }, activeGroupId: GROUP_ID, activeChannelId: 'ch-general' })
  })

  it('supprime le canal visé par le menu et l’annonce', async () => {
    render(<ChannelList />)
    fireEvent.contextMenu(screen.getByText('aléatoire').closest('button') as HTMLButtonElement)
    fireEvent.click(screen.getByRole('menuitem', { name: 'groups.deleteChannel' }))

    await waitFor(() => expect(groupService.removeChannel).toHaveBeenCalledWith(GROUP_ID, 'ch-random'))
    await waitFor(() => expect(toastTitles()).toContain('groups.channelDeleted'))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('annonce l’échec au lieu d’un succès silencieux', async () => {
    vi.mocked(groupService.removeChannel).mockRejectedValueOnce(new Error('droit refusé'))

    render(<ChannelList />)
    fireEvent.contextMenu(screen.getByText('aléatoire').closest('button') as HTMLButtonElement)
    fireEvent.click(screen.getByRole('menuitem', { name: 'groups.deleteChannel' }))

    await waitFor(() => expect(toastTitles()).toContain('groups.channelDeleteFailed'))
    expect(useUIStore.getState().toasts.at(-1)?.type).toBe('error')
  })

  it('ferme le menu avant d’agir, pour ne cibler un autre canal', async () => {
    render(<ChannelList />)
    fireEvent.contextMenu(screen.getByText('aléatoire').closest('button') as HTMLButtonElement)
    fireEvent.click(screen.getByRole('menuitem', { name: 'groups.deleteChannel' }))

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(groupService.removeChannel).toHaveBeenCalledTimes(1)
  })
})
