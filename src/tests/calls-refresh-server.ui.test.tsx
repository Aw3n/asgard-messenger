/**
 * Appels : « Actualiser la connexion au serveur » disait toujours la même chose.
 *
 * `NetworkService.refreshServer()` ne lève pas : il rend `false` quand le
 * serveur n'est pas joignable. La page ignorait ce verdict et journalisait
 * « Server refreshed » dans tous les cas — un bouton qui ne peut pas échouer
 * à l'écran. Ces tests séparent les trois issues : true, false, exception.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

vi.mock('@/services/CallService', () => ({
  callService: { startCall: vi.fn(), startGroupCall: vi.fn() },
}))

import { CallsPage } from '@/features/calls/CallsPage'
import { useCallStore } from '@/stores/callStore'
import { useContactStore } from '@/stores/contactStore'
import { useUIStore } from '@/stores/uiStore'

const network = () => window.asgard.network as unknown as Record<string, ReturnType<typeof vi.fn>>
const toasts = () => useUIStore.getState().toasts

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
  Object.assign(window.asgard.network, {
    getConnectingCount: vi.fn().mockResolvedValue(0),
    getConnectedPeersInfo: vi.fn().mockResolvedValue(new Map()),
    getServerAddress: vi.fn().mockResolvedValue({ host: '127.0.0.1', port: 4001, publicKey: 'ab' }),
    onPeerBanned: vi.fn().mockReturnValue(() => {}),
    refreshServer: vi.fn().mockResolvedValue(true),
  })
  Object.assign(window.asgard.storage, {
    onGroupActive: vi.fn(),
    onGroupActiveEvent: vi.fn().mockReturnValue(() => {}),
  })
  useCallStore.setState({ history: [] })
  useContactStore.setState({ contacts: {} })
  useUIStore.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const openPage = async () => {
  render(<CallsPage />)
  // La pastille du serveur n'apparaît qu'une fois l'adresse reçue.
  return screen.findByRole('button', { name: 'calls.refreshServer' })
}

describe('bandeau des groupes actifs', () => {
  it('nomme le compte dans la langue au lieu d’un mot anglais', () => {
    let emit: ((topic: string) => void) | null = null
    Object.assign(window.asgard.storage, {
      onGroupActiveEvent: vi.fn((callback: (topic: string) => void) => {
        emit = callback
        return () => {}
      }),
    })

    render(<CallsPage />)
    act(() => emit?.('topic-1'))

    expect(screen.getByText('calls.activeGroupTopics:{"total":1}')).toBeInTheDocument()
    expect(screen.queryByText(/active group/)).toBeNull()
  })
})

describe('actualiser la connexion au serveur', () => {
  it('nomme le champ de recherche des appels', async () => {
    await openPage()

    expect(screen.getByLabelText('search.placeholder')).toHaveAttribute('placeholder', 'search.placeholder')
  })

  it('confirme quand le serveur a vraiment été actualisé', async () => {
    const button = await openPage()

    fireEvent.click(button)

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'calls.serverRefreshed')
      expect(toast?.type).toBe('success')
    })
    expect(network().refreshServer).toHaveBeenCalledTimes(1)
    expect(toasts().some((entry) => entry.title === 'calls.refreshServerFailed')).toBe(false)
  })

  it('dit l’échec quand le service rend false', async () => {
    network().refreshServer.mockResolvedValueOnce(false)
    const button = await openPage()

    fireEvent.click(button)

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'calls.refreshServerFailed')
      expect(toast?.type).toBe('error')
    })
    expect(toasts().some((entry) => entry.title === 'calls.serverRefreshed')).toBe(false)
  })

  it('dit l’échec quand l’appel lève', async () => {
    network().refreshServer.mockRejectedValueOnce(new Error('IPC fermé'))
    const button = await openPage()

    fireEvent.click(button)

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'calls.refreshServerFailed')
      expect(toast?.type).toBe('error')
    })
  })
})
