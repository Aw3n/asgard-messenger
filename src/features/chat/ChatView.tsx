import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useMessageStore } from '@/stores/messageStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useContactStore } from '@/stores/contactStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useNetworkStore } from '@/stores/networkStore'
import { useUIStore } from '@/stores/uiStore'
import { MessageBubble } from './components/MessageBubble'
import { MessageInput } from './components/MessageInput'
import { ForwardModal } from './components/ForwardModal'
import { ActiveTransfersWidget } from './components/ActiveTransfersWidget'
import { Avatar } from '@/components/ui/Avatar'
import { chatService } from '@/services/ChatService'
import { p2pService } from '@/services/P2PService'
import { cryptoService } from '@/services/CryptoService'
import { callService } from '@/services/CallService'
import { fileService } from '@/services/FileService'
import { RightPanel } from '@/components/panels/RightPanel'
import { presenceMeta, isLivePresence } from '@/utils/presence'
import type { Message } from '@/types'

/**
 * ChatView — main conversation view.
 * Renders virtualized message list + input bar + header.
 */
export const ChatView: React.FC = () => {
  const { t } = useTranslation()
  const { conversationId } = useParams<{ conversationId: string }>()
  const [replyTo, setReplyTo] = useState<Message | undefined>()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [forwardMessage, setForwardMessage] = useState<Message | undefined>()
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const navigate = useNavigate()

  const identity = useIdentityStore((s) => s.identity)
  const getConversation = useConversationStore((s) => s.getConversation)
  // CRITICAL: Subscribe to the contacts OBJECT (not the getContact function).
  // This ensures ChatView re-renders when a contact's status changes,
  // keeping the header status indicator in sync with the conversation list.
  const contacts = useContactStore((s) => s.contacts)
  const getTypingUsers = useNetworkStore((s) => s.getTypingUsers)
  const setRightPanelView = useUIStore((s) => s.setRightPanelView)
  const rightPanelView = useUIStore((s) => s.rightPanelView)
  const setSearchOpen = useUIStore((s) => s.setSearchOpen)
  // CHAT/PRIVACY/A11Y SETTINGS: collapse grouping, read receipts, screen reader
  const collapseMessages = useUIStore((s) => s.settings.chat.collapseMessages)
  const sendReadReceipts = useUIStore((s) => s.settings.privacy.readReceipts)
  const screenReaderMode = useUIStore((s) => s.settings.accessibility.screenReader)

  const conversation = conversationId ? getConversation(conversationId) : undefined

  // CRITICAL: The conversationId in the URL IS the resolvedId (deriveConversationId result).
  // ensureConversation always creates conversations with id = deriveConversationId(myPk, peerPk).
  // So we can use conversationId directly as dataId — no need to re-derive.
  // We still compute resolvedId for joining the Hyperswarm topic.
  const resolvedId = (conversation?.participantId && identity)
    ? cryptoService.deriveConversationId(identity.keyPair.publicKey, conversation.participantId)
    : undefined

  // Use conversationId (URL) as the primary key for message lookups.
  // If the conversation has been created correctly, this equals resolvedId.
  // resolvedId is only used for network operations (topic join, message send).
  const dataId = conversationId

  // CRITICAL: Select messages REACTIVELY from the store.
  // Using getMessages(dataId) would select the FUNCTION reference (stable),
  // not the data. The component would never re-render when new messages arrive.
  // By selecting state.messages[dataId] directly, Zustand subscribes to changes.
  const messages = useMessageStore((s) => dataId ? (s.messages[dataId] ?? []) : [])
  const pinnedMessages = useMessageStore((s) => dataId ? s.getPinnedMessages(dataId) : [])
  const contact = conversation?.participantId ? contacts[conversation.participantId] : undefined
  const typingUsers = dataId ? getTypingUsers(dataId) : []

  // BROADCAST MODE: Check if user is read-only (not the broadcaster)
  const isBroadcastReadOnly = useConversationStore((s) =>
    dataId && identity ? s.isBroadcastReadOnly(dataId, identity.keyPair.publicKey) : false
  )

  // Load message history from Hyperbee storage when conversation opens
  useEffect(() => {
    if (!resolvedId) return
    chatService.loadMessages(resolvedId).catch(console.error)
  }, [resolvedId])

  // READ RECEIPTS: When the user opens a conversation, send read receipts for
  // all messages from the peer that aren't marked as 'read' yet.
  useEffect(() => {
    if (!resolvedId || !conversation?.participantId || !identity || messages.length === 0) return

    const myPk = identity.keyPair.publicKey
    const unreadFromPeer = messages.filter(
      (m) => m.senderId !== myPk && m.status !== 'read'
    )
    if (unreadFromPeer.length === 0) return

    const unreadIds = unreadFromPeer.map((m) => m.id)
    // Mark them as read locally immediately (optimistic UI)
    useMessageStore.getState().markAllAsRead(resolvedId)
    useConversationStore.getState().clearUnread(resolvedId)
    // PRIVACY SETTINGS: read receipts are only sent over the network when
    // privacy.readReceipts is enabled — the local read state stays accurate
    // either way, but the peer never learns we read their messages when off.
    if (sendReadReceipts) {
      chatService.sendReadReceipt(resolvedId, conversation.participantId, unreadIds).catch(() => {})
    }
  }, [resolvedId, conversation?.participantId, identity, messages.length, sendReadReceipts])

  // Join the Hyperswarm discovery topic for this conversation
  useEffect(() => {
    if (!resolvedId || !conversation?.participantId || !identity) return

    let cancelled = false

    const joinConversationTopic = async () => {
      try {
        const topic = await cryptoService.deriveConversationTopic(
          identity.keyPair.publicKey,
          conversation.participantId!
        )
        if (!cancelled) {
          await p2pService.joinTopic(topic)
        }
      } catch (err) {
        console.error('[ChatView] Failed to join topic:', err)
      }
    }

    joinConversationTopic()

    return () => {
      cancelled = true
      // PERSISTENCE: Do NOT leave the topic when switching conversations.
      // Leaving the topic makes us undiscoverable to this contact, breaking
      // online status and reconnection. Topics stay joined for the session.
    }
  }, [resolvedId, conversation?.participantId, identity])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, behavior: 'smooth' })
      }, 50)
    }
  }, [messages.length])

  const handleSend = useCallback(
    async (content: string) => {
      if (!dataId || !conversation?.participantId) return
      try {
        await chatService.sendMessage(
          { conversationId: dataId, type: 'text', content, replyTo: replyTo?.id },
          dataId,
          conversation.participantId
        )
        // Ensure typing indicator is cleared on the peer after sending
        chatService.sendTyping(dataId, conversation.participantId, false).catch(() => {})
        setReplyTo(undefined)
      } catch (err) {
        console.error('[ChatView] handleSend error:', err)
        try { window.asgard.debugLog('[ChatView] handleSend error: ' + (err instanceof Error ? err.message : String(err))) } catch {}
      }
    },
    [dataId, conversation, replyTo]
  )

  const handleTyping = useCallback(
    (typing: boolean) => {
      if (!conversation?.participantId || !dataId) return
      chatService.sendTyping(dataId, conversation.participantId, typing).catch(() => {})
    },
    [dataId, conversation]
  )

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!dataId || !conversation?.participantId) return
      try {
        await fileService.sendFiles(files, dataId, conversation.participantId)
      } catch (err) {
        console.error('[ChatView] Failed to send files:', err)
      }
    },
    [dataId, conversation]
  )

  if (!conversationId || !conversation) {
    return <ChatEmptyState />
  }

  const displayName = contact?.displayName ?? conversationId.slice(0, 16)

  return (
    <div className="flex h-full">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-asgard-border bg-asgard-surface/50 flex-shrink-0">
        <Avatar
          src={contact?.avatar}
          name={displayName}
          publicKey={conversation.participantId}
          size="sm"
          status={contact?.status}
          showStatus
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-asgard-text-primary truncate">{displayName}</h3>
          <div className="flex items-center gap-1.5">
            {/* Connection quality indicator */}
            {/* Un pair qui se déclare « absent » ou « occupé » est connecté : sa
                qualité de liaison est tout aussi pertinente que celle d'un pair
                « en ligne » (et le libellé en dessous l'affiche bien tel quel). */}
            {contact && isLivePresence(contact.status) && contact.publicKey && (
              <ConnectionQuality peerId={contact.publicKey} />
            )}
            <p className="text-xs text-asgard-text-muted">
              {typingUsers.length > 0
                ? t('chat.typing')
                : contact && isLivePresence(contact.status)
                ? t(presenceMeta(contact.status).labelKey)
                : contact?.lastSeen
                ? t('chat.lastSeen')
                : t('common.offline')}
            </p>
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1">
          <HeaderButton
            aria-label={t('calls.audioCall')}
            onClick={() => {
              if (contact) {
                callService.startCall(contact.publicKey, contact.displayName, 'audio', contact.avatar)
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
            </svg>
          </HeaderButton>
          <HeaderButton
            aria-label={t('calls.videoCall')}
            onClick={() => {
              if (contact) {
                callService.startCall(contact.publicKey, contact.displayName, 'video', contact.avatar)
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          </HeaderButton>
          <HeaderButton
            aria-label={t('chat.searchMessages')}
            onClick={() => setSearchOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </HeaderButton>
          <HeaderButton
            aria-label={t('chat.conversationInfo')}
            onClick={() => setRightPanelView('info')}
            className={rightPanelView ? 'bg-asgard-nordic/20 text-asgard-glacier' : ''}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
          </HeaderButton>
          <HeaderButton
            aria-label={t('chat.deleteConversation')}
            onClick={() => setShowDeleteConfirm(true)}
            className="text-red-400/60 hover:text-red-400"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </HeaderButton>
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-hidden">
        {/* Pinned messages bar */}
        {pinnedMessages.length > 0 && (
          <div className="px-4 py-2 bg-asgard-glacier/10 border-b border-asgard-border flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v1h1.6v-1H18v-2l-2-2z"/>
            </svg>
            <span className="text-xs text-asgard-glacier font-medium">
              {pinnedMessages.length} message{pinnedMessages.length > 1 ? 's' : ''} épinglé{pinnedMessages.length > 1 ? 's' : ''}
            </span>
            <span className="text-xs text-asgard-text-muted truncate flex-1">
              {pinnedMessages[pinnedMessages.length - 1]?.content?.slice(0, 50)}
            </span>
          </div>
        )}
        {messages.length === 0 ? (
          <ConversationStart name={displayName} />
        ) : (
          <div
            className="h-full"
            // ACCESSIBILITY SETTINGS: live region announces new messages to screen readers
            aria-live={screenReaderMode ? 'polite' : 'off'}
            aria-relevant="additions"
          >
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            followOutput="smooth"
            className="h-full virtual-list"
            initialTopMostItemIndex={messages.length - 1}
            itemContent={(index, message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.senderId === identity?.keyPair.publicKey}
                senderName={contact?.displayName}
                // CHAT SETTINGS (collapseMessages): group consecutive messages from
                // the same sender within 5 minutes — only the last one shows its
                // timestamp, the others render in compact mode.
                compact={
                  collapseMessages &&
                  index > 0 &&
                  messages[index - 1].senderId === message.senderId &&
                  message.timestamp - messages[index - 1].timestamp < 300_000
                }
                onReply={setReplyTo}
                onDelete={(msg) => {
                  if (!conversation.participantId || !dataId) return
                  chatService.deleteMessage(msg.id, dataId, conversation.participantId).catch((err) => {
                    console.error('[ChatView] deleteMessage failed:', err)
                    try { window.asgard.debugLog('[ChatView] deleteMessage failed: ' + (err instanceof Error ? err.message : String(err))) } catch {}
                  })
                }}
                onDeletePermanently={(msg) => {
                  if (!dataId) return
                  chatService.deleteMessagePermanently(msg.id, dataId, conversation.participantId ?? undefined).catch((err) => {
                    console.error('[ChatView] deleteMessagePermanently failed:', err)
                    try { window.asgard.debugLog('[ChatView] deleteMessagePermanently failed: ' + (err instanceof Error ? err.message : String(err))) } catch {}
                  })
                }}
                onReaction={(msg, emoji) => {
                  if (conversation.participantId && dataId) {
                    chatService.toggleReaction(msg.id, dataId, emoji, conversation.participantId)
                  }
                }}
                onForward={(msg) => setForwardMessage(msg)}
                onPin={(msg) => {
                  if (dataId) chatService.togglePinMessage(msg.id, dataId)
                }}
              />
            )}
            components={{
              Header: () => <div className="h-4" />,
              Footer: () => (
                <TypingIndicator users={typingUsers} contact={contact?.displayName} />
              ),
            }}
          />
          </div>
        )}
      </div>

      {/* Active file transfers widget */}
      <AnimatePresence>
        <ActiveTransfersWidget />
      </AnimatePresence>

      {/* Message input */}
      <MessageInput
        conversationId={conversationId}
        replyTo={replyTo}
        onSend={handleSend}
        onFiles={handleFiles}
        onCancelReply={() => setReplyTo(undefined)}
        onTyping={handleTyping}
        broadcastReadOnly={isBroadcastReadOnly}
      />
      </div>

      {/* Right panel */}
      <AnimatePresence>
        {rightPanelView && <RightPanel />}
      </AnimatePresence>

      {/* Delete conversation confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <DeleteConfirmModal
            name={displayName}
            onCancel={() => setShowDeleteConfirm(false)}
            onConfirm={async () => {
              if (!dataId) return
              try {
                setShowDeleteConfirm(false)
                await chatService.deleteConversation(dataId)
                navigate('/conversations')
              } catch (err) {
                console.error('[ChatView] deleteConversation failed:', err)
                try { window.asgard.debugLog('[ChatView] deleteConversation failed: ' + (err instanceof Error ? err.message : String(err))) } catch {}
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Forward message modal */}
      <AnimatePresence>
        {forwardMessage && (
          <ForwardModal
            message={forwardMessage}
            onClose={() => setForwardMessage(undefined)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Connection quality indicator — shows latency bars based on peer RTT */
const ConnectionQuality: React.FC<{ peerId: string }> = ({ peerId }) => {
  const peerLatency = useNetworkStore((s) => s.status.peerLatency)
  const rtt = peerLatency?.[peerId]

  if (rtt === undefined) return null

  // Determine quality: <100ms = excellent, <300ms = good, <600ms = fair, >600ms = poor
  const bars = rtt < 100 ? 4 : rtt < 300 ? 3 : rtt < 600 ? 2 : 1
  const color = bars >= 3 ? 'text-green-400' : bars === 2 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className={`flex items-end gap-0.5 h-3 ${color}`} title={`${rtt}ms`}>
      {[1, 2, 3, 4].map((bar) => (
        <div
          key={bar}
          className={`w-1 rounded-full transition-all ${bar <= bars ? 'bg-current' : 'bg-current/20'}`}
          style={{ height: `${bar * 25}%` }}
        />
      ))}
    </div>
  )
}

const ChatEmptyState: React.FC = () => {
  const { t } = useTranslation()
  return (
  <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
    <div className="w-20 h-20 rounded-3xl bg-asgard-nordic/10 border border-asgard-nordic/20 flex items-center justify-center mb-4">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier/40">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-asgard-text-primary mb-2">{t('chat.noConversation')}</h3>
    <p className="text-sm text-asgard-text-muted max-w-xs">
      {t('chat.startConversation')}
    </p>
  </div>
  )
}

const ConversationStart: React.FC<{ name: string }> = ({ name }) => (
  <div className="flex flex-col items-center justify-center h-full text-center px-8">
    <div className="mb-3 opacity-50">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
      </svg>
    </div>
    <p className="text-sm text-asgard-text-muted">
      This conversation is end-to-end encrypted.
      <br />
      Send a message to start talking with <strong className="text-asgard-text-secondary">{name}</strong>.
    </p>
  </div>
)

const TypingIndicator: React.FC<{ users: string[]; contact?: string }> = ({ users, contact }) => {
  const { t } = useTranslation()
  if (users.length === 0) return <div className="h-4" />
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-4 py-2"
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 bg-asgard-text-muted rounded-full animate-typing"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <span className="text-xs text-asgard-text-muted">
        {contact ?? t('chat.you')} {t('chat.typing')}
      </span>
    </motion.div>
  )
}

const HeaderButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...props }) => (
  <motion.button
    whileTap={{ scale: 0.9 }}
    className="w-9 h-9 flex items-center justify-center rounded-xl text-asgard-text-muted hover:bg-asgard-surface-alt hover:text-asgard-text-primary transition-colors"
    {...(props as any)}
  >
    {children}
  </motion.button>
)

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

const DeleteConfirmModal: React.FC<{
  name: string
  onCancel: () => void
  onConfirm: () => void
}> = ({ name, onCancel, onConfirm }) => {
  const { t } = useTranslation()
  return (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onClick={onCancel}
  >
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="mica-card border border-asgard-border rounded-2xl p-6 shadow-modal max-w-sm mx-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-busy">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-asgard-text-primary">{t('chat.deleteConversation')}</h3>
          <p className="text-xs text-asgard-text-muted">{t('chat.cannotUndo')}</p>
        </div>
      </div>
      <p className="text-sm text-asgard-text-secondary mb-5">
        {t('chat.deleteWarning', { name })}
      </p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg text-asgard-text-secondary hover:bg-asgard-surface-alt transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-sm rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors font-medium"
        >
          {t('chat.deletePermanently')}
        </button>
      </div>
    </motion.div>
  </motion.div>
  )
}
