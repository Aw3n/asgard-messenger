/**
 * Plein écran vidéo d'un pair.
 *
 * Le bouton de sortie annonçait « · Esc » quoi qu'il arrive et l'écouteur ne
 * comparait qu'à « Escape » : changer la touche de fermeture laissait l'écran
 * plein sans issue au clavier. La tuile qui l'ouvre portait role=button sans
 * être focusable ni activable, et l'ouverture démonte cette tuile : le focus
 * tombait sur <body>. Ici, la touche réglée, les deux gestes d'ouverture et le
 * trajet du focus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CallView } from '@/features/calls/components/CallView'
import { useCallStore, type CallRecord } from '@/stores/callStore'
import { useContactStore } from '@/stores/contactStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { DEFAULT_KEYBOARD_SHORTCUTS } from '@/utils/shortcuts'
import type { Contact } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    // La tuile doit nommer le pair ; l'interpolation fait donc partie du contrat.
    t: (key: string, opts?: { name?: string }) => (opts?.name ? `${key}:${opts.name}` : key),
  }),
}))

const ME = 'a'.repeat(64)
const BOB = 'b'.repeat(64)
const CAROL = 'c'.repeat(64)

vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
})

const contact = (name: string, publicKey: string): Contact => ({
  publicKey,
  displayName: name,
  status: 'online',
  relation: 'contact',
  verified: true,
  addedAt: 1,
})

const call = (overrides: Partial<CallRecord> = {}): CallRecord => ({
  id: 'call-1',
  peerId: 'g1',
  peerName: 'Équipe',
  type: 'video',
  status: 'connected',
  direction: 'outgoing',
  startedAt: 1_700_000_000_000,
  connectedAt: 1_700_000_000_000,
  missed: false,
  isGroupCall: true,
  groupId: 'g1',
  groupName: 'Équipe',
  participants: [ME, BOB, CAROL],
  ...overrides,
})

const view = () => render(
  <MemoryRouter>
    <CallView />
  </MemoryRouter>,
)

const tile = (name: string): HTMLElement =>
  screen.getByRole('button', { name: `calls.expandPeerVideo:${name}` })

const exitButton = (): HTMLElement =>
  screen.getByRole('button', { name: 'calls.exitVideoFullscreen' })

const openWith = (key: string): HTMLElement => {
  const trigger = tile('Bob')
  trigger.focus()
  fireEvent.keyDown(trigger, { key })
  return trigger
}

const isFullscreen = (): string | null => useCallStore.getState().peerVideoFullscreenId

const bindCloseKey = (combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  act(() => {
    useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, closeModal: combo } })
  })
}

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'f'.repeat(128) },
      profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useContactStore.setState({
    contacts: { [BOB]: contact('Bob', BOB), [CAROL]: contact('Carol', CAROL) },
  })
  useCallStore.setState({
    activeCall: call(),
    incomingCall: null,
    history: [],
    isMuted: false,
    isCameraOff: false,
    isScreenSharing: false,
    isOnHold: false,
    holdingPeers: [],
    callChatMessages: [],
    callReactions: [],
    showCallChat: false,
    isCallMinimized: false,
    peerVideoFullscreenId: null,
  })
  bindCloseKey(DEFAULT_KEYBOARD_SHORTCUTS.closeModal)
})

afterEach(() => {
  cleanup()
  bindCloseKey(DEFAULT_KEYBOARD_SHORTCUTS.closeModal)
  useCallStore.setState({ peerVideoFullscreenId: null })
})

describe('plein écran vidéo au clavier', () => {
  it('nomme chaque tuile de la grille et la rend focusable', () => {
    view()

    expect(tile('Bob')).toHaveAttribute('tabindex', '0')
    expect(tile('Carol')).toHaveAttribute('tabindex', '0')
    expect(tile('Bob')).toHaveAttribute('aria-label', 'calls.expandPeerVideo:Bob')
  })

  it('ouvre avec Entrée et pose le focus sur le bouton de sortie', async () => {
    view()

    openWith('Enter')

    expect(isFullscreen()).toBe(BOB)
    await waitFor(() => expect(document.activeElement).toBe(exitButton()))
  })

  it('ouvre aussi avec la barre d’espace', () => {
    view()

    openWith(' ')

    expect(isFullscreen()).toBe(BOB)
  })

  it('la touche de fermeture réglée referme et rend le focus à la tuile', async () => {
    view()
    openWith('Enter')

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(isFullscreen()).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(tile('Bob')))
    expect(screen.queryByRole('button', { name: 'calls.exitVideoFullscreen' })).toBeNull()
  })

  it('suit un changement de touche : Échap devient inerte, la combinaison agit', async () => {
    bindCloseKey('Ctrl+Shift+X')
    view()
    openWith('Enter')

    // Le bouton annonce la combinaison réelle, pas « Esc » figé.
    expect(exitButton().getAttribute('title')).toBe('calls.exitVideoFullscreen — Ctrl + Shift + X')
    expect(exitButton()).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+X')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(isFullscreen()).toBe(BOB)

    fireEvent.keyDown(window, { key: 'X', ctrlKey: true, shiftKey: true })
    expect(isFullscreen()).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(tile('Bob')))
  })

  it('sans geste réglé, n’annonce rien et ne s’en invente pas un', () => {
    bindCloseKey('')
    view()
    openWith('Enter')

    expect(exitButton().getAttribute('title')).toBe('calls.exitVideoFullscreen')
    expect(exitButton()).not.toHaveAttribute('aria-keyshortcuts')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(isFullscreen()).toBe(BOB)
  })

  it('n’expose plus la tuile agrandie comme une seconde commande', () => {
    view()
    openWith('Enter')

    // Le bouton nommé reste le chemin clavier ; le survol de la surface plein
    // écran continue de sortir au clic, comme avant.
    expect(screen.queryByRole('button', { name: 'calls.expandPeerVideo:Bob' })).toBeNull()
    const overlay = exitButton().parentElement as HTMLElement
    expect(within(overlay).getAllByRole('button')).toEqual([exitButton()])
    expect(tile('Carol')).toBeInTheDocument()
  })

  it('le bouton de sortie clique et rend le focus à la tuile', async () => {
    view()
    openWith('Enter')

    fireEvent.click(exitButton())

    expect(isFullscreen()).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(tile('Bob')))
  })
})
