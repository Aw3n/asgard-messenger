/**
 * Langue : un catalogue qui n'arrive pas ne dit pas « Langue modifiée ».
 *
 * `changeLanguage` avalait l'échec de chargement et se résolvait quand même ;
 * l'écran affichait un succès alors que la langue et la pastille n'avaient pas
 * bougé. Le verdict remonte maintenant à l'écran.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const changeLanguageMock = vi.fn()

vi.mock('@/i18n/config', () => ({
  __esModule: true,
  default: { language: 'fr' },
  i18nReady: Promise.resolve(),
  SUPPORTED_LANGUAGES: [
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
  ],
  changeLanguage: (...args: unknown[]) => changeLanguageMock(...args),
  getCurrentLanguage: () => 'fr',
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

const toasts = () => useUIStore.getState().toasts

async function openLanguage() {
  render(
    <MemoryRouter initialEntries={['/settings?section=language']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 3, name: 'settings.language' })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useUIStore.setState({ toasts: [] })
})

describe('changer de langue', () => {
  it('annonce le succès quand la langue a été appliquée', async () => {
    changeLanguageMock.mockResolvedValueOnce(true)
    await openLanguage()

    fireEvent.click(screen.getByRole('button', { name: /Deutsch/ }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.languageChanged')
      expect(toast?.type).toBe('success')
    })
    expect(toasts().some((entry) => entry.title === 'settings.languageChangeFailed')).toBe(false)
  })

  it('dit l’échec sans annoncer de changement', async () => {
    changeLanguageMock.mockResolvedValueOnce(false)
    await openLanguage()

    fireEvent.click(screen.getByRole('button', { name: /Deutsch/ }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.languageChangeFailed')
      expect(toast?.type).toBe('error')
    })
    expect(toasts().some((entry) => entry.title === 'settings.languageChanged')).toBe(false)
  })
})
