import React from 'react'
import { motion } from 'framer-motion'
import { useGroupStore } from '@/stores/groupStore'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/utils/cn'
import type { GroupMember, MemberRole } from '@/types'
import { useTranslation } from 'react-i18next'

/**
 * MemberList — displays group members grouped by role.
 * Shows role badges, online status, and provides admin actions context menu.
 */
export const MemberList: React.FC = () => {
  const { t } = useTranslation()
  const activeGroup = useGroupStore((s) => s.getActiveGroup())
  const getMembers = useGroupStore((s) => s.getMembers)
  const getOnlineMembers = useGroupStore((s) => s.getOnlineMembers)

  if (!activeGroup) return null

  const members = getMembers(activeGroup.id)
  const onlineMembers = new Set(getOnlineMembers(activeGroup.id))

  // Group members by role
  const owners = members.filter((m) => m.role === 'owner')
  const admins = members.filter((m) => m.role === 'admin')
  const moderators = members.filter((m) => m.role === 'moderator')
  const regularMembers = members.filter((m) => m.role === 'member')
  const guests = members.filter((m) => m.role === 'guest')

  return (
    <div className="w-56 flex-shrink-0 bg-asgard-deep-black/40 border-l border-asgard-border overflow-y-auto">
      <div className="px-3 py-3 border-b border-asgard-border">
        <h3 className="text-sm font-semibold text-asgard-text-primary">
          {t('groups.memberCount', { count: members.length })}
        </h3>
        <p className="text-xs text-asgard-text-muted">
          {t('groups.onlineMembers', { count: onlineMembers.size })}
        </p>
      </div>

      <div className="py-2">
        {owners.length > 0 && (
          <MemberSection title={t('common.owner')} members={owners} onlineMembers={onlineMembers} />
        )}
        {admins.length > 0 && (
          <MemberSection title={t('groups.admins')} members={admins} onlineMembers={onlineMembers} />
        )}
        {moderators.length > 0 && (
          <MemberSection title={t('groups.moderators')} members={moderators} onlineMembers={onlineMembers} />
        )}
        {regularMembers.length > 0 && (
          <MemberSection title={t('common.member_plural')} members={regularMembers} onlineMembers={onlineMembers} />
        )}
        {guests.length > 0 && (
          <MemberSection title={t('groups.guests')} members={guests} onlineMembers={onlineMembers} />
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const MemberSection: React.FC<{ title: string; members: GroupMember[]; onlineMembers: Set<string> }> = ({
  title,
  members,
  onlineMembers,
}) => (
  <div className="mb-3">
    <p className="px-3 py-1 text-xxs font-semibold text-asgard-text-muted uppercase tracking-wider">
      {title} — {members.length}
    </p>
    {members.map((member) => (
      <MemberItem key={member.publicKey} member={member} isOnline={onlineMembers.has(member.publicKey)} />
    ))}
  </div>
)

const MemberItem: React.FC<{ member: GroupMember; isOnline: boolean }> = ({ member, isOnline }) => {
  const { t } = useTranslation()
  const roleBadge = getRoleBadge(member.role, t)

  return (
    <motion.div
      layout
      className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-asgard-surface-alt transition-colors cursor-default"
    >
      <div className="relative">
        <Avatar
          src={member.avatar}
          name={member.displayName}
          publicKey={member.publicKey}
          size="sm"
        />
        {/* Online indicator */}
        <div
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-asgard-deep-black',
            isOnline ? 'bg-asgard-online' : 'bg-asgard-text-muted/50'
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-asgard-text-primary truncate">
          {member.displayName}
        </p>
        {roleBadge && (
          <span
            className={cn(
              'inline-block text-xxs px-1.5 py-0.5 rounded font-medium',
              roleBadge.className
            )}
          >
            {roleBadge.label}
          </span>
        )}
      </div>
      {member.mutedBy && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-busy flex-shrink-0">
          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
        </svg>
      )}
    </motion.div>
  )
}

function getRoleBadge(role: MemberRole, t: (key: string) => string): { label: string; className: string } | null {
  switch (role) {
    case 'owner':
      return { label: t('common.owner'), className: 'bg-asgard-cyan/20 text-asgard-cyan' }
    case 'admin':
      return { label: t('common.admin'), className: 'bg-asgard-glacier/20 text-asgard-glacier' }
    case 'moderator':
      return { label: t('common.moderator'), className: 'bg-asgard-online/20 text-asgard-online' }
    case 'guest':
      return { label: t('common.guest'), className: 'bg-asgard-surface-alt text-asgard-text-muted' }
    default:
      return null
  }
}
