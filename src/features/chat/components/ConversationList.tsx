import React, { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Virtuoso } from 'react-virtuoso'
import { useNavigate } from 'react-router-dom'
import { useConversationStore } from '@/stores/conversationStore'
import { useContactStore } from '@/stores/contactStore'
import { Avatar } from '@/components/ui/Avatar'
import { Input } from '@/components/ui/Input'
import { chatService } from '@/services/ChatService'
import { formatConversationTime } from '@/utils/time'
import { cn } from '@/utils/cn'
import type { Conversation } from '@/types'
import { useTranslation } from 'react-i18next'

interface ConversationListProps {
  onNewChat?: () => void
}

/**
 * ConversationList — virtualized list of all conversations.
 * Supports search, pinning, unread indicators.
 */
export const ConversationList: React.FC<ConversationListProps> = ({ onNewChat }) => {
  const { t } = useTranslation()
  const {
    filter,
    setFilter,
    getFilteredConversations,
    activeConversationId,
    setActiveConversation,
    muteConversation,
    pinConversation,
    archiveConversation,
    clearUnread,
    incrementUnread,
  } = useConversationStore()

  const navigate = useNavigate()
  // CRITICAL: Subscribe to the contacts OBJECT (not the getContact function).
  // Subscribing to getContact (a stable function) means the component never
  // re-renders when a contact's status changes — causing stale status indicators.
  // By subscribing to `contacts`, Zustand re-renders whenever any contact is
  // updated (immer produces a new object reference on mutation).
  const contacts = useContactStore((s) => s.contacts)
  // Les groupes vivent dans leur propre page et leur propre liste : une entrée
  // de groupe ici s'affichait comme un identifiant brut et ouvrait ChatView
  // sans destinataire, donc un fil vide qui ne pouvait rien envoyer.
  const conversations = getFilteredConversations().filter((conv) => conv.type === 'direct')
  const [contextMenu, setContextMenu] = useState<{
    conv: Conversation
    x: number
    y: number
    fromKeyboard?: boolean
  } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLElement | null>(null)

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter({ search: e.target.value })
  }

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      setActiveConversation(conv.id)
      navigate(`/conversations/${conv.id}`)
    },
    [setActiveConversation, navigate]
  )

  const handleContextMenu = useCallback((e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault()
    setContextMenu({ conv, x: e.clientX, y: e.clientY })
  }, [])

  // Maj+F10 et la touche Menu ouvrent le menu contextuel comme le clic droit.
  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, conv: Conversation) => {
      if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      menuTriggerRef.current = e.currentTarget
      setContextMenu({
        conv,
        x: Math.max(8, Math.min(rect.left + 16, window.innerWidth - 200)),
        y: Math.max(8, Math.min(rect.top + 16, window.innerHeight - 280)),
        fromKeyboard: true,
      })
    },
    []
  )

  const handleDeleteConversation = useCallback(async (conv: Conversation) => {
    setContextMenu(null)
    try {
      await chatService.deleteConversation(conv.id)
      navigate('/conversations')
    } catch (err) {
      console.error('[ConversationList] deleteConversation failed:', err)
      try { window.asgard.debugLog('[ConversationList] deleteConversation failed: ' + (err instanceof Error ? err.message : String(err))) } catch {}
    }
  }, [navigate])

  const handleClearConversation = useCallback(async (conv: Conversation) => {
    setContextMenu(null)
    try {
      await chatService.clearConversation(conv.id)
    } catch (err) {
      console.error('[ConversationList] clearConversation failed:', err)
      try { window.asgard.debugLog('[ConversationList] clearConversation failed: ' + (err instanceof Error ? err.message : String(err))) } catch {}
    }
  }, [])

  const renderConversation = useCallback(
    (_: number, conv: Conversation) => {
      const contact = conv.participantId ? contacts[conv.participantId] : undefined
      const isActive = conv.id === activeConversationId

      return (
        <ConversationItem
          key={conv.id}
          conversation={conv}
          contactName={contact?.displayName}
          contactAvatar={contact?.avatar}
          contactStatus={contact?.status}
          contactPending={contact?.relation === 'pending'}
          isActive={isActive}
          onClick={() => handleSelectConversation(conv)}
          onContextMenu={(e) => handleContextMenu(e, conv)}
          onKeyDown={(e) => handleItemKeyDown(e, conv)}
        />
      )
    },
    [activeConversationId, contacts, handleSelectConversation, handleContextMenu, handleItemKeyDown]
  )

  // Ferme le menu au clic extérieur, gère Échap, flèches et Tab au clavier.
  React.useEffect(() => {
    if (!contextMenu) return
    const clickHandler = () => setContextMenu(null)
    const keyHandler = (e: KeyboardEvent) => {
      const menu = menuRef.current
      if (!menu) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setContextMenu(null)
        const trigger = menuTriggerRef.current
        menuTriggerRef.current = null
        if (trigger?.isConnected) trigger.focus()
        return
      }
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      if (items.length === 0) return
      const active = document.activeElement as HTMLButtonElement | null
      const index = active ? items.indexOf(active) : -1
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        const next = index === -1
          ? (step === 1 ? 0 : items.length - 1)
          : (index + step + items.length) % items.length
        items[next]?.focus()
      } else if (e.key === 'Home') {
        e.preventDefault()
        items[0]?.focus()
      } else if (e.key === 'End') {
        e.preventDefault()
        items[items.length - 1]?.focus()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        if (index === -1) {
          items[0]?.focus()
          return
        }
        const next = (index + (e.shiftKey ? -1 : 1) + items.length) % items.length
        items[next]?.focus()
      }
    }
    window.addEventListener('click', clickHandler)
    window.addEventListener('keydown', keyHandler)
    if (contextMenu.fromKeyboard) {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    }
    return () => {
      window.removeEventListener('click', clickHandler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [contextMenu])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#C8D0E8' }}>
          {filter.archivedOnly ? t('chat.archived') : t('nav.messages')}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setFilter({ archivedOnly: !filter.archivedOnly })}
            aria-pressed={!!filter.archivedOnly}
            aria-label={t('chat.archived')}
            title={t('chat.archived')}
            style={{
              width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '8px', border: 'none', background: 'transparent',
              color: filter.archivedOnly ? '#4FC3F7' : 'rgba(200,208,232,0.5)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79,195,247,0.12)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/>
            </svg>
          </button>
          <button
            onClick={onNewChat}
            style={{
              width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '8px', border: 'none', background: 'transparent',
              color: 'rgba(200,208,232,0.5)', cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79,195,247,0.12)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            aria-label={t('chat.newConversation')}
            title={t('chat.newConversation')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px', flexShrink: 0 }}>
        <Input
          placeholder={t('search.placeholder')}
          value={filter.search ?? ''}
          onChange={handleSearch}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          }
          onClear={filter.search ? () => setFilter({ search: '' }) : undefined}
        />
      </div>

      {/* Conversation list */}
      {conversations.length === 0 ? (
        <EmptyState hasSearch={!!filter.search} onNewChat={onNewChat} />
      ) : (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Virtuoso
            data={conversations}
            itemContent={renderConversation}
            style={{ height: '100%' }}
            increaseViewportBy={200}
          />
        </div>
      )}

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            ref={menuRef}
            role="menu"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-50 mica-card border border-asgard-border rounded-xl p-1 shadow-modal min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <ContextMenuItem
              label={t(contextMenu.conv.unreadCount > 0 ? 'chat.markAsRead' : 'chat.markAsUnread')}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              }
              onClick={() => {
                const conv = contextMenu.conv
                if (conv.unreadCount > 0) clearUnread(conv.id)
                else incrementUnread(conv.id)
                setContextMenu(null)
              }}
            />
            <div className="h-px bg-asgard-border my-0.5" />
            <ContextMenuItem
              label={t(contextMenu.conv.pinned ? 'chat.unpinConversation' : 'chat.pinConversation')}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
                </svg>
              }
              onClick={() => {
                pinConversation(contextMenu.conv.id, !contextMenu.conv.pinned)
                setContextMenu(null)
              }}
            />
            <ContextMenuItem
              label={t(contextMenu.conv.archived ? 'chat.unarchiveConversation' : 'chat.archiveConversation')}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/>
                </svg>
              }
              onClick={() => {
                const conv = contextMenu.conv
                archiveConversation(conv.id, !conv.archived)
                // Archiver le fil affiché le laisse sans entrée dans la liste :
                // revenir à l'accueil évite un écran de conversation orphelin.
                if (!conv.archived && activeConversationId === conv.id) navigate('/conversations')
                setContextMenu(null)
              }}
            />
            <ContextMenuItem
              label={t(contextMenu.conv.muted ? 'chat.unmuteConversation' : 'chat.muteConversation')}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                </svg>
              }
              onClick={() => {
                muteConversation(contextMenu.conv.id, !contextMenu.conv.muted)
                setContextMenu(null)
              }}
            />
            <div className="h-px bg-asgard-border my-0.5" />
            <ContextMenuItem
              label={t('chat.clearMessages')}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              }
              onClick={() => handleClearConversation(contextMenu.conv)}
            />
            <div className="h-px bg-asgard-border my-0.5" />
            <ContextMenuItem
              label={t('chat.deleteConversation')}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
              }
              onClick={() => handleDeleteConversation(contextMenu.conv)}
              danger
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Conversation Item ────────────────────────────────────────────────────────

interface ConversationItemProps {
  conversation: Conversation
  contactName?: string
  contactAvatar?: string
  contactStatus?: string
  contactPending?: boolean
  isActive: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation: conv,
  contactName,
  contactAvatar,
  contactStatus,
  contactPending,
  isActive,
  onClick,
  onContextMenu,
  onKeyDown,
}) => {
  const { t } = useTranslation()
  const name = contactName ?? conv.participantId?.slice(0, 16) ?? conv.id.slice(0, 16)
  const lastMsg = conv.lastMessage

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      aria-haspopup="menu"
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5',
        'transition-colors duration-200 text-left',
        isActive
          ? 'bg-asgard-nordic/20 border-l-2 border-asgard-glacier'
          : 'border-l-2 border-transparent hover:bg-asgard-surface-alt'
      )}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <Avatar
          src={contactAvatar}
          name={name}
          publicKey={conv.participantId}
          size="md"
          status={contactStatus as 'online' | 'offline' | 'away' | 'busy' | 'invisible' | undefined}
          showStatus
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span
            className={cn(
              'text-sm font-medium truncate',
              isActive ? 'text-asgard-text-primary' : 'text-asgard-text-primary'
            )}
          >
            {name}
          </span>
          {contactPending && (
            <span className="text-xxs px-1.5 py-0.5 rounded-full bg-asgard-away/15 text-asgard-away flex-shrink-0 ml-2">
              {t('contacts.pendingBadge')}
            </span>
          )}
          {conv.pinned && (
            <svg
              width="11" height="11" viewBox="0 0 24 24" fill="currentColor"
              className="text-asgard-glacier flex-shrink-0 ml-2" aria-hidden="true"
            >
              <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
            </svg>
          )}
          {conv.updatedAt > 0 && (
            <span className="text-xxs text-asgard-text-muted flex-shrink-0 ml-2">
              {formatConversationTime(conv.updatedAt)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-asgard-text-muted truncate">
            {conv.muted && (
              <svg className="inline w-3 h-3 mr-1" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            )}
            {lastMsg?.deleted
              ? t('chat.messageDeleted')
              : lastMsg?.content ?? t('chat.startConversation')}
          </p>

          {/* Unread badge */}
          {conv.unreadCount > 0 && !conv.muted && (
            <span className="ml-2 min-w-5 h-5 flex items-center justify-center bg-asgard-glacier text-asgard-deep-black text-xxs font-bold rounded-full px-1 flex-shrink-0">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
          {conv.unreadCount > 0 && conv.muted && (
            <span className="ml-2 w-2 h-2 rounded-full bg-asgard-text-muted flex-shrink-0" />
          )}
        </div>
      </div>
    </motion.button>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ hasSearch: boolean; onNewChat?: () => void }> = ({
  hasSearch,
  onNewChat,
}) => {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-asgard-nordic/10 flex items-center justify-center mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier/40">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
      </div>
      {hasSearch ? (
        <p className="text-sm text-asgard-text-muted">{t('chat.noConversationsFound')}</p>
      ) : (
        <>
          <p className="text-sm font-medium text-asgard-text-secondary mb-1">{t('chat.noConversationsYet')}</p>
          <p className="text-xs text-asgard-text-muted mb-4">
            {t('chat.addContactToStart')}
          </p>
          {onNewChat && (
            <button
              onClick={onNewChat}
              className="btn-primary px-4 py-2 text-xs rounded-lg"
            >
              {t('chat.startConversation')}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─── Context Menu Item ───────────────────────────────────────────────────────

const ContextMenuItem: React.FC<{
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
}> = ({ label, icon, onClick, danger }) => (
  <button
    type="button"
    role="menuitem"
    tabIndex={-1}
    onClick={onClick}
    className={cn(
      'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left',
      danger
        ? 'text-red-400 hover:bg-red-500/10'
        : 'text-asgard-text-secondary hover:bg-asgard-surface-alt hover:text-asgard-text-primary'
    )}
  >
    {icon}
    {label}
  </button>
)
