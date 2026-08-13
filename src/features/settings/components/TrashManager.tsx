import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'
import { fileService } from '@/services/FileService'

interface TrashEntry {
  blobKey: string
  deletedAt: number
  expiresAt: number
}

/**
 * TrashManager — manages deleted files with restore and permanent delete options.
 */
export const TrashManager: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { t } = useTranslation()
  const [trashItems, setTrashItems] = useState<TrashEntry[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showConfirmEmpty, setShowConfirmEmpty] = useState(false)

  useEffect(() => {
    loadTrash()
  }, [])

  const loadTrash = () => {
    const items = fileService.getTrashBin()
    setTrashItems(items)
  }

  const handleRestore = (blobKey: string) => {
    fileService.restoreFromTrash(blobKey)
    loadTrash()
    setSelectedItems((prev) => {
      const next = new Set(prev)
      next.delete(blobKey)
      return next
    })
  }

  const handlePermanentDelete = (blobKey: string) => {
    fileService.permanentDelete(blobKey)
    loadTrash()
    setSelectedItems((prev) => {
      const next = new Set(prev)
      next.delete(blobKey)
      return next
    })
  }

  const handleEmptyTrash = () => {
    fileService.emptyTrash()
    loadTrash()
    setSelectedItems(new Set())
    setShowConfirmEmpty(false)
  }

  const handleSelectAll = () => {
    if (selectedItems.size === trashItems.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(trashItems.map((item) => item.blobKey)))
    }
  }

  const handleBulkRestore = () => {
    selectedItems.forEach((blobKey) => {
      fileService.restoreFromTrash(blobKey)
    })
    loadTrash()
    setSelectedItems(new Set())
  }

  const handleBulkDelete = () => {
    selectedItems.forEach((blobKey) => {
      fileService.permanentDelete(blobKey)
    })
    loadTrash()
    setSelectedItems(new Set())
  }

  const formatTimeRemaining = (expiresAt: number) => {
    const now = Date.now()
    const remaining = expiresAt - now
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    if (days > 0) return t('time.remainingDaysHours', { days, hours })
    return t('time.remainingHours', { hours })
  }

  const stats = fileService.getTrashStats()

  return (
    <div className="flex flex-col h-full bg-asgard-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-asgard-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-red-400">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-asgard-text-primary">{t('settings.trash')}</h2>
            <p className="text-xs text-asgard-text-muted">
              {t('settings.trashItems', { count: trashItems.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {trashItems.length > 0 && (
            <>
              <button
                onClick={handleSelectAll}
                className="px-3 py-1.5 text-xs text-asgard-text-secondary hover:text-asgard-text-primary bg-asgard-surface-alt hover:bg-asgard-surface-alt rounded-lg transition-colors"
              >
                {selectedItems.size === trashItems.length ? t('settings.deselectAll') : t('settings.selectAll')}
              </button>
              {selectedItems.size > 0 && (
                <>
                  <button
                    onClick={handleBulkRestore}
                    className="px-3 py-1.5 text-xs text-asgard-glacier bg-asgard-glacier/10 hover:bg-asgard-glacier/20 rounded-lg transition-colors"
                  >
                    {t('settings.restore')} ({selectedItems.size})
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-3 py-1.5 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                  >
                    {t('common.delete')} ({selectedItems.size})
                  </button>
                </>
              )}
              <button
                onClick={() => setShowConfirmEmpty(true)}
                className="px-3 py-1.5 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
              >
                {t('settings.emptyTrash')}
              </button>
            </>
          )}
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {trashItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-asgard-surface-alt flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </div>
            <p className="text-sm text-asgard-text-secondary mb-1">{t('settings.noTrash')}</p>
            <p className="text-xs text-asgard-text-muted">{t('settings.deletedFilesWillAppearHere')}</p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            <AnimatePresence>
              {trashItems.map((item) => (
                <motion.div
                  key={item.blobKey}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                    selectedItems.has(item.blobKey)
                      ? 'bg-asgard-glacier/10 border-asgard-glacier/30'
                      : 'bg-asgard-surface-alt border-asgard-border hover:bg-asgard-surface-alt'
                  )}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => {
                      setSelectedItems((prev) => {
                        const next = new Set(prev)
                        if (next.has(item.blobKey)) {
                          next.delete(item.blobKey)
                        } else {
                          next.add(item.blobKey)
                        }
                        return next
                      })
                    }}
                    className={cn(
                      'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors',
                      selectedItems.has(item.blobKey)
                        ? 'bg-asgard-glacier border-asgard-glacier'
                        : 'border-asgard-border hover:border-asgard-text-muted'
                    )}
                  >
                    {selectedItems.has(item.blobKey) && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    )}
                  </button>

                  {/* File icon */}
                  <div className="w-10 h-10 rounded-lg bg-asgard-surface-alt flex items-center justify-center flex-shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted">
                      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                    </svg>
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-asgard-text-primary truncate font-mono">
                      {item.blobKey.slice(0, 16)}...
                    </p>
                    <p className="text-xs text-asgard-text-muted">
                      {t('settings.deletedAt')}: {new Date(item.deletedAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Time remaining */}
                  <div className="text-xs text-asgard-text-muted">
                    {formatTimeRemaining(item.expiresAt)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleRestore(item.blobKey)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-asgard-glacier/10 text-asgard-text-muted hover:text-asgard-glacier transition-colors"
                      title={t('settings.restore')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(item.blobKey)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-asgard-text-muted hover:text-red-400 transition-colors"
                      title={t('settings.deletePermanently')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer stats */}
      {trashItems.length > 0 && (
        <div className="px-6 py-3 border-t border-asgard-border bg-asgard-surface-alt">
          <p className="text-xs text-asgard-text-muted">
            {t('settings.trashItemsCount', { count: stats.count })}
          </p>
        </div>
      )}

      {/* Confirm empty dialog */}
      <AnimatePresence>
        {showConfirmEmpty && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowConfirmEmpty(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="mica-card border border-asgard-border rounded-2xl p-6 max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-asgard-text-primary mb-2">
                {t('settings.emptyTrashConfirm')}
              </h3>
              <p className="text-sm text-asgard-text-secondary mb-4">
                {t('settings.emptyTrashWarning', { count: trashItems.length })}
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowConfirmEmpty(false)}
                  className="px-4 py-2 text-sm text-asgard-text-secondary hover:text-asgard-text-primary transition-colors rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleEmptyTrash}
                  className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                >
                  {t('settings.emptyTrash')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
