/**
 * Les deux gestes de la fenêtre d'appel entrant.
 *
 * `IncomingCallOverlay` écrivait « Ctrl+Shift+A » et « Ctrl+Shift+D » en dur,
 * dans son écouteur comme sur ses deux infobulles : la touche promise à l'écran
 * ne pouvait être ni changée ni éteinte. Répondre et refuser sont depuis deux
 * combinaisons réglées de plus : la frappe est confrontée au magasin au moment
 * où elle part, l'écran « Raccourcis » les montre, et les boutons disent la
 * touche d'aujourd'hui.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IncomingCallOverlay } from '@/components/overlays/IncomingCallOverlay'
import { callService } from '@/services/CallService'
import { useCallStore, type CallRecord } from '@/stores/callStore'
import { useUIStore } from '@/stores/uiStore'
import { DEFAULT_KEYBOARD_SHORTCUTS } from '@/utils/shortcuts'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
})

const answer = () => screen.getByRole('button', { name: 'calls.answer' })
const decline = () => screen.getByRole('button', { name: 'calls.decline' })

/** Une frappe qui part de la page : la sonnerie tient l'écran entier, aucun champ n'est sous le curseur. */
const press = (key: string, modifiers: Record<string, unknown> = {}) =>
  fireEvent.keyDown(window, { key, cancelable: true, bubbles: true, ...modifiers })

const bind = (name: 'acceptCall' | 'declineCall', combo: string) =>
  act(() => {
    const current = useUIStore.getState().settings.keyboardShortcuts
    useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, [name]: combo } })
  })

const ring = (overrides: Partial<CallRecord> = {}): CallRecord => ({
  id: 'call-in-1',
  peerId: 'b'.repeat(64),
  peerName: 'Bob',
  type: 'audio',
  status: 'incoming',
  direction: 'incoming',
  startedAt: 1_700_000_000_000,
  missed: false,
  ...overrides,
})

const comboBaseline = { ...useUIStore.getState().settings.keyboardShortcuts }

let accepted: MockInstance<typeof callService.acceptCall>
let rejected: MockInstance<typeof callService.rejectCall>

beforeEach(() => {
  accepted = vi.spyOn(callService, 'acceptCall').mockResolvedValue(undefined)
  rejected = vi.spyOn(callService, 'rejectCall').mockResolvedValue(undefined)
  bind('acceptCall', DEFAULT_KEYBOARD_SHORTCUTS.acceptCall)
  bind('declineCall', DEFAULT_KEYBOARD_SHORTCUTS.declineCall)
  act(() => {
    useCallStore.setState({ incomingCall: ring() })
  })
  render(<IncomingCallOverlay />)
})

afterEach(() => {
  cleanup()
  act(() => {
    useUIStore.getState().updateSettings({ keyboardShortcuts: { ...comboBaseline } })
    useCallStore.setState({ incomingCall: null })
  })
  vi.restoreAllMocks()
})

describe('annonce des gestes de réponse', () => {
  it('dit la combinaison réglée sur chaque bouton', () => {
    expect(answer()).toHaveAttribute('title', 'calls.answer — Ctrl + Shift + A')
    expect(answer()).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+A')
    expect(decline()).toHaveAttribute('title', 'calls.decline — Ctrl + Shift + D')
    expect(decline()).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+D')
  })

  it('suit la combinaison changée pendant que le téléphone sonne', () => {
    bind('acceptCall', 'Ctrl+Shift+J')
    expect(answer()).toHaveAttribute('title', 'calls.answer — Ctrl + Shift + J')
    expect(answer()).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+J')
  })

  it('ne promet aucune touche à un geste effacé', () => {
    bind('acceptCall', '')
    expect(answer()).toHaveAttribute('title', 'calls.answer')
    expect(answer()).not.toHaveAttribute('aria-keyshortcuts')
    // Les deux gestes restent indépendants : vider l'un n'éteint pas l'autre.
    expect(decline()).toHaveAttribute('title', 'calls.decline — Ctrl + Shift + D')
  })
})

describe('frappes reconnues', () => {
  it('répond à la combinaison du lancement et refuse à la sienne', () => {
    press('a', { ctrlKey: true, shiftKey: true })
    expect(accepted).toHaveBeenCalledTimes(1)
    expect(rejected).not.toHaveBeenCalled()

    press('d', { ctrlKey: true, shiftKey: true })
    expect(rejected).toHaveBeenCalledTimes(1)
  })

  it('écoute la combinaison réglée, pas sa copie du lancement', () => {
    bind('acceptCall', 'Ctrl+Shift+J')
    press('a', { ctrlKey: true, shiftKey: true })
    expect(accepted).not.toHaveBeenCalled()
    press('j', { ctrlKey: true, shiftKey: true })
    expect(accepted).toHaveBeenCalledTimes(1)
  })

  it("ne déclenche rien sur une frappe qui n'est pas le combo exact", () => {
    // Une touche de plus : « Ctrl+Maj+Alt+A » n'est pas « Ctrl+Maj+A ».
    press('a', { ctrlKey: true, shiftKey: true, altKey: true })
    expect(accepted).not.toHaveBeenCalled()
    // La même lettre sans les deux touches : un geste réglé n'est pas une
    // lettre tenue n'importe comment.
    press('a', { ctrlKey: true })
    expect(accepted).not.toHaveBeenCalled()
  })

  it('laisse la touche Cmd tenir le rôle de Ctrl', () => {
    // Le magasin écrit « Ctrl » ; sous macOS c'est Cmd la touche primaire, et
    // `comboMatches` le sait pour tous les gestes réglés.
    press('a', { metaKey: true, shiftKey: true })
    expect(accepted).toHaveBeenCalledTimes(1)
  })

  it('laisse une composition IME en cours tranquille', () => {
    press('a', { ctrlKey: true, shiftKey: true, isComposing: true })
    press('d', { ctrlKey: true, shiftKey: true, keyCode: 229 })
    expect(accepted).not.toHaveBeenCalled()
    expect(rejected).not.toHaveBeenCalled()
  })

  it('éteint le geste dont la combinaison est vide, sans éteindre le bouton', () => {
    bind('acceptCall', '')
    press('a', { ctrlKey: true, shiftKey: true })
    expect(accepted).not.toHaveBeenCalled()
    fireEvent.click(answer())
    expect(accepted).toHaveBeenCalledTimes(1)
  })

  it('reste muette quand rien ne sonne', () => {
    cleanup()
    act(() => {
      useCallStore.setState({ incomingCall: null })
    })
    render(<IncomingCallOverlay />)
    press('a', { ctrlKey: true, shiftKey: true })
    press('d', { ctrlKey: true, shiftKey: true })
    expect(accepted).not.toHaveBeenCalled()
    expect(rejected).not.toHaveBeenCalled()
  })
})

describe('garde de source de la fenêtre d’appel entrant', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/overlays/IncomingCallOverlay.tsx'), 'utf8')

  it('lit les deux gestes au lieu de les recopier', () => {
    expect(source).toContain('comboMatches')
    expect(source).toContain("useGestureHint('acceptCall'")
    expect(source).not.toMatch(/title="Ctrl/)
    expect(source).not.toMatch(/key === 'a'/)
  })
})
