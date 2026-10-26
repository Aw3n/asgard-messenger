/**
 * Pare-feu : une lecture en panne ne se fait plus passer pour un état mesuré.
 *
 * `getStatus()` échouait (netsh indisponible, droits, etc.) et l'écran
 * affichait « Connexions P2P bloquées — configuration requise » : une panne de
 * mesure devenait une affirmation sur le réseau. La carte dit maintenant
 * qu'elle ne sait pas, et offre de revérifier.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { SettingsPage } from '@/features/settings/SettingsPage'

const getStatus = vi.fn()

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
})

beforeEach(() => {
  getStatus.mockReset()
  Object.assign(window.asgard, {
    firewall: {
      getStatus,
      configure: vi.fn().mockResolvedValue(true),
      runAsAdmin: vi.fn().mockResolvedValue(true),
    },
  })
  Object.assign(window.asgard.network, {
    updateConfig: vi.fn().mockResolvedValue(undefined),
    getPeerScores: vi.fn().mockResolvedValue({}),
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

describe('statut du pare-feu', () => {
  it('dit l’incertitude au lieu d’affirmer que tout est bloqué', async () => {
    getStatus.mockRejectedValueOnce(new Error('netsh indisponible'))
    await openNetwork()

    expect(await screen.findByText('settings.firewallUnavailable')).toBeInTheDocument()
    expect(screen.queryByText('settings.firewallNotConfigured')).not.toBeInTheDocument()
  })

  it('revérifie et affiche le vrai état quand la lecture repasse', async () => {
    getStatus.mockRejectedValueOnce(new Error('netsh indisponible'))
    await openNetwork()
    await screen.findByText('settings.firewallUnavailable')

    getStatus.mockResolvedValueOnce('configured')
    fireEvent.click(screen.getByRole('button', { name: 'settings.firewallRecheck' }))

    await waitFor(() => expect(screen.getByText('settings.firewallConfigured')).toBeInTheDocument())
    expect(screen.queryByText('settings.firewallUnavailable')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'settings.firewallRecheck' })).not.toBeInTheDocument()
  })
})
