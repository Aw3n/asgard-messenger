import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useMessageStore } from '@/stores/messageStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useTranslation } from 'react-i18next'
import { FileAttachment } from '@/features/chat/components/FileAttachment'
import { getCurrentLanguage } from '@/i18n/config'
import type { Message, MessageAttachment } from '@/types'

/** Référence stable pour une conversation encore vide (évite un rendu par lecture). */
const NO_MESSAGES: Message[] = []

/**
 * FilesPanel — shows all file attachments shared in the active conversation.
 */
export const FilesPanel: React.FC = () => {
  const { t } = useTranslation()
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  // S'abonner à la LISTE (pas à getMessages, dont la référence ne change jamais) :
  // sans cela le panneau reste figé aux pièces jointes présentes à l'ouverture.
  const messages = useMessageStore((s) => (
    activeConversationId ? s.messages[activeConversationId] ?? NO_MESSAGES : NO_MESSAGES
  ))

  const allAttachments = useMemo(() => {
    const list: { attachment: MessageAttachment; timestamp: number }[] = []
    for (const msg of messages) {
      if (msg.attachments) {
        for (const att of msg.attachments) {
          list.push({ attachment: att, timestamp: msg.timestamp })
        }
      }
    }
    // Sort by most recent first
    return list.sort((a, b) => b.timestamp - a.timestamp)
  }, [messages])

  // Group by date
  const grouped = useMemo(() => {
    const locale = getCurrentLanguage()
    const out: Record<string, typeof allAttachments> = {}
    for (const item of allAttachments) {
      const date = new Date(item.timestamp).toLocaleDateString(locale)
      if (!out[date]) out[date] = []
      out[date].push(item)
    }
    return out
  }, [allAttachments])

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-asgard-text-primary">{t('panels.sharedFiles')}</h3>
        <span className="text-xs text-asgard-text-muted">{allAttachments.length}</span>
      </div>

      {allAttachments.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted/30 mb-2">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
          </svg>
          <p className="text-sm text-asgard-text-muted">{t('panels.noFilesShared')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <h4 className="text-xs font-medium text-asgard-text-muted uppercase tracking-wider mb-2">
                {date}
              </h4>
              <div className="space-y-2">
                {items.map(({ attachment }) => (
                  <FileAttachment
                    key={attachment.id}
                    attachment={attachment}
                    isOwn={false}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
