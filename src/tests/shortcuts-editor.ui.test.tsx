/**
 * L'écran qui règle les quinze gestes clavier.
 *
 * `settings.keyboardShortcuts` portait quinze combinaisons que l'application lit
 * depuis quatre endroits — l'écouteur global, le composeur, les rangées de
 * message, les dialogues — sans qu'aucun écran ne les montre ni ne les laisse
 * changer. Ces tests rendent la section « shortcuts » des réglages et exigent
 * les observations que l'utilisateur fait vraiment : la frappe écrit la
 * combinaison, ne déclenche pas l'action réglée, refuse ce qui est déjà tenu ou
 * ce qui détournerait le focus, et le doigt sur « vider » éteint le geste dans
 * toute l'application.
 *
 * Les frappes partent du bouton sous le curseur et remontent jusqu'à `window`,
 * comme dans un navigateur : c'est ce trajet qui rend la phase de capture de
 * l'éditeur antérieure à l'écouteur global, et que le test de non-déclenchement
 * prouve réellement.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useAppShortcuts } from '@/hooks/useAppShortcuts'
import { useUIStore } from '@/stores/uiStore'
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  SHORTCUT_GROUPS,
  SHORTCUT_LABEL_KEYS,
  SHORTCUT_NAMES,
  type ShortcutName,
} from '@/utils/shortcuts'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    // Le refus d'un conflit nomme l'action déjà réglée : l'option passe par la
    // traduction, donc le mock doit la rendre lisible, sinon le test verrait
    // un message sans coupable.
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.action === 'string' ? `${key} → ${options.action}` : key,
  }),
}))

function GlobalGestures() {
  useAppShortcuts()
  return null
}

function renderShortcuts() {
  return render(
    <MemoryRouter initialEntries={['/settings?section=shortcuts']}>
      <GlobalGestures />
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 * Le bouton où l'écran écrit la combinaison. Son nom accessible porte le titre
 * du geste et la valeur affichée, donc la recherche porte sur le titre seul :
 * c'est par lui qu'un lecteur d'écran retrouve la rangée.
 */
const valueButton = (name: ShortcutName) =>
  screen.getByRole('button', { name: new RegExp(SHORTCUT_LABEL_KEYS[name].replace(/\./g, '\\.')) })

/** La rangée : le bouton de valeur, son indice d'attente et ses deux boutons d'un clic. */
const rowBox = (name: ShortcutName) => valueButton(name).parentElement as HTMLElement

const hint = (name: ShortcutName) =>
  rowBox(name).querySelector('[aria-live="polite"]')?.textContent ?? ''

const stored = (name: ShortcutName) => useUIStore.getState().settings.keyboardShortcuts[name]

/** Armer une rangée : le curseur dessus, un clic, et la frappe qui suit est pour l'éditeur. */
const arm = (name: ShortcutName) => {
  const button = valueButton(name)
  // Le focus quitte la rangée précédente, qui rend son écouteur : la sortie du
  // curseur est un rendu, donc elle se joue dans `act`.
  act(() => { button.focus() })
  fireEvent.click(button)
  return button
}

const press = (source: HTMLElement, key: string, modifiers: Record<string, boolean> = {}) => {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...modifiers })
  act(() => { source.dispatchEvent(event) })
  return event
}

/** Une frappe jouée sur la page, hors d'une rangée armée : c'est le geste global. */
const pressAnywhere = (key: string, modifiers: Record<string, boolean> = {}) =>
  press(document.body, key, modifiers)

const baselineShortcuts = { ...useUIStore.getState().settings.keyboardShortcuts }

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
})

beforeEach(() => {
  useUIStore.setState({ sidebarCollapsed: false, isSearchOpen: false })
})

afterEach(() => {
  cleanup()
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...baselineShortcuts } })
  useUIStore.setState({ sidebarCollapsed: false, isSearchOpen: false })
})

describe('rangées de l’écran', () => {
  it('montre les trois groupes, dans l’ordre de l’écran', () => {
    renderShortcuts()
    expect(
      screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent),
    ).toEqual(SHORTCUT_GROUPS.map((group) => group.titleKey))
  })

  it('donne les quinze gestes à régler, chacun nommé par son action', () => {
    renderShortcuts()
    expect(SHORTCUT_NAMES).toHaveLength(15)
    for (const name of SHORTCUT_NAMES) {
      expect(valueButton(name)).toBeInTheDocument()
    }
  })

  it('écrit la combinaison du magasin lisible sur sa rangée', () => {
    renderShortcuts()
    expect(valueButton('toggleSidebar')).toHaveTextContent('Ctrl + B')
    expect(valueButton('nextConversation')).toHaveTextContent('Ctrl + ↓')
    expect(valueButton('deleteMessage')).toHaveTextContent('Delete')
    expect(valueButton('openSettings')).toHaveTextContent('Ctrl + ,')
    expect(valueButton('closeModal')).toHaveTextContent('Escape')
  })

  it('rend la même touche que le plus écrit en toutes lettres', () => {
    renderShortcuts()
    // Le signe « + » ne peut pas s'écrire tel quel dans le magasin, où il sert
    // de séparateur : la frappe de « Ctrl + » garde « Plus », et les deux
    // écritures se lisent à l'écran de la même façon.
    press(arm('openProfile'), '+', { ctrlKey: true })
    expect(stored('openProfile')).toBe('Ctrl+Plus')
    expect(valueButton('openProfile')).toHaveTextContent('Ctrl + Plus')
  })

  it('annonce le geste au lecteur d’écran dans le vocabulaire ARIA', () => {
    renderShortcuts()
    expect(valueButton('toggleSidebar')).toHaveAttribute('aria-keyshortcuts', 'Control+B')
    expect(valueButton('closeModal')).toHaveAttribute('aria-keyshortcuts', 'Escape')
  })
})

describe('régler un geste par une frappe', () => {
  it('écrit dans le magasin la combinaison exacte que le code relit', () => {
    renderShortcuts()
    press(arm('openProfile'), 'j', { ctrlKey: true, altKey: true, shiftKey: true })
    expect(stored('openProfile')).toBe('Ctrl+Alt+Shift+J')
    expect(valueButton('openProfile')).toHaveTextContent('Ctrl + Alt + Shift + J')
    expect(hint('openProfile')).toBe('')
  })

  it('refuse la touche Cmd sur un geste que Ctrl tient déjà', () => {
    renderShortcuts()
    // « Ctrl+K » part aussi sur Cmd : régler « Cmd+K » ailleurs laisserait deux
    // gestes sur la même frappe, l'un des deux mort sans que l'écran le dise.
    press(arm('openProfile'), 'k', { metaKey: true })
    expect(stored('openProfile')).toBe('Ctrl+P')
    expect(hint('openProfile')).toBe('settings.shortcutTaken → common.search')
  })

  it('rend une flèche par son glyphe et garde le nom écrit au magasin', () => {
    renderShortcuts()
    press(arm('openProfile'), 'ArrowLeft', { ctrlKey: true })
    expect(stored('openProfile')).toBe('Ctrl+ArrowLeft')
    expect(valueButton('openProfile')).toHaveTextContent('Ctrl + ←')
  })

  it('accepte la barre d’espacement', () => {
    renderShortcuts()
    press(arm('openProfile'), ' ', { ctrlKey: true })
    expect(stored('openProfile')).toBe('Ctrl+Space')
    expect(valueButton('openProfile')).toHaveTextContent('Ctrl + Space')
  })

  it('ne déclenche pas l’action réglée pendant qu’on la change', () => {
    renderShortcuts()
    // Le geste frappé est exactement celui que la rangée tient déjà : seule une
    // frappe avalée en capture laisse le rail à sa place.
    const event = press(arm('toggleSidebar'), 'b', { ctrlKey: true })
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    press(arm('openSearch'), 'k', { ctrlKey: true })
    expect(useUIStore.getState().isSearchOpen).toBe(false)
    expect(stored('openSearch')).toBe('Ctrl+K')
  })

  it('attend la touche suivante quand un modificateur est tenu seul', () => {
    renderShortcuts()
    const button = arm('openProfile')
    press(button, 'Control', { ctrlKey: true })
    expect(stored('openProfile')).toBe('Ctrl+P')
    expect(hint('openProfile')).toBe('settings.shortcutListening')
    press(button, 'y', { ctrlKey: true })
    expect(stored('openProfile')).toBe('Ctrl+Y')
  })

  it('laisse une composition IME sans effet sur le réglage', () => {
    renderShortcuts()
    const button = arm('openProfile')
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true, bubbles: true })
    Object.defineProperty(event, 'isComposing', { value: true })
    act(() => { button.dispatchEvent(event) })
    expect(stored('openProfile')).toBe('Ctrl+P')
    expect(event.defaultPrevented).toBe(false)
    expect(hint('openProfile')).toBe('settings.shortcutListening')
  })

  it('ignore une touche sans signe écrit', () => {
    renderShortcuts()
    const button = arm('openProfile')
    press(button, 'MediaPlay')
    expect(stored('openProfile')).toBe('Ctrl+P')
    expect(hint('openProfile')).toBe('settings.shortcutListening')
  })
})

describe('refus opposés à la frappe', () => {
  it('refuse une combinaison déjà tenue et nomme l’action qui la tient', () => {
    renderShortcuts()
    press(arm('openSearch'), 'b', { ctrlKey: true })
    expect(stored('openSearch')).toBe('Ctrl+K')
    expect(hint('openSearch')).toBe('settings.shortcutTaken → settings.shortcutToggleSidebar')
  })

  it('refuse Tab, qui mène le focus dans toute l’interface', () => {
    renderShortcuts()
    const event = press(arm('openSettings'), 'Tab')
    expect(event.defaultPrevented).toBe(true)
    expect(stored('openSettings')).toBe('Ctrl+,')
    expect(hint('openSettings')).toBe('settings.shortcutReserved')
  })

  it('reste à l’écoute après un refus, pour frapper autre chose', () => {
    renderShortcuts()
    const button = arm('openSearch')
    press(button, 'p', { ctrlKey: true })
    expect(hint('openSearch')).toBe('settings.shortcutTaken → settings.shortcutOpenProfile')
    press(button, 'z', { ctrlKey: true })
    expect(stored('openSearch')).toBe('Ctrl+Z')
    expect(hint('openSearch')).toBe('')
  })

  it('sort de la saisie sur Échap seul, sans rien écrire', () => {
    renderShortcuts()
    const button = arm('openSearch')
    press(button, 'Escape')
    expect(stored('openSearch')).toBe('Ctrl+K')
    expect(hint('openSearch')).toBe('')
  })

  it('rend Échap réglable dès qu’il est combiné', () => {
    renderShortcuts()
    press(arm('closeModal'), 'Escape', { ctrlKey: true })
    expect(stored('closeModal')).toBe('Ctrl+Escape')
    expect(valueButton('closeModal')).toHaveTextContent('Ctrl + Escape')
  })
})

describe('éteindre et rétablir un geste', () => {
  it('vider une rangée éteint le geste dans toute l’application', () => {
    renderShortcuts()
    fireEvent.click(within(rowBox('openSearch')).getByLabelText('settings.shortcutClear'))
    expect(stored('openSearch')).toBe('')
    expect(valueButton('openSearch')).toHaveTextContent('settings.shortcutDisabled')
    expect(valueButton('openSearch')).not.toHaveAttribute('aria-keyshortcuts')
    pressAnywhere('k', { ctrlKey: true })
    expect(useUIStore.getState().isSearchOpen).toBe(false)
  })

  it('rend la combinaison d’origine depuis la rangée changée', () => {
    renderShortcuts()
    press(arm('openSearch'), 'j', { ctrlKey: true })
    fireEvent.click(within(rowBox('openSearch')).getByLabelText('settings.shortcutReset'))
    expect(stored('openSearch')).toBe(DEFAULT_KEYBOARD_SHORTCUTS.openSearch)
  })

  it('ne propose aucun bouton de rétablissement tant que rien n’a bougé', () => {
    renderShortcuts()
    expect(screen.queryAllByLabelText('settings.shortcutReset')).toHaveLength(0)
    expect(screen.queryByText('settings.shortcutsResetAll')).not.toBeInTheDocument()
  })

  it('rétablit les quinze gestes d’un seul bouton', () => {
    renderShortcuts()
    press(arm('openSearch'), 'j', { ctrlKey: true })
    press(arm('toggleSidebar'), 'y', { ctrlKey: true })
    const button = screen.getByRole('button', { name: 'settings.shortcutsResetAll' })
    fireEvent.click(button)
    const shortcuts = useUIStore.getState().settings.keyboardShortcuts
    for (const name of SHORTCUT_NAMES) expect(shortcuts[name]).toBe(DEFAULT_KEYBOARD_SHORTCUTS[name])
    expect(screen.queryByText('settings.shortcutsResetAll')).not.toBeInTheDocument()
  })
})

describe('le réglage écrit commande le comportement', () => {
  it('suit la combinaison tapée sur l’écran, sans redémarrer la page', () => {
    renderShortcuts()
    press(arm('openSearch'), 'k', { shiftKey: true, ctrlKey: true })
    expect(stored('openSearch')).toBe('Ctrl+Shift+K')
    pressAnywhere('k', { ctrlKey: true })
    expect(useUIStore.getState().isSearchOpen).toBe(false)
    pressAnywhere('k', { ctrlKey: true, shiftKey: true })
    expect(useUIStore.getState().isSearchOpen).toBe(true)
  })

  it('laisse un geste de composeur vide éteindre l’envoi à l’écran', () => {
    renderShortcuts()
    fireEvent.click(within(rowBox('sendMessage')).getByLabelText('settings.shortcutClear'))
    expect(stored('sendMessage')).toBe('')
    expect(valueButton('sendMessage')).toHaveTextContent('settings.shortcutDisabled')
    // La rangée n'a plus de valeur affichée : plus de bouton « vider » en trop.
    expect(within(rowBox('sendMessage')).queryByLabelText('settings.shortcutClear')).not.toBeInTheDocument()
  })
})

describe('garde de source de l’éditeur de raccourcis', () => {
  const source = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

  it('ne recopie plus les combinaisons dans le magasin', () => {
    const store = source('src/stores/uiStore.ts')
    expect(store).not.toContain("sendMessage: 'Enter'")
    expect(store).toContain('DEFAULT_KEYBOARD_SHORTCUTS')
  })

  it('donne à la page des réglages la section et son composant', () => {
    const page = source('src/features/settings/SettingsPage.tsx')
    expect(page).toContain("id: 'shortcuts'")
    expect(page).toContain('<ShortcutsManager />')
  })
})
