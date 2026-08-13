import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui/Avatar'
import { useIdentityStore } from '@/stores/identityStore'
import { useConversationStore } from '@/stores/conversationStore'
import { cn } from '@/utils/cn'

interface NavItem {
  id: string
  path: string
  label: string
  icon: React.ReactNode
  badge?: number
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const ChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
  </svg>
)

const ContactsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
  </svg>
)

const GroupsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
  </svg>
)

const CallsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
  </svg>
)

const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
  </svg>
)

/**
 * Sidebar — vertical navigation rail.
 * Clean icons with tooltips, active indicator, user avatar at bottom.
 */
export const Sidebar: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const identity = useIdentityStore((s) => s.identity)
  const conversations = useConversationStore((s) => s.conversations)

  const totalUnread = Object.values(conversations).reduce(
    (sum, c) => sum + (c.unreadCount ?? 0),
    0
  )

  const navItems: NavItem[] = [
    {
      id: 'conversations',
      path: '/conversations',
      label: t('nav.messages'),
      icon: <ChatIcon />,
      badge: totalUnread > 0 ? totalUnread : undefined,
    },
    { id: 'contacts',  path: '/contacts',  label: t('nav.contacts'), icon: <ContactsIcon /> },
    { id: 'groups',    path: '/groups',    label: t('nav.groups'),  icon: <GroupsIcon /> },
    { id: 'calls',     path: '/calls',     label: t('nav.calls'),   icon: <CallsIcon /> },
  ]

  return (
    <nav
      className="flex flex-col items-center py-2 w-14 flex-shrink-0 h-full"
      style={{ background: 'rgba(9,12,22,0.95)', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Main nav */}
      <div className="flex flex-col items-center gap-0.5 flex-1 w-full px-1.5 pt-1">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path)
          return (
            <NavButton
              key={item.id}
              item={item}
              isActive={isActive}
              onClick={() => navigate(item.path)}
            />
          )
        })}
      </div>

      {/* Divider */}
      <div className="w-8 h-px my-1" style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* Settings */}
      <div className="px-1.5 pb-1 w-full">
        <NavButton
          item={{ id: 'settings', path: '/settings', label: t('nav.settings'), icon: <SettingsIcon /> }}
          isActive={location.pathname.startsWith('/settings')}
          onClick={() => navigate('/settings')}
        />
      </div>

      {/* User avatar */}
      <div className="px-1.5 pb-2 w-full">
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center justify-center p-1.5 rounded-xl transition-colors hover:bg-white/8"
          aria-label={t('nav.myProfile')}
        >
          <Avatar
            src={identity?.profile.avatar}
            name={identity?.profile.displayName}
            publicKey={identity?.keyPair.publicKey}
            size="sm"
            status={identity?.profile.status ?? 'offline'}
            showStatus
          />
        </button>
      </div>
    </nav>
  )
}

// ─── NavButton ────────────────────────────────────────────────────────────────

interface NavButtonProps {
  item: NavItem
  isActive: boolean
  onClick: () => void
}

const NavButton: React.FC<NavButtonProps> = ({ item, isActive, onClick }) => (
  <div className="relative w-full group">
    {/* Active pill indicator */}
    <AnimatePresence>
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r-full"
          style={{ background: '#4FC3F7' }}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0 }}
          transition={{ duration: 0.2 }}
        />
      )}
    </AnimatePresence>

    {/* Button */}
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      aria-label={item.label}
      className={cn(
        'relative w-full h-11 flex items-center justify-center rounded-xl',
        'transition-all duration-150',
        isActive
          ? 'text-[#4FC3F7]'
          : 'text-[#6B7FA8] hover:text-[#A8B8D8] hover:bg-white/6'
      )}
      style={isActive ? { background: 'rgba(79,195,247,0.12)' } : {}}
    >
      {item.icon}

      {/* Unread badge */}
      {item.badge !== undefined && item.badge > 0 && (
        <span
          className="absolute top-1.5 right-1.5 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold rounded-full px-1"
          style={{ background: '#4FC3F7', color: '#0B0E1A' }}
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </motion.button>

    {/* Tooltip on hover */}
    <div className={cn(
      'absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5',
      'rounded-lg text-xs font-medium whitespace-nowrap',
      'pointer-events-none opacity-0 group-hover:opacity-100',
      'transition-opacity duration-150 z-50'
    )}
      style={{ background: 'rgba(15,20,35,0.95)', color: '#C8D0E8', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      {item.label}
    </div>
  </div>
)
