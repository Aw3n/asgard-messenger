/**
 * Favoris et historique de téléchargements vivaient uniquement en mémoire et
 * n'étaient alimentés par aucun geste : les deux panneaux des réglages restaient
 * vides pour toujours, y compris après un enregistrement réussi.
 *
 * Ces tests fixent les deux maillons : l'action de menu remplit les favoris, et
 * l'enregistrement sur disque laisse une trace — les deux survivant au
 * redémarrage par le stockage local.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const FAVORITES_KEY = 'asgard.fileFavorites'
const DOWNLOADS_KEY = 'asgard.downloadHistory'

describe('favoris de fichiers', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('retient un favori et le relit au démarrage suivant', async () => {
    const { fileService } = await import('@/services/FileService')

    fileService.addFavorite('blob-fav', 'note.txt', 'conv-1', 'text/plain')

    expect(fileService.isFavorite('blob-fav')).toBe(true)
    expect(fileService.getFavorites()).toEqual([
      expect.objectContaining({ blobKey: 'blob-fav', fileName: 'note.txt' }),
    ])
    expect(localStorage.getItem(FAVORITES_KEY)).toContain('blob-fav')

    vi.resetModules()
    const { fileService: reloaded } = await import('@/services/FileService')
    expect(reloaded.isFavorite('blob-fav')).toBe(true)
  })

  it('retire un favori du stockage, pas seulement de la mémoire', async () => {
    const { fileService } = await import('@/services/FileService')
    fileService.addFavorite('blob-fav', 'note.txt', 'conv-1', 'text/plain')

    fileService.removeFavorite('blob-fav')

    expect(fileService.isFavorite('blob-fav')).toBe(false)
    expect(localStorage.getItem(FAVORITES_KEY)).toBe('[]')
  })

  it('ignore un stockage illisible sans empêcher le démarrage', async () => {
    localStorage.setItem(FAVORITES_KEY, '{pas du json')

    const { fileService } = await import('@/services/FileService')

    expect(fileService.getFavorites()).toEqual([])
  })
})

describe('historique de téléchargements', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('enregistre le dernier fichier écrit et le relit au démarrage suivant', async () => {
    const { fileService } = await import('@/services/FileService')

    fileService.recordDownload({
      blobKey: 'blob-dl',
      fileName: 'rapport.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
      conversationId: 'conv-1',
    })

    expect(fileService.getDownloadHistory()[0]).toEqual(
      expect.objectContaining({ blobKey: 'blob-dl', fileName: 'rapport.pdf', fileSize: 2048 }),
    )
    expect(localStorage.getItem(DOWNLOADS_KEY)).toContain('rapport.pdf')

    vi.resetModules()
    const { fileService: reloaded } = await import('@/services/FileService')
    expect(reloaded.getDownloadHistory()[0].fileName).toBe('rapport.pdf')
  })

  it('vide aussi la copie persistée', async () => {
    const { fileService } = await import('@/services/FileService')
    fileService.recordDownload({
      blobKey: 'blob-dl',
      fileName: 'rapport.pdf',
      fileSize: 1,
      mimeType: 'application/pdf',
    })

    fileService.clearDownloadHistory()

    expect(fileService.getDownloadHistory()).toEqual([])
    expect(localStorage.getItem(DOWNLOADS_KEY)).toBe('[]')
  })
})
