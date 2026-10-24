/**
 * Le panneau « Fichiers favoris » des réglages n'avait aucun producteur : aucun
 * geste de l'application ne pouvait y ajouter une pièce jointe. Ce test ouvre le
 * menu de la bulle, ajoute le fichier, vérifie qu'il apparaît dans le panneau,
 * puis le retire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FileAttachment } from '@/features/chat/components/FileAttachment'
import { FavoritesManager } from '@/features/settings/components/FavoritesManager'
import { fileService } from '@/services/FileService'
import { useUIStore } from '@/stores/uiStore'
import type { MessageAttachment } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr', changeLanguage: vi.fn() } }),
}))

function attachment(): MessageAttachment {
  return {
    id: 'att-fav-1',
    type: 'document',
    name: 'note.txt',
    size: 12,
    mimeType: 'text/plain',
    blobKey: 'blob-fav-ui',
  }
}

function openMenu() {
  fireEvent.contextMenu(screen.getByText('note.txt'))
}

beforeEach(() => {
  localStorage.clear()
  fileService.removeFavorite('blob-fav-ui')
  useUIStore.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
  fileService.removeFavorite('blob-fav-ui')
  localStorage.clear()
})

describe('favoris depuis la pièce jointe', () => {
  it('ajoute le fichier, le montre dans les réglages, puis le retire', () => {
    render(
      <FileAttachment attachment={attachment()} isOwn={false} messageId="m-1" conversationId="conv-1" />,
    )

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'chat.addToFavorites' }))

    expect(fileService.isFavorite('blob-fav-ui')).toBe(true)
    // La taille est relevée à l'ajout : le panneau l'affiche ensuite sans blob.
    expect(fileService.getFavorites()[0].fileSize).toBe(12)
    expect(useUIStore.getState().toasts[0].title).toBe('chat.addedToFavorites')

    // Le panneau et la bulle affichent tous deux le nom : démonter la bulle
    // laisse le panneau seul en scène pour la vérification.
    cleanup()
    render(<FavoritesManager onClose={() => {}} />)
    expect(screen.getByText('note.txt')).toBeInTheDocument()

    cleanup()
    render(
      <FileAttachment attachment={attachment()} isOwn={false} messageId="m-1" conversationId="conv-1" />,
    )
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'chat.removeFromFavorites' }))

    expect(fileService.isFavorite('blob-fav-ui')).toBe(false)
    expect(useUIStore.getState().toasts.at(-1)?.title).toBe('chat.removedFromFavorites')
  })

  it('relit l’état du favori à chaque ouverture du menu', () => {
    render(
      <FileAttachment attachment={attachment()} isOwn={false} messageId="m-1" conversationId="conv-1" />,
    )

    // Ajouté ailleurs (panneau des réglages) après le montage de la bulle.
    fileService.addFavorite('blob-fav-ui', 'note.txt', 'conv-1', 'text/plain')
    openMenu()
    expect(screen.getByRole('menuitem', { name: 'chat.removeFromFavorites' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    fileService.removeFavorite('blob-fav-ui')
    openMenu()
    expect(screen.getByRole('menuitem', { name: 'chat.addToFavorites' })).toBeInTheDocument()
  })

  it('n’offre pas les favoris pour une pièce sans blob', () => {
    render(
      <FileAttachment
        attachment={{ ...attachment(), blobKey: undefined }}
        isOwn={false}
        messageId="m-2"
        conversationId="conv-1"
      />,
    )

    openMenu()

    expect(screen.queryByRole('menuitem', { name: 'chat.addToFavorites' })).not.toBeInTheDocument()
  })
})
