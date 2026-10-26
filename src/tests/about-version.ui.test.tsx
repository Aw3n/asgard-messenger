/**
 * La section À propos ne doit pas inventer de version.
 *
 * Elle partait d'un « 1.0.1 » codé en dur : quand le pont ne répondait pas,
 * l'écran affirmait une version qui deviendrait fausse à la release suivante.
 * Tant que la vraie valeur n'est pas connue, il doit dire qu'il l'ignore.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  // L'interpolation doit être lisible : c'est la valeur affichée qu'on vérifie.
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}))

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
})

const beforeStorage = useUIStore.getState().settings.storage

async function openAbout() {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  )
  fireEvent.click(screen.getByRole('button', { name: 'settings.aboutApp' }))
  await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: 'settings.aboutApp' })).toBeInTheDocument())
}

const versionLine = () => screen.getByText(/^settings\.appVersion /)

beforeEach(() => {
  Object.assign(window.asgard.app, { getVersion: vi.fn().mockResolvedValue('2.3.4') })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useUIStore.setState({ toasts: [] })
  useUIStore.getState().updateSettings({ storage: beforeStorage })
})

describe('version affichée', () => {
  it('affiche la version rendue par le pont', async () => {
    await openAbout()

    await waitFor(() => expect(versionLine().textContent).toBe('settings.appVersion {"version":"2.3.4"}'))
  })

  it('dit « inconnu » quand le pont échoue, sans retomber sur 1.0.1', async () => {
    Object.assign(window.asgard.app, { getVersion: vi.fn().mockRejectedValue(new Error('pont fermé')) })
    await openAbout()

    await waitFor(() => expect(versionLine().textContent).toBe('settings.appVersion {"version":"common.unknown"}'))
    expect(versionLine().textContent).not.toContain('1.0.1')
  })

  it('dit « inconnu » quand le pont répond une chaîne vide', async () => {
    Object.assign(window.asgard.app, { getVersion: vi.fn().mockResolvedValue('') })
    await openAbout()

    await waitFor(() => expect(versionLine().textContent).toBe('settings.appVersion {"version":"common.unknown"}'))
  })
})
