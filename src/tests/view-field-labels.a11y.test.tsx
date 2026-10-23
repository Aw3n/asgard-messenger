/**
 * Vues hors réglages : huit titres de champ ne désignaient rien.
 *
 * Le lien d'invitation, la clé publique et l'identifiant Keet de la modale
 * d'invitation ; la zone où coller une clé dans le QR code ; la description du
 * nouveau groupe ; la clé publique du composeur d'ajout de contact ; le curseur
 * de rayon de bordure et les sept sélecteurs de couleur du thème ; la qualité
 * vidéo du panneau d'appel. À l'annonce : six zones d'édition vides et une
 * rangée de trois boutons sans nom. Le panneau d'appel et le sélecteur de
 * couleur n'étaient pas des champs mais des choix — là, c'est le groupe qui
 * reçoit le titre (role="group" + aria-labelledby) et le retenu se lit sur
 * aria-pressed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ContactInviteModal } from '@/features/contacts/components/ContactInviteModal'
import { QRCodeModal } from '@/features/contacts/components/QRCodeModal'
import { CreateGroupModal } from '@/features/groups/components/CreateGroupModal'
import { ContactsPage } from '@/features/contacts/ContactsPage'
import { ThemeSelector } from '@/features/settings/components/ThemeSelector'
import { CallControls } from '@/features/calls/components/CallControls'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { SPKI_ED25519_PREFIX } from '@/utils/invite'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Le QR code se dessine dans un canvas que jsdom ne sait pas ouvrir.
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn(async () => undefined) } }))

vi.mock('@/services/GroupService', () => ({
  groupService: { createGroup: vi.fn(async () => ({})) },
}))

const ME = `${SPKI_ED25519_PREFIX}${'a'.repeat(64)}`

vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
})

beforeAll(() => {
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

describe('champs des modales de contact et de groupe', () => {
  it('nomme les trois champs en lecture seule de la modale d’invitation', () => {
    render(<ContactInviteModal onClose={() => {}} />)

    expect(screen.getByLabelText('contacts.inviteLink')).toHaveValue(`asgard://invite/${ME}?name=Moi`)
    expect(screen.getByLabelText('contacts.publicKey')).toHaveValue(ME)
    // L'identifiant z-base-32 se dérive de la clé : on vérifie qu'il est bien
    // nommé et rempli, pas sa forme — c'est utils/invite qui en répond.
    expect(screen.getByLabelText('contacts.keetId')).not.toHaveValue('')
  })

  it('nomme la zone où coller une clé publique', async () => {
    render(
      <MemoryRouter>
        <QRCodeModal onClose={() => {}} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'contacts.addFromKey' }))
    const field = await screen.findByLabelText('contacts.pastePublicKey')

    expect(field).toBeInstanceOf(HTMLTextAreaElement)
  })

  it('nomme la description du nouveau groupe', () => {
    render(<CreateGroupModal onClose={() => {}} />)

    expect(screen.getByLabelText('groups.descriptionOptional')).toBeInstanceOf(HTMLTextAreaElement)
  })

  it('nomme le champ de clé du composeur d’ajout de contact', async () => {
    render(
      <MemoryRouter initialEntries={['/contacts']}>
        <Routes>
          <Route path="/contacts" element={<ContactsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'contacts.add' }))
    const dialog = await screen.findByRole('dialog')

    expect(dialog).toHaveAccessibleName('contacts.addContact')
    expect(within(dialog).getByLabelText('contacts.publicKey')).toBeInTheDocument()
  })
})

describe('thème personnalisé', () => {
  /** L'éditeur de couleurs n'apparaît que thème personnalisé activé + montré. */
  async function openEditor() {
    useUIStore.getState().updateSettings({
      customTheme: { ...useUIStore.getState().settings.customTheme, enabled: true },
    })
    render(<ThemeSelector />)
    fireEvent.click(screen.getByRole('button', { name: /settings\.colorEditor/i }))
    await screen.findByLabelText(/^settings\.borderRadius/)
  }

  it('nomme le curseur de rayon de bordure', async () => {
    await openEditor()

    expect(screen.getByLabelText(/^settings\.borderRadius/)).toHaveAttribute('type', 'range')
  })

  it('nomme la pastille et le code tapé du groupe de couleur', async () => {
    await openEditor()
    const row = await screen.findByRole('group', { name: 'settings.accentColor' })

    // Deux contrôles pour une seule valeur : la pastille et le champ texte,
    // tous deux annoncés sous le même titre au lieu de rester muets.
    expect(within(row).getAllByLabelText('settings.accentColor')).toHaveLength(2)
  })

  it('désigne les sept couleurs du thème comme groupes nommés', async () => {
    await openEditor()
    await screen.findByRole('group', { name: 'settings.accentColor' })

    const titles = [
      'settings.accentColor', 'settings.secondaryColor', 'settings.backgroundColor',
      'settings.surfaceColor', 'settings.textPrimaryColor', 'settings.textSecondaryColor',
      'settings.borderColor',
    ]
    for (const title of titles) {
      expect(screen.getAllByRole('group', { name: title })).toHaveLength(1)
    }
  })
})

describe('panneau d’appel', () => {
  async function openPanel() {
    render(<CallControls />)
    // CallButton donne son infobulle au nom accessible : c'est `callSettings`
    // que la barre annonce, pas `settingsLabel`.
    fireEvent.click(screen.getByRole('button', { name: 'calls.callSettings' }))
    return screen.findByRole('group', { name: 'calls.videoQuality' })
  }

  it('nomme la rangée de qualités vidéo et désigne le choix en cours', async () => {
    const row = await openPanel()

    // Quatre paliers depuis que le panneau commande l'encodeur : « auto » rend
    // la main à l'adaptatif, sans quoi un choix forcé serait irréversible.
    expect(within(row).getAllByRole('button')).toHaveLength(4)
    expect(within(row).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })

  it('reporte le choix pressé quand on passe en basse qualité', async () => {
    const row = await openPanel()

    fireEvent.click(within(row).getByRole('button', { name: 'calls.qualityLow' }))

    const pressed = within(row).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(1)
    expect(pressed[0]).toHaveAccessibleName('calls.qualityLow')
  })
})

/**
 * Garde-fou statique : la preuve par rendu ne couvre que les composants qu'un
 * test sait monter — l'étape Profil de l'onboarding en est une. Un <label> n'a
 * que deux vies licites : un htmlFor qui désigne un champ, ou le champ à
 * l'intérieur. La troisième est le défaut d'origine.
 */
function openingTag(source: string, start: number) {
  let depth = 0
  let quote: string | null = null
  for (let i = start + '<label'.length; i < source.length; i += 1) {
    const c = source[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') depth -= 1
    else if (c === '>' && depth === 0) return source.slice(start, i + 1)
  }
  return source.slice(start)
}

function danglingLabels(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (entry === 'tests' || entry === 'node_modules') continue
    if (statSync(path).isDirectory()) {
      danglingLabels(path, found)
      continue
    }
    if (!path.endsWith('.tsx')) continue
    const source = readFileSync(path, 'utf8')
    let at = source.indexOf('<label')
    while (at !== -1) {
      const tag = openingTag(source, at)
      const isWired = /htmlFor\s*=/.test(tag)
      const closes = source.indexOf('</label>', at)
      const wrapsAControl = closes !== -1 && /<(input|textarea|select)\b/.test(source.slice(at, closes))
      // Un <label> cité dans un commentaire n'est pas une balise rendue :
      // `{/* … <label> … */}`, `// … <label> …` et les lignes de JSDoc.
      const lineStart = source.lastIndexOf('\n', at) + 1
      const before = source.slice(lineStart, at)
      const insideComment = before.includes('{/*') || before.includes('//') || /^\s*\*/.test(before)
      if (!isWired && !wrapsAControl && !insideComment) {
        found.push(`${path}:${source.slice(0, at).split('\n').length}`)
      }
      at = source.indexOf('<label', at + 1)
    }
  }
  return found
}

describe('garde-fou sur tous les libellés de l’interface', () => {
  it('ne laisse aucun <label> sans champ désigné ni champ englobé', () => {
    expect(danglingLabels('src')).toEqual([])
  })
})
