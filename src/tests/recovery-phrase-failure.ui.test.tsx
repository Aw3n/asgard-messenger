/**
 * Sécurité : afficher la phrase de récupération ne peut plus échouer en silence.
 *
 * Le bouton appelait `identity.exportSeedPhrase()` et, en cas de rejet, se
 * contentait d'un `console.error` : l'écran restait identique, sans phrase et
 * sans explication, comme si le clic n'avait pas été pris. Ces tests séparent
 * le succès (les 24 mots s'affichent) de l'échec (un toast le dit).
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

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
})

const identity = () => window.asgard.identity as unknown as Record<string, ReturnType<typeof vi.fn>>
const toasts = () => useUIStore.getState().toasts

beforeEach(() => {
  identity().exportSeedPhrase.mockResolvedValue(Array(24).fill('abandon'))
  useUIStore.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function openSecurity() {
  render(
    <MemoryRouter initialEntries={['/settings?section=security']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 3, name: 'settings.security' })
}

describe('phrase de récupération', () => {
  it('affiche les vingt-quatre mots quand l’export réussit', async () => {
    await openSecurity()

    fireEvent.click(screen.getByRole('button', { name: 'settings.showRecoveryPhrase' }))

    await waitFor(() => expect(screen.getAllByText('abandon')).toHaveLength(24))
    expect(screen.queryByRole('button', { name: 'settings.showRecoveryPhrase' })).toBeNull()
    expect(toasts().some((entry) => entry.title === 'settings.recoveryPhraseFailed')).toBe(false)
  })

  it('dit l’échec au lieu de laisser le bouton sans effet', async () => {
    identity().exportSeedPhrase.mockRejectedValueOnce(new Error('fichier illisible'))
    await openSecurity()

    fireEvent.click(screen.getByRole('button', { name: 'settings.showRecoveryPhrase' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.recoveryPhraseFailed')
      expect(toast?.type).toBe('error')
    })
    expect(screen.getByRole('button', { name: 'settings.showRecoveryPhrase' })).toBeInTheDocument()
  })
})
