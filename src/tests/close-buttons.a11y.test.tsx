/**
 * Les boutons de fermeture réduits à une icône n’avaient aucun nom accessible :
 * un lecteur d’écran annonçait « bouton » sans dire ce qu’il fait. Chaque
 * panneau nomme désormais le sien — et le dit aussi haut que la touche réglée :
 * la croix fait exactement ce que fait `settings.keyboardShortcuts.closeModal`,
 * donc elle en porte le nom (survol + `aria-keyshortcuts`), et les panneaux qui
 * ignoraient encore cette touche la reçoivent.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrashManager } from '@/features/settings/components/TrashManager'
import { DownloadHistory } from '@/features/settings/components/DownloadHistory'
import { FileTransferManager } from '@/features/settings/components/FileTransferManager'
import { ShareLinksManager } from '@/features/settings/components/ShareLinksManager'
import { BlockedPeersManager } from '@/features/settings/components/BlockedPeersManager'
import { FavoritesManager } from '@/features/settings/components/FavoritesManager'
import { GroupSettings } from '@/features/groups/components/GroupSettings'
import { CallControls } from '@/features/calls/components/CallControls'
import { ModalContainer } from '@/components/modals/ModalContainer'
import { useUIStore } from '@/stores/uiStore'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useConversationStore } from '@/stores/conversationStore'
import { DEFAULT_KEYBOARD_SHORTCUTS } from '@/utils/shortcuts'
import type { ReactElement } from 'react'
import type { Conversation, Group } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const GROUP_ID = 'groupe-abcdef123456'
const OWNER = 'a'.repeat(64)
const REBOUND = 'Ctrl+Shift+X'

const group: Group = {
  id: GROUP_ID,
  name: 'Équipe',
  members: [],
  channels: [],
  createdAt: 1,
  ownerId: OWNER,
  isPublic: false,
  maxMembers: 100,
}

const conversation: Conversation = {
  id: GROUP_ID,
  type: 'group',
  groupId: GROUP_ID,
  unreadCount: 0,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  broadcastMode: false,
}

const closeButton = (): HTMLElement => screen.getByRole('button', { name: 'common.close' })

const bindCloseKey = (combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  // `act` : l’indice se lit par sélecteur, il ne parvient au bouton qu’au rendu
  // suivant — comme pour un réglage changé à l’écran sans rien remonter.
  act(() => {
    useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, closeModal: combo } })
  })
}

/** Le geste annoncé : `aria-keyshortcuts` pour le lecteur d’écran, le survol pour l’œil. */
const announces = (aria: string, shown: string) => {
  expect(closeButton()).toHaveAttribute('aria-keyshortcuts', aria)
  expect(closeButton().getAttribute('title') ?? '').toBe(`common.close — ${shown}`)
}

const silent = () => {
  expect(closeButton()).not.toHaveAttribute('aria-keyshortcuts')
  expect(closeButton().getAttribute('title') ?? '').toBe('common.close')
}

const closedBy = (spy: () => void): boolean =>
  (spy as unknown as { mock: { calls: unknown[] } }).mock.calls.length > 0

/**
 * Un panneau et l’observable de sa fermeture : la callback passée pour ceux que
 * leur vue pose elle-même, l’état du magasin pour la modale globale, qui ne
 * ferme que par lui.
 */
const panels: {
  label: string
  open: (onClose: () => void) => ReactElement
  closed: (onClose: () => void) => boolean
}[] = [
  { label: 'corbeille', open: (onClose) => <TrashManager onClose={onClose} />, closed: closedBy },
  { label: 'historique des téléchargements', open: (onClose) => <DownloadHistory onClose={onClose} />, closed: closedBy },
  { label: 'gestionnaire des transferts', open: (onClose) => <FileTransferManager onClose={onClose} />, closed: closedBy },
  { label: 'liens de partage', open: (onClose) => <ShareLinksManager onClose={onClose} />, closed: closedBy },
  { label: 'fichiers favoris', open: (onClose) => <FavoritesManager onClose={onClose} />, closed: closedBy },
  { label: 'réglages de groupe', open: (onClose) => <GroupSettings onClose={onClose} />, closed: closedBy },
  {
    label: 'boîte de dialogue d’ajout de contact',
    open: () => {
      // La modale globale se lit dans le magasin : c’est lui qui la pose.
      useUIStore.setState({ modal: { type: 'addContact' } })
      return (
        <MemoryRouter>
          <ModalContainer />
        </MemoryRouter>
      )
    },
    closed: () => useUIStore.getState().modal.type === null,
  },
]

beforeEach(() => {
  Object.assign(window.asgard.network, { getBlockedPeers: vi.fn().mockResolvedValue([]) })
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  bindCloseKey(DEFAULT_KEYBOARD_SHORTCUTS.closeModal)
  useUIStore.setState({ modal: { type: null } })
  useGroupStore.setState({ groups: { [GROUP_ID]: group }, activeGroupId: GROUP_ID, activeChannelId: null })
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: OWNER, secretKey: 'b'.repeat(128) },
      profile: { publicKey: OWNER, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useConversationStore.setState({ conversations: { [GROUP_ID]: conversation }, activeConversationId: GROUP_ID })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  bindCloseKey(DEFAULT_KEYBOARD_SHORTCUTS.closeModal)
  useUIStore.setState({ modal: { type: null } })
})

describe('croix de fermeture', () => {
  it.each(panels)('$label : nomme la touche réglée', ({ open }) => {
    render(open(vi.fn()))
    announces('Escape', 'Escape')
  })

  it.each(panels)('$label : suit le réglage sans démonter le panneau', ({ open }) => {
    render(open(vi.fn()))
    bindCloseKey(REBOUND)
    announces('Control+Shift+X', 'Ctrl + Shift + X')
  })

  it.each(panels)('$label : se tait quand le geste est éteint', ({ open }) => {
    render(open(vi.fn()))
    bindCloseKey('')
    silent()
  })

  it.each(panels)('$label : la croix ferme', ({ open, closed }) => {
    const onClose = vi.fn()
    render(open(onClose))
    fireEvent.click(closeButton())
    expect(closed(onClose)).toBe(true)
  })

  it.each(panels)('$label : la touche réglée ferme aussi', ({ open, closed }) => {
    const onClose = vi.fn()
    render(open(onClose))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closed(onClose)).toBe(true)
  })

  it.each(panels)('$label : seule la touche réglée ferme, pas une frappe en composition', ({ open, closed }) => {
    const onClose = vi.fn()
    render(open(onClose))
    bindCloseKey(REBOUND)

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true, isComposing: true })
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true, keyCode: 229 })
    expect(closed(onClose)).toBe(false)

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true })
    expect(closed(onClose)).toBe(true)
  })

  it.each(panels)('$label : geste éteint, rien ne ferme', ({ open, closed }) => {
    const onClose = vi.fn()
    render(open(onClose))
    bindCloseKey('')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closed(onClose)).toBe(false)
  })
})

describe('panneaux qui ne doivent rien annoncer', () => {
  it('pairs bloqués : posé dans le fil de la page, la touche de fermeture ne lui appartient pas', async () => {
    render(<BlockedPeersManager onClose={() => {}} />)
    silent()
    await waitFor(() => expect(screen.getByText('settings.noBlockedPeers')).toBeInTheDocument())
  })
})

describe('le panneau s’annonce comme un dialogue et prend le focus', () => {
  it('historique des téléchargements', () => {
    render(<DownloadHistory onClose={() => {}} />)
    // Sans ce focus, Échap partirait du corps de page et un lecteur d’écran
    // resterait muet sur le nom du panneau ouvert.
    expect(screen.getByRole('dialog', { name: 'settings.downloadHistory' })).toHaveFocus()
  })

  it('rendu sans callback de fermeture : le panneau reste inerte', () => {
    // `onClose` est optionnel sur ces panneaux, leur croix n’apparaît qu’avec
    // lui. Sans elle, la touche n’aurait rien à refermer : elle doit rester à la
    // page, et le focus à ce qui le tenait.
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    render(<DownloadHistory />)
    expect(document.activeElement).toBe(outside)
    expect(fireEvent.keyDown(window, { key: 'Escape' })).toBe(true)

    outside.remove()
  })

  it('réglages de groupe : le commutateur de diffusion reste un interrupteur', () => {
    render(<GroupSettings onClose={() => {}} />)
    const toggle = screen.getByRole('switch', { name: 'groups.broadcastMode' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(screen.getByRole('switch', { name: 'groups.broadcastMode' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('panneau des réglages d’appel', () => {
  it('nomme sa fermeture, la referme et obéit à la touche réglée', async () => {
    render(<CallControls />)
    fireEvent.click(screen.getByRole('button', { name: 'calls.callSettings' }))

    expect(closeButton()).toHaveAttribute('aria-keyshortcuts', 'Escape')
    expect(closeButton().getAttribute('title') ?? '').toBe('common.close — Escape')
    // Le panneau s’ouvre comme un dialogue nommé, et c’est lui qui tient le focus.
    expect(screen.getByRole('dialog', { name: 'calls.callSettings' })).toHaveFocus()

    fireEvent.click(closeButton())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'calls.callSettings' }))
    bindCloseKey(REBOUND)
    expect(closeButton()).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+X')
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true })
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument(),
    )
  })
})
