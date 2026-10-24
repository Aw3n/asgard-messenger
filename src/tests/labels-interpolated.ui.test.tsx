/**
 * Quatre libellés recevaient des paramètres que leur traduction n'utilisait
 * pas : le compteur de vues d'un partage, la taille totale des téléchargements,
 * le nom du canal dans le composeur et le nom de la conversation à supprimer
 * (la phrase affichait le mot « name ») restaient invisibles. Les panneaux sont
 * rendus ici avec le vrai catalogue français, et les 25 langues sont balayées.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@/i18n/config'
import { translations } from '@/i18n/translations'
import { ShareLinksManager } from '@/features/settings/components/ShareLinksManager'
import { DownloadHistory } from '@/features/settings/components/DownloadHistory'

vi.mock('@/services/FileService', () => ({
  fileService: {
    getActiveShareLinks: () => [{
      token: 'tok-1',
      blobKey: 'bafyblobkeyexample00000000',
      createdAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
      accessCount: 3,
      maxAccess: 10,
    }],
    revokeShareLink: vi.fn(),
    getDownloadHistory: () => [{
      id: 'dl-1',
      blobKey: 'bafyblobkeyexample00000000',
      fileName: 'photo.png',
      fileSize: 1536,
      mimeType: 'image/png',
      downloadedAt: Date.now(),
    }],
    getDownloadStats: () => ({ total: 1, totalSize: 1536, byType: { image: 1 }, recentCount: 1 }),
    searchDownloadHistory: () => [],
    clearDownloadHistory: vi.fn(),
  },
}))

const REQUIRED: Record<string, string[]> = {
  'settings.views': ['used', 'total'],
  'settings.totalSize': ['size'],
  'groups.messageChannel': ['channelName'],
  'chat.deleteWarning': ['name'],
}

afterEach(cleanup)

describe('libellés interpolés', () => {
  it('les 25 langues portent les trous de leurs paramètres', () => {
    const locales = Object.entries(translations)
    expect(locales).toHaveLength(25)

    for (const [code, locale] of locales) {
      const dictionary = (locale as { translation: Record<string, string> }).translation
      for (const [key, holes] of Object.entries(REQUIRED)) {
        const value = dictionary[key]
        expect(value, `${code} ${key}`).toBeTruthy()
        for (const hole of holes) {
          expect(value, `${code} ${key}`).toContain(`{{${hole}}}`)
        }
      }
    }
  })

  it('un partage affiche ses vues et son plafond', () => {
    render(<ShareLinksManager />)

    expect(screen.getByText('Vues : 3 / 10')).toBeInTheDocument()
  })

  it('l’historique affiche la taille totale', () => {
    render(<DownloadHistory />)

    expect(screen.getByText('Taille totale : 1.5 KB')).toBeInTheDocument()
  })
})
