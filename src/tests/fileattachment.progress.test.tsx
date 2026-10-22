// c:\Users\Ael\Desktop\Asgard!\src\tests\fileattachment.progress.test.tsx
/// <reference types="vitest/globals" />
/**
 * Verrou de la progression d’une pièce jointe.
 *
 * Chaque bulle lançait un `setInterval` de 300 ms qui interrogeait FileService
 * pour toute la vie de la conversation — y compris pour des fichiers terminés
 * depuis longtemps. La progression est désormais poussée par l’abonnement
 * coalescé du service ; ces tests gèlent les deux côtés du contrat : aucune
 * surveillance pour un fichier stable, et une mise à jour immédiate pour une
 * réception en cours.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { FileAttachment } from '@/features/chat/components/FileAttachment'
import { fileService } from '@/services/FileService'
import type { MessageAttachment } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr', changeLanguage: vi.fn() } }),
}))

function documentAttachment(over: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    id: 'att-doc-1',
    type: 'document',
    name: 'report.pdf',
    size: 2048,
    mimeType: 'application/pdf',
    ...over
  }
}

describe('progression d’une pièce jointe', () => {
  beforeEach(() => {
    vi.spyOn(fileService, 'isLiveUrl').mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('ne surveille pas un fichier déjà stocké', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const subscribe = vi.spyOn(fileService, 'subscribeTransfers')

    render(
      <FileAttachment
        attachment={documentAttachment({ blobKey: 'blob-1', localUrl: 'blob:file-service/doc' })}
        isOwn={false}
        messageId="m1"
        conversationId="c1"
      />
    )

    // Le fichier est complet : ni abonnement ni horloge de 300 ms.
    expect(subscribe).not.toHaveBeenCalled()
    expect(setIntervalSpy.mock.calls.filter(([, delay]) => delay === 300)).toHaveLength(0)
  })

  it('ne surveille pas non plus une réception abandonnée', () => {
    const subscribe = vi.spyOn(fileService, 'subscribeTransfers')

    render(
      <FileAttachment
        attachment={documentAttachment({ failed: true, transferId: 't-failed' })}
        isOwn={false}
        messageId="m1"
        conversationId="c1"
      />
    )

    expect(subscribe).not.toHaveBeenCalled()
  })

  it('suit une réception en cours sur notification du service', () => {
    let listener: (() => void) | null = null
    const unsubscribe = vi.fn()
    vi.spyOn(fileService, 'subscribeTransfers').mockImplementation((cb) => {
      listener = cb
      return unsubscribe
    })
    let progress: number | null = null
    vi.spyOn(fileService, 'getReceiveProgressByTransfer').mockImplementation(() =>
      progress === null ? null : { fileName: 'report.pdf', progress }
    )

    const view = render(
      <FileAttachment
        attachment={documentAttachment({ transferId: 't-live' })}
        isOwn={false}
        messageId="m1"
        conversationId="c1"
      />
    )

    // Avant le premier chunk : barre indéterminée, jamais un « 0 % » trompeur.
    expect(document.body.textContent).toContain('chat.receiving')
    expect(listener).not.toBeNull()

    progress = 42
    act(() => listener?.())

    expect(document.body.textContent).toContain('42%')
    expect(document.body.textContent).not.toContain('chat.receiving')

    view.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
