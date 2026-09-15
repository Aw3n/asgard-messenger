/**
 * FavoritesManager — manage favorite files with search, filter, and statistics.
 */

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { fileService } from '@/services/FileService'
import { getCurrentLanguage } from '@/i18n/config'

// Icons
const XIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const StarIcon = ({ filled = false, size = 16 }: { filled?: boolean; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
const ImageIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
const VideoIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
const MusicIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
const FileIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
const FolderIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>

interface FavoriteFile {
  blobKey: string
  fileName: string
  conversationId: string
  mimeType: string
  addedAt: number
}

interface FavoritesManagerProps {
  onClose: () => void
}

export function FavoritesManager({ onClose }: FavoritesManagerProps) {
  const { t } = useTranslation()
  const [favorites, setFavorites] = useState<FavoriteFile[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadFavorites()
  }, [])

  const loadFavorites = () => {
    setFavorites(fileService.getFavorites())
  }

  const filteredFavorites = useMemo(() => {
    let filtered = favorites

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(f => f.mimeType.startsWith(filterType))
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(f =>
        f.fileName.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [favorites, filterType, searchQuery])

  const stats = useMemo(() => {
    return fileService.getFavoritesStats()
  }, [favorites])

  const handleRemoveFavorite = (blobKey: string) => {
    fileService.removeFavorite(blobKey)
    loadFavorites()
  }

  const handleClearAll = () => {
    if (confirm(t('settings.clearFavoritesConfirm'))) {
      fileService.clearFavorites()
      loadFavorites()
    }
  }

  const handleSelectItem = (blobKey: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(blobKey)) {
      newSelected.delete(blobKey)
    } else {
      newSelected.add(blobKey)
    }
    setSelectedItems(newSelected)
  }

  const handleRemoveSelected = () => {
    for (const blobKey of selectedItems) {
      fileService.removeFavorite(blobKey)
    }
    setSelectedItems(new Set())
    loadFavorites()
  }

  const getTypeIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <span className="text-blue-500"><ImageIcon /></span>
    if (mimeType.startsWith('video/')) return <span className="text-purple-500"><VideoIcon /></span>
    if (mimeType.startsWith('audio/')) return <span className="text-green-500"><MusicIcon /></span>
    return <span className="text-gray-500"><FileIcon /></span>
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return t('time.today')
    if (diffDays === 1) return t('time.yesterday')
    if (diffDays < 7) return t('time.daysAgo', { count: diffDays })
    return date.toLocaleDateString(getCurrentLanguage())
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-2xl max-h-[80vh] bg-[var(--bg-primary)] rounded-xl shadow-2xl border border-[var(--border-primary)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center gap-3">
            <span className="text-yellow-500"><StarIcon size={20} filled /></span>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.favoriteFiles')}</h2>
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/10 text-yellow-500 rounded-full">
              {stats.total}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <span className="text-[var(--text-secondary)]"><XIcon /></span>
          </button>
        </div>

        {/* Search and filters */}
        <div className="px-6 py-4 border-b border-[var(--border-primary)] space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"><SearchIcon /></span>
            <input
              type="text"
              placeholder={t('settings.searchFavorites')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)]">{t('settings.filter')}:</span>
            {[
              { id: 'all', label: t('settings.all'), icon: <FolderIcon /> },
              { id: 'image', label: t('settings.images'), icon: <ImageIcon /> },
              { id: 'video', label: t('settings.videos'), icon: <VideoIcon /> },
              { id: 'audio', label: t('settings.audio'), icon: <MusicIcon /> },
              { id: 'application', label: t('settings.documents'), icon: <FileIcon /> },
            ].map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setFilterType(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filterType === id
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {selectedItems.size > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-secondary)] rounded-lg">
              <span className="text-xs text-[var(--text-secondary)]">
                {t('settings.selectedCount', { count: selectedItems.size })}
              </span>
              <button
                onClick={handleRemoveSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <TrashIcon />
                {t('settings.removeSelected')}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <AnimatePresence mode="popLayout">
            {filteredFavorites.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <span className="text-[var(--text-secondary)] opacity-30 mb-4"><StarIcon size={48} /></span>
                <p className="text-[var(--text-secondary)]">
                  {searchQuery || filterType !== 'all' ? t('settings.noFavoritesMatch') : t('settings.noFavoriteFiles')}
                </p>
              </motion.div>
            ) : (
              <div className="space-y-2">
                {filteredFavorites.map((favorite) => (
                  <motion.div
                    key={favorite.blobKey}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      selectedItems.has(favorite.blobKey)
                        ? 'bg-[var(--primary)]/5 border-[var(--primary)]'
                        : 'bg-[var(--bg-secondary)] border-[var(--border-primary)] hover:border-[var(--primary)]/50'
                    }`}
                    onClick={() => handleSelectItem(favorite.blobKey)}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center">
                      {getTypeIcon(favorite.mimeType)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {favorite.fileName}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {t('settings.added')} {formatDate(favorite.addedAt)}
                      </p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveFavorite(favorite.blobKey)
                      }}
                      className="flex-shrink-0 p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                      title={t('settings.removeFromFavorites')}
                    >
                      <span className="text-yellow-500"><StarIcon filled /></span>
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
            <span>{t('settings.total')}: {stats.total}</span>
            {Object.entries(stats.byType).map(([type, count]) => {
              const typeLabels: Record<string, string> = {
                all: t('settings.fileType_all'),
                image: t('settings.fileType_image'),
                video: t('settings.fileType_video'),
                audio: t('settings.fileType_audio'),
                application: t('settings.fileType_application'),
              }
              return <span key={type}>{typeLabels[type] || type}: {count}</span>
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearAll}
              disabled={stats.total === 0}
              className="px-4 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('settings.clearAll')}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('common.done')}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
