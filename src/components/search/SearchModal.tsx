import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSearch, type SearchResult } from '@/hooks/useSearch'
import { isCloseKeypress } from '@/hooks/useDialogBehavior'
import { useGestureHint } from '@/hooks/useGestureHint'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/utils/cn'
import { getCurrentLanguage } from '@/i18n/config'
import { buildSearchSnippet } from '@/utils/searchSnippet'

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
  // -1 = aucune ligne sélectionnée : ↑↓ la choisit, ↵ l'ouvre (cf. footer).
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Élément qui avait le focus à l'ouverture (souvent le champ de saisie du
  // chat) : le rendre à la fermeture évite de renvoyer l'utilisateur au body.
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const navigate = useNavigate()
  const { t } = useTranslation()
  // La pastille au bout du champ promet la touche qui referme la recherche :
  // elle doit lire la combinaison réglée, pas « ESC » en dur — effacée, elle
  // disparaît plutôt que d'annoncer une frappe muette.
  const closeGesture = useGestureHint('closeModal', t('search.placeholder'))
  const { results, contactResults, messageResults, groupResults, isSearching, truncated, storageIncomplete } = useSearch(query)
  // Le plafond est par type : n'annoncer la coupure que pour l'onglet affiché.
  const tabTruncated =
    activeTab === 'contacts'
      ? !!truncated?.contacts
      : activeTab === 'groups'
        ? !!truncated?.groups
        : activeTab === 'messages'
          ? !!truncated?.messages
          : !!(truncated?.contacts || truncated?.groups || truncated?.messages)
  const tabs: { id: SearchTab; label: string }[] = [
    { id: 'all', label: t('search.all') },
    { id: 'messages', label: t('search.messages') },
    { id: 'contacts', label: t('search.contacts') },
    { id: 'groups', label: t('search.groups') },
  ]

  // Focus input when opened, restore it when closed
  useEffect(() => {
    if (isOpen) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setQuery('')
      setActiveTab('all')
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => {
        clearTimeout(timer)
        const previous = restoreFocusRef.current
        restoreFocusRef.current = null
        if (previous?.isConnected) previous.focus()
      }
    }
  }, [isOpen])

  // Tab ne doit pas sortir d'une modale : le cycle revient au premier contrôle
  // focusable (et ⇧Tab au dernier), sinon le focus part derrière le backdrop.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const root = dialogRef.current
    if (!root) return
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Fermeture : la combinaison réglée dans `settings.keyboardShortcuts`.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Échap qui annule une composition IME reste au champ : fermer la
      // recherche jetterait la saisie en cours.
      if (e.isComposing || e.keyCode === 229) return
      if (isCloseKeypress(e) && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleNavigate = useCallback(
    (path: string, state?: unknown) => {
      onClose()
      navigate(path, state === undefined ? undefined : { state })
    },
    [onClose, navigate]
  )

  const openResult = useCallback((result: SearchResult) => {
    if (result.type === 'contact' && result.contact) {
      // Un contact déjà en conversation s'ouvre directement ; sinon la page
      // Contacts propose de démarrer le fil.
      const existing = Object.values(useConversationStore.getState().conversations)
        .find((conv) => conv.participantId === result.contact!.publicKey)
      if (existing) {
        useConversationStore.getState().setActiveConversation(existing.id)
        handleNavigate(`/conversations/${existing.id}`)
      } else {
        // Sans fil existant, la page Contacts doit ouvrir CE contact au lieu
        // de laisser l'utilisateur le rechercher une seconde fois.
        handleNavigate('/contacts', { contactPublicKey: result.contact.publicKey })
      }
    } else if (result.type === 'group' && result.group) {
      useGroupStore.getState().setActiveGroup(result.group.id)
      handleNavigate(`/groups/${result.group.id}`)
    } else if (result.type === 'message' && result.message) {
      // La vue doit ouvrir CE message, pas le bas du fil : la cible voyage avec
      // la navigation et sera chargée depuis Hyperbee si elle est trop ancienne.
      const jump = {
        messageId: result.message.id,
        messageTimestamp: result.message.timestamp,
        conversationId: result.channelId ?? result.message.conversationId,
      }
      if (result.groupId && result.channelId) {
        // Sélectionner le canal avant la route : GroupView lit ces deux ids
        // du store pour afficher le bon fil.
        useGroupStore.getState().setActiveGroup(result.groupId)
        useGroupStore.getState().setActiveChannel(result.channelId)
        handleNavigate(`/groups/${result.groupId}/channels/${result.channelId}`, jump)
      } else {
        handleNavigate(`/conversations/${result.message.conversationId}`, jump)
      }
    }
  }, [handleNavigate])

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

  // Une nouvelle requête, un nouvel onglet ou une réouverture repartent sans
  // sélection : ↵ ne doit jamais ouvrir un résultat d'une recherche précédente.
  useEffect(() => {
    setSelectedIndex(-1)
  }, [query, activeTab, isOpen])

  useEffect(() => {
    if (selectedIndex < 0) return
    document.getElementById(`search-result-${selectedIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <AnimatePresence>
      {isOpen && (
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
          ref={dialogRef}
          onKeyDown={trapTab}
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          role="dialog"
          aria-modal="true"
          aria-label={t('search.placeholder')}
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
              onKeyDown={(e) => {
                // Composition IME : Entrée valide la saisie, les flèches
                // choisissent un candidat — rien de tout cela ne pilote la liste.
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (filteredResults.length === 0) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSelectedIndex((index) => (index + 1) % filteredResults.length)
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSelectedIndex((index) => (index <= 0 ? filteredResults.length - 1 : index - 1))
                } else if (e.key === 'Enter' && selectedIndex >= 0) {
                  const result = filteredResults[selectedIndex]
                  if (result) {
                    e.preventDefault()
                    openResult(result)
                  }
                }
              }}
              placeholder={t('search.placeholder')}
              aria-label={t('search.placeholder')}
              role="combobox"
              aria-expanded={filteredResults.length > 0}
              aria-controls="search-results"
              aria-autocomplete="list"
              aria-activedescendant={selectedIndex >= 0 ? `search-result-${selectedIndex}` : undefined}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 bg-transparent text-sm text-asgard-text-primary placeholder:text-asgard-text-muted outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('search.clearQuery')}
                title={t('search.clearQuery')}
                className="text-asgard-text-muted hover:text-asgard-text-primary transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            )}
            {closeGesture.shown && (
              <kbd className="text-xxs text-asgard-text-muted bg-asgard-surface-alt px-1.5 py-0.5 rounded border border-asgard-border">
                {closeGesture.shown}
              </kbd>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0 px-4 border-b border-asgard-border">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
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
          <div
            id="search-results"
            role="listbox"
            aria-label={t('search.placeholder')}
            className="max-h-80 overflow-y-auto p-2"
          >
            {!query.trim() && (
              <div className="flex flex-col items-center justify-center py-10 text-asgard-text-muted">
                <SearchIcon size={32} />
                <p className="text-sm mt-3">{t('search.typeToSearch')}</p>
                <p className="text-xs mt-1">{t('search.acrossHint')}</p>
              </div>
            )}

            {query.trim() && filteredResults.length === 0 && isSearching && (
              <div className="flex flex-col items-center justify-center py-10 text-asgard-text-muted">
                <span className="w-5 h-5 border-2 border-asgard-glacier border-t-transparent rounded-full animate-spin" />
                <p className="text-sm mt-3">{t('search.searching')}</p>
              </div>
            )}

            {query.trim() && filteredResults.length === 0 && !isSearching && (
              <div className="flex flex-col items-center justify-center py-10 text-asgard-text-muted">
                <p className="text-sm">{t('search.noResults')}</p>
                <p className="text-xs mt-1">{t('search.tryDifferent')}</p>
              </div>
            )}

            {filteredResults.map((result, index) => (
              <SearchResultItem
                key={`${result.type}-${index}`}
                id={`search-result-${index}`}
                result={result}
                query={query}
                selected={index === selectedIndex}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => openResult(result)}
              />
            ))}

            {query.trim() && filteredResults.length > 0 && tabTruncated && (
              <p className="px-3 py-2 text-xxs text-asgard-text-muted" role="status">
                {t('search.moreResults')}
              </p>
            )}

            {query.trim() && !isSearching && storageIncomplete && (
              <p className="px-3 py-2 text-xxs text-asgard-text-muted" role="status">
                {t('search.incomplete')}
              </p>
            )}
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
            <span className="text-xxs text-asgard-text-muted" role="status">
              {!query.trim()
                ? ''
                : isSearching
                  ? t('search.searching')
                  : t('search.resultsCount', { count: filteredResults.length })}
            </span>
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Result Item ──────────────────────────────────────────────────────────────

interface SearchResultItemProps {
  id: string
  result: SearchResult
  query: string
  selected: boolean
  onMouseEnter: () => void
  onClick: () => void
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({
  id,
  result,
  query,
  selected,
  onMouseEnter,
  onClick,
}) => {
  const { t } = useTranslation()
  const itemClass = cn(
    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-asgard-surface-alt transition-colors text-left',
    selected && 'bg-asgard-surface-alt'
  )
  const optionProps = {
    id,
    role: 'option',
    'aria-selected': selected,
    onMouseEnter,
  } as const
  if (result.type === 'contact' && result.contact) {
    return (
      <button
        {...optionProps}
        onClick={onClick}
        className={itemClass}
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
        {...optionProps}
        onClick={onClick}
        className={itemClass}
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
    const snippet = buildSearchSnippet(result.message.content, query)
    return (
      <button
        {...optionProps}
        onClick={onClick}
        className={itemClass}
      >
        <div className="w-8 h-8 rounded-full bg-asgard-nordic/30 flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-asgard-text-primary truncate">
            {snippet.clippedStart && '…'}
            {snippet.before}
            {snippet.match && (
              <mark className="bg-asgard-glacier/30 text-asgard-text-primary rounded px-0.5">
                {snippet.match}
              </mark>
            )}
            {snippet.after}
            {snippet.clippedEnd && '…'}
          </p>
          <p className="text-xs text-asgard-text-muted truncate">
            {result.sourceLabel ? `${result.sourceLabel} · ` : ''}
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
    aria-hidden="true"
    className="text-asgard-text-muted"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)
