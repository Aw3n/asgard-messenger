/**
 * « Tout effacer » des favoris passait par `confirm()` natif : le fil gelait,
 * la touche de fermeture réglée n'était pas lue et le dialogue sortait du
 * thème. Ces tests suivent le geste, pas la peinture : rien n'est effacé tant
 * que le dialogue rendu n'a pas reçu son acquiescement, et la touche le
 * referme sans rien effacer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { fileServiceMock } = vi.hoisted(() => {
  const favorite = {
    blobKey: 'blob-1',
    fileName: 'photo.png',
    conversationId: 'conv-1',
    mimeType: 'image/png',
    addedAt: 1_700_000_000_000,
  }
  return {
    favorite,
    fileServiceMock: {
      getFavorites: vi.fn(() => [favorite]),
      getFavoritesStats: vi.fn(() => ({ total: 1, byType: { image: 1 } as Record<string, number> })),
      removeFavorite: vi.fn(),
      clearFavorites: vi.fn(),
    },
  }
})

vi.mock('@/services/FileService', () => ({ fileService: fileServiceMock }))

import { FavoritesManager } from '@/features/settings/components/FavoritesManager'

const openFavorites = () => render(<FavoritesManager onClose={() => {}} />)
const clearTrigger = () => screen.getByRole('button', { name: 'settings.clearAll' })
const clearDialog = () => screen.getByRole('dialog', { name: 'settings.clearAll' })

beforeEach(() => {
  fileServiceMock.clearFavorites.mockClear()
  fileServiceMock.getFavorites.mockClear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('vider les favoris', () => {
  it('n’efface qu’après acquiescement du dialogue rendu, sans confirm natif', () => {
    const nativeConfirm = vi.spyOn(window, 'confirm').mockImplementation(() => true)
    openFavorites()

    fireEvent.click(clearTrigger())

    expect(nativeConfirm).not.toHaveBeenCalled()
    expect(fileServiceMock.clearFavorites).not.toHaveBeenCalled()
    expect(clearDialog()).toBeInTheDocument()

    fireEvent.click(within(clearDialog()).getByRole('button', { name: 'settings.clearAll' }))

    expect(fileServiceMock.clearFavorites).toHaveBeenCalledTimes(1)
    return waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'settings.clearAll' })).not.toBeInTheDocument(),
    )
  })

  it('se referme à la touche réglée sans rien effacer', async () => {
    openFavorites()
    fireEvent.click(clearTrigger())
    expect(clearDialog()).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'settings.clearAll' })).not.toBeInTheDocument(),
    )
    expect(fileServiceMock.clearFavorites).not.toHaveBeenCalled()
  })

  it('annule au clic sur le fond sans fermer le panneau des favoris', async () => {
    openFavorites()
    fireEvent.click(clearTrigger())

    fireEvent.click(clearDialog().parentElement as HTMLElement)

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'settings.clearAll' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('dialog', { name: 'settings.favoriteFiles' })).toBeInTheDocument()
    expect(fileServiceMock.clearFavorites).not.toHaveBeenCalled()
  })
})
