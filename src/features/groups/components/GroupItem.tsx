import React from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/utils/cn'
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
          {totalUnread > 0 && (
            <span className="ml-2 min-w-5 h-5 flex items-center justify-center bg-asgard-glacier text-asgard-deep-black text-xxs font-bold rounded-full px-1 flex-shrink-0">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
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
