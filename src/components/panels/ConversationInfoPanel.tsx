import React from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/ui/Avatar'
import { useConversationStore } from '@/stores/conversationStore'
import { useContactStore } from '@/stores/contactStore'
import { useTranslation } from 'react-i18next'
import { formatPublicKey } from '@/utils/id'

/**
 * ConversationInfoPanel — shows conversation details: avatar, name, encryption status, key.
 */
export const ConversationInfoPanel: React.FC = () => {
  const { t } = useTranslation()
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const getConversation = useConversationStore((s) => s.getConversation)
  // Subscribe to contacts object for reactive status updates
  const contacts = useContactStore((s) => s.contacts)

  const conversation = activeConversationId ? getConversation(activeConversationId) : null
  const contact = conversation?.participantId ? contacts[conversation.participantId] : null
  const displayName = contact?.displayName ?? activeConversationId?.slice(0, 16) ?? t('common.unknown')

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="p-4 space-y-4"
    >
      {/* Avatar + Name */}
      <div className="flex flex-col items-center py-4">
        <Avatar
          src={contact?.avatar}
          name={displayName}
          publicKey={conversation?.participantId || ''}
          size="xl"
          status={contact?.status}
          showStatus
        />
        <h3 className="text-base font-semibold text-asgard-text-primary mt-3">{displayName}</h3>
        {contact?.remoteName && (
          <p className="text-xs text-asgard-text-muted">@{contact.remoteName}</p>
        )}
      </div>

      {/* Encryption info */}
      <div className="bg-asgard-nordic/5 border border-asgard-nordic/10 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
          <span className="text-xs font-medium text-asgard-glacier">{t('panels.endToEndEncrypted')}</span>
        </div>
        <p className="text-xs text-asgard-text-muted">
          {t('panels.encryptionDescription')}
        </p>
      </div>

      {/* Details */}
      <div className="space-y-3">
        <DetailRow label={t('contacts.publicKey')} value={conversation?.participantId ? formatPublicKey(conversation.participantId) : t('common.unknown')} />
        <DetailRow label={t('settings.status')} value={contact?.status ? {
          online: t('common.online'),
          offline: t('common.offline'),
          away: t('common.away'),
          busy: t('common.busy'),
          dnd: t('common.dnd'),
          invisible: t('common.invisible'),
        }[contact.status] ?? t('common.unknown') : t('common.unknown')} />
        {contact?.lastSeen && (
          <DetailRow label={t('chat.lastSeen')} value={new Date(contact.lastSeen).toLocaleString()} />
        )}
        {contact?.addedAt && (
          <DetailRow label={t('common.added')} value={new Date(contact.addedAt).toLocaleDateString()} />
        )}
        {contact?.verified && (
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            <span className="text-xs text-asgard-glacier">{t('panels.identityVerified')}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-xs text-asgard-text-muted uppercase tracking-wider">{label}</span>
    <span className="text-xs text-asgard-text-secondary font-mono">{value}</span>
  </div>
)
