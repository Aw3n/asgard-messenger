import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSearch } from '@/hooks/useSearch'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/utils/cn'
import { getCurrentLanguage } from '@/i18n/config'

type SearchTab = 'all' | 'messages' | 'contacts' | 'groups'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * SearchModal — global search overlay (Ctrl+K) with tabbed results.
 */
export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<SearchTab>('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { results, contactResults, messageResults, groupResults } = useSearch(query)
  const tabs: { id: SearchTab; label: string }[] = [
    { id: 'all', label: t('search.all') },
    { id: 'messages', label: t('search.messages') },
    { id: 'contacts', label: t('search.contacts') },
    { id: 'groups', label: t('search.groups') },
  ]

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveTab('all')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleNavigate = useCallback(
    (path: string) => {
      onClose()
      navigate(path)
    },
    [onClose, navigate]
  )

  const filteredResults = (() => {
    switch (activeTab) {
      case 'messages':
        return messageResults
      case 'contacts':
        return contactResults
      case 'groups':
        return groupResults
      default:
        return results
    }
  })()

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-asgard-deep-black/70 backdrop-blur-sm" />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-xl mica-card border border-asgard-border rounded-2xl shadow-modal overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-asgard-border">
            <SearchIcon />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="flex-1 bg-transparent text-sm text-asgard-text-primary placeholder:text-asgard-text-muted outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-asgard-text-muted hover:text-asgard-text-primary transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            )}
            <kbd className="text-xxs text-asgard-text-muted bg-asgard-surface-alt px-1.5 py-0.5 rounded border border-asgard-border">
              ESC
            </kbd>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 px-4 border-b border-asgard-border">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
                  activeTab === tab.id
                    ? 'text-asgard-glacier border-asgard-glacier'
                    : 'text-asgard-text-muted border-transparent hover:text-asgard-text-secondary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-2">
            {!query.trim() && (
              <div className="flex flex-col items-center justify-center py-10 text-asgard-text-muted">
                <SearchIcon size={32} />
                <p className="text-sm mt-3">{t('search.typeToSearch')}</p>
                <p className="text-xs mt-1">{t('search.acrossHint')}</p>
              </div>
            )}

            {query.trim() && filteredResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-asgard-text-muted">
                <p className="text-sm">{t('search.noResults')}</p>
                <p className="text-xs mt-1">{t('search.tryDifferent')}</p>
              </div>
            )}

            {filteredResults.map((result, index) => (
              <SearchResultItem
                key={`${result.type}-${index}`}
                result={result}
                onClick={() => {
                  if (result.type === 'contact' && result.contact) {
                    handleNavigate(`/contacts`)
                  } else if (result.type === 'group' && result.group) {
                    handleNavigate(`/groups/${result.group.id}`)
                  } else if (result.type === 'message' && result.message) {
                    handleNavigate(`/conversations/${result.message.conversationId}`)
                  }
                }}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-asgard-border bg-asgard-deep-black">
            <div className="flex items-center gap-3 text-xxs text-asgard-text-muted">
              <span className="flex items-center gap-1">
                <kbd className="bg-asgard-surface-alt px-1 py-0.5 rounded border border-asgard-border">↑↓</kbd>
                {t('search.navigate')}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-asgard-surface-alt px-1 py-0.5 rounded border border-asgard-border">↵</kbd>
                {t('search.open')}
              </span>
            </div>
            <span className="text-xxs text-asgard-text-muted">
              {query.trim() ? t('search.resultsCount', { count: filteredResults.length }) : ''}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Result Item ──────────────────────────────────────────────────────────────

interface SearchResultItemProps {
  result: ReturnType<typeof useSearch>['results'][0]
  onClick: () => void
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ result, onClick }) => {
  const { t } = useTranslation()
  if (result.type === 'contact' && result.contact) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-asgard-surface-alt transition-colors text-left"
      >
        <Avatar
          name={result.contact.displayName}
          publicKey={result.contact.publicKey}
          src={result.contact.avatar}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-asgard-text-primary truncate">
            {result.contact.displayName}
          </p>
          <p className="text-xs text-asgard-text-muted truncate">{t('search.contacts')}</p>
        </div>
        <span className="text-xxs text-asgard-text-muted bg-asgard-surface-alt px-2 py-0.5 rounded-full">
          {t('search.contacts')}
        </span>
      </button>
    )
  }

  if (result.type === 'group' && result.group) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-asgard-surface-alt transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-asgard-nordic to-asgard-cyan flex items-center justify-center text-white text-xs font-bold">
          {result.group.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-asgard-text-primary truncate">
            {result.group.name}
          </p>
          <p className="text-xs text-asgard-text-muted truncate">
            {result.group.description || t('search.groupFallback')}
          </p>
        </div>
        <span className="text-xxs text-asgard-text-muted bg-asgard-surface-alt px-2 py-0.5 rounded-full">
          {t('search.groupFallback')}
        </span>
      </button>
    )
  }

  if (result.type === 'message' && result.message) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-asgard-surface-alt transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-asgard-nordic/30 flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-asgard-text-primary truncate">
            {highlightText(result.highlight, result.message.content)}
          </p>
          <p className="text-xs text-asgard-text-muted">
            {new Date(result.message.timestamp).toLocaleDateString(getCurrentLanguage())}
          </p>
        </div>
        <span className="text-xxs text-asgard-text-muted bg-asgard-surface-alt px-2 py-0.5 rounded-full">
          {t('search.messages')}
        </span>
      </button>
    )
  }

  return null
}

function highlightText(_highlight: string, content: string): string {
  return content.slice(0, 80)
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const SearchIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-asgard-text-muted"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)
