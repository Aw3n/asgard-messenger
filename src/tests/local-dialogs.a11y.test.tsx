/**
 * Sept dialogues ne passent pas par ModalContainer : leur vue les pose
 * elle-même par-dessus la page (réglages et création de groupe, transfert,
 * invitation, QR code, favoris, confirmation de vidage). Ils n'avaient aucun
 * geste clavier — Échap ne les refermait pas et Tab filait dans la page
 * recouverte. `useDialogBehavior` leur donne les trois gestes admis ailleurs.
 */
import { StrictMode, useState, type ReactElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateGroupModal } from '@/features/groups/components/CreateGroupModal'
import { GroupSettings } from '@/features/groups/components/GroupSettings'
import { ForwardModal } from '@/features/chat/components/ForwardModal'
import { ContactInviteModal } from '@/features/contacts/components/ContactInviteModal'
import { QRCodeModal } from '@/features/contacts/components/QRCodeModal'
import { FavoritesManager } from '@/features/settings/components/FavoritesManager'
import { TrashManager } from '@/features/settings/components/TrashManager'
import { fileService } from '@/services/FileService'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { DIALOG_FOCUSABLE } from '@/hooks/useDialogBehavior'
import { DEFAULT_KEYBOARD_SHORTCUTS } from '@/utils/shortcuts'
import type { Conversation, Group, Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

// jsdom n'a pas de contexte 2D : le rendu du QR échouerait bruyamment sans
// rien apporter au test des gestes.
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))

const GROUP_ID = 'groupe-abcdef123456'
const OWNER = 'a'.repeat(64)
const PEER = 'b'.repeat(64)

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

const message: Message = {
  id: 'm-source',
  conversationId: GROUP_ID,
  senderId: PEER,
  type: 'text',
  content: 'à transférer',
  timestamp: 1_700_000_000_000,
  status: 'sent',
}

const dialogFixtures: { label: string; name: string; open: (onClose: () => void) => ReactElement }[] = [
  {
    label: 'réglages de groupe',
    name: 'groups.groupSettingsTitle',
    open: (onClose) => <GroupSettings onClose={onClose} />,
  },
  {
    label: 'création de groupe',
    name: 'groups.createGroup',
    open: (onClose) => <CreateGroupModal onClose={onClose} />,
  },
  {
    label: 'transfert de message',
    name: 'chat.forwardMessage',
    open: (onClose) => <ForwardModal message={message} onClose={onClose} />,
  },
  {
    label: 'invitation d’un contact',
    name: 'contacts.inviteTitle',
    open: (onClose) => <ContactInviteModal onClose={onClose} />,
  },
  {
    label: 'QR code',
    name: 'contacts.myQRCode',
    open: (onClose) => (
      <MemoryRouter>
        <QRCodeModal onClose={onClose} />
      </MemoryRouter>
    ),
  },
  {
    label: 'fichiers favoris',
    name: 'settings.favoriteFiles',
    open: (onClose) => <FavoritesManager onClose={onClose} />,
  },
]

const focusableIn = (panel: HTMLElement): HTMLElement[] =>
  Array.from(panel.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE))

// Deux dialogues referment par un mot plutôt que par une croix : le geste est
// le même, l'annonce doit l'être aussi.
const wordCloseFixtures: { label: string; open: (onClose: () => void) => ReactElement }[] = [
  {
    label: 'invitation d’un contact',
    open: (onClose) => <ContactInviteModal onClose={onClose} />,
  },
  {
    label: 'QR code',
    open: (onClose) => (
      <MemoryRouter>
        <QRCodeModal onClose={onClose} />
      </MemoryRouter>
    ),
  },
]

/** Un réglage changé à l'écran : le bouton le relit au rendu suivant. */
const bindCloseKey = (combo: string) =>
  act(() =>
    useUIStore.getState().updateSettings({
      keyboardShortcuts: { ...useUIStore.getState().settings.keyboardShortcuts, closeModal: combo },
    }),
  )

beforeEach(() => {
  vi.spyOn(fileService, 'getTrashBin').mockReturnValue([
    { blobKey: 'blob-1', deletedAt: 1, expiresAt: Date.now() + 60_000 },
  ])
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: OWNER, secretKey: 'b'.repeat(128) },
      profile: { publicKey: OWNER, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useGroupStore.setState({ groups: { [GROUP_ID]: group }, activeGroupId: GROUP_ID, activeChannelId: null })
  useConversationStore.setState({ conversations: { [GROUP_ID]: conversation }, activeConversationId: GROUP_ID })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useUIStore.setState({ modal: { type: null } })
  bindCloseKey(DEFAULT_KEYBOARD_SHORTCUTS.closeModal)
})

describe('bouton de fermeture : la touche réglée est écrite dessus', () => {
  const closeButton = () => screen.getByRole('button', { name: 'common.close' })

  it.each(wordCloseFixtures)('$label : nomme « Escape » tant que rien n’est re-réglé', ({ open }) => {
    render(open(() => {}))

    expect(closeButton()).toHaveAttribute('aria-keyshortcuts', 'Escape')
    expect(closeButton().getAttribute('title')).toBe('common.close — Escape')
  })

  it.each(wordCloseFixtures)('$label : suit un re-réglage sans redémarrer la vue', ({ open }) => {
    render(open(() => {}))
    bindCloseKey('Ctrl+Shift+X')

    expect(closeButton()).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+X')
    expect(closeButton().getAttribute('title')).toBe('common.close — Ctrl + Shift + X')
  })

  it.each(wordCloseFixtures)('$label : se tait quand la touche est effacée', ({ open }) => {
    bindCloseKey('')
    render(open(() => {}))

    expect(closeButton()).not.toHaveAttribute('aria-keyshortcuts')
    expect(closeButton().getAttribute('title')).toBe('common.close')
  })

  it.each(wordCloseFixtures)('$label : le clic et la touche referment le même dialogue', ({ open }) => {
    bindCloseKey('Ctrl+Shift+X')
    const onClose = vi.fn()
    render(open(onClose))

    fireEvent.click(closeButton())
    expect(onClose).toHaveBeenCalledOnce()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('dialogues posés par leur propre vue', () => {
  it.each(dialogFixtures)('$label : s’annonce comme un dialogue nommé', ({ name, open }) => {
    const onClose = vi.fn()
    render(open(onClose))

    const panel = screen.getByRole('dialog', { name })
    expect(panel).toHaveAttribute('aria-modal', 'true')
    // Un dialogue sans nom lisible laisse l'AT muet ; un focus resté dehors
    // empêche Échap et la tabulation d'arriver jusqu'à lui.
    expect(panel.contains(document.activeElement)).toBe(true)
  })

  it.each(dialogFixtures)(
    '$label : se referme sur Échap, pas pendant une composition IME',
    ({ open }) => {
      const onClose = vi.fn()
      render(open(onClose))

      fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
      fireEvent.keyDown(window, { key: 'Escape', keyCode: 229 })
      expect(onClose).not.toHaveBeenCalled()

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledOnce()
    },
  )

  it.each(dialogFixtures)('$label : garde la tabulation dans son panneau', ({ open }) => {
    render(open(() => {}))

    const panel = screen.getByRole('dialog')
    const stops = focusableIn(panel)
    // Un seul contrôle ne prouverait rien : le piège ne se voit qu'à une
    // bordure.
    expect(stops.length).toBeGreaterThan(1)

    stops[stops.length - 1].focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(stops[0])

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(stops[stops.length - 1])
  })
})

describe('focus rendu à ce qui a ouvert le dialogue', () => {
  function Triggered({ children }: { children: (onClose: () => void) => ReactElement }) {
    const [visible, setVisible] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setVisible(true)}>
          ouvrir
        </button>
        {visible && children(() => setVisible(false))}
      </>
    )
  }

  it.each([
    ['hors StrictMode', (ui: ReactElement) => ui],
    ['sous StrictMode', (ui: ReactElement) => <StrictMode>{ui}</StrictMode>],
  ])('réglages de groupe fermés par Échap (%s)', async (_name, wrap) => {
    render(
      wrap(
        <Triggered>
          {(onClose) => <GroupSettings onClose={onClose} />}
        </Triggered>,
      ),
    )
    const trigger = screen.getByRole('button', { name: 'ouvrir' })
    trigger.focus()
    fireEvent.click(trigger)

    const panel = screen.getByRole('dialog')
    expect(panel.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.activeElement).toBe(trigger)
  })

  it('favoris fermés par le bouton de fermeture', async () => {
    render(
      <Triggered>
        {(onClose) => <FavoritesManager onClose={onClose} />}
      </Triggered>,
    )
    const trigger = screen.getByRole('button', { name: 'ouvrir' })
    trigger.focus()
    fireEvent.click(trigger)

    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.activeElement).toBe(trigger)
  })
})

describe('dialogues posés l’un sur l’autre', () => {
  it('Échap ne referme que le plus haut', async () => {
    const closeSettings = vi.fn()
    function Stacked() {
      const [showFavorites, setShowFavorites] = useState(true)
      return (
        <>
          <GroupSettings onClose={closeSettings} />
          {showFavorites && <FavoritesManager onClose={() => setShowFavorites(false)} />}
        </>
      )
    }
    render(<Stacked />)
    expect(screen.getAllByRole('dialog')).toHaveLength(2)

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
    expect(closeSettings).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeSettings).toHaveBeenCalledOnce()
  })
})

describe('confirmation de vidage de la corbeille', () => {
  it('se pose au clic, se referme sur Échap et rend le focus au bouton', async () => {
    render(<TrashManager onClose={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'settings.emptyTrash' })
    trigger.focus()
    fireEvent.click(trigger)

    const panel = screen.getByRole('dialog', { name: 'settings.emptyTrashConfirm' })
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(panel.contains(document.activeElement)).toBe(true)

    const stops = focusableIn(panel)
    expect(stops.length).toBeGreaterThan(1)
    stops[stops.length - 1].focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(stops[0])

    fireEvent.keyDown(window, { key: 'Escape' })
    // La corbeille est un dialogue depuis ce lot : seul le sur-message doit
    // disparaître, le panneau reste ouvert derrière lui.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'settings.emptyTrashConfirm' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('dialog', { name: 'settings.trash' })).toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('Échap pendant une composition IME laisse la confirmation ouverte', () => {
    render(<TrashManager onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'settings.emptyTrash' }))

    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    expect(screen.getByRole('dialog', { name: 'settings.emptyTrashConfirm' })).toBeInTheDocument()
  })
})
