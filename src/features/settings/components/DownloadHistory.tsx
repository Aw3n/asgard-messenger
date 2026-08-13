import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { fileService } from '@/services/FileService'

interface DownloadHistoryEntry {
  id: string
  blobKey: string
  fileName: string
  fileSize: number
  mimeType: string
  source?: string
  conversationId?: string
  downloadedAt: number
}

/**
 * DownloadHistory — displays and manages download history.
 */
export const DownloadHistory: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { t } = useTranslation()
  const [history, setHistory] = useState<DownloadHistoryEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState({
    total: 0,
    totalSize: 0,
    byType: {} as Record<string, number>,
    recentCount: 0,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    setHistory(fileService.getDownloadHistory(100))
    setStats(fileService.getDownloadStats())
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query) {
      setHistory(fileService.searchDownloadHistory(query))
    } else {
      setHistory(fileService.getDownloadHistory(100))
    }
  }

  const handleClear = () => {
    fileService.clearDownloadHistory()
    loadData()
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t('time.justNow')
    if (diffMins < 60) return t('time.minutesAgo', { count: diffMins })
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours })
    if (diffDays < 7) return t('time.daysAgo', { count: diffDays })
    return date.toLocaleDateString()
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-purple-400">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
        </svg>
      )
    }
    if (mimeType.startsWith('video/')) {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-red-400">
          <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
        </svg>
      )
    }
    if (mimeType.startsWith('audio/')) {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-green-400">
          <path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/>
        </svg>
      )
    }
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-blue-400">
        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
      </svg>
    )
  }

  return (
    <div className="flex flex-col h-full bg-asgard-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-asgard-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-blue-400">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-asgard-text-primary">{t('settings.downloadHistory')}</h2>
            <p className="text-xs text-asgard-text-muted">
              {stats.total} {t('settings.files')} · {formatBytes(stats.totalSize)} · {stats.recentCount} {t('chat.today').toLowerCase()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={handleClear}
              className="px-3 py-1.5 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              {t('calls.clearHistory')}
            </button>
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

      {/* Search */}
      <div className="px-6 py-3 border-b border-asgard-border">
        <div className="relative">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-asgard-text-muted"
          >
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t('settings.searchDownloads')}
            className="w-full pl-10 pr-4 py-2 bg-asgard-surface-alt border border-asgard-border rounded-lg text-sm text-asgard-text-primary placeholder:text-asgard-text-muted focus:outline-none focus:border-asgard-glacier/50"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-asgard-surface-alt flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
            </div>
            <p className="text-sm text-asgard-text-secondary mb-1">
              {searchQuery ? t('common.noResults') : t('settings.noDownloads')}
            </p>
            <p className="text-xs text-asgard-text-muted">
              {searchQuery ? t('search.tryDifferent') : t('settings.downloadsWillAppearHere')}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            <AnimatePresence>
              {history.map((entry) => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-asgard-surface-alt border border-asgard-border hover:bg-asgard-surface-alt transition-colors"
                >
                  {/* File icon */}
                  <div className="w-10 h-10 rounded-lg bg-asgard-surface-alt flex items-center justify-center flex-shrink-0">
                    {getFileIcon(entry.mimeType)}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-asgard-text-primary truncate">
                      {entry.fileName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-asgard-text-muted">
                      <span>{formatBytes(entry.fileSize)}</span>
                      <span>·</span>
                      <span>{formatDate(entry.downloadedAt)}</span>
                      {entry.source && (
                        <>
                          <span>·</span>
                          <span className="truncate">{entry.source}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* MIME type badge */}
                  <div className="text-xs text-asgard-text-muted bg-asgard-surface-alt px-2 py-1 rounded-md">
                    {entry.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer stats */}
      {history.length > 0 && (
        <div className="px-6 py-3 border-t border-asgard-border bg-asgard-surface-alt">
          <div className="flex items-center justify-between text-xs text-asgard-text-muted">
            <span>{t('settings.totalDownloads', { count: stats.total })}</span>
            <span>{t('settings.totalSize', { size: formatBytes(stats.totalSize) })}</span>
          </div>
        </div>
      )}
    </div>
  )
}
