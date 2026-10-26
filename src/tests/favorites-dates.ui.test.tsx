/**
 * Le panneau des favoris datait ses lignes par tranches de 24 h : un favori
 * ajouté la veille à 22 h s'affichait « aujourd'hui » le lendemain matin.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { FavoritesManager } from '@/features/settings/components/FavoritesManager'
import { fileService } from '@/services/FileService'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr', changeLanguage: vi.fn() } }),
}))

beforeEach(() => {
  localStorage.clear()
  fileService.clearFavorites()
})

afterEach(() => {
  cleanup()
  fileService.clearFavorites()
  localStorage.clear()
  vi.useRealTimers()
})

describe('datation des favoris', () => {
  it('un favori de la veille à 22 h n’est pas daté d’aujourd’hui', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 10, 22, 0, 0))
    fileService.addFavorite('blob-veille', 'hier.png', 'conv-1', 'image/png', 1024)

    vi.setSystemTime(new Date(2026, 2, 11, 10, 0, 0))
    render(<FavoritesManager onClose={() => {}} />)

    const ligne = screen.getByRole('button', { name: 'hier.png' })
    expect(within(ligne).getByText(/time\.yesterday/)).toBeInTheDocument()
    expect(within(ligne).queryByText(/time\.today/)).toBeNull()
  })
})
