/**
 * Les gestes clavier globaux obéissent-ils au réglage ?
 *
 * `settings.keyboardShortcuts` écrivait quinze combinaisons dans le store et la
 * persistance ; seule l'une d'elles vivait, recopiée en dur dans `App.tsx`.
 * Changer le réglage ne changeait donc rien, et `Ctrl+B`, `Ctrl+,`, `Ctrl+P`,
 * `Ctrl+Flèche`, `Ctrl+I` ne faisaient rien du tout. Ces tests jouent les
 * frappes sur le hook réel et exigent le déplacement observable — y compris
 * après un re-réglage sans démontage, et jusqu'au silence quand la
 * combinaison est vide.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import {
  COMPOSER_INPUT_ID,
  WIRED_SHORTCUTS,
  type ShortcutName,
  type WiredShortcut,
} from '@/utils/shortcuts'
import { useAppShortcuts } from '@/hooks/useAppShortcuts'
import { useUIStore } from '@/stores/uiStore'
import { useConversationStore } from '@/stores/conversationStore'
import type { Conversation } from '@/types'

function Shell() {
  useAppShortcuts()
  const location = useLocation()
  return <div data-testid="route">{`${location.pathname}${location.search}`}</div>
}

function renderShell(initial = '/conversations/conv-a') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="*" element={<Shell />} />
      </Routes>
    </MemoryRouter>,
  )
}

const route = () => screen.getByTestId('route').textContent

const conv = (id: string, updatedAt: number, type: Conversation['type'] = 'direct'): Conversation => ({
  id,
  type,
  unreadCount: 0,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt,
  ...(type === 'group' ? { groupId: id } : { participantId: id.replace('conv-', 'p') }),
})

/** Trois fils directs, du plus récent au plus ancien, plus un groupe hors liste. */
const seed = () => {
  useConversationStore.setState({
    conversations: {
      'conv-a': conv('conv-a', 30),
      'conv-b': conv('conv-b', 20),
      'conv-c': conv('conv-c', 10),
      'groupe-1': conv('groupe-1', 40, 'group'),
    },
    activeConversationId: 'conv-a',
    drafts: {},
    filter: {},
  })
}

const setShortcut = (name: ShortcutName, combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, [name]: combo } })
}

const baselineShortcuts = { ...useUIStore.getState().settings.keyboardShortcuts }

const press = (key: string, modifiers: Record<string, boolean> = {}) => {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...modifiers })
  act(() => { window.dispatchEvent(event) })
}

beforeEach(() => {
  seed()
  useUIStore.setState({ sidebarCollapsed: false, isSearchOpen: false })
  setShortcut('openSearch', 'Ctrl+K')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...baselineShortcuts } })
})

describe('gestes globaux réglés', () => {
  it('ouvre la recherche sur la combinaison du réglage', () => {
    renderShell()
    press('k', { ctrlKey: true })
    expect(useUIStore.getState().isSearchOpen).toBe(true)
  })

  it('suit un re-réglage sans démonter l’écouteur', () => {
    renderShell()
    setShortcut('openSearch', 'Ctrl+Shift+U')
    press('k', { ctrlKey: true })
    expect(useUIStore.getState().isSearchOpen).toBe(false)
    press('U', { ctrlKey: true, shiftKey: true })
    expect(useUIStore.getState().isSearchOpen).toBe(true)
  })

  it('éteint l’action quand la combinaison est vide', () => {
    renderShell()
    setShortcut('openSearch', '')
    press('k', { ctrlKey: true })
    expect(useUIStore.getState().isSearchOpen).toBe(false)
  })

  it('ne laisse pas un modificateur en trop déclencher le geste', () => {
    renderShell()
    press('k', { ctrlKey: true, shiftKey: true })
    expect(useUIStore.getState().isSearchOpen).toBe(false)
  })

  it('escamote le panneau de liste et le rend', () => {
    renderShell()
    press('b', { ctrlKey: true })
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    press('b', { ctrlKey: true })
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })

  it('passe au fil suivant, dans l’ordre de la liste visible', () => {
    renderShell()
    press('ArrowDown', { ctrlKey: true })
    expect(route()).toBe('/conversations/conv-b')
    expect(useConversationStore.getState().activeConversationId).toBe('conv-b')
  })

  it('revient au fil précédent', () => {
    renderShell('/conversations/conv-c')
    press('ArrowUp', { ctrlKey: true })
    expect(route()).toBe('/conversations/conv-b')
  })

  it('fait faire le tour de la liste', () => {
    renderShell('/conversations/conv-c')
    press('ArrowDown', { ctrlKey: true })
    expect(route()).toBe('/conversations/conv-a')
    press('ArrowUp', { ctrlKey: true })
    expect(route()).toBe('/conversations/conv-c')
  })

  it('ignore les groupes, que la liste Messages ne montre pas', () => {
    renderShell('/conversations/conv-a')
    // Sans filtre, le groupe — le plus récent — se placerait en tête de liste
    // et le tour de la liste marcherait sur une entrée que la page ne rend pas.
    press('ArrowUp', { ctrlKey: true })
    expect(route()).toBe('/conversations/conv-c')
    expect(route()).not.toContain('groupe')
  })

  it('ouvre les réglages depuis n’importe quelle page', () => {
    renderShell('/conversations/conv-a')
    press(',', { ctrlKey: true })
    expect(route()).toBe('/settings')
  })

  it('garde la section des réglages où l’on se trouve', () => {
    renderShell('/settings?section=storage')
    press(',', { ctrlKey: true })
    expect(route()).toBe('/settings?section=storage')
  })

  it('va à la section profil même en étant déjà dans les réglages', () => {
    renderShell('/settings?section=storage')
    press('p', { ctrlKey: true })
    expect(route()).toBe('/settings?section=profile')
  })

  it('pose le curseur dans le composeur', () => {
    render(
      <MemoryRouter>
        <Shell />
        <textarea id={COMPOSER_INPUT_ID} data-testid="composeur" />
      </MemoryRouter>,
    )
    press('i', { ctrlKey: true })
    expect(document.activeElement).toBe(screen.getByTestId('composeur'))
  })

  it('laisse une composition IME en cours tranquille', () => {
    renderShell()
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true })
    Object.defineProperty(event, 'isComposing', { value: true })
    act(() => { window.dispatchEvent(event) })
    expect(useUIStore.getState().isSearchOpen).toBe(false)
  })
})

describe('garde de source des raccourcis', () => {
  const source = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

  it('ne laisse plus App.tsx comparer une touche en dur', () => {
    const app = source('src/App.tsx')
    expect(app).toContain('useAppShortcuts()')
    expect(app).not.toMatch(/e\.key === 'k'/)
  })

  it('ne laisse aucun panneau de dialogue coder Échap en dur', () => {
    for (const file of [
      'src/hooks/useDialogBehavior.ts',
      'src/components/modals/ModalContainer.tsx',
      'src/components/search/SearchModal.tsx',
    ]) {
      const text = source(file)
      expect(text).toContain('isCloseKeypress')
      expect(text).not.toMatch(/=== 'Escape'/)
    }
  })

  it('donne au geste de rail un lecteur à l’écran', () => {
    expect(source('src/features/chat/ConversationsPage.tsx')).toMatch(/sidebarCollapsed/)
  })

  it('donne au composeur l’identifiant visé par focusInput', () => {
    expect(source('src/features/chat/components/MessageInput.tsx')).toMatch(/id=\{COMPOSER_INPUT_ID\}/)
  })

  it('borne les actions branchées à des combinaisons du réglage', () => {
    const declared = Object.keys(baselineShortcuts)
    for (const name of WIRED_SHORTCUTS as readonly WiredShortcut[]) {
      expect(declared).toContain(name)
      expect(typeof baselineShortcuts[name as ShortcutName]).toBe('string')
    }
  })
})
