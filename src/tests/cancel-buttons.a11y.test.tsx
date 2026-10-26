/**
 * Un bouton « Annuler » n’annonce la touche réglée que si les deux renvoient au
 * même endroit. Six dialogues sont dans ce cas — la croix, la touche et le bouton
 * referment le même panneau — et portent donc le même indice que la croix des
 * lots précédents : survol + `aria-keyshortcuts`, suivi en direct du réglage, muet
 * si le geste est éteint.
 *
 * Trois « Annuler » restent volontairement silencieux, et le test le pinse : la
 * bande de confirmation inline des réglages de groupe (Échap ferme tout le
 * panneau, pas seulement la bande) et les deux boutons d’abandon d’un transfert
 * (ils interrompent un envoi, ils ne referment rien). La garde balaye aussi toute
 * l’interface : un indice de touche ne peut sortir que du réglage, jamais d’une
 * valeur écrite à la main.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { ModalContainer } from '@/components/modals/ModalContainer'
import { ContactsPage } from '@/features/contacts/ContactsPage'
import { TrashManager } from '@/features/settings/components/TrashManager'
import { MessageDeleteConfirm } from '@/features/chat/components/MessageDeleteConfirm'
import { CreateChannelModal } from '@/features/groups/components/CreateChannelModal'
import { CreateGroupModal } from '@/features/groups/components/CreateGroupModal'
import { GroupSettings } from '@/features/groups/components/GroupSettings'
import { fileService } from '@/services/FileService'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { DEFAULT_KEYBOARD_SHORTCUTS } from '@/utils/shortcuts'
import type { Contact, Conversation, Group } from '@/types'
import type { ReactElement } from 'react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const CANCEL = 'common.cancel'
const GROUP_ID = 'groupe-abcdef123456'
const OWNER = 'a'.repeat(64)
const MEMBER = 'c'.repeat(64)
const REBOUND = 'Ctrl+Shift+X'
const PUBLIC_KEY = 'd'.repeat(64)

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

const contact: Contact = {
  publicKey: PUBLIC_KEY,
  displayName: 'Alice',
  status: 'online',
  relation: 'contact',
  verified: false,
  addedAt: 0,
}

const cancelButton = (): HTMLElement => screen.getByRole('button', { name: CANCEL })

/** La corbeille ne propose son vidage que si elle contient quelque chose. */
let trashBin: MockInstance<typeof fileService.getTrashBin>

const bindCloseKey = (combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  // `act` : l’indice se lit par sélecteur, il ne parvient au bouton qu’au rendu
  // suivant — comme pour un réglage changé à l’écran sans rien remonter.
  act(() => {
    useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, closeModal: combo } })
  })
}

const announces = (aria: string, shown: string) => {
  expect(cancelButton()).toHaveAttribute('aria-keyshortcuts', aria)
  expect(cancelButton().getAttribute('title') ?? '').toBe(`${CANCEL} — ${shown}`)
}

const silent = () => {
  expect(cancelButton()).not.toHaveAttribute('aria-keyshortcuts')
  expect(cancelButton().getAttribute('title') ?? '').toBe(CANCEL)
}

/** Un bouton muet : rien que son nom, ni attribut de touche, ni survol détaillé. */
const bareLabel = (button: HTMLElement, label: string) => {
  expect(button).not.toHaveAttribute('aria-keyshortcuts')
  expect(button.getAttribute('title') ?? label).toBe(label)
}

const closedBy = (spy: () => void): boolean =>
  (spy as unknown as { mock: { calls: unknown[] } }).mock.calls.length > 0

/** Le sous-dialoge n’appelle rien pour se refermer : il disparaît du DOM. */
const goneFromDom = () => screen.queryByRole('button', { name: CANCEL }) === null

/** Un dialogue et l’observable de sa fermeture. */
interface CancelPanel {
  label: string
  view: (onCancel: () => void) => ReactElement
  /** Certains « Annuler » ne s’obtiennent qu’après un clic sur leur page. */
  reveal?: () => void
  gone: (onCancel: () => void) => boolean
}

const panels: CancelPanel[] = [
  {
    label: 'modale globale d’ajout de contact',
    view: () => {
      useUIStore.setState({ modal: { type: 'addContact' } })
      return (
        <MemoryRouter>
          <ModalContainer />
        </MemoryRouter>
      )
    },
    gone: () => useUIStore.getState().modal.type === null,
  },
  {
    label: 'confirmation de vidage de la corbeille',
    view: (onCancel) => <TrashManager onClose={onCancel} />,
    reveal: () => fireEvent.click(screen.getByRole('button', { name: 'settings.emptyTrash' })),
    gone: goneFromDom,
  },
  {
    label: 'confirmation de suppression de message',
    view: (onCancel) => <MessageDeleteConfirm mode="forEveryone" onCancel={onCancel} onConfirm={vi.fn()} />,
    gone: closedBy,
  },
  {
    label: 'création de groupe',
    view: (onCancel) => <CreateGroupModal onClose={onCancel} />,
    gone: closedBy,
  },
  {
    label: 'création de canal',
    view: (onCancel) => <CreateChannelModal groupId={GROUP_ID} onClose={onCancel} />,
    gone: closedBy,
  },
  {
    label: 'ajout de contact depuis la page Contacts',
    view: () => (
      <MemoryRouter initialEntries={['/contacts']}>
        <ContactsPage />
      </MemoryRouter>
    ),
    reveal: () => fireEvent.click(screen.getByRole('button', { name: 'contacts.add' })),
    gone: () => screen.queryByRole('dialog', { name: 'contacts.addContact' }) === null,
  },
]

function show(panel: CancelPanel, onCancel = vi.fn()) {
  render(panel.view(onCancel))
  panel.reveal?.()
  return onCancel
}

beforeEach(() => {
  Object.assign(window.asgard.network, { getBlockedPeers: vi.fn().mockResolvedValue([]) })
  trashBin = vi.spyOn(fileService, 'getTrashBin').mockReturnValue([{ blobKey: 'blob-1', deletedAt: 1, expiresAt: 2 }])
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
  useContactStore.setState({ contacts: { [PUBLIC_KEY]: contact }, searchQuery: '' })
})

afterEach(() => {
  cleanup()
  // `restoreAllMocks` ici aurait aussi rendu muets les `vi.fn()` du setup
  // (window.asgard.app.getPendingDeepLink), et la modale explose au test suivant.
  trashBin.mockRestore()
  vi.unstubAllGlobals()
  bindCloseKey(DEFAULT_KEYBOARD_SHORTCUTS.closeModal)
  useUIStore.setState({ modal: { type: null } })
})

describe('bouton Annuler d’un dialogue', () => {
  it.each(panels)('$label : nomme la touche réglée', (panel) => {
    show(panel)
    announces('Escape', 'Escape')
  })

  it.each(panels)('$label : suit le réglage sans démonter le dialogue', (panel) => {
    show(panel)
    bindCloseKey(REBOUND)
    announces('Control+Shift+X', 'Ctrl + Shift + X')
  })

  it.each(panels)('$label : se tait quand le geste est éteint', (panel) => {
    show(panel)
    bindCloseKey('')
    silent()
  })

  it.each(panels)('$label : Annuler referme le dialogue', (panel) => {
    const onCancel = show(panel)
    fireEvent.click(cancelButton())
    return waitFor(() => expect(panel.gone(onCancel)).toBe(true))
  })

  it.each(panels)('$label : la touche réglée referme aussi', (panel) => {
    const onCancel = show(panel)
    fireEvent.keyDown(window, { key: 'Escape' })
    return waitFor(() => expect(panel.gone(onCancel)).toBe(true))
  })

  it.each(panels)('$label : seule la touche réglée referme', (panel) => {
    const onCancel = show(panel)
    bindCloseKey(REBOUND)

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true, isComposing: true })
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true, keyCode: 229 })
    expect(panel.gone(onCancel)).toBe(false)

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true })
    return waitFor(() => expect(panel.gone(onCancel)).toBe(true))
  })

  it.each(panels)('$label : geste éteint, rien ne referme', (panel) => {
    const onCancel = show(panel)
    bindCloseKey('')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(panel.gone(onCancel)).toBe(false)
  })
})

describe('bande de confirmation inline : ne pas promettre ce qu’Échap ne fait pas', () => {
  /** Le panneau de réglages est ouvert, la bande « quitter le groupe » est posée. */
  function leaveStrip(onClose = vi.fn()) {
    // Le propritaire ne peut pas quitter son groupe : la bande n’existe que pour
    // un membre.
    useIdentityStore.setState({
      identity: {
        keyPair: { publicKey: MEMBER, secretKey: 'b'.repeat(128) },
        profile: { publicKey: MEMBER, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
      },
      isSetup: true,
    })
    render(<GroupSettings onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'groups.leaveGroup' }))
    return onClose
  }

  it('son Annuler reste muet sur la touche', () => {
    leaveStrip()
    expect(screen.getByText('groups.leaveConfirm')).toBeInTheDocument()
    bareLabel(cancelButton(), CANCEL)
  })

  it('Échap ferme tout le panneau, pas seulement la bande', () => {
    const onClose = leaveStrip()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('son Annuler n’efface que la bande : le panneau reste ouvert', () => {
    const onClose = leaveStrip()
    fireEvent.click(cancelButton())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('groups.leaveConfirm')).not.toBeInTheDocument()
  })
})

describe('les autres « Annuler » ne referment aucun dialogue', () => {
  const source = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8')

  /** Toutes les sources de l’interface, hors tests. */
  const tsxFiles = (dir: string): string[] => {
    const found: string[] = []
    for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!rel.includes('tests')) found.push(...tsxFiles(rel))
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        found.push(rel)
      }
    }
    return found
  }

  /** La balise d’ouverture du bouton qui contient `needle`. */
  const openingTag = (text: string, needle: string): string => {
    const at = text.indexOf(needle)
    // Une aiguille qui ne trouve plus son bouton rendrait la garde faussement
    // vraie : elle doit crier avant de conclure.
    expect(at).toBeGreaterThan(-1)
    return text.slice(text.lastIndexOf('<', at), text.indexOf('>', at) + 1)
  }

  it('abandon de transfert : le bouton nomme son action, jamais une touche', () => {
    // Interrompre un envoi ne referme rien : promettre Échap là-dessus serait un
    // mensonge. Le contrôle positif prouve que c’est bien le bouton visé.
    const row = openingTag(
      source('src/features/chat/components/ActiveTransfersWidget.tsx'),
      'fileService.cancelTransfer(transfer.id)',
    )
    // Le libellé porte aussi le fichier : plusieurs transferts peuvent être
    // actifs, « Annuler » seul ne dirait pas lequel serait abandonné.
    expect(row).toContain("aria-label={`${t('common.cancel')} — ${transfer.fileName}`}")
    expect(row).not.toContain('aria-keyshortcuts')

    const manager = openingTag(source('src/features/settings/components/FileTransferManager.tsx'), 'handleCancel(transfer.id)')
    expect(manager).not.toContain('aria-keyshortcuts')
  })

  it('aucun indice de touche n’est écrit à la main', () => {
    // Balayage de toute l’interface : un `aria-keyshortcuts` n’a le droit
    // d’exister que s’il sort du réglage de l’utilisateur. Une valeur codée en
    // dur annoncerait un geste que la page Réglages ne peut plus changer.
    const offenders: string[] = []
    let announced = 0
    for (const path of tsxFiles('src')) {
      source(path)
        .split('\n')
        .filter((line) => line.includes('aria-keyshortcuts'))
        // Une ligne de documentation n’est pas un attribut posé à l’écran.
        .filter((line) => !/^\s*(\*|\/\/)/.test(line))
        .forEach((line) => {
          announced += 1
          const wired =
            /\{\s*[\w.]*[Gg]esture[?\w.]*\.ariaKeyShortcuts\s*\}/.test(line) ||
            line.includes('toAriaKeyShortcuts(')
          if (!wired) offenders.push(`${path}: ${line.trim()}`)
        })
    }
    // Un balayage vide se lirait comme un succès : il faut qu’il ait vu les
    // annonces des lots précédents pour dire que les autres sont propres.
    expect(announced).toBeGreaterThan(20)
    expect(offenders).toEqual([])
  })
})
