/**
 * Les filtres de favoris ne disaient leur état qu'à l'œil, la rangée ne se
 * sélectionnait qu'à la souris et la recherche n'avait pas de nom pour le
 * lecteur d'écran. L'état est maintenant annoncé, la rangée répond à
 * Entrée/Espace, et les boutons qu'elle contient gardent leurs propres gestes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { FavoritesManager } from '@/features/settings/components/FavoritesManager'
import { fileService } from '@/services/FileService'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr', changeLanguage: vi.fn() } }),
}))

beforeEach(() => {
  localStorage.clear()
  fileService.clearFavorites()
  fileService.addFavorite('blob-photo', 'photo.png', 'conv-1', 'image/png', 2048)
  fileService.addFavorite('blob-doc', 'note.txt', 'conv-1', 'text/plain', 4096)
})

afterEach(() => {
  cleanup()
  fileService.clearFavorites()
  localStorage.clear()
})

describe('favoris au clavier', () => {
  it('nomme la recherche et annonce le filtre actif', () => {
    render(<FavoritesManager onClose={() => {}} />)

    expect(screen.getByLabelText('settings.searchFavorites')).toBeInTheDocument()

    const all = screen.getByRole('button', { name: 'settings.all' })
    const images = screen.getByRole('button', { name: 'settings.images' })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(images).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(images)
    expect(all).toHaveAttribute('aria-pressed', 'false')
    expect(images).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('note.txt')).not.toBeInTheDocument()
  })

  it('sélectionne une rangée avec Entrée ou Espace, sans le faire depuis ses boutons', () => {
    render(<FavoritesManager onClose={() => {}} />)

    const row = screen.getByRole('button', { name: 'photo.png' })
    expect(row).toHaveAttribute('aria-pressed', 'false')

    fireEvent.keyDown(row, { key: 'Enter' })
    expect(row).toHaveAttribute('aria-pressed', 'true')

    // Le geste clavier d'un bouton de la rangée ne doit pas la sélectionner.
    const save = screen.getAllByRole('button', { name: 'chat.saveAs' })[0]
    fireEvent.keyDown(save, { key: ' ' })
    expect(row).toHaveAttribute('aria-pressed', 'true')

    fireEvent.keyDown(row, { key: ' ' })
    expect(row).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('retrait de la sélection', () => {
  const selectPhoto = () => {
    fireEvent.keyDown(screen.getByRole('button', { name: 'photo.png' }), { key: 'Enter' })
  }
  const bulkTrigger = () => screen.getByRole('button', { name: 'settings.removeSelected' })

  it('demande confirmation et ne retire rien avant l’acquiescement', () => {
    render(<FavoritesManager onClose={() => {}} />)
    selectPhoto()

    fireEvent.click(bulkTrigger())

    const dialog = screen.getByRole('dialog', { name: 'settings.removeSelected' })
    expect(within(dialog).getByText('settings.removeSelectedWarning')).toBeInTheDocument()
    expect(fileService.getFavorites()).toHaveLength(2)
  })

  it('retire uniquement les favoris sélectionnés après confirmation', async () => {
    render(<FavoritesManager onClose={() => {}} />)
    selectPhoto()
    fireEvent.click(bulkTrigger())

    const dialog = screen.getByRole('dialog', { name: 'settings.removeSelected' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'settings.removeSelected' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'settings.removeSelected' })).toBeNull(),
    )
    expect(fileService.getFavorites().map((favorite) => favorite.blobKey)).toEqual(['blob-doc'])
    expect(screen.getByText('note.txt')).toBeInTheDocument()
    expect(screen.queryByText('photo.png')).toBeNull()
  })

  it('annuler garde les favoris', async () => {
    render(<FavoritesManager onClose={() => {}} />)
    selectPhoto()
    fireEvent.click(bulkTrigger())

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'settings.removeSelected' })).toBeNull(),
    )
    expect(fileService.getFavorites()).toHaveLength(2)
  })

  /** Une sélection masquée par la recherche était encore effaçable : le bouton
   *  restait offert pour une ligne que l'utilisateur ne voyait plus. */
  it('abandonne les sélections devenues invisibles quand la recherche change', () => {
    render(<FavoritesManager onClose={() => {}} />)
    selectPhoto()

    fireEvent.change(screen.getByLabelText('settings.searchFavorites'), {
      target: { value: 'note' },
    })

    expect(screen.queryByRole('button', { name: 'settings.removeSelected' })).toBeNull()
    expect(fileService.getFavorites()).toHaveLength(2)
  })
})
