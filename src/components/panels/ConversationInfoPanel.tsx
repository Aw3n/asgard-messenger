import React from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/ui/Avatar'
import { useConversationStore } from '@/stores/conversationStore'
import { useContactStore } from '@/stores/contactStore'
import { useTranslation } from 'react-i18next'
import { formatPublicKey } from '@/utils/id'
import { presenceMeta } from '@/utils/presence'
import { getCurrentLanguage } from '@/i18n/config'

/**
 * ConversationInfoPanel — shows conversation details: avatar, name, encryption status, key.
 */
export const ConversationInfoPanel: React.FC = () => {
  const { t } = useTranslation()
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  // S'abonner à la table elle-même : couper le son doit réafficher l'état du
  // bouton immédiatement (getConversation seul ne déclenche aucun rendu).
  const conversations = useConversationStore((s) => s.conversations)
  const muteConversation = useConversationStore((s) => s.muteConversation)
  // Subscribe to contacts object for reactive status updates
  const contacts = useContactStore((s) => s.contacts)

  const conversation = activeConversationId ? conversations[activeConversationId] ?? null : null
  const contact = conversation?.participantId ? contacts[conversation.participantId] : null
  const displayName = contact?.displayName ?? activeConversationId?.slice(0, 16) ?? t('common.unknown')
  // Une sourdine temporisée expire toute seule : sans échéance affichée, elle
  // est indiscernable d'une sourdine permanente.
  const muteExpiry =
    conversation?.muted && conversation.mutedUntil != null
      ? new Date(conversation.mutedUntil).toLocaleString(getCurrentLanguage(), {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : null

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

      {/* Sourdine : ChatService ignore les notifications, le son et la TTS
          tant que conversation.muted est vrai ; les non-lus continuent d'être
          comptés. */}
      {conversation && (
        <div className="px-3 py-2.5 bg-asgard-surface-alt/60 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-asgard-text-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
              </svg>
              {t(conversation.muted ? 'chat.unmuteConversation' : 'chat.muteConversation')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={conversation.muted}
              aria-label={t(conversation.muted ? 'chat.unmuteConversation' : 'chat.muteConversation')}
              aria-describedby={muteExpiry ? 'conversation-mute-expiry' : undefined}
              onClick={() => muteConversation(conversation.id, !conversation.muted)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                conversation.muted ? 'bg-asgard-glacier' : 'bg-asgard-border'
              } cursor-pointer`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  conversation.muted ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {muteExpiry && (
            <p id="conversation-mute-expiry" className="mt-1.5 text-xxs text-asgard-text-muted">
              {t('panels.mutedUntil', { date: muteExpiry })}
            </p>
          )}
        </div>
      )}

      {/* Details */}
      <div className="space-y-3">
        <DetailRow label={t('contacts.publicKey')} value={conversation?.participantId ? formatPublicKey(conversation.participantId) : t('common.unknown')} />
        {/* Libellé commun à toute l'interface (src/utils/presence.ts) : cette table
            affichait « Ne pas déranger » là où le reste de l'app dit « Occupé »
            pour la même personne. */}
        <DetailRow label={t('settings.status')} value={contact?.status ? t(presenceMeta(contact.status).labelKey) : t('common.unknown')} />
        {contact?.lastSeen && (
          <DetailRow label={t('chat.lastSeen')} value={new Date(contact.lastSeen).toLocaleString(getCurrentLanguage())} />
        )}
        {contact?.addedAt && (
          <DetailRow label={t('common.added')} value={new Date(contact.addedAt).toLocaleDateString(getCurrentLanguage())} />
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
