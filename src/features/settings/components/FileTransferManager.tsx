import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'
import { fileService } from '@/services/FileService'

interface FileTransfer {
  id: string
  fileName: string
  fileSize: number
  progress: number
  status: 'uploading' | 'downloading' | 'complete' | 'error'
  type: 'image' | 'video' | 'audio' | 'document' | 'voice'
}

/**
 * FileTransferManager — displays active file transfers with progress and controls.
 */
export const FileTransferManager: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { t } = useTranslation()
  const [transfers, setTransfers] = useState<FileTransfer[]>([])
  const [filter, setFilter] = useState<'all' | 'uploading' | 'downloading' | 'complete' | 'error'>('all')

  useEffect(() => {
    loadTransfers()
    const interval = setInterval(loadTransfers, 500)
    return () => clearInterval(interval)
  }, [])

  const loadTransfers = () => {
    const activeTransfers = fileService.getTransfers()
    setTransfers(activeTransfers as FileTransfer[])
  }

  const handleCancel = (transferId: string) => {
    fileService.cancelTransfer(transferId)
    loadTransfers()
  }

  const handleRetry = (transferId: string) => {
    fileService.retryTransfer(transferId)
    loadTransfers()
  }

  const filteredTransfers = filter === 'all'
    ? transfers
    : transfers.filter((t) => t.status === filter)

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-purple-400">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
        )
      case 'video':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-red-400">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
          </svg>
        )
      case 'audio':
      case 'voice':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-green-400">
            <path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/>
          </svg>
        )
      default:
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-blue-400">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
          </svg>
        )
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploading':
        return 'text-blue-400'
      case 'downloading':
        return 'text-cyan-400'
      case 'complete':
        return 'text-green-400'
      case 'error':
        return 'text-red-400'
      default:
        return 'text-asgard-text-muted'
    }
  }

  const stats = {
    total: transfers.length,
    uploading: transfers.filter((t) => t.status === 'uploading').length,
    downloading: transfers.filter((t) => t.status === 'downloading').length,
    complete: transfers.filter((t) => t.status === 'complete').length,
    error: transfers.filter((t) => t.status === 'error').length,
  }

  return (
    <div className="flex flex-col h-full bg-asgard-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-asgard-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-cyan-400">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-asgard-text-primary">{t('settings.fileTransfers')}</h2>
            <p className="text-xs text-asgard-text-muted">
              {stats.uploading} {t('settings.uploading')} · {stats.downloading} {t('settings.downloading')} · {stats.complete} {t('settings.complete')}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-asgard-surface-alt transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-secondary">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="px-6 py-3 border-b border-asgard-border">
        <div className="flex gap-2">
          {(['all', 'uploading', 'downloading', 'complete', 'error'] as const).map((f) => {
            const filterLabels: Record<typeof f, string> = {
              all: t('settings.transfer_all'),
              uploading: t('settings.transfer_uploading'),
              downloading: t('settings.transfer_downloading'),
              complete: t('settings.transfer_complete'),
              error: t('settings.transfer_error'),
            }
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
                  filter === f
                    ? 'bg-asgard-glacier/20 text-asgard-glacier'
                    : 'text-asgard-text-muted hover:text-asgard-text-secondary hover:bg-asgard-surface-alt'
                )}
              >
                {filterLabels[f]} {f !== 'all' && `(${stats[f]})`}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {filteredTransfers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-asgard-surface-alt flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
            </div>
            <p className="text-sm text-asgard-text-secondary mb-1">{t('settings.noTransfers')}</p>
            <p className="text-xs text-asgard-text-muted">
              {t('settings.transfersWillAppearHere')}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <AnimatePresence>
              {filteredTransfers.map((transfer) => (
                <motion.div
                  key={transfer.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-4 rounded-xl bg-asgard-surface-alt border border-asgard-border"
                >
                  <div className="flex items-start gap-3">
                    {/* File icon */}
                    <div className="w-10 h-10 rounded-lg bg-asgard-surface-alt flex items-center justify-center flex-shrink-0">
                      {getFileIcon(transfer.type)}
                    </div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-asgard-text-primary truncate mb-1">
                        {transfer.fileName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-asgard-text-muted">
                        <span>{formatBytes(transfer.fileSize)}</span>
                        <span>·</span>
                        <span className={getStatusColor(transfer.status)}>
                          {({
                            uploading: t('settings.transferStatus_uploading'),
                            downloading: t('settings.transferStatus_downloading'),
                            complete: t('settings.transferStatus_complete'),
                            error: t('settings.transferStatus_error'),
                          } as const)[transfer.status]}
                        </span>
                      </div>

                      {/* Progress bar */}
                      {(transfer.status === 'uploading' || transfer.status === 'downloading') && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-asgard-text-muted">{t('common.progress')}</span>
                            <span className="text-asgard-text-secondary">{Math.round(transfer.progress)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-asgard-border rounded-full overflow-hidden">
                            <motion.div
                              className={cn(
                                'h-full rounded-full',
                                transfer.status === 'uploading' ? 'bg-blue-400' : 'bg-cyan-400'
                              )}
                              initial={{ width: 0 }}
                              animate={{ width: `${transfer.progress}%` }}
                              transition={{ duration: 0.3, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Error message */}
                      {transfer.status === 'error' && (
                        <p className="mt-2 text-xs text-red-400">
                          {t('settings.transferFailed')}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {(transfer.status === 'uploading' || transfer.status === 'downloading') && (
                        <button
                          onClick={() => handleCancel(transfer.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-asgard-text-muted hover:text-red-400 transition-colors"
                          title={t('common.cancel')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                          </svg>
                        </button>
                      )}
                      {transfer.status === 'error' && (
                        <button
                          onClick={() => handleRetry(transfer.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-asgard-glacier/10 text-asgard-text-muted hover:text-asgard-glacier transition-colors"
                          title={t('common.retry')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer stats */}
      {filteredTransfers.length > 0 && (
        <div className="px-6 py-3 border-t border-asgard-border bg-asgard-surface-alt">
          <div className="flex items-center justify-between text-xs text-asgard-text-muted">
            <span>{t('settings.totalTransfers', { count: stats.total })}</span>
            {stats.error > 0 && (
              <span className="text-red-400">{t('settings.failedTransfers', { count: stats.error })}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
