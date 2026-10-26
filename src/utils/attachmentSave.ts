import { useUIStore } from '@/stores/uiStore'
import { fileService } from '@/services/FileService'
import type { MessageAttachment } from '@/types'

type Translate = (key: string, options?: Record<string, unknown>) => string

/** Ce qu'un enregistrement a besoin de savoir pour laisser une trace lisible. */
type SaveableAttachment = Pick<MessageAttachment, 'name'> & {
  blobKey?: string
  size?: number
  mimeType?: string
}

/**
 * Enregistrer une pièce jointe sur disque se joue en trois issues : le choix de
 * l'utilisateur, un échec, un chemin écrit. Les trois doivent se voir au même
 * endroit quel que soit le bouton qui lance l'action — le widget de fichier le
 * faisait, le menu de la bulle téléchargeait sans rien dire.
 *
 * `canceled` n'est pas une panne : la fenêtre d'enregistrement fermée sans choix
 * est un refus de l'utilisateur, pas un défaut d'Asgard.
 */
export async function saveAttachmentToDisk(
  attachment: SaveableAttachment,
  t: Translate,
  conversationId?: string,
): Promise<boolean> {
  const { addToast, settings } = useUIStore.getState()

  if (!attachment.blobKey) {
    addToast({
      type: 'error',
      title: t('chat.downloadUnavailable'),
      message: t('chat.fileNotYetAvailable'),
    })
    return false
  }

  const result = await window.asgard.file.saveAs(attachment.blobKey, attachment.name, settings.storage.downloadPath)

  if (result.success) {
    // L'historique ne se remplit qu'ici : chaque bouton « enregistrer sous »
    // passe par cette fonction, et un échec ou un refus n'y laisse rien.
    fileService.recordDownload({
      blobKey: attachment.blobKey,
      fileName: attachment.name,
      fileSize: attachment.size ?? 0,
      mimeType: attachment.mimeType ?? '',
      conversationId,
    })
    addToast({ type: 'success', title: t('chat.fileSaved'), message: result.filePath, duration: 3000 })
    return true
  }

  console.warn('[attachmentSave] Save failed:', result.reason, result.message)
  try {
    window.asgard.debugLog(
      `[attachmentSave] Save failed: ${result.reason}${result.message ? ' - ' + result.message : ''}`,
    )
  } catch { /* le journal main-process peut manquer */ }

  if (result.reason === 'canceled') return false

  // Un blobKey purement numérique vient d'une ancienne version : le blob n'a
  // jamais été adressable, le renvoyer est le seul vrai remède.
  const isLegacyBlobId = /^\d+$/.test(attachment.blobKey)
  addToast({
    type: 'error',
    title: t('chat.downloadFailed'),
    message: result.reason === 'not-found'
      ? (isLegacyBlobId ? t('chat.legacyFileNotDownloadable') : t('chat.fileNotFoundLocally'))
      : (result.message ?? t('chat.saveError')),
  })
  return false
}
