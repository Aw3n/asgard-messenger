import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'

interface FileTransferProgressProps {
  fileName: string
  fileSize: number
  progress: number
  status: 'uploading' | 'downloading' | 'complete' | 'error'
  onCancel?: () => void
}

/**
 * FileTransferProgress — displays a progress bar for file transfers.
 */
export const FileTransferProgress: React.FC<FileTransferProgressProps> = ({
  fileName,
  fileSize,
  progress,
  status,
  onCancel,
}) => {
  const { t } = useTranslation()
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center gap-3 bg-asgard-surface/80 border border-asgard-border/30 rounded-xl px-3 py-2.5"
    >
      {/* File icon */}
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
        status === 'error' ? 'bg-red-500/20' : 'bg-asgard-nordic/20'
      )}>
        {status === 'error' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-busy">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-asgard-text-primary truncate mb-1">{fileName}</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-asgard-border rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                status === 'error' ? 'bg-red-500' :
                status === 'complete' ? 'bg-green-500' :
                'bg-asgard-glacier'
              )}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-xxs text-asgard-text-muted flex-shrink-0">
            {status === 'complete' ? formatSize(fileSize) :
             status === 'error' ? t('common.failed') :
             `${progress}%`}
          </span>
        </div>
      </div>

      {/* Cancel button */}
      {status !== 'complete' && onCancel && (
        <button
          onClick={onCancel}
          className="flex-shrink-0 text-asgard-text-muted hover:text-asgard-text-primary transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      )}
    </motion.div>
  )
}
