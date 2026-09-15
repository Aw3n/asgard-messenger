import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'
import { formatMessageTime } from '@/utils/time'
import { useUIStore } from '@/stores/uiStore'
import { FileAttachment } from './FileAttachment'
import { MarkdownRenderer } from './MarkdownRenderer'
import { LinkPreview } from './LinkPreview'
import type { Message } from '@/types'

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
  senderName?: string
  senderAvatar?: string
  showSender?: boolean
  /** CHAT SETTINGS (collapseMessages): consecutive message from the same sender — compact layout */
  compact?: boolean
  onReply?: (message: Message) => void
  onEdit?: (message: Message) => void
  onDelete?: (message: Message) => void
  onDeletePermanently?: (message: Message) => void
  onReaction?: (message: Message, emoji: string) => void
  onForward?: (message: Message) => void
  onPin?: (message: Message) => void
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

/**
 * MessageBubble — renders a single message with reactions, context menu, and reply support.
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  senderName,
  showSender = false,
  compact = false,
  onReply,
  onEdit,
  onDelete,
  onDeletePermanently,
  onReaction,
  onForward,
  onPin,
}) => {
  const { t } = useTranslation()
  // CHAT SETTINGS: timestamps, seconds, read status ticks and density
  const chatSettings = useUIStore((s) => s.settings.chat)
  // PRIVACY SETTINGS (privacy.linkPreviews): first URL of the message gets a
  // preview card when the user opted in — metadata is fetched by the main
  // process only, nothing leaves the app when the setting is off.
  const linkPreviewUrl = useUIStore.getState().settings.privacy.linkPreviews
    ? message.content?.match(/\bhttps?:\/\/[^\s<>()[\]"']+/)?.[0]?.replace(/[.,;:!?)]+$/, '')
    : undefined
  const [showActions, setShowActions] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)

  if (message.deleted) {
    return (
      <div className={cn('flex px-4 py-0.5', isOwn ? 'justify-end' : 'justify-start')}>
        <p className="text-xs italic text-asgard-text-muted px-3 py-1 rounded-xl border border-dashed border-asgard-border">
          {t('chat.messageDeleted')}
        </p>
      </div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'group flex message-enter',
        // CHAT SETTINGS (density + collapseMessages): vertical rhythm per row
        compact ? 'py-0 px-4' : chatSettings.density === 'compact' ? 'py-0.5 px-4' : chatSettings.density === 'cozy' ? 'py-1 px-4' : 'py-1.5 px-4',
        isOwn ? 'flex-row-reverse' : 'flex-row',
        'items-end gap-2'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowContextMenu(false) }}
    >
      {/* Bubble */}
      <div className={cn('max-w-[65%] flex flex-col', isOwn ? 'items-end' : 'items-start')}>
        {/* Sender name (in groups) */}
        {showSender && !isOwn && senderName && (
          <p className="text-xs font-semibold text-asgard-glacier mb-1 px-1">{senderName}</p>
        )}

        {/* Pinned indicator */}
        {message.pinned && (
          <div className="flex items-center gap-1 mb-0.5 px-1 text-asgard-glacier/60">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v1h1.6v-1H18v-2l-2-2z"/>
            </svg>
            <span className="text-xxs">{t('chat.pinnedMessage')}</span>
          </div>
        )}

        {/* Reply preview */}
        {message.replyTo && (
          <div className={cn(
            'mb-1 px-3 py-1.5 rounded-lg border-l-2 border-asgard-glacier/50 bg-black/20 max-w-full',
          )}>
            <p className="text-xs text-asgard-glacier font-medium mb-0.5">
              {message.replyTo.senderId?.slice(0, 8) ?? '???'}…
            </p>
            <p className="text-xs text-asgard-text-muted truncate">{message.replyTo.content ?? ''}</p>
          </div>
        )}

        {/* Main bubble */}
        <div
          className={cn(
            'px-3 rounded-2xl relative',
            // CHAT SETTINGS (density): bubble padding
            chatSettings.density === 'compact' ? 'py-1.5' : chatSettings.density === 'cozy' ? 'py-2' : 'py-2.5',
            isOwn ? 'message-bubble-own' : 'message-bubble-other',
          )}
        >
          {/* Text content */}
          {message.content && (
            <div className="text-sm text-white leading-5 message-content">
              <MarkdownRenderer content={message.content} />
              {linkPreviewUrl && <LinkPreview url={linkPreviewUrl} />}
            </div>
          )}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1.5">
              {message.attachments.map((attachment) => (
                <FileAttachment
                  key={attachment.id}
                  attachment={attachment}
                  isOwn={isOwn}
                  messageId={message.id}
                  conversationId={message.conversationId}
                />
              ))}
            </div>
          )}

          {/* Edited label */}
          {message.edits && message.edits.length > 0 && (
            <span className="text-xxs text-asgard-text-muted ml-2">{t('chat.edited')}</span>
          )}
        </div>

        {/* Timestamp + status — CHAT SETTINGS: timestamps/seconds hidden via
            chat.showTimestamps / chat.showSeconds ; read ticks via chat.showReadStatus.
            In collapsed mode the timestamp only shows for the last message of a group. */}
        {(chatSettings.showTimestamps || (isOwn && chatSettings.showReadStatus)) && (
          <div className={cn('flex items-center gap-1 mt-0.5 px-1', isOwn ? 'flex-row-reverse' : 'flex-row')}>
            {chatSettings.showTimestamps && !compact && (
              <span className="text-xxs text-asgard-text-muted">
                {formatMessageTime(message.timestamp, { withSeconds: chatSettings.showSeconds })}
              </span>
            )}
            {isOwn && chatSettings.showReadStatus && <MessageStatusIcon status={message.status} />}
          </div>
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {message.reactions.map((reaction) => (
              <motion.button
                key={reaction.emoji}
                whileTap={{ scale: 0.9 }}
                onClick={() => onReaction?.(message, reaction.emoji)}
                className="flex items-center gap-1 bg-asgard-surface-alt border border-asgard-border rounded-full px-2 py-0.5 text-xs hover:bg-asgard-border transition-colors"
              >
                <span>{reaction.emoji}</span>
                <span className="text-asgard-text-secondary">{reaction.count}</span>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Action bar — shown on hover */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.1 }}
            className={cn(
              'flex items-center gap-0.5 mb-1',
              'bg-asgard-surface border border-asgard-border rounded-xl px-1 py-0.5',
              'shadow-tooltip'
            )}
          >
            {/* Quick reactions */}
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onReaction?.(message, emoji)}
                className="w-7 h-7 flex items-center justify-center text-base rounded-lg hover:bg-asgard-border transition-colors"
              >
                {emoji}
              </button>
            ))}
            {/* Divider */}
            <div className="w-px h-4 bg-asgard-border mx-1" />
            {/* Reply */}
            <ActionIcon
              label={t('chat.reply')}
              onClick={() => onReply?.(message)}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
                </svg>
              }
            />
            {/* More */}
            <ActionIcon
              label={t('chat.more')}
              onClick={() => setShowContextMenu((s) => !s)}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context menu */}
      <AnimatePresence>
        {showContextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn(
              'absolute z-50 mica-card border border-asgard-border rounded-xl p-1 shadow-modal',
              'flex flex-col gap-0.5 min-w-36'
            )}
          >
            <ContextMenuItem label={t('chat.reply')} onClick={() => { onReply?.(message); setShowContextMenu(false) }} />
            <ContextMenuItem label={t('common.copy')} onClick={() => { navigator.clipboard.writeText(message.content ?? '').catch(() => {}); setShowContextMenu(false) }} />
            {onForward && <ContextMenuItem label={t('chat.forward')} onClick={() => { onForward(message); setShowContextMenu(false) }} />}
            {onPin && <ContextMenuItem label={message.pinned ? t('chat.unpin') : t('chat.pin')} onClick={() => { onPin(message); setShowContextMenu(false) }} />}
            {/* Download attachment if present */}
            {message.attachments && message.attachments.length > 0 && message.attachments[0]?.blobKey && (
              <ContextMenuItem
                label={t('chat.downloadNamedFile', { name: message.attachments[0].name })}
                onClick={async () => {
                  const firstAttachment = message.attachments?.[0]
                  if (firstAttachment?.blobKey) {
                    const result = await window.asgard.file.saveAs(firstAttachment.blobKey, firstAttachment.name)
                    if (!result.success) {
                      console.warn('[MessageBubble] Save failed:', result.reason, result.message)
                      try {
                        window.asgard.debugLog(`[MessageBubble] Save failed: ${result.reason}${result.message ? ' - ' + result.message : ''}`)
                      } catch {}
                    }
                  }
                  setShowContextMenu(false)
                }}
              />
            )}
            {isOwn && (
              <>
                <ContextMenuItem label={t('chat.editMessage')} onClick={() => { onEdit?.(message); setShowContextMenu(false) }} />
                <div className="h-px bg-asgard-border my-0.5" />
                <ContextMenuItem label={t('common.delete')} onClick={() => { onDelete?.(message); setShowContextMenu(false) }} />
                <ContextMenuItem label={t('chat.deletePermanently')} onClick={() => { onDeletePermanently?.(message); setShowContextMenu(false) }} danger />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ActionIcon: React.FC<{ label: string; icon: React.ReactNode; onClick: () => void }> = ({
  label,
  icon,
  onClick,
}) => (
  <button
    aria-label={label}
    onClick={onClick}
    className="w-7 h-7 flex items-center justify-center rounded-lg text-asgard-text-muted hover:bg-asgard-border hover:text-asgard-text-primary transition-colors"
  >
    {icon}
  </button>
)

const ContextMenuItem: React.FC<{
  label: string
  onClick: () => void
  danger?: boolean
}> = ({ label, onClick, danger }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full text-left px-3 py-2 text-sm rounded-lg transition-colors',
      danger
        ? 'text-red-400 hover:bg-red-500/10'
        : 'text-asgard-text-secondary hover:bg-asgard-surface-alt hover:text-asgard-text-primary'
    )}
  >
    {label}
  </button>
)

function MessageStatusIcon({ status }: { status: Message['status'] }) {
  if (status === 'sending') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-white/40 animate-spin-slow">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10"/>
      </svg>
    )
  }
  if (status === 'sent') {
    return (
      <svg width="14" height="12" viewBox="0 0 18 12" fill="none" className="text-white/50">
        <path d="M1 6L5 10L12 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  if (status === 'delivered') {
    return (
      <svg width="18" height="12" viewBox="0 0 24 12" fill="none" className="text-white/50">
        <path d="M1 6L5 10L12 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 6L13 10L20 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  if (status === 'read') {
    return (
      <svg width="18" height="12" viewBox="0 0 24 12" fill="none" className="text-asgard-glacier">
        <path d="M1 6L5 10L12 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 6L13 10L20 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  if (status === 'failed') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-busy">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
    )
  }
  return null
}
