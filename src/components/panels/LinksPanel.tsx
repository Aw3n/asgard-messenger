import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useMessageStore } from '@/stores/messageStore'
import { useConversationStore } from '@/stores/conversationStore'

/**
 * LinksPanel — shows all links shared in the active conversation.
 */
export const LinksPanel: React.FC = () => {
  const { t } = useTranslation()
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const getMessages = useMessageStore((s) => s.getMessages)

  const messages = activeConversationId ? getMessages(activeConversationId) : []

  // Extract URLs from messages
  const urlRegex = /https?:\/\/[^\s<]+/g
  const links: { url: string; timestamp: number; senderId: string }[] = []

  for (const msg of messages) {
    if (msg.deleted) continue
    const matches = msg.content.match(urlRegex)
    if (matches) {
      for (const url of matches) {
        links.push({ url, timestamp: msg.timestamp, senderId: msg.senderId })
      }
    }
  }

  // Sort by most recent first
  links.sort((a, b) => b.timestamp - a.timestamp)

  // Deduplicate URLs
  const seen = new Set<string>()
  const uniqueLinks = links.filter((l) => {
    if (seen.has(l.url)) return false
    seen.add(l.url)
    return true
  })

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-asgard-text-primary">{t('panels.sharedLinks')}</h3>
        <span className="text-xs text-asgard-text-muted">{uniqueLinks.length}</span>
      </div>

      {uniqueLinks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted/30 mb-2">
            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
          </svg>
          <p className="text-sm text-asgard-text-muted">{t('panels.noLinksShared')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {uniqueLinks.map((link, index) => {
            let domain = ''
            try {
              domain = new URL(link.url).hostname
            } catch {
              domain = link.url.slice(0, 30)
            }

            return (
              <a
                key={index}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-asgard-surface-alt hover:bg-asgard-border transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-asgard-nordic/10 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-asgard-glacier truncate group-hover:underline">{domain}</p>
                  <p className="text-xs text-asgard-text-muted truncate">{link.url}</p>
                </div>
                <span className="text-xxs text-asgard-text-muted flex-shrink-0">
                  {new Date(link.timestamp).toLocaleDateString()}
                </span>
              </a>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
