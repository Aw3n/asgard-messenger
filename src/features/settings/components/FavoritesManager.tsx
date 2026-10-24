/**
 * FavoritesManager — manage favorite files with search, filter, and statistics.
 */

import { useId, useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { fileService } from '@/services/FileService'
import { saveAttachmentToDisk } from '@/utils/attachmentSave'
import { getCurrentLanguage } from '@/i18n/config'
import { useDialogBehavior } from '@/hooks/useDialogBehavior'
import { useGestureHint } from '@/hooks/useGestureHint'

// Icons
const XIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const StarIcon = ({ filled = false, size = 16 }: { filled?: boolean; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
const SaveIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
  fileSize?: number
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
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const dialogRef = useDialogBehavior(onClose)
  const closeGesture = useGestureHint('closeModal', t('common.close'))

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

  // `confirm()` natif gelait le fil, ignorait la touche de fermeture réglée et
  // sortait du thème : la demande devient un dialogue rendu, qui n'efface rien
  // avant l'acquiescement.
  const handleClearAll = () => {
    setShowClearConfirm(true)
  }

  const confirmClearAll = () => {
    fileService.clearFavorites()
    loadFavorites()
    setShowClearConfirm(false)
  }

  // Un favori n'était jusqu'ici qu'une ligne à retirer : le panneau nommait des
  // fichiers sans permettre de les rouvrir. La rangée rend le blob au même
  // dialogue d'enregistrement que la bulle, succès et échec compris.
  const handleSaveFavorite = (favorite: FavoriteFile) => {
    void saveAttachmentToDisk(
      {
        blobKey: favorite.blobKey,
        name: favorite.fileName,
        mimeType: favorite.mimeType,
        size: favorite.fileSize,
      },
      t,
      favorite.conversationId || undefined,
    )
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
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
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={dialogRef}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.favoriteFiles')}
        tabIndex={-1}
        className="w-full max-w-2xl max-h-[80vh] bg-[var(--bg-primary)] rounded-xl shadow-2xl border border-[var(--border-primary)] flex flex-col overflow-hidden focus:outline-none"
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
            aria-label={t('common.close')}
            title={closeGesture.title}
            aria-keyshortcuts={closeGesture.ariaKeyShortcuts}
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
              aria-label={t('settings.searchFavorites')}
              placeholder={t('settings.searchFavorites')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div className="flex items-center gap-2" role="group" aria-label={t('settings.filter')}>
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
                aria-pressed={filterType === id}
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
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      selectedItems.has(favorite.blobKey)
                        ? 'bg-[var(--primary)]/5 border-[var(--primary)]'
                        : 'bg-[var(--bg-secondary)] border-[var(--border-primary)] hover:border-[var(--primary)]/50'
                    }`}
                  >
                    {/* Un <button> ne peut pas contenir les boutons de la rangée :
                        la zone de sélection prend un rôle explicite et le clavier. */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedItems.has(favorite.blobKey)}
                      aria-label={favorite.fileName}
                      onClick={() => handleSelectItem(favorite.blobKey)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        e.preventDefault()
                        handleSelectItem(favorite.blobKey)
                      }}
                      className="flex flex-1 min-w-0 items-center gap-3 text-left cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                    >
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center">
                      {getTypeIcon(favorite.mimeType)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {favorite.fileName}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {favorite.fileSize !== undefined && (
                          <>
                            {formatBytes(favorite.fileSize)}
                            <span aria-hidden="true"> · </span>
                          </>
                        )}
                        {t('settings.added')} {formatDate(favorite.addedAt)}
                      </p>
                    </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSaveFavorite(favorite)
                      }}
                      className="flex-shrink-0 p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                      title={t('chat.saveAs')}
                      aria-label={t('chat.saveAs')}
                    >
                      <SaveIcon />
                    </button>

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

      <AnimatePresence>
        {showClearConfirm && (
          <ClearFavoritesConfirm
            onCancel={() => setShowClearConfirm(false)}
            onConfirm={confirmClearAll}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/**
 * ClearFavoritesConfirm — « Tout effacer » demande d'abord : le clic n'efface
 * rien tant que le dialogue n'a pas reçu son acquiescement. La touche réglée le
 * referme sans rien effacer, et le bouton qui fait le même geste l'annonce.
 */
function ClearFavoritesConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation()
  const dialogRef = useDialogBehavior<HTMLDivElement>(onCancel)
  const cancelGesture = useGestureHint('closeModal', t('common.cancel'))
  const titleId = useId()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        ref={dialogRef}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="mica-card border border-[var(--border-primary)] rounded-2xl p-6 max-w-sm mx-4 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-lg font-semibold text-[var(--text-primary)] mb-2">
          {t('settings.clearAll')}
        </h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          {t('settings.clearFavoritesConfirm')}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            title={cancelGesture.title}
            aria-keyshortcuts={cancelGesture.ariaKeyShortcuts}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            {t('settings.clearAll')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
