import React, { useMemo, useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'
import { fileService } from '@/services/FileService'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'
import type { MessageAttachment } from '@/types'
import { ImageLightbox, type LightboxItem } from './ImageLightbox'

interface FileAttachmentProps {
  attachment: MessageAttachment
  isOwn: boolean
  messageId?: string
  conversationId?: string
}

/** Types dont l'affichage dépend d'une URL d'objet locale. */
const MEDIA_TYPES: MessageAttachment['type'][] = ['image', 'video', 'audio', 'voice']

/**
 * Build a lightbox entry out of an image attachment.
 *
 * What is displayed immediately is whatever is already local (the downloaded
 * file, otherwise the thumbnail that came with the message); `loadFull` fetches
 * the original so that zooming reveals real detail instead of an enlarged blur.
 *
 * The local URL is only accepted when FileService recognises it as live: a
 * `blob:` URL saved with the message during an earlier run of the app is a dead
 * reference, and feeding it to the viewer is what produced a broken picture
 * behind a "100%" zoom badge.
 */
function toLightboxItem(att: MessageAttachment): LightboxItem {
  const live = fileService.isLiveUrl(att.localUrl) ? (att.localUrl as string) : null
  return {
    id: att.id,
    src: live ?? att.thumbnail ?? '',
    alt: att.name,
    // A thumbnail alone cannot be zoomed usefully — the original is still missing.
    preview: !live,
    loadFull: async () => {
      if (live) return live
      if (!att.blobKey) return null
      // downloadFile re-reads the blob from disk whenever the stored URL is a
      // leftover from a previous session, so this also heals dead references.
      return await fileService.downloadFile(att)
    },
  }
}

/**
 * FileAttachment — renders a file attachment with progress bar, save-as, and delete support.
 */
export const FileAttachment: React.FC<FileAttachmentProps> = ({ attachment, isOwn, messageId, conversationId }) => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  /**
   * Compteur de résolution locale. `downloadFile` remplit `attachment.localUrl`
   * en place : sans signal, la galerie mémoïsée resterait sur l'ancienne source
   * (vide ou périmée) et le clic n'ouvrirait rien. Le store n'est pas toujours
   * notifiable — la liste des fichiers rend des pièces jointes hors conversation.
   */
  const [resolvedVersion, setResolvedVersion] = useState(0)
  const progressInterval = useRef<ReturnType<typeof setInterval>>()

  const deleteFileAttachment = useMessageStore((s) => s.deleteFileAttachment)
  const setAttachmentLocalUrl = useMessageStore((s) => s.setAttachmentLocalUrl)
  const addToast = useUIStore((s) => s.addToast)

  // GUÉRISON DES URL MORTES: `localUrl` est une URL `blob:` liée à la session
  // qui a reçu le fichier, mais elle est persistée avec le message. Au
  // redémarrage la référence ne résout plus: bulle et visionneuse affichent
  // l'icône d'image cassée alors que le blob est toujours sur disque. On le
  // relit une fois et on publie l'URL neuve dans le store (mise à jour immuable
  // → la bulle, la galerie et la visionneuse se re-rendent toutes).
  useEffect(() => {
    if (!messageId || !conversationId) return
    if (!attachment.blobKey || attachment.deleted) return
    if (!MEDIA_TYPES.includes(attachment.type)) return
    // Une URL absente est le cas normal du téléchargement à la demande ; une URL
    // vivante n'a rien à guérir. Seule une référence périmée nous concerne.
    if (!attachment.localUrl || fileService.isLiveUrl(attachment.localUrl)) return
    let cancelled = false
    fileService.resolveLocalUrl(attachment)
      .then((url) => {
        if (cancelled || !url) return
        if (messageId && conversationId) setAttachmentLocalUrl(messageId, conversationId, attachment.id, url)
        setResolvedVersion((n) => n + 1)
      })
      .catch(() => { /* le blob a pu être purgé: l'aperçu reste affiché */ })
    return () => { cancelled = true }
  }, [attachment.id, attachment.type, attachment.blobKey, attachment.localUrl, attachment.deleted, messageId, conversationId, setAttachmentLocalUrl])

  // Poll transfer progress for both send and receive
  // CRITICAL: all hooks must run before any early return.
  useEffect(() => {
    const checkProgress = () => {
      // Check send transfers
      const transfers = fileService.getTransfers()
      const transfer = transfers.find((entry) => entry.fileName === attachment.name)
      if (transfer && transfer.status === 'uploading') {
        setProgress(transfer.progress)
        return
      }

      // Check receive progress via active receive buffer
      if (!attachment.localUrl && !attachment.blobKey && conversationId) {
        const receiveProgress = fileService.getReceiveProgress(conversationId)
        if (receiveProgress && receiveProgress.fileName === attachment.name) {
          setProgress(receiveProgress.progress)
        } else {
          // Still waiting for data — show indeterminate progress
          setProgress(-1) // -1 means indeterminate
        }
        return
      }

      // If we had progress before but now it's gone, clear it
      if (progress !== null && !transfer) {
        setProgress(null)
      }
    }

    checkProgress()
    progressInterval.current = setInterval(checkProgress, 300)
    return () => clearInterval(progressInterval.current)
  }, [attachment.name, attachment.localUrl, attachment.blobKey, conversationId])

  const handleClick = async () => {
    const live = fileService.isLiveUrl(attachment.localUrl) ? (attachment.localUrl as string) : null
    if (attachment.type === 'image' && (live || attachment.thumbnail)) {
      // Open right away on whatever is already here — the viewer loads the
      // original itself and can move through the conversation's photos.
      setLightboxOpen(true)
      return
    }
    if (live) {
      window.open(live, '_blank')
      return
    }

    setLoading(true)
    try {
      const url = await fileService.resolveLocalUrl(attachment)
      if (url) {
        // Publier dans le store (bulle, galerie, visionneuse) et, à défaut de
        // conversation connue, au moins prévenir ce composant de la mutation.
        if (messageId && conversationId) setAttachmentLocalUrl(messageId, conversationId, attachment.id, url)
        setResolvedVersion((n) => n + 1)
      }
      // After download, if it's an image, open the lightbox
      if (attachment.type === 'image') {
        // Ouvrir seulement s'il y a un pixel à montrer: sinon l'appel du clic
        // se perdrait dans une visionneuse vide.
        if (url || attachment.thumbnail) setLightboxOpen(true)
        else setError(true)
      } else if (url) {
        window.open(url, '_blank')
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    }
    setLoading(false)
  }

  // Every photo of this conversation, oldest first: the lightbox uses that for
  // previous/next navigation instead of trapping the user on a single picture.
  const conversationMessages = useMessageStore((s) => (conversationId ? s.messages[conversationId] : undefined))
  const gallery = useMemo<LightboxItem[]>(() => {
    const list: LightboxItem[] = []
    for (const msg of conversationMessages ?? []) {
      if (msg.deleted || msg.recalled) continue
      for (const att of msg.attachments ?? []) {
        if (att.type !== 'image' || att.deleted) continue
        list.push(toLightboxItem(att))
      }
    }
    // A message still missing from the store slice must stay viewable anyway.
    if (attachment.type === 'image' && !list.some((i) => i.id === attachment.id)) {
      list.push(toLightboxItem(attachment))
    }
    return list.filter((i) => i.src)
  }, [conversationMessages, attachment, resolvedVersion])
  const startIndex = Math.max(gallery.findIndex((i) => i.id === attachment.id), 0)
  const canOpenLightbox = attachment.type === 'image' && gallery.some((i) => i.id === attachment.id)

  const handleSaveAs = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!attachment.blobKey) {
      addToast({ type: 'error', title: t('chat.downloadUnavailable'), message: t('chat.fileNotYetAvailable') })
      return
    }
    console.log('[FileAttachment] saveAs blobKey:', attachment.blobKey, 'name:', attachment.name)
    const result = await window.asgard.file.saveAs(attachment.blobKey, attachment.name)
    if (!result.success) {
      console.warn('[FileAttachment] Save failed:', result.reason, result.message)
      try {
        window.asgard.debugLog(`[FileAttachment] Save failed: ${result.reason}${result.message ? ' - ' + result.message : ''}`)
      } catch {}
      if (result.reason === 'canceled') return
      const isLegacyBlobId = /^\d+$/.test(attachment.blobKey)
      addToast({
        type: 'error',
        title: t('chat.downloadFailed'),
        message: result.reason === 'not-found'
          ? (isLegacyBlobId
              ? t('chat.legacyFileNotDownloadable')
              : t('chat.fileNotFoundLocally'))
          : (result.message ?? t('chat.saveError')),
      })
    } else {
      addToast({ type: 'success', title: t('chat.fileSaved'), message: result.filePath, duration: 3000 })
    }
  }

  /**
   * Pièce jointe audio pas encore matérialisée localement (ou retirée du disque
   * depuis l'envoi) : on relit le blob et on publie l'URL dans le store. Poser
   * l'URL en place ne suffirait pas — `FileService.downloadFile` mute l'objet,
   * et sans mise à jour immuable du store le lecteur ne se re-renderait pas.
   */
  const handleAudioFetch = async () => {
    if (!messageId || !conversationId) {
      await fileService.resolveLocalUrl(attachment).catch(() => null)
      return
    }
    try {
      const url = await fileService.resolveLocalUrl(attachment)
      if (!url) throw new Error('blob indisponible')
      setAttachmentLocalUrl(messageId, conversationId, attachment.id, url)
    } catch {
      addToast({ type: 'error', title: t('chat.downloadFailed'), message: t('chat.fileNotFoundLocally') })
    }
  }

  const handleDelete = async () => {
    if (!messageId || !conversationId) return
    try {
      const success = await deleteFileAttachment(messageId, conversationId, attachment.id)
      if (success) {
        setShowDeleteConfirm(false)
      } else {
        console.warn('[FileAttachment] deleteFileAttachment returned false')
      }
    } catch (err) {
      console.error('[FileAttachment] Failed to delete attachment:', err)
    }
  }

  // Context menu state for attachment-level actions
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const attachmentRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const closeContextMenu = () => setContextMenu(null)

  // Defensive: attachment object may be malformed in some edge cases
  if (!attachment || !attachment.id) {
    return (
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-xl',
        'bg-asgard-surface-alt border border-dashed border-asgard-border'
      )}>
        <p className="text-xs text-asgard-text-muted italic">{t('chat.invalidAttachment')}</p>
      </div>
    )
  }

  // Handle deleted state
  if (attachment.deleted) {
    return (
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-xl',
        'bg-asgard-surface-alt border border-dashed border-asgard-border'
      )}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
          <path d="M9 10h6v4H9z"/>
        </svg>
        <p className="text-xs text-asgard-text-muted italic">
          {t('chat.fileDeletedBySender')}
        </p>
      </div>
    )
  }

  const deleteButton = isOwn && messageId && conversationId ? (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      onClick={(e) => {
        e.stopPropagation()
        setShowDeleteConfirm(true)
      }}
      className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/80 hover:bg-red-500 transition-colors group/delete"
      title={t('chat.deleteFile')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
      </svg>
    </motion.button>
  ) : null

  const deleteConfirmDialog = showDeleteConfirm ? (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setShowDeleteConfirm(false)}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="mica-card border border-asgard-border rounded-2xl p-6 max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-asgard-text-primary mb-2">
          {t('chat.deleteFileConfirm')}
        </h3>
        <p className="text-sm text-asgard-text-secondary mb-4">
          {t('chat.deleteFileWarning')}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="px-4 py-2 text-sm text-asgard-text-secondary hover:text-asgard-text-primary transition-colors rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            {t('common.delete')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  ) : null

  const renderAttachment = () => {
    switch (attachment.type) {
      case 'image':
        return <ImageAttachment attachment={attachment} onClick={handleClick} onSave={handleSaveAs} loading={loading} progress={progress} />
      case 'video':
        return <VideoAttachment attachment={attachment} onClick={handleClick} onSave={handleSaveAs} loading={loading} progress={progress} />
      case 'audio':
      case 'voice':
        return <AudioAttachment attachment={attachment} onSave={handleSaveAs} onFetch={handleAudioFetch} reserveDeleteSpace={!!deleteButton} />
      default:
        return <DocumentAttachment attachment={attachment} onClick={handleClick} onSave={handleSaveAs} loading={loading} error={error} progress={progress} />
    }
  }

  return (
    <div
      ref={attachmentRef}
      className="relative inline-block"
      onContextMenu={handleContextMenu}
    >
      {deleteButton}
      {renderAttachment()}
      {deleteConfirmDialog}
      {contextMenu && (
        <AttachmentContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onDownload={handleSaveAs}
          canDownload={!!attachment.blobKey}
          fileName={attachment.name}
        />
      )}
      <AnimatePresence>
        {lightboxOpen && canOpenLightbox && (
          <ImageLightbox
            items={gallery}
            startIndex={startIndex}
            fileName={attachment.name}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

const ProgressBar: React.FC<{ progress: number; className?: string }> = ({ progress, className }) => {
  const isIndeterminate = progress < 0

  if (isIndeterminate) {
    return (
      <div className={cn('h-1.5 bg-asgard-border rounded-full overflow-hidden', className)}>
        <motion.div
          className="h-full bg-asgard-glacier rounded-full"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: '40%' }}
        />
      </div>
    )
  }

  return (
    <div className={cn('h-1.5 bg-asgard-border rounded-full overflow-hidden', className)}>
      <motion.div
        className="h-full bg-asgard-glacier rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </div>
  )
}

// ─── Attachment Context Menu ──────────────────────────────────────────────────

const AttachmentContextMenu: React.FC<{
  x: number
  y: number
  onClose: () => void
  onDownload: () => void
  canDownload: boolean
  fileName?: string
}> = ({ x, y, onClose, onDownload, canDownload, fileName }) => {
  const { t } = useTranslation()
  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('click', handler, { once: true })
    return () => window.removeEventListener('click', handler)
  }, [onClose])

  const label = fileName ? t('chat.downloadNamedFile', { name: fileName }) : t('chat.downloadFile')

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        'fixed z-50 mica-card border border-asgard-border rounded-xl p-1 shadow-modal',
        'flex flex-col gap-0.5 min-w-36'
      )}
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => {
          onDownload()
          onClose()
        }}
        disabled={!canDownload}
        className={cn(
          'text-left px-3 py-2 text-sm rounded-lg transition-colors',
          canDownload
            ? 'text-asgard-text-primary hover:bg-asgard-surface-alt'
            : 'text-asgard-text-muted cursor-not-allowed'
        )}
      >
        {canDownload ? label : t('chat.fileNotAvailable')}
      </button>
    </motion.div>
  )
}

// ─── Save Button ──────────────────────────────────────────────────────────────

const SaveButton: React.FC<{ onClick: (e: React.MouseEvent) => void }> = ({ onClick }) => {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-lg bg-asgard-surface-alt hover:bg-asgard-border transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      title={t('chat.saveAs')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-secondary">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
    </button>
  )
}

// ─── Image ───────────────────────────────────────────────────────────────────

const ImageAttachment: React.FC<{
  attachment: MessageAttachment
  onClick: () => void
  onSave: (e: React.MouseEvent) => void
  loading: boolean
  progress: number | null
}> = ({ attachment, onClick, onSave, loading, progress }) => {
  const { t } = useTranslation()
  // MEDIA SETTINGS (autoPlayGifs): GIFs play inline when enabled; when disabled
  // the static thumbnail is preferred — clicking opens the animated lightbox.
  const mediaSettings = useUIStore((s) => s.settings.media)
  const isGif = /\.gif$/i.test(attachment.name ?? '')
  // Une URL `blob:` d'une session précédente ne résout plus : elle est écartée
  // ici, la miniature (URL `data:` autonome) prend le relais.
  const liveUrl = fileService.isLiveUrl(attachment.localUrl) ? (attachment.localUrl as string) : null
  const primary = isGif
    ? (mediaSettings.autoPlayGifs && liveUrl ? liveUrl : (attachment.thumbnail || liveUrl))
    : (attachment.thumbnail || liveUrl)
  // Repli: une source qui ne décode pas (miniature corrompue, URL périmée,
  // webp non pris en charge) bascule sur l'autre support local avant d'être
  // déclarée indisponible — l'icône d'image cassée du navigateur n'est jamais
  // laissée à l'écran.
  const alternate = [liveUrl, attachment.thumbnail].find((u) => !!u && u !== primary) ?? null
  const [useAlternate, setUseAlternate] = useState(false)
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    // Un changement de support (guérison de l'URL, miniature reçue après coup)
    // repart de la source principale.
    setUseAlternate(false)
    setBroken(false)
  }, [primary, alternate])
  const src = useAlternate && alternate ? alternate : primary
  const handleImgError = () => {
    if (!useAlternate && alternate) setUseAlternate(true)
    else setBroken(true)
  }

  // Keyboard parity: the picture is a button, so Enter/Space must open it too.
  const openKeyHandlers = {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
  }

  if (!src || broken) {
    // Aucun pixel affichable : tuile discrète et toujours cliquable, l'ouverture
    // de la visionneuse tentera de relire l'original et expliquera l'échec.
    return (
      <div
        {...openKeyHandlers}
        className="w-48 h-48 bg-asgard-surface-alt rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-asgard-border transition-colors"
        title={t('lightbox.open')}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
        </svg>
        <p className="text-xxs text-asgard-text-muted truncate max-w-[10rem]">{attachment.name}</p>
      </div>
    )
  }

  return (
    <div
      {...openKeyHandlers}
      className="relative rounded-xl overflow-hidden max-w-[280px] group focus:outline-none focus-visible:ring-2 focus-visible:ring-asgard-glacier"
      style={{ cursor: 'zoom-in' }}
      title={t('lightbox.open')}
    >
      <img
        src={src}
        alt={attachment.name}
        className="max-w-full h-auto rounded-xl object-contain"
        // `cover` rognait les photos très allongées dès que la boîte était
        // bornée par `maxHeight` : la bulle doit montrer le cadre entier.
        style={{ maxHeight: '300px' }}
        draggable={false}
        onError={handleImgError}
      />
      {/* Zoom affordance: without it nothing hints that the picture opens. */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity pointer-events-none bg-black/10">
        <span className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/>
          </svg>
        </span>
      </div>
      {loading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {/* Progress bar for transfers in progress */}
      {progress !== null && progress < 100 && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/40">
          <ProgressBar progress={progress} />
          <p className="text-xxs text-asgard-text-primary mt-1">
            {progress < 0 ? t('chat.receiving') : `${progress}%`}
          </p>
        </div>
      )}
      {/* Save button on hover */}
      {attachment.blobKey && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <SaveButton onClick={onSave} />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-xs text-white truncate">{attachment.name}</p>
      </div>
    </div>
  )
}

// ─── Video ───────────────────────────────────────────────────────────────────

const VideoAttachment: React.FC<{
  attachment: MessageAttachment
  onClick: () => void
  onSave: (e: React.MouseEvent) => void
  loading: boolean
  progress: number | null
}> = ({ attachment, onClick, onSave, loading, progress }) => {
  const { t } = useTranslation()
  // MEDIA SETTINGS: native controls, autoplay and default mute for videos.
  // Note: browsers only honor autoplay when the video starts muted — with
  // muteByDefault off the user simply presses play (controls are shown).
  const mediaSettings = useUIStore((s) => s.settings.media)
  if (!fileService.isLiveUrl(attachment.localUrl)) {
    // Lecteur vidéo jamais monté sur une URL morte (message restauré après un
    // redémarrage) : on garde la vignette « charger », l'effet de guérison du
    // parent remplace la référence périmée et ce bloc se re-rend de lui-même.
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-3 bg-asgard-surface-alt rounded-xl px-3 py-2.5 hover:bg-asgard-surface-alt transition-colors"
      >
        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-purple-400">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-asgard-text-primary truncate">{attachment.name}</p>
          <p className="text-xs text-asgard-text-muted">{formatSize(attachment.size)}</p>
        </div>
        {loading && <div className="w-4 h-4 border-2 border-asgard-glacier border-t-transparent rounded-full animate-spin" />}
      </button>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden max-w-[320px] group relative">
      <video
        src={attachment.localUrl}
        // MEDIA SETTINGS: controls / autoplay / default mute
        controls={mediaSettings.showVideoControls}
        autoPlay={mediaSettings.autoPlayVideos}
        muted={mediaSettings.muteByDefault}
        className="max-w-full rounded-xl"
        style={{ maxHeight: '240px' }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {progress !== null && progress < 100 && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/40">
          <ProgressBar progress={progress} />
          <p className="text-xxs text-asgard-text-primary mt-1">
            {progress < 0 ? t('chat.receiving') : `${progress}%`}
          </p>
        </div>
      )}
      {attachment.blobKey && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <SaveButton onClick={onSave} />
        </div>
      )}
    </div>
  )
}

// ─── Audio ───────────────────────────────────────────────────────────────────

/**
 * Un seul extrait joué à la fois : démarrer un lecteur met en pause celui qui
 * jouait déjà. Sans cette registry de module, deux messages audio entendables
 * se chevauchent dès qu'on lance le second sans avoir arrêté le premier.
 */
let activeAudioElement: HTMLAudioElement | null = null

const AudioAttachment: React.FC<{
  attachment: MessageAttachment
  onSave: (e: React.MouseEvent) => void
  /** Récupère le fichier local et publie son URL (voir `handleAudioFetch`). */
  onFetch: () => Promise<void> | void
  /** Le bouton « supprimer » du parent est posé en surimpression en haut à droite. */
  reserveDeleteSpace: boolean
}> = ({ attachment, onSave, onFetch, reserveDeleteSpace }) => {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [current, setCurrent] = useState(0)
  const [fetching, setFetching] = useState(false)

  // Même règle que la vidéo : une URL `blob:` héritée d'une session précédente
  // ne joue pas. Et un fichier jamais reçu n'a pas d'URL du tout. Dans ces deux
  // cas on propose le rechargement plutôt qu'un lecteur muet.
  const src = fileService.isLiveUrl(attachment.localUrl) ? attachment.localUrl : null
  const knownDuration = typeof attachment.duration === 'number' && attachment.duration > 0 ? attachment.duration : 0
  const [duration, setDuration] = useState(knownDuration)

  useEffect(() => {
    const el = audioRef.current
    return () => {
      // Le message part (suppression, changement de conversation) : le fichier
      // ne doit pas continuer à jouer hors écran.
      el?.pause()
      if (activeAudioElement === el) activeAudioElement = null
    }
  }, [])

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      activeAudioElement?.pause()
      activeAudioElement = el
      // Deux rejets sont transitoires et ne disent rien de l'état du fichier : `AbortError`
      // quand `pause()` arrive avant la fin du chargement (cas de ce lecteur mis en
      // pause par la reprise du slot unique), `NotAllowedError` quand la politique
      // d'autoplay du navigateur refuse sans geste. Les deux gardent le lecteur.
      el.play().catch((err: unknown) => {
        setPlaying(false)
        const name = err instanceof DOMException ? err.name : ''
        if (name !== 'AbortError' && name !== 'NotAllowedError') setFailed(true)
      })
    } else {
      el.pause()
    }
  }

  const seek = (value: number) => {
    const el = audioRef.current
    setCurrent(value)
    if (el) el.currentTime = value
  }

  const playable = !!src && !failed
  const total = duration || knownDuration
  const percent = total > 0 ? Math.min(100, (current / total) * 100) : 0
  const ext = (attachment.name?.split('.').pop() || (attachment.type === 'voice' ? 'voice' : 'audio')).slice(0, 4).toUpperCase()
  const label = playing ? t('chat.pauseAudio') : t('chat.playAudio')

  return (
    <div className={cn(
      // Même pastille des deux côtés : le widget se lit comme un lecteur posé sur la
      // bulle, et les tokens du thème restent lisibles en thème sombre comme en clair
      // (un voile blanc sur bulle claire rendait la durée illisible).
      'group relative flex w-full max-w-[300px] min-w-[190px] flex-col gap-1.5 rounded-xl',
      'border border-asgard-border bg-asgard-surface-alt px-2.5 py-2',
      // Le bouton « supprimer » du parent est en surimpression en haut à droite : on
      // réserve sa largeur pour qu'il n'écrase ni la piste ni la durée.
      reserveDeleteSpace && 'pr-10',
    )}>
      {playable ? (
        <>
          <audio
            ref={audioRef}
            src={src}
            preload="metadata"
            className="hidden"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration
              if (Number.isFinite(d) && d > 0) setDuration(d)
            }}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); setCurrent(0) }}
            onError={() => { setFailed(true); setPlaying(false) }}
            onContextMenu={(e) => e.preventDefault()}
          />
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggle}
              aria-label={label}
              title={label}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-asgard-glacier text-asgard-deep-black transition-transform hover:scale-105 active:scale-95"
            >
              {playing ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            {/* Piste de progression : la partie déjà écoutée est teintée, le pouce
                suit, et la barre reste utilisable au clavier (flèches). */}
            <input
              type="range"
              min={0}
              max={total || 0}
              step={0.1}
              value={Math.min(current, total || 0)}
              disabled={total <= 0}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label={t('chat.audioPosition')}
              className="audio-scrub h-1.5 w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-full outline-none disabled:cursor-default"
              style={{
                // Partie écoutée = accent du thème, reste de la piste = texte atténué :
                // les deux tiennent sur n'importe quel fond, sans variante de thème.
                background: `linear-gradient(to right, rgb(var(--asgard-glacier)) ${percent}%, rgb(var(--asgard-text-primary) / 0.18) ${percent}%)`,
              }}
            />
            {attachment.blobKey && <SaveButton onClick={onSave} />}
          </div>
          <div className="flex items-baseline justify-between gap-2 text-xxs text-asgard-text-secondary">
            {/* Ni nom ni miniature ici : le nom est déjà le texte du message, et
                répéter « hello.ogg » ne fait que charger la bulle. */}
            <span className="truncate tracking-wide">{ext} · {formatSize(attachment.size)}</span>
            <span className="flex-shrink-0 tabular-nums">
              {formatDuration(total > 0 ? current : 0)} / {formatDuration(total)}
            </span>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setFetching(true)
            void Promise.resolve(onFetch()).finally(() => setFetching(false))
          }}
          disabled={fetching}
          aria-label={t('chat.downloadFile')}
          title={t('chat.downloadFile')}
          className={cn('flex items-center gap-2.5 text-left', fetching && 'opacity-60')}
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-asgard-glacier/15">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
              <path d="M12 14a2 2 0 0 0 2-2V6a2 2 0 1 0-4 0v6a2 2 0 0 0 2 2zm5-2a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12z"/>
            </svg>
          </span>
          <span className="flex-1 text-xxs text-asgard-text-secondary">
            {ext} · {formatSize(attachment.size)}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0 text-asgard-glacier">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
        </button>
      )}
    </div>
  )
}

// ─── Document ────────────────────────────────────────────────────────────────

const DocumentAttachment: React.FC<{
  attachment: MessageAttachment
  onClick: () => void
  onSave: (e: React.MouseEvent) => void
  loading: boolean
  error: boolean
  progress: number | null
}> = ({ attachment, onClick, onSave, loading, error, progress }) => {
  const { t } = useTranslation()
  const ext = attachment.name?.split('.').pop()?.toUpperCase() || 'FILE'
  const isTransferring = progress !== null && progress !== 100
  const isIndeterminate = progress !== null && progress < 0

  return (
    <div className="flex flex-col gap-1.5 max-w-[280px]">
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className="flex items-center gap-3 bg-asgard-surface-alt rounded-xl px-3 py-2.5 hover:bg-asgard-surface-alt transition-colors"
      >
        <div className="w-10 h-10 rounded-lg bg-asgard-nordic/20 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-asgard-glacier">{ext}</span>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm text-asgard-text-primary truncate">{attachment.name}</p>
          <p className="text-xs text-asgard-text-muted">
            {isIndeterminate
              ? `${formatSize(attachment.size)} — ${t('chat.receiving')}`
              : isTransferring
              ? `${formatSize(attachment.size)} — ${progress}%`
              : formatSize(attachment.size)}
          </p>
          {isTransferring && (
            <div className="mt-1.5">
              <ProgressBar progress={progress ?? 0} />
            </div>
          )}
        </div>
        {loading && <div className="w-4 h-4 border-2 border-asgard-glacier border-t-transparent rounded-full animate-spin flex-shrink-0" />}
        {error && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-busy flex-shrink-0">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
        )}
        {attachment.blobKey && !loading && !isTransferring && (
          <SaveButton onClick={onSave} />
        )}
      </motion.button>
    </div>
  )
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  const safeBytes = bytes ?? 0
  if (safeBytes < 1024) return `${safeBytes} B`
  if (safeBytes < 1024 * 1024) return `${(safeBytes / 1024).toFixed(1)} KB`
  if (safeBytes < 1024 * 1024 * 1024) return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(safeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
