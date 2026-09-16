import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'
import { fileService } from '@/services/FileService'

/**
 * ActiveTransfersWidget — floating widget showing all active file transfers.
 * Displays progress bars, speed, ETA for both uploads and downloads.
 * Supports multiple simultaneous transfers with a collapsible view.
 *
 * Holepunch/Keet pattern: real-time transfer visibility so users always
 * know the status of their files in transit.
 */

interface TransferInfo {
  id: string
  fileName: string
  fileSize: number
  progress: number
  status: 'uploading' | 'downloading' | 'complete' | 'error'
  type: 'image' | 'video' | 'audio' | 'document' | 'voice'
  direction: 'send' | 'receive'
  speed: number // bytes per second
  transferredBytes: number
  startedAt: number
}

export const ActiveTransfersWidget: React.FC = () => {
  const { t } = useTranslation()
  const [transfers, setTransfers] = useState<TransferInfo[]>([])
  const [isExpanded, setIsExpanded] = useState(true)
  const prevProgressRef = useRef<Map<string, { progress: number; timestamp: number }>>(new Map())

  useEffect(() => {
    const updateTransfers = () => {
      const activeTransfers = fileService.getTransfers()
      const now = Date.now()

      // le paramètre s'appelait `t` : il masquait la fonction de traduction du
      // composant, donc aucun libellé n'aurait pu être traduit dans ce corps
      const mapped: TransferInfo[] = activeTransfers
        .filter(transfer => transfer.status === 'uploading' || transfer.status === 'downloading')
        .map(transfer => {
          // Calculate speed based on progress delta
          const prev = prevProgressRef.current.get(transfer.id)
          let speed = 0
          if (prev && prev.progress < transfer.progress) {
            const elapsed = (now - prev.timestamp) / 1000 // seconds
            const bytesDelta = (transfer.progress - prev.progress) / 100 * transfer.fileSize
            if (elapsed > 0) speed = bytesDelta / elapsed
          }
          prevProgressRef.current.set(transfer.id, { progress: transfer.progress, timestamp: now })

          return {
            id: transfer.id,
            fileName: transfer.fileName,
            fileSize: transfer.fileSize,
            progress: transfer.progress,
            status: transfer.status,
            type: transfer.type || 'document',
            direction: 'send' as const,
            speed,
            transferredBytes: Math.round(transfer.progress / 100 * transfer.fileSize),
            startedAt: now - (transfer.progress > 0 ? (100 - transfer.progress) * transfer.fileSize / (speed || 1) / 100 : 0),
          }
        })

      // Also check receive buffers for incoming transfers
      const activeReceives = fileService.getActiveReceives()
      for (const recv of activeReceives) {
        const progress = recv.progress
        const prev = prevProgressRef.current.get(recv.transferId)
        let speed = 0
        if (prev && prev.progress < progress) {
          const elapsed = (now - prev.timestamp) / 1000
          const bytesDelta = (progress - prev.progress) / 100 * recv.fileSize
          if (elapsed > 0) speed = bytesDelta / elapsed
        }
        prevProgressRef.current.set(recv.transferId, { progress, timestamp: now })

        // Avoid duplicates
        if (!mapped.find(entry => entry.id === recv.transferId)) {
          mapped.push({
            id: recv.transferId,
            fileName: recv.fileName,
            fileSize: recv.fileSize,
            progress,
            status: 'downloading',
            type: (recv.type as TransferInfo['type']) || 'document',
            direction: 'receive',
            speed,
            transferredBytes: Math.round(progress / 100 * recv.fileSize),
            startedAt: now,
          })
        }
      }

      setTransfers(mapped)

      // Clean up old entries from prevProgressRef
      const activeIds = new Set(mapped.map(entry => entry.id))
      for (const key of prevProgressRef.current.keys()) {
        if (!activeIds.has(key)) prevProgressRef.current.delete(key)
      }
    }

    const unsubscribe = fileService.subscribeTransfers(updateTransfers)
    updateTransfers()
    const interval = setInterval(updateTransfers, 400)
    return () => {
      unsubscribe()
      clearInterval(interval)
      prevProgressRef.current.clear()
    }
  }, [])

  if (transfers.length === 0) return null

  const totalProgress = transfers.length > 0
    ? Math.round(transfers.reduce((sum, transfer) => sum + transfer.progress, 0) / transfers.length)
    : 0

  const totalSpeed = transfers.reduce((sum, transfer) => sum + transfer.speed, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: 20, height: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mx-3 mb-2"
    >
      <div className="mica-card border border-asgard-border/60 rounded-2xl overflow-hidden shadow-lg shadow-black/10">
        {/* Header — always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-asgard-surface-alt/50 transition-colors"
        >
          {/* Transfer icon with pulse */}
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-asgard-glacier/15 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                {transfers.some(transfer => transfer.direction === 'send') ? (
                  <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
                ) : (
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                )}
              </svg>
            </div>
            {/* Pulse indicator */}
            <motion.div
              animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-asgard-glacier"
            />
          </div>

          {/* Summary */}
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-asgard-text-primary truncate">
                {transfers.length === 1
                  ? (transfers[0].direction === 'send'
                    ? t('chat.sendingFile')
                    : t('chat.receivingFile'))
                  : t('chat.transfersActive', { count: transfers.length })
                }
              </p>
              <span className="text-xs font-medium text-asgard-glacier flex-shrink-0">
                {totalProgress}%
              </span>
            </div>
            {/* Overall progress bar */}
            <div className="mt-1.5 h-1.5 bg-asgard-border/50 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-asgard-glacier to-asgard-nordic"
                animate={{ width: `${totalProgress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Speed + expand toggle */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {totalSpeed > 0 && (
              <span className="text-xs text-asgard-text-muted">
                {formatSpeed(totalSpeed)}
              </span>
            )}
            <motion.svg
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
              className="text-asgard-text-muted"
            >
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
            </motion.svg>
          </div>
        </button>

        {/* Expanded transfer list */}
        <AnimatePresence>
          {isExpanded && transfers.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t border-asgard-border/30 divide-y divide-asgard-border/20 max-h-64 overflow-y-auto">
                {transfers.map((transfer) => (
                  <TransferItem key={transfer.id} transfer={transfer} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ─── Individual Transfer Item ──────────────────────────────────────────────────

const TransferItem: React.FC<{ transfer: TransferInfo }> = ({ transfer }) => {
  const { t } = useTranslation()
  const ext = transfer.fileName.split('.').pop()?.toUpperCase() || ''
  const isImage = transfer.type === 'image'
  const isVideo = transfer.type === 'video'
  const isAudio = transfer.type === 'audio' || transfer.type === 'voice'

  const eta = transfer.speed > 0 && transfer.progress < 100
    ? Math.round((transfer.fileSize - transfer.transferredBytes) / transfer.speed)
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="flex items-center gap-3 px-4 py-2.5"
    >
      {/* File type icon */}
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
        isImage ? 'bg-green-500/15' :
        isVideo ? 'bg-purple-500/15' :
        isAudio ? 'bg-orange-500/15' :
        'bg-asgard-nordic/15'
      )}>
        {isImage ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-green-400">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
        ) : isVideo ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-purple-400">
            <path d="M8 5v14l11-7z"/>
          </svg>
        ) : isAudio ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-orange-400">
            <path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/>
          </svg>
        ) : (
          <span className="text-xs font-bold text-asgard-glacier">{ext.slice(0, 4)}</span>
        )}
      </div>

      {/* File info + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-asgard-text-primary truncate font-medium">
            {transfer.fileName}
          </p>
          <span className="text-xxs text-asgard-text-muted flex-shrink-0">
            {formatBytes(transfer.fileSize)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-asgard-border/40 rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                transfer.status === 'error' ? 'bg-red-500' :
                transfer.progress >= 100 ? 'bg-green-500' :
                transfer.direction === 'send'
                  ? 'bg-gradient-to-r from-asgard-glacier to-asgard-nordic'
                  : 'bg-gradient-to-r from-green-400 to-emerald-500'
              )}
              animate={{ width: `${Math.min(transfer.progress, 100)}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <span className={cn(
            'text-xxs font-medium flex-shrink-0 tabular-nums w-9 text-right',
            transfer.progress >= 100 ? 'text-green-400' : 'text-asgard-text-secondary'
          )}>
            {Math.min(transfer.progress, 100)}%
          </span>
        </div>

        {/* Speed + ETA */}
        <div className="mt-0.5 flex items-center gap-3">
          {transfer.speed > 0 && (
            <span className="text-xxs text-asgard-text-muted">
              {formatSpeed(transfer.speed)}
            </span>
          )}
          {eta > 0 && (
            <span className="text-xxs text-asgard-text-muted">
              {formatETA(eta)}
            </span>
          )}
          <span className="text-xxs text-asgard-text-muted">
            {transfer.direction === 'send'
              ? t('chat.sending')
              : t('chat.receiving')
            }
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `~${m}:${s.toString().padStart(2, '0')}`
}
