import React from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/ui/Avatar'
import { useGroupStore } from '@/stores/groupStore'
import { useTranslation } from 'react-i18next'
import { formatPublicKey } from '@/utils/id'

/**
 * MembersPanel — shows group members grouped by role.
 */
export const MembersPanel: React.FC = () => {
  const { t } = useTranslation()
  const getActiveGroup = useGroupStore((s) => s.getActiveGroup)
  const group = getActiveGroup()

  if (!group) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-asgard-text-muted">{t('panels.noGroupSelected')}</p>
      </div>
    )
  }

  const owners = group.members.filter((m) => m.role === 'owner')
  const admins = group.members.filter((m) => m.role === 'admin')
  const moderators = group.members.filter((m) => m.role === 'moderator')
  const members = group.members.filter((m) => m.role === 'member' || m.role === 'guest')

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-asgard-text-primary">{t('chat.members')}</h3>
        <span className="text-xs text-asgard-text-muted">{group.members.length}</span>
      </div>

      {owners.length > 0 && <MemberGroup title={t('common.owner')} members={owners} />}
      {admins.length > 0 && <MemberGroup title={t('groups.admins')} members={admins} />}
      {moderators.length > 0 && <MemberGroup title={t('groups.moderators')} members={moderators} />}
      {members.length > 0 && <MemberGroup title={t('groups.membersList')} members={members} />}
    </motion.div>
  )
}

const MemberGroup: React.FC<{
  title: string
  members: Array<{ publicKey: string; displayName: string; avatar?: string; role: string; mutedBy?: string }>
}> = ({ title, members }) => (
  <div>
    <h4 className="text-xs font-medium text-asgard-text-muted uppercase tracking-wider mb-2">
      {title} — {members.length}
    </h4>
    <div className="space-y-1">
      {members.map((member) => (
        <div key={member.publicKey} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-asgard-surface-alt transition-colors">
          <Avatar
            src={member.avatar}
            name={member.displayName}
            publicKey={member.publicKey}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-asgard-text-primary truncate">{member.displayName}</p>
            <p className="text-xs text-asgard-text-muted">{formatPublicKey(member.publicKey)}</p>
          </div>
          {member.mutedBy && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-busy" aria-label="Muted">
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l6 6zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.76-.48 2.51-.98L19.73 21 21 19.73 4.27 3z"/>
            </svg>
          )}
        </div>
      ))}
    </div>
  </div>
)
