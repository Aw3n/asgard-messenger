import React from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/utils/cn'
import { useConversationStore } from '@/stores/conversationStore'
import type { Group } from '@/types'
import { useTranslation } from 'react-i18next'

interface GroupItemProps {
  group: Group
  isActive: boolean
  onClick: () => void
}

/**
 * GroupItem — renders a single group in the group list.
 * Shows avatar, name, member count, and total unread badge.
 */
export const GroupItem: React.FC<GroupItemProps> = ({ group, isActive, onClick }) => {
  const { t } = useTranslation()
  const memberCount = group.members.length
  const totalUnread = group.channels.reduce((sum, ch) => sum + ch.unreadCount, 0)
  // Même convention que la liste 1:1 : une conversation muette garde son
  // compteur visible mais sous forme de point neutre, pas de pastille vive.
  const muted = useConversationStore((s) => s.conversations[group.id]?.muted ?? false)

  return (
    <motion.button
      layout
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5',
        'transition-colors duration-100 text-left rounded-xl mx-1',
        isActive
          ? 'bg-asgard-nordic/20 text-asgard-glacier'
          : 'hover:bg-asgard-surface-alt text-asgard-text-primary'
      )}
    >
      {/* Group avatar */}
      <div className="flex-shrink-0">
        <Avatar
          src={group.avatar}
          name={group.name}
          publicKey={group.id}
          size="md"
        />
      </div>

      {/* Group info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-sm font-medium truncate">{group.name}</span>
          {muted && (
            <svg
              width="11" height="11" viewBox="0 0 24 24" fill="currentColor"
              className="text-asgard-text-muted flex-shrink-0 ml-2"
              data-testid="group-muted"
              aria-label={t('chat.muteConversation')}
            >
              <path d="M20 18.69L7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42v5l-2 2v1h13.73l2 2L21 19.72l-1-1.03zM12 22c1.11 0 2-.89 2-2h-4c0 1.11.89 2 2 2zm6-7.32V11c0-3.08-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.15.03-.29.08-.42.12-.1.03-.2.07-.3.11h-.01c-.01 0-.01 0-.02.01-.23.09-.46.2-.68.31 0 0-.01 0-.01.01L18 14.68z" />
            </svg>
          )}
          {totalUnread > 0 && !muted && (
            <span className="ml-2 min-w-5 h-5 flex items-center justify-center bg-asgard-glacier text-asgard-deep-black text-xxs font-bold rounded-full px-1 flex-shrink-0">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
          {totalUnread > 0 && muted && (
            <span
              className="ml-2 w-2 h-2 rounded-full bg-asgard-text-muted flex-shrink-0"
              data-testid="group-unread-muted"
            />
          )}
        </div>
        <p className="text-xs text-asgard-text-muted truncate">
          {group.description
            ? group.description
            : t('groups.memberCount', { count: memberCount })}
        </p>
      </div>
    </motion.button>
  )
}
