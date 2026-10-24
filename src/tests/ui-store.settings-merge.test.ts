import { describe, expect, it } from 'vitest'
import { mergeStoredSettings } from '@/stores/uiStore'

/**
 * Un état persisté antérieur peut précéder l'ajout d'un bloc de réglages.
 * La fusion doit rendre la section complète sans perdre les choix locaux —
 * sans elle, l'écran Stockage lisait `settings.storage.cacheSize` sur undefined.
 */
describe('fusion des réglages persistés', () => {
  it('restaure le bloc stockage absent d’un état ancien', () => {
    const merged = mergeStoredSettings({ theme: 'light', fontSize: 'large' })

    expect(merged.theme).toBe('light')
    expect(merged.fontSize).toBe('large')
    expect(merged.storage).toEqual({
      autoDownload: { images: true, videos: false, documents: false, audio: true, maxSize: 50 },
      downloadPath: '',
      cacheSize: 500,
    })
  })

  it('garde les valeurs de stockage et complète ses sous-clés', () => {
    const merged = mergeStoredSettings({
      storage: { cacheSize: 42, autoDownload: { videos: true } },
    })

    expect(merged.storage.cacheSize).toBe(42)
    expect(merged.storage.autoDownload.videos).toBe(true)
    expect(merged.storage.autoDownload.images).toBe(true)
    expect(merged.storage.downloadPath).toBe('')
  })

  it('complète une section partielle sans écraser les choix', () => {
    const merged = mergeStoredSettings({ chat: { sendOnEnter: false } })

    expect(merged.chat.sendOnEnter).toBe(false)
    expect(merged.chat.density).toBe('comfortable')
    expect(merged.privacy.readReceipts).toBe(true)
  })
})
