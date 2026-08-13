import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'
import { fileService } from '@/services/FileService'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'
import type { MessageAttachment } from '@/types'

interface FileAttachmentProps {
  attachment: MessageAttachment
  isOwn: boolean
  messageId?: string
  conversationId?: string
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
  const progressInterval = useRef<ReturnType<typeof setInterval>>()

  const deleteFileAttachment = useMessageStore((s) => s.deleteFileAttachment)
  const addToast = useUIStore((s) => s.addToast)

  // Poll transfer progress for both send and receive
  // CRITICAL: all hooks must run before any early return.
  useEffect(() => {
    const checkProgress = () => {
      // Check send transfers
      const transfers = fileService.getTransfers()
      const transfer = transfers.find((t) => t.fileName === attachment.name)
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
    if (attachment.localUrl) {
      if (attachment.type === 'image') {
        // For images, open in new tab to view full size, or save if user prefers
        window.open(attachment.localUrl, '_blank')
        return
      }
      window.open(attachment.localUrl, '_blank')
      return
    }

    setLoading(true)
    try {
      await fileService.downloadFile(attachment)
    } catch {
      setError(true)
    }
    setLoading(false)
  }

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
        return <AudioAttachment attachment={attachment} isOwn={isOwn} onSave={handleSaveAs} />
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
}> = ({ attachment, onSave, loading, progress }) => {
  const { t } = useTranslation()
  const src = attachment.thumbnail || attachment.localUrl

  if (!src && !attachment.thumbnail) {
    return (
      <div className="w-48 h-48 bg-asgard-surface-alt rounded-xl flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
        </svg>
      </div>
    )
  }

  return (
    <div className="relative rounded-xl overflow-hidden max-w-[280px] cursor-pointer group">
      <img
        src={src}
        alt={attachment.name}
        className="max-w-full h-auto rounded-xl"
        style={{ maxHeight: '300px', objectFit: 'cover' }}
      />
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
  if (!attachment.localUrl) {
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
        controls
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

const AudioAttachment: React.FC<{
  attachment: MessageAttachment
  isOwn: boolean
  onSave: (e: React.MouseEvent) => void
}> = ({ attachment, isOwn, onSave }) => {
  const src = attachment.localUrl

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl px-3 py-2 min-w-[200px]',
      isOwn ? 'bg-asgard-border' : 'bg-black/20'
    )}>
      {src ? (
        <>
          <audio src={src} controls className="h-8 flex-1" onContextMenu={(e) => e.preventDefault()} />
          {attachment.blobKey && <SaveButton onClick={onSave} />}
        </>
      ) : (
        <>
          <button
            onClick={() => fileService.downloadFile(attachment)}
            className="w-8 h-8 rounded-full bg-asgard-nordic/30 flex items-center justify-center flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <div className="flex-1">
            <div className="h-1 bg-asgard-border rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-asgard-glacier/40 rounded-full" />
            </div>
          </div>
          <span className="text-xxs text-asgard-text-muted">
            {attachment.duration ? formatDuration(attachment.duration) : formatSize(attachment.size)}
          </span>
        </>
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
