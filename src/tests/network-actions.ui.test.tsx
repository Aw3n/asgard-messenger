/**
 * Panneau Réseau : les deux commandes qui n'annonçaient rien.
 *
 * « Vider le DHT » ne donnait aucun retour, ni en cas de succès ni d'échec, et
 * la bascule suspendre/reprendre avalait son erreur : l'écran restait identique
 * qu'on ait agi ou non. Ces tests font parler les deux commandes.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { SettingsPage } from '@/features/settings/SettingsPage'
import { useUIStore } from '@/stores/uiStore'
import { useNetworkStore } from '@/stores/networkStore'

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
})

const network = () => window.asgard.network as unknown as Record<string, ReturnType<typeof vi.fn>>

function installBridge() {
  Object.assign(window.asgard, {
    firewall: {
      getStatus: vi.fn().mockResolvedValue('configured'),
      configure: vi.fn().mockResolvedValue(undefined),
      runAsAdmin: vi.fn().mockResolvedValue(true),
    },
  })
  Object.assign(window.asgard.network, {
    getPeerScores: vi.fn().mockResolvedValue({}),
    flush: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    updateConfig: vi.fn().mockResolvedValue(undefined),
  })
}

const toasts = () => useUIStore.getState().toasts

beforeEach(() => {
  installBridge()
  useUIStore.setState({ toasts: [] })
  useNetworkStore.setState({ swarmSuspended: false })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useNetworkStore.setState({ swarmSuspended: false })
})

async function openNetwork() {
  render(
    <MemoryRouter initialEntries={['/settings?section=network']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 3, name: 'settings.network' })
}

describe('vider le DHT', () => {
  it('confirme le vidage', async () => {
    await openNetwork()

    fireEvent.click(screen.getByRole('button', { name: 'settings.flushDht' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.dhtFlushed')
      expect(toast?.type).toBe('success')
    })
    expect(network().flush).toHaveBeenCalledTimes(1)
    expect(toasts().some((entry) => entry.title === 'settings.flushFailed')).toBe(false)
  })

  it('dit l’échec au lieu de rester muet', async () => {
    network().flush.mockRejectedValueOnce(new Error('DHT absent'))
    await openNetwork()

    fireEvent.click(screen.getByRole('button', { name: 'settings.flushDht' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.flushFailed')
      expect(toast?.type).toBe('error')
    })
    expect(toasts().some((entry) => entry.title === 'settings.dhtFlushed')).toBe(false)
  })
})

describe('suspendre et reprendre', () => {
  it('une suspension réussie bascule le bouton', async () => {
    await openNetwork()

    fireEvent.click(screen.getByRole('button', { name: 'settings.suspend' }))

    expect(await screen.findByRole('button', { name: 'settings.resume' })).toBeInTheDocument()
    expect(network().suspend).toHaveBeenCalledTimes(1)
    expect(toasts().some((entry) => entry.title === 'settings.swarmToggleFailed')).toBe(false)
  })

  it('une suspension ratée se dit et ne prétend pas être suspendu', async () => {
    network().suspend.mockRejectedValueOnce(new Error('swarm fermé'))
    await openNetwork()

    fireEvent.click(screen.getByRole('button', { name: 'settings.suspend' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.swarmToggleFailed')
      expect(toast?.type).toBe('error')
    })
    expect(useNetworkStore.getState().swarmSuspended).toBe(false)
    expect(screen.getByRole('button', { name: 'settings.suspend' })).toBeInTheDocument()
  })

  it('une reprise ratée laisse le réseau suspendu et le dit', async () => {
    useNetworkStore.setState({ swarmSuspended: true })
    network().resume.mockRejectedValueOnce(new Error('réveil impossible'))
    await openNetwork()

    fireEvent.click(screen.getByRole('button', { name: 'settings.resume' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.swarmToggleFailed')
      expect(toast?.type).toBe('error')
    })
    expect(useNetworkStore.getState().swarmSuspended).toBe(true)
    expect(screen.getByRole('button', { name: 'settings.resume' })).toBeInTheDocument()
  })
})
