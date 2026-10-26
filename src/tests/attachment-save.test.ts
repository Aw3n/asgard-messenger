/**
 * Enregistrer une pièce jointe sur disque : les trois issues doivent se voir.
 *
 * Le menu de la bulle téléchargeait sans rien annoncer — succès comme échec
 * restaient muets, pendant que le widget du fichier, lui, avertissait. La logique
 * est désormais partagée, et ces tests fixent ce que chaque retour du dialogue
 * doit produire à l'écran.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveAttachmentToDisk } from '@/utils/attachmentSave'
import { fileService } from '@/services/FileService'
import { useUIStore } from '@/stores/uiStore'
import type { MessageAttachment } from '@/types'

const t = (key: string) => key

function attachment(overrides: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    id: 'att-1',
    type: 'document',
    name: 'note.txt',
    size: 12,
    mimeType: 'text/plain',
    blobKey: 'blob-1',
    ...overrides,
  }
}

const toasts = () => useUIStore.getState().toasts.map((toast) => `${toast.type}:${toast.title}`)

const beforeStorage = useUIStore.getState().settings.storage

const setDownloadPath = (downloadPath: string) =>
  useUIStore.getState().updateSettings({
    storage: { ...useUIStore.getState().settings.storage, downloadPath },
  })

beforeEach(() => {
  useUIStore.setState({ toasts: [] })
  setDownloadPath('')
  fileService.clearDownloadHistory()
  vi.mocked(window.asgard.file.saveAs).mockReset()
})

afterEach(() => {
  useUIStore.getState().updateSettings({ storage: beforeStorage })
})

describe('saveAttachmentToDisk', () => {
  it('annonce le chemin écrit', async () => {
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: true, filePath: 'C:\\note.txt' })

    await expect(saveAttachmentToDisk(attachment(), t)).resolves.toBe(true)
    expect(toasts()).toEqual(['success:chat.fileSaved'])
    expect(useUIStore.getState().toasts[0].message).toBe('C:\\note.txt')
  })

  it('distingue un fichier jamais reçu d’un échec de disque', async () => {
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: false, reason: 'not-found' })

    await expect(saveAttachmentToDisk(attachment(), t)).resolves.toBe(false)
    expect(toasts()).toEqual(['error:chat.downloadFailed'])
    expect(useUIStore.getState().toasts[0].message).toBe('chat.fileNotFoundLocally')
  })

  it('nomme une pièce jointe héritée d’une ancienne version', async () => {
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: false, reason: 'not-found' })

    await saveAttachmentToDisk(attachment({ blobKey: '1739' }), t)
    expect(useUIStore.getState().toasts[0].message).toBe('chat.legacyFileNotDownloadable')
  })

  it('tait le choix d’un dialogue fermé sans enregistrement', async () => {
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: false, reason: 'canceled' })

    await expect(saveAttachmentToDisk(attachment(), t)).resolves.toBe(false)
    expect(toasts()).toEqual([])
  })

  it('refuse une pièce dont le blob n’est pas encore arrivé', async () => {
    await expect(saveAttachmentToDisk(attachment({ blobKey: undefined }), t)).resolves.toBe(false)
    expect(toasts()).toEqual(['error:chat.downloadUnavailable'])
    expect(window.asgard.file.saveAs).not.toHaveBeenCalled()
  })

  it('porte le dossier réglé jusqu’au dialogue natif', async () => {
    setDownloadPath('D:\\Asgard\\Reçus')
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: true, filePath: 'D:\\Asgard\\Reçus\\note.txt' })

    await saveAttachmentToDisk(attachment(), t)

    // Le réglage était écrit par l'utilisateur et jeté par le pont : sans
    // l'argument, la boîte de dialogue repartait de son emplacement système.
    expect(window.asgard.file.saveAs).toHaveBeenCalledWith('blob-1', 'note.txt', 'D:\\Asgard\\Reçus')
  })

  it('laisse le dossier vide tel quel quand rien n’est réglé', async () => {
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: true, filePath: 'C:\\note.txt' })

    await saveAttachmentToDisk(attachment(), t)

    expect(window.asgard.file.saveAs).toHaveBeenCalledWith('blob-1', 'note.txt', '')
  })

  it('inscrit un enregistrement réussi dans l’historique, avec sa conversation', async () => {
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: true, filePath: 'C:\\note.txt' })

    await saveAttachmentToDisk(attachment(), t, 'conv-42')

    const [entry] = fileService.getDownloadHistory()
    expect(entry).toMatchObject({
      blobKey: 'blob-1',
      fileName: 'note.txt',
      fileSize: 12,
      mimeType: 'text/plain',
      conversationId: 'conv-42',
    })
  })

  it('n’inscrit rien quand le dialogue est annulé ou échoue', async () => {
    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: false, reason: 'canceled' })
    await saveAttachmentToDisk(attachment(), t, 'conv-42')

    vi.mocked(window.asgard.file.saveAs).mockResolvedValue({ success: false, reason: 'error' })
    await saveAttachmentToDisk(attachment(), t, 'conv-42')

    expect(fileService.getDownloadHistory()).toEqual([])
  })
})
