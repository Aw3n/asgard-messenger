import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { NO_MESSAGES, useMessageStore } from '@/stores/messageStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useContactStore } from '@/stores/contactStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useNetworkStore } from '@/stores/networkStore'
import { useUIStore } from '@/stores/uiStore'
import { MessageBubble } from './components/MessageBubble'
import { MessageInput } from './components/MessageInput'
import { PendingContactBanner } from './components/PendingContactBanner'
import { ForwardModal } from './components/ForwardModal'
import { MessageDeleteConfirm } from './components/MessageDeleteConfirm'
import { ActiveTransfersWidget } from './components/ActiveTransfersWidget'
import { Avatar } from '@/components/ui/Avatar'
import { MuteButton } from '@/components/ui/MuteButton'
import { UnreadDivider } from '@/components/ui/UnreadDivider'
import { HistoryFailureNotice } from '@/components/ui/HistoryFailureNotice'
import { chatService } from '@/services/ChatService'
import { p2pService } from '@/services/P2PService'
import { cryptoService } from '@/services/CryptoService'
import { callService } from '@/services/CallService'
import { fileService, PeerUnreachableError, TransferCancelledError } from '@/services/FileService'
import { RightPanel } from '@/components/panels/RightPanel'
import { presenceMeta, isLivePresence } from '@/utils/presence'
import { watchWindowVisibility } from '@/utils/windowVisibility'
import { countIncomingAfter } from '@/utils/incomingAfter'
import { findFirstUnreadMessageId } from '@/utils/unreadDivider'
import { parseMessageJump } from '@/utils/messageJump'
import type { MessageCursor } from '@/utils/messageGap'
import { useMessageJump } from '@/hooks/useMessageJump'
import { useMessageActionShortcuts } from '@/hooks/useMessageActionShortcuts'
import { useDeleteConfirmation } from '@/hooks/useDeleteConfirmation'
import { useNewerMessages } from '@/hooks/useNewerMessages'
import { useHistoryErrorNotice } from '@/hooks/useHistoryErrorNotice'
import { useGestureHint } from '@/hooks/useGestureHint'
import { useDialogBehavior } from '@/hooks/useDialogBehavior'
import { formatLastSeen } from '@/utils/time'
import type { Message } from '@/types'

const HISTORY_PAGE_SIZE = 50
// Index de départ arbitrairement haut : Virtuoso s'en sert pour ancrer le
// viewport quand des messages plus anciens sont insérés devant la liste.
const FIRST_ITEM_INDEX = 100_000

/**
 * ChatView — main conversation view.
 * Renders virtualized message list + input bar + header.
 */
export const ChatView: React.FC = () => {
  const { t } = useTranslation()
  const { conversationId } = useParams<{ conversationId: string }>()
  const [replyTo, setReplyTo] = useState<Message | undefined>()
  const [editingMessage, setEditingMessage] = useState<Message | undefined>()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [forwardMessage, setForwardMessage] = useState<Message | undefined>()
  // Suivi du bas du fil : une lecture remontée doit s'annoncer quand un
  // message arrive en dessous, et un envoi doit ramener à sa propre bulle.
  const [atBottom, setAtBottom] = useState(true)
  const [newBelowCount, setNewBelowCount] = useState(0)
  // Premier message non lu ancré à l'ouverture : le compteur est remis à zéro
  // juste après, donc l'ancre doit être posée avant, une seule fois par fil.
  const [firstUnreadId, setFirstUnreadId] = useState<string | undefined>(undefined)
  const lastSeenMessageIdRef = useRef<string | undefined>(undefined)
  const followOwnSendRef = useRef(false)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const identity = useIdentityStore((s) => s.identity)
  const getConversation = useConversationStore((s) => s.getConversation)
  const chatViewVisible = useConversationStore((s) => s.chatViewVisible)
  // CRITICAL: Subscribe to the contacts OBJECT (not the getContact function).
  // This ensures ChatView re-renders when a contact's status changes,
  // keeping the header status indicator in sync with the conversation list.
  const contacts = useContactStore((s) => s.contacts)
  const getTypingUsers = useNetworkStore((s) => s.getTypingUsers)
  const setRightPanelView = useUIStore((s) => s.setRightPanelView)
  const rightPanelView = useUIStore((s) => s.rightPanelView)
  const setSearchOpen = useUIStore((s) => s.setSearchOpen)
  // L'icône de recherche du fil ouvre la même fenêtre que le geste global : elle
  // en porte la combinaison réglée, à l'œil et au lecteur d'écran.
  const searchGesture = useGestureHint('openSearch', t('chat.searchMessages'))
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
  const messages = useMessageStore((s) => (dataId ? s.messages[dataId] : undefined) ?? NO_MESSAGES)
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : undefined

  // Changer de fil remet le suivi du bas à zéro : la pastille d'un ancien fil
  // ne doit pas survivre à la navigation.
  useEffect(() => {
    setAtBottom(true)
    setNewBelowCount(0)
    setFirstUnreadId(undefined)
    lastSeenMessageIdRef.current = undefined
  }, [conversationId])

  // Un message qui s'ajoute sous une lecture remontée doit s'annoncer : sans
  // pastille, son arrivée ne produisait aucun signe visible.
  useEffect(() => {
    const previousId = lastSeenMessageIdRef.current
    lastSeenMessageIdRef.current = lastMessageId
    if (atBottom) {
      setNewBelowCount(0)
      return
    }
    if (previousId === undefined || previousId === lastMessageId) return
    const added = countIncomingAfter(messages, previousId, identity?.keyPair.publicKey)
    if (added > 0) setNewBelowCount((count) => count + added)
  }, [lastMessageId, atBottom, messages, identity?.keyPair.publicKey])

  // Envoyer depuis une position remontée ramène au bas : la bulle qu'on vient
  // d'écrire ne doit pas rester hors écran.
  useEffect(() => {
    if (!followOwnSendRef.current || messages.length === 0) return
    followOwnSendRef.current = false
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' })
  }, [messages.length])
  const [pagination, setPagination] = useState({
    dataId,
    firstItemIndex: FIRST_ITEM_INDEX,
    exhausted: false,
  })
  // La conversation peut changer sans démonter la vue : l'état d'ancrage
  // d'anciens messages ne doit pas suivre le nouveau fil.
  const paginationState = pagination.dataId === dataId
    ? pagination
    : { dataId, firstItemIndex: FIRST_ITEM_INDEX, exhausted: false }
  const loadingOlderRef = useRef(false)
  const dataIdRef = useRef(dataId)
  dataIdRef.current = dataId
  // Dérivé de la liste déjà abonée : le sélecteur de store construit un tableau
  // neuf à chaque rendu, ce qui relance la vue sans raison.
  const pinnedMessages = useMemo(() => messages.filter((message) => message.pinned), [messages])
  const contact = conversation?.participantId ? contacts[conversation.participantId] : undefined
  const typingUsers = dataId ? getTypingUsers(dataId) : []

  // BROADCAST MODE: Check if user is read-only (not the broadcaster)
  const isBroadcastReadOnly = useConversationStore((s) =>
    dataId && identity ? s.isBroadcastReadOnly(dataId, identity.keyPair.publicKey) : false
  )
  // Parité avec l'en-tête de groupe : la sourdine du fil 1:1 était réglable
  // uniquement par le clic droit de la liste.
  const conversationMuted = useConversationStore((s) =>
    dataId ? s.conversations[dataId]?.muted ?? false : false
  )
  const conversationMutedUntil = useConversationStore((s) =>
    dataId ? s.conversations[dataId]?.mutedUntil : undefined
  )

  // Changer de conversation abandonne une réponse ou une édition en cours :
  // le composer ne doit pas modifier un message qui n'est plus à l'écran.
  useEffect(() => {
    setEditingMessage(undefined)
    setReplyTo(undefined)
  }, [conversationId])

  // Un fil ouvert par l'URL (résultat de recherche, clic de notification,
  // retour arrière) doit aussi devenir la conversation sélectionnée : sinon
  // un message entrant reste compté non lu et notifié alors qu'il s'affiche.
  useEffect(() => {
    if (conversationId) {
      useConversationStore.getState().setActiveConversation(conversationId)
    }
  }, [conversationId])

  // Seul un ChatView monté prouve que le fil est visible : l'identifiant de
  // conversation, lui, reste sélectionné après un passage sur une autre page.
  // Une fenêtre réduite ou sans focus ne rend rien à l'écran : elle doit donc
  // compter les messages comme non lus et laisser passer les notifications.
  useEffect(() => {
    const stopWatching = watchWindowVisibility((visible) => {
      useConversationStore.getState().setChatViewVisible(visible)
    })
    return () => {
      stopWatching()
      useConversationStore.getState().setChatViewVisible(false)
    }
  }, [])

  // Load message history from Hyperbee storage when conversation opens
  const initialHistoryLoadRef = useRef<Promise<unknown>>(Promise.resolve())
  const { noticeHistoryError, historyLoaded, historyFailed, retryHistory, historyRetry } =
    useHistoryErrorNotice(dataId)
  useEffect(() => {
    if (!resolvedId) return
    initialHistoryLoadRef.current = chatService
      .loadMessages(resolvedId)
      .then((page) => {
        // Une page vide est un fil vide ; `null` est une panne, et elle doit se
        // voir : sans message à l'écran comme dans la console, rien ne la distinguait.
        if (page === null) noticeHistoryError()
        else historyLoaded()
      })
      .catch(console.error)
  }, [resolvedId, noticeHistoryError, historyLoaded, historyRetry])

  // Un résultat de recherche profond peut viser un message plus ancien que la
  // page de démarrage : charger son contexte, puis le centrer.
  const jumpRequest = React.useMemo(
    () => parseMessageJump(location.state, conversationId),
    [location.state, conversationId]
  )
  const waitForInitialHistory = useCallback(() => initialHistoryLoadRef.current, [])
  const loadJumpContext = useCallback(async (timestamp: number) => {
    if (!resolvedId) return
    const page = await chatService.loadMessageContext(resolvedId, timestamp)
    // Le saut abandonne sans rien montrer si la page de contexte n'arrive pas :
    // l'échec doit être annoncé, pas seulement journalisé.
    if (page === null) noticeHistoryError()
    else historyLoaded()
    return page
  }, [resolvedId, noticeHistoryError, historyLoaded])
  // La page de contexte s'arrête bien avant la fenêtre récente : charger la
  // suite seulement quand la vue s'en approche évite un trou définitif.
  const loadNewerGapMessages = useCallback(async (cursor: MessageCursor, limit: number) => {
    if (!resolvedId) return []
    const page = await chatService.loadNewerMessages(resolvedId, cursor.timestamp, cursor.id, limit)
    if (page === null) noticeHistoryError()
    else historyLoaded()
    return page
  }, [resolvedId, noticeHistoryError, historyLoaded])
  const { gapArmed, armGap, onRangeChanged } = useNewerMessages({
    dataId,
    messages,
    firstItemIndex: paginationState.firstItemIndex,
    pageSize: HISTORY_PAGE_SIZE,
    loadNewer: loadNewerGapMessages,
  })
  const handleJumpPrepended = useCallback((added: number) => {
    setPagination((state) => {
      const base = state.dataId === dataId ? state.firstItemIndex : FIRST_ITEM_INDEX
      return {
        dataId,
        firstItemIndex: Math.max(0, base - added),
        exhausted: state.dataId === dataId ? state.exhausted : false,
      }
    })
  }, [dataId])
  const handleJumpStart = useCallback(() => setAtBottom(false), [])
  const highlightedMessageId = useMessageJump({
    request: jumpRequest,
    dataId,
    messages,
    firstItemIndex: paginationState.firstItemIndex,
    virtuosoRef,
    waitForInitialHistory,
    loadContext: loadJumpContext,
    onPrependedMessages: handleJumpPrepended,
    onNewerGap: armGap,
    onJumpStart: handleJumpStart,
  })

  // Les trois gestes de message ont une seule implémentation : le clic du menu
  // et la frappe réglée doivent passer par le même chemin.
  const handleReply = useCallback((message: Message) => {
    setEditingMessage(undefined)
    setReplyTo(message)
  }, [])
  const handleEdit = useCallback((message: Message) => {
    setReplyTo(undefined)
    setEditingMessage(message)
  }, [])
  const handleForward = useCallback((message: Message) => setForwardMessage(message), [])

  // SUPPRESSION D'UN MESSAGE : menu et touche réglée demandent, le dialogue
  // acquiesce. Dans un fil 1:1 deux gestes sont réels : la mention « Supprimé »
  // reste chez le contact pour l'un, et rien ne subsiste pour l'autre.
  const {
    pending: pendingDelete,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useDeleteConfirmation((message, mode) => {
    if (mode === 'forEveryone') {
      if (!conversation?.participantId || !dataId) return
      chatService.deleteMessage(message.id, dataId, conversation.participantId).catch((err) => {
        console.error('[ChatView] deleteMessage failed:', err)
        try { window.asgard.debugLog('[ChatView] deleteMessage failed: ' + (err instanceof Error ? err.message : String(err))) } catch {}
        // La copie locale est déjà retirée ; seul le contact n'a pas reçu l'avis.
        useUIStore.getState().addToast({ type: 'error', title: t('chat.deleteForEveryoneFailed') })
      })
      return
    }
    if (!dataId) return
    chatService.deleteMessagePermanently(message.id, dataId, conversation?.participantId ?? undefined).catch((err) => {
      console.error('[ChatView] deleteMessagePermanently failed:', err)
      try { window.asgard.debugLog('[ChatView] deleteMessagePermanently failed: ' + (err instanceof Error ? err.message : String(err))) } catch {}
      useUIStore.getState().addToast({ type: 'error', title: t('chat.deleteForEveryoneFailed') })
    })
  })

  // GESTES CLAVIER DU FIL : copie, réponse, transfert, édition du dernier
  // message et demande de suppression, lus dans `settings.keyboardShortcuts` à
  // la frappe.
  useMessageActionShortcuts({
    messages,
    ownSenderId: identity?.keyPair.publicKey,
    highlightedMessageId,
    handlers: {
      onReply: handleReply,
      onEdit: handleEdit,
      onForward: handleForward,
      onDelete: (message) => requestDelete(message, 'forEveryone'),
    },
  })

  // PAGINATION: l'ouverture ne charge que les derniers messages ; remonter en
  // haut du fil doit aller chercher la suite au lieu de laisser un trou.
  const loadOlderMessages = useCallback(async () => {
    if (!resolvedId || loadingOlderRef.current || paginationState.exhausted) return
    const current = useMessageStore.getState().messages[resolvedId] ?? []
    if (current.length === 0) return
    loadingOlderRef.current = true
    try {
      // +1 ms inclut les messages qui partagent l'horodatage du plus ancien.
      const older = await chatService.loadOlderMessages(
        resolvedId,
        current[0].timestamp + 1,
        HISTORY_PAGE_SIZE,
      )
      if (dataIdRef.current !== dataId) return
      // `null` = lecture échouée : ne pas épuiser la pagination laisse
      // `startReached` retenter la même page au prochain bord haut.
      if (older === null) {
        noticeHistoryError()
        return
      }
      historyLoaded()
      const after = useMessageStore.getState().messages[resolvedId]?.length ?? current.length
      const added = after - current.length
      setPagination((state) => {
        const base = state.dataId === dataId ? state.firstItemIndex : FIRST_ITEM_INDEX
        return {
          dataId,
          firstItemIndex: Math.max(0, base - added),
          // Une page incomplète, ou une page qui n'a rien ajouté (doublons),
          // signifie qu'il n'y a plus rien à remonter : ne pas boucler.
          exhausted: older.length < HISTORY_PAGE_SIZE || added === 0,
        }
      })
    } finally {
      loadingOlderRef.current = false
    }
  }, [resolvedId, dataId, paginationState.exhausted, noticeHistoryError, historyLoaded])

  // READ RECEIPTS: When the user opens a conversation, send read receipts for
  // all messages from the peer that aren't marked as 'read' yet.
  useEffect(() => {
    if (!chatViewVisible) return
    if (!resolvedId || !conversation?.participantId || !identity || messages.length === 0) return

    const myPk = identity.keyPair.publicKey
    const unreadFromPeer = messages.filter(
      (m) => m.senderId !== myPk && m.status !== 'read'
    )
    if (unreadFromPeer.length === 0) return

    const unreadIds = unreadFromPeer.map((m) => m.id)
    // L'ancre « Nouveaux messages » se pose AVANT la remise à zéro : après,
    // le total non lu ne dit plus où la lecture s'était arrêtée.
    const unreadTotal = useConversationStore.getState().conversations[resolvedId]?.unreadCount ?? 0
    if (unreadTotal > 0) {
      const anchor = findFirstUnreadMessageId(messages, unreadTotal, myPk)
      if (anchor) setFirstUnreadId(anchor)
    }
    // Mark them as read locally immediately (optimistic UI)
    useMessageStore.getState().markAllAsRead(resolvedId)
    useConversationStore.getState().clearUnread(resolvedId)
    // PRIVACY SETTINGS: read receipts are only sent over the network when
    // privacy.readReceipts is enabled — the local read state stays accurate
    // either way, but the peer never learns we read their messages when off.
    if (sendReadReceipts) {
      chatService.sendReadReceipt(resolvedId, conversation.participantId, unreadIds).catch(() => {})
    }
  }, [resolvedId, conversation?.participantId, identity, messages.length, sendReadReceipts, chatViewVisible])

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

  // DÉCOUVERTE IMMÉDIATE : ouvrir une conversation compose le contact tout de
  // suite (adresse Noise directe) et rafraîchit son profil DHT, au lieu
  // d'attendre le heartbeat (5 s) ou la boucle de présence (30 s).
  useEffect(() => {
    if (!conversation?.participantId) return
    chatService.probeContact(conversation.participantId)
  }, [conversation?.participantId])

  const handleSend = useCallback(
    async (content: string) => {
      if (!dataId || !conversation?.participantId) return
      try {
        followOwnSendRef.current = true
        const outcome = await chatService.sendMessage(
          { conversationId: dataId, type: 'text', content, replyTo: replyTo?.id },
          dataId,
          conversation.participantId
        )
        // Ensure typing indicator is cleared on the peer after sending
        chatService.sendTyping(dataId, conversation.participantId, false).catch(() => {})
        setReplyTo(undefined)
        if (outcome === 'queued') {
          useUIStore.getState().addToast({
            type: 'warning',
            title: t('chat.messageQueued'),
            duration: 5000,
          })
        }
      } catch (err) {
        followOwnSendRef.current = false
        console.error('[ChatView] handleSend error:', err)
        try { window.asgard.debugLog('[ChatView] handleSend error: ' + (err instanceof Error ? err.message : String(err))) } catch {}
      }
    },
    [dataId, conversation, replyTo, t]
  )

  const handleEditSubmit = useCallback(
    async (content: string) => {
      const target = editingMessage
      if (!target || !dataId || !conversation?.participantId) return
      const peerId = conversation.participantId
      setEditingMessage(undefined)
      setReplyTo(undefined)
      try {
        await chatService.editMessage(target.id, dataId, content, peerId)
      } catch (err) {
        console.error('[ChatView] editMessage failed:', err)
        try { window.asgard.debugLog('[ChatView] editMessage failed: ' + (err instanceof Error ? err.message : String(err))) } catch {}
        useUIStore.getState().addToast({ type: 'error', title: t('chat.editFailed') })
      }
    },
    [editingMessage, dataId, conversation, t]
  )

  const handleRetry = useCallback(
    async (message: Message) => {
      if (!dataId || !conversation?.participantId) return
      try {
        const outcome = await chatService.retryMessage(message.id, dataId, conversation.participantId)
        if (outcome === 'queued') {
          useUIStore.getState().addToast({ type: 'warning', title: t('chat.messageQueued'), duration: 5000 })
        }
      } catch (err) {
        console.error('[ChatView] retryMessage failed:', err)
        useUIStore.getState().addToast({ type: 'error', title: t('chat.messageNotDelivered') })
      }
    },
    [dataId, conversation, t]
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
        // Annulation volontaire : un toast « échec » pour un geste que
        // l'utilisateur vient de faire serait trompeur.
        if (err instanceof TransferCancelledError) return
        console.error('[ChatView] Failed to send files:', err)
        useUIStore.getState().addToast({
          type: 'error',
          title: t('settings.transferFailed'),
          message: err instanceof PeerUnreachableError ? t('common.offline') : undefined,
        })
      }
    },
    [dataId, conversation, t]
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
                ? formatLastSeen(contact.lastSeen)
                : t('common.offline')}
            </p>
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1">
          <HeaderButton
            aria-label={t('calls.audioCall')}
            disabled={contact?.relation === 'pending'}
            onClick={() => {
              if (contact && contact.relation !== 'pending') {
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
            disabled={contact?.relation === 'pending'}
            onClick={() => {
              if (contact && contact.relation !== 'pending') {
                callService.startCall(contact.publicKey, contact.displayName, 'video', contact.avatar)
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          </HeaderButton>
          <MuteButton
            muted={conversationMuted}
            mutedUntil={conversationMutedUntil}
            onToggle={() =>
              useConversationStore.getState().muteConversation(conversation.id, !conversationMuted)
            }
          />
          <HeaderButton
            aria-label={t('chat.searchMessages')}
            title={searchGesture.title}
            aria-keyshortcuts={searchGesture.ariaKeyShortcuts}
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
      <div className="relative flex-1 overflow-hidden">
        {/* Pinned messages bar */}
        {pinnedMessages.length > 0 && (
          <div className="px-4 py-2 bg-asgard-glacier/10 border-b border-asgard-border flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v1h1.6v-1H18v-2l-2-2z"/>
            </svg>
            <span className="text-xs text-asgard-glacier font-medium">
              {t('chat.pinnedMessages')} · {pinnedMessages.length}
            </span>
            <span className="text-xs text-asgard-text-muted truncate flex-1">
              {pinnedMessages[pinnedMessages.length - 1]?.content?.slice(0, 50)}
            </span>
          </div>
        )}
        {messages.length === 0 ? (
          historyFailed ? (
            <HistoryFailureNotice onRetry={retryHistory} />
          ) : (
            <ConversationStart name={displayName} />
          )
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
            firstItemIndex={paginationState.firstItemIndex}
            startReached={() => { void loadOlderMessages() }}
            rangeChanged={onRangeChanged}
            // Ne suit le bas que si l'utilisateur y est déjà : remonter pour
            // relire l'historique ne doit pas être annulé par chaque arrivée.
            // Pendant un comblement de couture, l'ajout de page ne doit pas
            // non plus tirer la vue vers le bas.
            followOutput={(atBottom) => (atBottom && !gapArmed ? 'smooth' : false)}
            atBottomStateChange={setAtBottom}
            className="h-full virtual-list"
            initialTopMostItemIndex={messages.length - 1}
            itemContent={(index, message) => (
              <React.Fragment key={message.id}>
                {message.id === firstUnreadId && (
                  <UnreadDivider label={t('chat.newMessages')} />
                )}
                <MessageBubble
                  message={message}
                  isOwn={message.senderId === identity?.keyPair.publicKey}
                  senderName={contact?.displayName}
                  highlighted={message.id === highlightedMessageId}
                  // CHAT SETTINGS (collapseMessages): group consecutive messages from
                  // the same sender within 5 minutes — only the last one shows its
                  // timestamp, the others render in compact mode.
                  compact={
                    collapseMessages &&
                    index > 0 &&
                    messages[index - 1].senderId === message.senderId &&
                    message.timestamp - messages[index - 1].timestamp < 300_000
                  }
                  onReply={handleReply}
                  onEdit={handleEdit}
                  onRetry={handleRetry}
                  onDelete={requestDelete}
                  deleteModes={['forEveryone', 'permanently']}
                  onReaction={(msg, emoji) => {
                    if (conversation.participantId && dataId) {
                      chatService.toggleReaction(msg.id, dataId, emoji, conversation.participantId).catch((err) => {
                        console.warn('[ChatView] toggleReaction failed:', err)
                      })
                    } else {
                      console.warn('[ChatView] Reaction ignored: conversation has no participantId')
                    }
                  }}
                  onForward={handleForward}
                  onPin={(msg) => {
                    if (dataId) chatService.togglePinMessage(msg.id, dataId)
                  }}
                />
              </React.Fragment>
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

        {/* Retour au bas du fil : visible uniquement quand l'utilisateur lit
            plus haut, avec le nombre de messages reçus en dessous. */}
        {!atBottom && messages.length > 0 && (
          <button
            type="button"
            aria-label={t('chat.scrollToLatest')}
            title={t('chat.scrollToLatest')}
            onClick={() => {
              virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' })
            }}
            className="absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-asgard-border bg-asgard-surface text-asgard-glacier shadow-lg transition-colors hover:bg-asgard-nordic/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asgard-glacier"
          >
            {newBelowCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px]"
                style={{ background: '#4FC3F7', color: '#0B0E1A' }}
              >
                {newBelowCount > 99 ? '99+' : newBelowCount}
              </span>
            )}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
            </svg>
          </button>
        )}
      </div>

      {/* Active file transfers widget */}
      <AnimatePresence>
        <ActiveTransfersWidget conversationId={dataId} />
      </AnimatePresence>

      {/* Demande de contact en attente — réponse = confirmation */}
      <AnimatePresence>
        {contact?.relation === 'pending' && <PendingContactBanner contact={contact} />}
      </AnimatePresence>

      {/* Message input */}
      <MessageInput
        conversationId={conversationId}
        replyTo={replyTo}
        editingMessage={editingMessage}
        onSend={handleSend}
        onEditSubmit={handleEditSubmit}
        onCancelEdit={() => setEditingMessage(undefined)}
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
                useUIStore.getState().addToast({ type: 'error', title: t('chat.deleteConversationFailed') })
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

      {/* Le message ne part qu'après acquiescement : annuler laisse la bulle en
          place et rend le focus à la rangée qui avait demandé. */}
      <AnimatePresence>
        {pendingDelete && (
          <MessageDeleteConfirm
            mode={pendingDelete.mode}
            onCancel={cancelDelete}
            onConfirm={confirmDelete}
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

const ConversationStart: React.FC<{ name: string }> = ({ name }) => {
  const { t } = useTranslation()
  return (
  <div className="flex flex-col items-center justify-center h-full text-center px-8">
    <div className="mb-3 opacity-50">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
      </svg>
    </div>
    <p className="text-sm text-asgard-text-muted">
      {t('panels.endToEndEncrypted')}.
      <br />
      {t('chat.sendToStart', { name })}
    </p>
  </div>
  )
}

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
    className="w-9 h-9 flex items-center justify-center rounded-xl text-asgard-text-muted hover:bg-asgard-surface-alt hover:text-asgard-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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
  // Le fond sombre recouvre toute la page : la touche réglée doit refermer ce
  // dialogue-là aussi, en prendre le focus et le rendre à la rangée qui l’a ouvert.
  const dialogRef = useDialogBehavior<HTMLDivElement>(onCancel)
  const cancelGesture = useGestureHint('closeModal', t('common.cancel'))
  const titleId = React.useId()
  return (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onClick={onCancel}
  >
    <motion.div
      ref={dialogRef}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      transition={{ duration: 0.15 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="mica-card border border-asgard-border rounded-2xl p-6 shadow-modal max-w-sm mx-4 focus:outline-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-busy">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </div>
        <div>
          <h3 id={titleId} className="text-sm font-semibold text-asgard-text-primary">{t('chat.deleteConversation')}</h3>
          <p className="text-xs text-asgard-text-muted">{t('chat.cannotUndo')}</p>
        </div>
      </div>
      <p className="text-sm text-asgard-text-secondary mb-5">
        {t('chat.deleteWarning', { name })}
      </p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          title={cancelGesture.title}
          aria-keyshortcuts={cancelGesture.ariaKeyShortcuts}
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
