import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'
import { copyMessageText } from '@/utils/clipboard'
import { saveAttachmentToDisk } from '@/utils/attachmentSave'
import { useMenuGestures } from '@/hooks/useMenuGestures'
import { DELETE_MODE_LABEL_KEYS, type DeleteMode } from '@/hooks/useDeleteConfirmation'
import { formatCombo } from '@/utils/shortcuts'
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
  /** Résultat de recherche atteint : la bulle se repère quelques instants. */
  highlighted?: boolean
  onReply?: (message: Message) => void
  onEdit?: (message: Message) => void
  /** Réessaie l'envoi d'un message passé en échec définitif. */
  onRetry?: (message: Message) => void
  /** Demande de suppression : le menu dit quel geste a été cliqué, la vue n'a
   *  plus qu'à l'enregistrer — ici ouvrir le dialogue, jamais effacer. */
  onDelete?: (message: Message, mode: DeleteMode) => void
  /** Les suppressions que la vue sait réellement exécuter, dans l'ordre du
   *  menu. Une entrée n'est qu'un mode : son libellé sort de la même table que
   *  le bouton du dialogue de confirmation, donc la bulle ne peut pas promettre
   *  un geste que la vue ne fait pas. */
  deleteModes?: DeleteMode[]
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
  highlighted = false,
  onReply,
  onEdit,
  onRetry,
  onDelete,
  deleteModes,
  onReaction,
  onForward,
  onPin,
}) => {
  const { t } = useTranslation()
  // CHAT SETTINGS: timestamps, seconds, read status ticks and density
  const chatSettings = useUIStore((s) => s.settings.chat)
  // Les combinaisons réglées à l'écran « Raccourcis » se relisent ici, là où
  // l'action se joue : une touche changée doit se retrouver sans rouvrir les
  // réglages. Seuls les gestes qui portent sur cette rangée ont un indice —
  // « Éditer le dernier message » vise un autre message que celui du menu.
  const shortcuts = useUIStore((s) => s.settings.keyboardShortcuts)
  // PRIVACY SETTINGS (privacy.linkPreviews): first URL of the message gets a
  // preview card when the user opted in — metadata is fetched by the main
  // process only, nothing leaves the app when the setting is off.
  // La souscription est obligatoire : lu en getState(), l'interrupteur restait
  // sans effet sur les bulles déjà montées.
  const linkPreviewsOn = useUIStore((s) => s.settings.privacy.linkPreviews)
  const linkPreviewUrl = linkPreviewsOn
    ? message.content?.match(/\bhttps?:\/\/[^\s<>()[\]"']+/)?.[0]?.replace(/[.,;:!?)]+$/, '')
    : undefined
  const [showActions, setShowActions] = useState(false)
  /**
   * Menu ancré à des coordonnées écran, pas à la bulle : ouvert au clic droit,
   * par le bouton « Plus » (souris et tactile) ou au clavier (Menu / Maj+F10).
   * `null` = fermé ; sinon il se ferme au clic extérieur, à la touche de
   * fermeture réglée, au scroll et au redimensionnement.
   */
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    fromKeyboard?: boolean
  } | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Le menu ne rend que les suppressions que la vue a demandées : rien ici sans
  // geste réellement possible derrière.
  const shownDeleteModes = onDelete ? (deleteModes ?? []) : []

  const openContextMenu = (x: number, y: number, fromKeyboard = false) => {
    // Le menu porte sur la rangée ouverte : le focus y vient, sinon la frappe
    // réglée (Copier, Répondre, Transférer) agirait sur la rangée tenue depuis
    // le dernier Tab pendant que l'utilisateur regarde un autre message.
    rowRef.current?.focus()
    // Le menu fait ~240 × 240 px depuis qu'une colonne de geste porte la
    // combinaison réglée en face de chaque action : on le garde dans la fenêtre
    // plutôt que de le laisser sortir à droite ou en bas sur les messages des
    // bords. La largeur réelle dépend de la frappe que l'utilisateur a réglée ;
    // une combinaison à quatre modificateurs déborde encore, elle se rattrape
    // au clic extérieur.
    setContextMenu({
      x: Math.max(8, Math.min(x, window.innerWidth - 248)),
      y: Math.max(8, Math.min(y, window.innerHeight - 248)),
      fromKeyboard,
    })
  }

  // Touche réglée, flèches, `Home`/`Fin`/`Tab` et focus rendu à la rangée : le
  // même geste que sur les menus des trois listes.
  useMenuGestures({
    open: !!contextMenu,
    menuRef,
    triggerRef: rowRef,
    onClose: () => setContextMenu(null),
    fromKeyboard: contextMenu?.fromKeyboard,
  })

  // Le menu est posé à des coordonnées d'écran : défiler ou redimensionner le
  // laisserait flottant loin du message qu'il commande.
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])

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
      ref={rowRef}
      layout
      // La rangée focalisée porte l'identifiant du message : les gestes réglés
      // (copie, réponse, transfert) cherchent ainsi « sur quoi » ils portent.
      data-message-id={message.id}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15 }}
      // Une rangée focalisable rend les actions atteignables au clavier :
      // Tab affiche la barre, Menu/Maj+F10 ouvre le menu complet, Échap le ferme.
      tabIndex={0}
      role="group"
      aria-label={t('chat.messageActions')}
      aria-haspopup="menu"
      aria-expanded={!!contextMenu}
      onKeyDown={(e) => {
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault()
          const rect = rowRef.current?.getBoundingClientRect()
          openContextMenu(rect ? rect.left + 24 : 24, rect ? rect.top + 24 : 24, true)
        }
      }}
      className={cn(
        'group flex message-enter rounded-lg',
        // CHAT SETTINGS (density + collapseMessages): vertical rhythm per row
        compact ? 'py-0 px-4' : chatSettings.density === 'compact' ? 'py-0.5 px-4' : chatSettings.density === 'cozy' ? 'py-1 px-4' : 'py-1.5 px-4',
        isOwn ? 'flex-row-reverse' : 'flex-row',
        'items-end gap-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-asgard-glacier/40',
        highlighted && 'bg-asgard-glacier/10 ring-1 ring-inset ring-asgard-glacier/50'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onFocus={() => setShowActions(true)}
      onBlur={(e) => {
        // Ne referme pas la barre quand le focus passe d'un bouton à l'autre
        // de la même rangée ; seulement quand il en sort.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setShowActions(false)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        openContextMenu(e.clientX, e.clientY)
      }}
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
        {(chatSettings.showTimestamps || (isOwn && (chatSettings.showReadStatus || message.status === 'failed'))) && (
          <div className={cn('flex items-center gap-1 mt-0.5 px-1', isOwn ? 'flex-row-reverse' : 'flex-row')}>
            {chatSettings.showTimestamps && !compact && (
              <span className="text-xxs text-asgard-text-muted">
                {formatMessageTime(message.timestamp, { withSeconds: chatSettings.showSeconds })}
              </span>
            )}
            {/* Un échec doit rester visible même quand l'utilisateur a masqué
                les accusés de lecture, sinon le message semble simplement parti. */}
            {isOwn && (chatSettings.showReadStatus || message.status === 'failed') && (
              <MessageStatusIcon
                status={message.status}
                onRetry={onRetry ? () => onRetry(message) : undefined}
              />
            )}
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
            {/* More — ancre le menu sous le bouton (souris, tactile, clavier) */}
            <ActionIcon
              label={t('chat.more')}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                openContextMenu(rect.left, rect.bottom + 4)
              }}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context menu — ancré à l'écran, fermé par clic extérieur / Échap */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label={t('chat.messageActions')}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className={cn(
              'fixed z-50 mica-card border border-asgard-border rounded-xl p-1 shadow-modal',
              'flex flex-col gap-0.5 min-w-36'
            )}
          >
            <ContextMenuItem label={t('chat.reply')} hint={formatCombo(shortcuts.replyToMessage)} onClick={() => { onReply?.(message); setContextMenu(null) }} />
            {message.content && (
              <ContextMenuItem label={t('common.copy')} hint={formatCombo(shortcuts.copyMessage)} onClick={() => { copyMessageText(message); setContextMenu(null) }} />
            )}
            {onForward && <ContextMenuItem label={t('chat.forward')} hint={formatCombo(shortcuts.forwardMessage)} onClick={() => { onForward(message); setContextMenu(null) }} />}
            {onPin && <ContextMenuItem label={message.pinned ? t('chat.unpin') : t('chat.pin')} onClick={() => { onPin(message); setContextMenu(null) }} />}
            {isOwn && onRetry && message.status === 'failed' && (
              <ContextMenuItem label={t('chat.retrySend')} onClick={() => { onRetry(message); setContextMenu(null) }} />
            )}
            {/* Download attachment if present */}
            {message.attachments && message.attachments.length > 0 && message.attachments[0]?.blobKey && (
              <ContextMenuItem
                label={t('chat.downloadNamedFile', { name: message.attachments[0].name })}
                onClick={async () => {
                  const firstAttachment = message.attachments?.[0]
                  if (firstAttachment) await saveAttachmentToDisk(firstAttachment, t)
                  setContextMenu(null)
                }}
              />
            )}
            {isOwn && (onEdit || shownDeleteModes.length > 0) && (
              <>
                <div className="h-px bg-asgard-border my-0.5" />
                {onEdit && message.content && (
                  <ContextMenuItem label={t('chat.editMessage')} onClick={() => { onEdit(message); setContextMenu(null) }} />
                )}
                {shownDeleteModes.map((mode) => (
                  <ContextMenuItem
                    key={mode}
                    label={t(DELETE_MODE_LABEL_KEYS[mode])}
                    onClick={() => { onDelete?.(message, mode); setContextMenu(null) }}
                    danger
                  />
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ActionIcon: React.FC<{
  label: string
  icon: React.ReactNode
  onClick: React.MouseEventHandler<HTMLButtonElement>
}> = ({ label, icon, onClick }) => (
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
  /** La combinaison réglée qui fait la même chose au clavier, `null` si le geste n'existe pas ici. */
  hint?: string | null
  onClick: () => void
  danger?: boolean
}> = ({ label, hint, onClick, danger }) => (
  <button
    role="menuitem"
    onClick={onClick}
    className={cn(
      'w-full flex items-center justify-between gap-4 text-left px-3 py-2 text-sm rounded-lg transition-colors',
      danger
        ? 'text-red-400 hover:bg-red-500/10'
        : 'text-asgard-text-secondary hover:bg-asgard-surface-alt hover:text-asgard-text-primary'
    )}
  >
    <span>{label}</span>
    {hint && <span className="shrink-0 text-xs font-mono text-asgard-text-muted">{hint}</span>}
  </button>
)

function MessageStatusIcon({ status, onRetry }: { status: Message['status']; onRetry?: () => void }) {
  const { t } = useTranslation()
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
    const icon = (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-busy">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
    )
    // L'échec est actionnable : un clic relance l'envoi au lieu de laisser
    // l'utilisateur retaper un message qu'il voit déjà dans la conversation.
    if (onRetry) {
      return (
        <button
          type="button"
          onClick={onRetry}
          aria-label={t('chat.retrySend')}
          title={t('chat.retrySend')}
          className="rounded p-0.5 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-asgard-glacier"
        >
          {icon}
        </button>
      )
    }
    return (
      <span role="img" aria-label={t('chat.messageNotDelivered')} title={t('chat.messageNotDelivered')}>
        {icon}
      </span>
    )
  }
  return null
}
