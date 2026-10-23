import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { useGroupStore } from '@/stores/groupStore'
import { useConversationStore } from '@/stores/conversationStore'
import { GroupItem } from './GroupItem'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import type { Group } from '@/types'

interface GroupListProps {
  onCreateGroup: () => void
}

const totalUnread = (group: Group): number =>
  group.channels.reduce((sum, channel) => sum + channel.unreadCount, 0)

/**
 * GroupList — left panel listing all groups with search and create button.
 */
export const GroupList: React.FC<GroupListProps> = ({ onCreateGroup }) => {
  const { t } = useTranslation()
  const {
    activeGroupId,
    setActiveGroup,
    getFilteredGroups,
    searchQuery,
  } = useGroupStore()

  const [localSearch, setLocalSearch] = useState(searchQuery)
  const groups = getFilteredGroups()

  // Le clic droit reprend les deux actions que la liste 1:1 offre déjà et qui
  // ont un sens au niveau d'un groupe : tout marquer lu, couper les alertes.
  const [contextMenu, setContextMenu] = useState<{
    group: Group
    x: number
    y: number
    muted: boolean
    fromKeyboard?: boolean
  } | null>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const menuTriggerRef = React.useRef<HTMLElement | null>(null)

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalSearch(value)
    useGroupStore.setState((s) => ({ ...s, searchQuery: value }))
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, group: Group) => {
    e.preventDefault()
    setContextMenu({
      group,
      x: e.clientX,
      y: e.clientY,
      muted: useConversationStore.getState().getConversation(group.id)?.muted ?? false,
    })
  }, [])

  // Maj+F10 et la touche Menu ouvrent le menu contextuel comme le clic droit.
  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, group: Group) => {
      if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      menuTriggerRef.current = e.currentTarget
      setContextMenu({
        group,
        x: Math.max(8, Math.min(rect.left + 16, window.innerWidth - 220)),
        y: Math.max(8, Math.min(rect.top + 16, window.innerHeight - 200)),
        muted: useConversationStore.getState().getConversation(group.id)?.muted ?? false,
        fromKeyboard: true,
      })
    },
    []
  )

  const markGroupRead = useCallback(() => {
    if (!contextMenu) return
    const store = useGroupStore.getState()
    for (const channel of contextMenu.group.channels) {
      store.clearChannelUnread(contextMenu.group.id, channel.id)
    }
    setContextMenu(null)
  }, [contextMenu])

  const toggleGroupMute = useCallback(() => {
    if (!contextMenu) return
    useConversationStore
      .getState()
      .muteConversation(contextMenu.group.id, !contextMenu.muted)
    setContextMenu(null)
  }, [contextMenu])

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
    <div className="flex flex-col h-full bg-asgard-surface border-r border-asgard-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-asgard-border flex-shrink-0">
        <h2 className="text-base font-semibold text-asgard-text-primary">{t('groups.groups')}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreateGroup}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          }
        >
          {t('groups.create')}
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 flex-shrink-0">
          <Input
            placeholder={t('groups.searchGroups')}
          value={localSearch}
          onChange={handleSearch}
          onClear={localSearch ? () => {
            setLocalSearch('')
            useGroupStore.setState((s) => ({ ...s, searchQuery: '' }))
          } : undefined}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
          }
        />
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        <AnimatePresence>
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-asgard-surface-alt flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-white/20">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              </div>
              {localSearch ? (
                <p className="text-sm text-asgard-text-muted">{t('groups.noGroupsFound')}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-asgard-text-secondary mb-1">{t('groups.noGroupsYet')}</p>
                  <p className="text-xs text-asgard-text-muted mb-3">{t('groups.createGroupHint')}</p>
                  <button
                    onClick={onCreateGroup}
                    className="text-xs text-asgard-glacier hover:underline"
                  >
                    {t('groups.createFirstGroup')}
                  </button>
                </>
              )}
            </div>
          ) : (
            groups.map((group) => (
              <GroupItem
                key={group.id}
                group={group}
                isActive={group.id === activeGroupId}
                onClick={() => setActiveGroup(group.id)}
                onContextMenu={(e) => handleContextMenu(e, group)}
                onKeyDown={(e) => handleItemKeyDown(e, group)}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label={contextMenu.group.name}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-50 mica-card border border-asgard-border rounded-xl p-1 shadow-modal min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {totalUnread(contextMenu.group) > 0 && (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={markGroupRead}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left',
                  'text-asgard-text-secondary hover:bg-asgard-surface-alt hover:text-asgard-text-primary'
                )}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                {t('chat.markAsRead')}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={toggleGroupMute}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left',
                'text-asgard-text-secondary hover:bg-asgard-surface-alt hover:text-asgard-text-primary'
              )}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
              </svg>
              {t(contextMenu.muted ? 'chat.unmuteConversation' : 'chat.muteConversation')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
