/**
 * Réglages réseau : le commutateur « relais » ne commandait rien.
 *
 * `network.updateConfig` recevait bien `relayEnabled`, mais le service principal
 * se contentait de l'écrire dans la console : aucun `relayThrough` n'était
 * configuré, et le projet ne connaît aucun nœud relais. La bascule promettait
 * donc un chemin de connexion qui n'existait pas. Elle est retirée ; le plafond
 * de pairs, lui, continue de décider au démarrage comme à chaud.
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

const updateConfig = vi.fn().mockResolvedValue(undefined)

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
})

beforeEach(() => {
  updateConfig.mockClear()
  // La section réseau interroge le pare-feu et les scores de pairs au montage :
  // sans ces deux ponts, l'effet lèverait avant même le premier rendu utile.
  Object.assign(window.asgard, {
    firewall: {
      getStatus: vi.fn().mockResolvedValue('not-configured'),
      configure: vi.fn().mockResolvedValue(true),
      runAsAdmin: vi.fn().mockResolvedValue(true),
    },
  })
  Object.assign(window.asgard.network, {
    updateConfig,
    getPeerScores: vi.fn().mockResolvedValue({}),
  })
  useUIStore.setState({
    settings: { ...useUIStore.getState().settings, network: { maxPeers: 64 } },
  })
})

afterEach(() => {
  cleanup()
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

describe('réglages réseau', () => {
  it('n’offre plus de commutateur de relais qui ne commandait rien', async () => {
    await openNetwork()

    expect(screen.queryByRole('switch', { name: 'settings.enableRelay' })).not.toBeInTheDocument()
    // Le plafond de pairs, lui, reste réglable et nommé.
    expect(screen.getByLabelText('settings.maxPeers')).toBeInTheDocument()
  })

  it('applique le plafond de pairs au swarm et le retient', async () => {
    await openNetwork()

    fireEvent.change(screen.getByLabelText('settings.maxPeers'), { target: { value: '48' } })

    await waitFor(() => expect(updateConfig).toHaveBeenCalledWith({ maxPeers: 48 }))
    expect(useUIStore.getState().settings.network.maxPeers).toBe(48)
  })
})
