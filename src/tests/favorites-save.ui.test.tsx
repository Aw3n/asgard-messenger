/**
 * Une ligne de favori ne savait rien faire d'autre que disparaître : le panneau
 * nommait des fichiers sans permettre de les rouvrir. Chaque rangée passe
 * maintenant par le même dialogue d'enregistrement que la bulle, avec sa taille
 * et sa conversation — et la croix de retrait ne déclenche pas d'écriture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FavoritesManager } from '@/features/settings/components/FavoritesManager'
import { fileService } from '@/services/FileService'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr', changeLanguage: vi.fn() } }),
}))

beforeEach(() => {
  localStorage.clear()
  useUIStore.setState({ toasts: [] })
  fileService.clearFavorites()
  fileService.clearDownloadHistory()
  vi.mocked(window.asgard.file.saveAs).mockReset()
})

afterEach(() => {
  cleanup()
  fileService.clearFavorites()
  fileService.clearDownloadHistory()
  localStorage.clear()
})

function seedFavorite() {
  fileService.addFavorite('blob-fav', 'note.txt', 'conv-7', 'text/plain', 4096)
}

describe('favoris : enregistrement depuis le panneau', () => {
  it('écrit le blob, garde la taille et la conversation dans l’historique', async () => {
    seedFavorite()
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: true, filePath: 'C:\\note.txt' })

    render(<FavoritesManager onClose={() => {}} />)

    expect(screen.getByText(/4\.0 KB/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.saveAs' }))

    await waitFor(() =>
      expect(window.asgard.file.saveAs).toHaveBeenCalledWith('blob-fav', 'note.txt', expect.any(String)),
    )
    await waitFor(() => expect(useUIStore.getState().toasts[0]?.title).toBe('chat.fileSaved'))
    expect(fileService.getDownloadHistory()[0]).toMatchObject({
      blobKey: 'blob-fav',
      fileName: 'note.txt',
      fileSize: 4096,
      mimeType: 'text/plain',
      conversationId: 'conv-7',
    })
  })

  it('la croix de retrait retire le favori sans lancer d’enregistrement', () => {
    seedFavorite()

    render(<FavoritesManager onClose={() => {}} />)
    fireEvent.click(screen.getByTitle('settings.removeFromFavorites'))

    expect(fileService.isFavorite('blob-fav')).toBe(false)
    expect(window.asgard.file.saveAs).not.toHaveBeenCalled()
  })
})
