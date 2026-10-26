/**
 * L'attente à l'écran.
 *
 * Deux choses se tenaient pour dites sans l'être : le bouton « Attente »
 * peignait son propre état (reprendre ne rendait ni le micro ni la caméra, et
 * un remontage effaçait tout), et le pair posé de l'autre côté restait sans
 * visage — une image figée, rien de plus. Ici, l'infobulle suit le store et le
 * nom de celui qui attend s'affiche dans la vue d'appel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CallControls } from '@/features/calls/components/CallControls'
import { CallView } from '@/features/calls/components/CallView'
import { callService } from '@/services/CallService'
import { useCallStore } from '@/stores/callStore'
import { useContactStore } from '@/stores/contactStore'
import { useIdentityStore } from '@/stores/identityStore'
import type { CallRecord } from '@/stores/callStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    // L'attente se nomme : le test doit voir le nom interpolé, pas la clé.
    t: (key: string, opts?: { name?: string }) => (opts?.name ? `${key}:${opts.name}` : key),
  }),
}))

const ME = 'a'.repeat(64)
const BOB = 'b'.repeat(64)
const CAROL = 'c'.repeat(64)

function call(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id: 'call-1',
    peerId: BOB,
    peerName: 'Bob',
    type: 'audio',
    status: 'connected',
    direction: 'outgoing',
    startedAt: 1_700_000_000_000,
    connectedAt: 1_700_000_000_000,
    missed: false,
    ...overrides,
  }
}

vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
})

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'f'.repeat(128) },
      profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useContactStore.setState({ contacts: {} })
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
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('bouton d’attente de la barre d’appel', () => {
  it('confie son état au service et non à un state local', () => {
    const spy = vi.spyOn(callService, 'toggleHold')
    render(<CallControls />)

    fireEvent.click(screen.getByRole('button', { name: 'calls.holdCall' }))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(useCallStore.getState().isOnHold).toBe(true)
  })

  it('change de nom accessible quand l’appel est posé', () => {
    render(<CallControls />)

    fireEvent.click(screen.getByRole('button', { name: 'calls.holdCall' }))

    expect(screen.getByRole('button', { name: 'calls.resumeCall' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'calls.holdCall' })).not.toBeInTheDocument()
  })

  it('retrouve l’attente après un remontage', () => {
    render(<CallControls />)
    fireEvent.click(screen.getByRole('button', { name: 'calls.holdCall' }))
    cleanup()

    render(<CallControls />)

    expect(screen.getByRole('button', { name: 'calls.resumeCall' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'calls.resumeCall' }))
    expect(useCallStore.getState().isOnHold).toBe(false)
  })
})

describe('indicateur d’attente de la vue d’appel', () => {
  const view = () => render(
    <MemoryRouter>
      <CallView />
    </MemoryRouter>,
  )

  it('dit que c’est nous qui tenons l’appel', () => {
    useCallStore.getState().setOnHold(true)

    view()

    expect(screen.getAllByText('calls.youOnHold').length).toBeGreaterThan(0)
  })

  it('nomme le pair qui s’est mis en attente', () => {
    useCallStore.getState().setPeerHolding(BOB, true)

    view()

    expect(screen.getAllByText('calls.peerOnHold:Bob').length).toBeGreaterThan(0)
  })

  it('sans attente d’aucun côté, n’affiche rien', () => {
    view()

    expect(screen.queryByText('calls.youOnHold')).not.toBeInTheDocument()
    expect(screen.queryByText('calls.peerOnHold:Bob')).not.toBeInTheDocument()
  })

  it('désigne chaque participant en attente dans un appel de groupe', () => {
    useContactStore.setState({
      contacts: {
        [BOB]: { publicKey: BOB, displayName: 'Bob', createdAt: 0, updatedAt: 0 },
        [CAROL]: { publicKey: CAROL, displayName: 'Carol', createdAt: 0, updatedAt: 0 },
      } as never,
    })
    useCallStore.setState({
      activeCall: call({
        peerId: 'g1', isGroupCall: true, groupId: 'g1', groupName: 'Équipe',
        participants: [ME, BOB, CAROL],
      }),
    })
    useCallStore.getState().setPeerHolding(BOB, true)
    useCallStore.getState().setPeerHolding(CAROL, true)

    view()

    expect(screen.getAllByText('calls.peerOnHold:Bob').length).toBeGreaterThan(0)
    expect(screen.getAllByText('calls.peerOnHold:Carol').length).toBeGreaterThan(0)
  })
})
