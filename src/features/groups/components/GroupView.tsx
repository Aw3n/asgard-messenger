import React, { useState, useCallback, useEffect } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useGroupStore } from '@/stores/groupStore'
import { useConversationStore } from '@/stores/conversationStore'
import { NO_MESSAGES, useMessageStore } from '@/stores/messageStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { ChannelList } from './ChannelList'
import { MemberList } from './MemberList'
import { GroupSettings } from './GroupSettings'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { MessageInput } from '@/features/chat/components/MessageInput'
import { ActiveTransfersWidget } from '@/features/chat/components/ActiveTransfersWidget'
import { ForwardModal } from '@/features/chat/components/ForwardModal'
import { UnreadDivider } from '@/components/ui/UnreadDivider'
import { HistoryFailureNotice } from '@/components/ui/HistoryFailureNotice'
import { MuteButton } from '@/components/ui/MuteButton'
import { callService } from '@/services/CallService'
import { groupService } from '@/services/GroupService'
import { useTranslation } from 'react-i18next'
import { watchWindowVisibility } from '@/utils/windowVisibility'
import { countIncomingAfter } from '@/utils/incomingAfter'
import { findFirstUnreadMessageId } from '@/utils/unreadDivider'
import { parseMessageJump } from '@/utils/messageJump'
import type { MessageCursor } from '@/utils/messageGap'
import { useMessageJump } from '@/hooks/useMessageJump'
import { useNewerMessages } from '@/hooks/useNewerMessages'
import { useHistoryErrorNotice } from '@/hooks/useHistoryErrorNotice'
import type { Message } from '@/types'

const HISTORY_PAGE_SIZE = 50
// Index de départ arbitrairement haut : Virtuoso s'en sert pour ancrer le
// viewport quand des messages plus anciens sont insérés devant la liste.
const FIRST_ITEM_INDEX = 100_000

/**
 * GroupView — main view for a selected group.
 * Shows channel list (left), messages (center), and member list (right).
 */
export const GroupView: React.FC = () => {
  const { t } = useTranslation()
  const activeGroup = useGroupStore((s) => s.getActiveGroup())
  const activeChannel = useGroupStore((s) => s.getActiveChannel())
  const groupViewVisible = useGroupStore((s) => s.groupViewVisible)
  const identity = useIdentityStore((s) => s.identity)
  // S'abonner à la table : basculer la sourdine doit réafficher l'icône.
  const groupMuted = useConversationStore((s) =>
    activeGroup ? (s.conversations[activeGroup.id]?.muted ?? false) : false
  )
  const groupMutedUntil = useConversationStore((s) =>
    activeGroup ? s.conversations[activeGroup.id]?.mutedUntil : undefined
  )
  const [showSettings, setShowSettings] = useState(false)
  const [showMembers, setShowMembers] = useState(true)
  const [forwardMessage, setForwardMessage] = useState<Message | undefined>()
  const [replyTo, setReplyTo] = useState<Message | undefined>()
  const [editingMessage, setEditingMessage] = useState<Message | undefined>()
  // Même suivi du bas que le fil 1:1 : lecture remontée + envoi qui ramène.
  const [atBottom, setAtBottom] = useState(true)
  const [newBelowCount, setNewBelowCount] = useState(0)
  // Même ancre que le fil 1:1 : posée avant que le canal ne soit marqué lu.
  const [firstUnreadId, setFirstUnreadId] = useState<string | undefined>(undefined)
  const lastSeenMessageIdRef = React.useRef<string | undefined>(undefined)
  const followOwnSendRef = React.useRef(false)
  const virtuosoRef = React.useRef<VirtuosoHandle>(null)
  const location = useLocation()

  const channelId = activeChannel?.id ?? ''
  const activeGroupId = activeGroup?.id
  // CRITICAL: Select messages reactively from the store
  const messages = useMessageStore((s) => (channelId ? s.messages[channelId] : undefined) ?? NO_MESSAGES)
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : undefined
  const historyKey = `${activeGroupId ?? ''}:${channelId}`
  const [pagination, setPagination] = useState({
    key: historyKey,
    firstItemIndex: FIRST_ITEM_INDEX,
    exhausted: false,
  })
  // Changer de canal ne doit pas transporter l'ancrage d'historique du canal
  // précédent, alors que la vue reste montée.
  const paginationState = pagination.key === historyKey
    ? pagination
    : { key: historyKey, firstItemIndex: FIRST_ITEM_INDEX, exhausted: false }
  const loadingOlderRef = React.useRef(false)
  const historyKeyRef = React.useRef(historyKey)
  historyKeyRef.current = historyKey

  // La frappe de groupe vit dans le GroupStore (par canal), pas dans le store
  // réseau du fil 1:1 : lire le mauvais store rendait l'indicateur muet.
  const channelTyping = useGroupStore((s) => s.channelTyping)
  const [typingTick, setTypingTick] = useState(0)
  const typingUsers = React.useMemo(
    () => (activeGroup?.id && channelId
      ? useGroupStore.getState().getChannelTypingUsers(activeGroup.id, channelId)
      : []),
    // channelTyping et typingTick forcent la ré-évaluation (arrivée, expiration).
    [activeGroup?.id, channelId, channelTyping, typingTick],
  )
  // Une frappe expire après 5 s sans nouvel événement : tant qu'elle est
  // affichée, un tick par seconde la fait disparaître sans attendre un autre
  // message du réseau.
  useEffect(() => {
    if (typingUsers.length === 0) return
    const timer = setTimeout(() => setTypingTick((n) => n + 1), 1000)
    return () => clearTimeout(timer)
  }, [typingUsers.length, typingTick])

  // Changer de canal remet le suivi du bas à zéro.
  useEffect(() => {
    setAtBottom(true)
    setNewBelowCount(0)
    setFirstUnreadId(undefined)
    lastSeenMessageIdRef.current = undefined
  }, [historyKey])

  // Un message qui arrive sous une lecture remontée s'annonce par une pastille.
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

  // Envoyer depuis une position remontée ramène à sa propre bulle.
  useEffect(() => {
    if (!followOwnSendRef.current || messages.length === 0) return
    followOwnSendRef.current = false
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' })
  }, [messages.length])
  const currentMember = activeGroup?.members.find(
    (member) => member.publicKey === identity?.keyPair.publicKey,
  )
  // Épingler est réservé aux mêmes rôles que côté service ; les autres membres
  // ne doivent pas voir une action qui échouerait.
  const canPin = !!currentMember && ['owner', 'admin', 'moderator'].includes(currentMember.role)

  const handleSend = useCallback(
    (content: string) => {
      // Send message via P2P to group members
      if (!identity || !channelId || !activeGroup) return
      const quoted = replyTo
      setReplyTo(undefined)
      followOwnSendRef.current = true
      groupService.sendGroupMessage(activeGroup.id, channelId, content, undefined, undefined, quoted?.id)
    },
    [identity, channelId, activeGroup, replyTo]
  )

  const handleTyping = useCallback(
    (typing: boolean) => {
      if (!activeGroup || !channelId) return
      groupService.sendTypingIndicator(activeGroup.id, channelId, typing).catch(() => {})
    },
    [activeGroup, channelId],
  )

  const handleReaction = useCallback(
    (message: Message, emoji: string) => {
      if (!activeGroup || !channelId) return
      groupService.toggleGroupReaction(activeGroup.id, channelId, message.id, emoji).catch((err) => {
        console.warn('[GroupView] toggleGroupReaction failed:', err)
      })
    },
    [activeGroup, channelId]
  )

  const handlePin = useCallback(
    (message: Message) => {
      if (!activeGroup || !channelId) return
      const operation = message.pinned
        ? groupService.unpinMessage(activeGroup.id, channelId, message.id)
        : groupService.pinMessage(activeGroup.id, channelId, message.id)
      operation.catch((err) => {
        console.warn('[GroupView] pin operation failed:', err)
      })
    },
    [activeGroup, channelId]
  )

  const handleEditSubmit = useCallback(
    async (content: string) => {
      const target = editingMessage
      if (!target || !activeGroup || !channelId) return
      setEditingMessage(undefined)
      try {
        await groupService.editGroupMessage(activeGroup.id, channelId, target.id, content)
      } catch (err) {
        console.error('[GroupView] editGroupMessage failed:', err)
        useUIStore.getState().addToast({ type: 'error', title: t('chat.editFailed') })
      }
    },
    [editingMessage, activeGroup, channelId, t]
  )

  const handleDelete = useCallback(
    (message: Message) => {
      if (!activeGroup || !channelId) return
      groupService.deleteGroupMessage(activeGroup.id, channelId, message.id).catch((err) => {
        console.warn('[GroupView] deleteGroupMessage failed:', err)
        useUIStore.getState().addToast({ type: 'error', title: t('common.failed') })
      })
    },
    [activeGroup, channelId, t]
  )

  const handleDeleteForMe = useCallback(
    (message: Message) => {
      if (!activeGroup || !channelId) return
      groupService.deleteGroupMessageForMe(activeGroup.id, channelId, message.id).catch((err) => {
        console.warn('[GroupView] deleteGroupMessageForMe failed:', err)
      })
    },
    [activeGroup, channelId]
  )

  // PERFORMANCE: Handle file sends to group using multicast
  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!activeGroup || !channelId) return
      try {
        await groupService.sendFilesToGroup(files, activeGroup.id, channelId)
      } catch (err) {
        console.error('[GroupView] Failed to send files to group:', err)
      }
    },
    [activeGroup, channelId]
  )

  // Announce presence when viewing a group
  useEffect(() => {
    if (activeGroup) {
      groupService.announceGroupPresence(activeGroup.id)
    }
  }, [activeGroup?.id])

  // Le groupe et le canal sélectionnés survivent à la navigation : sans ce
  // drapeau, un message reçu après avoir quitté la page serait considéré comme
  // lu parce que le canal était encore « actif » dans le store. Une fenêtre
  // réduite ou sans focus ne montre rien : elle doit compter en non lus.
  useEffect(() => {
    const stopWatching = watchWindowVisibility((visible) => {
      useGroupStore.getState().setGroupViewVisible(visible)
    })
    return () => {
      stopWatching()
      useGroupStore.getState().setGroupViewVisible(false)
    }
  }, [])

  // Une citation ou une édition appartient au canal où elle a été choisie :
  // changer de canal ne doit pas envoyer une réponse pointant vers un message
  // invisible, ni valider une édition sur un autre canal.
  useEffect(() => {
    setReplyTo(undefined)
    setEditingMessage(undefined)
  }, [channelId])

  // Ouvrir un canal recharge son historique depuis Hyperbee (il n'était relu
  // qu'en 1:1, si bien qu'un redémarrage vidait les groupes) puis vaut lecture :
  // le compteur n'était incrémenté qu'en dehors du canal actif et rien ne le
  // remettait à zéro, donc sa pastille restait indéfiniment allumée.
  const initialChannelLoadRef = React.useRef<Promise<unknown>>(Promise.resolve())
  const { noticeHistoryError, historyLoaded, historyFailed, retryHistory, historyRetry } =
    useHistoryErrorNotice(historyKey)
  useEffect(() => {
    if (!activeGroupId || !channelId || !groupViewVisible) return
    let cancelled = false
    const openChannel = async () => {
      const load = groupService.loadChannelMessages(activeGroupId, channelId)
      initialChannelLoadRef.current = load
      const stored = await load
      if (cancelled) return
      // Un canal qui n'a rien à lire et un canal dont la lecture échoue se
      // ressemblent à l'écran : seule l'erreur renvoie `null`, et elle doit
      // s'annoncer pour que l'utilisateur comprenne pourquoi le canal est vide.
      if (stored === null) noticeHistoryError()
      else historyLoaded()
      const channel = useGroupStore.getState().getGroup(activeGroupId)?.channels.find((c) => c.id === channelId)
      if (!channel?.unreadCount) return
      const reader = useIdentityStore.getState().identity?.keyPair.publicKey
      const channelMessages = useMessageStore.getState().messages[channelId] ?? []
      // Le compteur est remis à zéro juste en dessous : l'ancre se pose ici.
      if (reader) {
        const anchor = findFirstUnreadMessageId(channelMessages, channel.unreadCount, reader)
        if (anchor) setFirstUnreadId(anchor)
      }
      const messageIds = reader
        ? channelMessages
          .filter((message) => message.senderId !== reader)
          .slice(-200)
          .map((message) => message.id)
        : []
      if (messageIds.length > 0 && useUIStore.getState().settings.privacy.readReceipts) {
        await groupService.markAsRead(activeGroupId, channelId, messageIds).catch((err) => {
          console.warn('[GroupView] markAsRead failed:', err)
        })
      } else {
        useGroupStore.getState().clearChannelUnread(activeGroupId, channelId)
      }
    }
    void openChannel()
    return () => { cancelled = true }
  }, [activeGroupId, channelId, groupViewVisible, noticeHistoryError, historyLoaded, historyRetry])

  // PAGINATION: l'ouverture ne charge que les derniers messages du canal ;
  // remonter en haut doit aller chercher la suite dans Hyperbee.
  const loadOlderMessages = useCallback(async () => {
    if (!activeGroupId || !channelId || loadingOlderRef.current || paginationState.exhausted) return
    const current = useMessageStore.getState().messages[channelId] ?? []
    if (current.length === 0) return
    loadingOlderRef.current = true
    try {
      const older = await groupService.loadOlderChannelMessages(
        activeGroupId,
        channelId,
        current[0].timestamp + 1,
        HISTORY_PAGE_SIZE,
      )
      if (historyKeyRef.current !== historyKey) return
      // `null` = lecture échouée : garder la pagination ouverte permet à
      // `startReached` de retenter la même page au prochain bord haut.
      if (older === null) {
        noticeHistoryError()
        return
      }
      historyLoaded()
      const after = useMessageStore.getState().messages[channelId]?.length ?? current.length
      const added = after - current.length
      setPagination((state) => {
        const base = state.key === historyKey ? state.firstItemIndex : FIRST_ITEM_INDEX
        return {
          key: historyKey,
          firstItemIndex: Math.max(0, base - added),
          exhausted: older.length < HISTORY_PAGE_SIZE || added === 0,
        }
      })
    } finally {
      loadingOlderRef.current = false
    }
  }, [activeGroupId, channelId, historyKey, paginationState.exhausted, noticeHistoryError, historyLoaded])

  // Même saut que le fil 1:1 : un résultat de recherche profond doit ouvrir le
  // canal sur son message, chargé depuis Hyperbee si nécessaire.
  const jumpRequest = React.useMemo(
    () => parseMessageJump(location.state, channelId || undefined),
    [location.state, channelId]
  )
  const waitForInitialHistory = useCallback(() => initialChannelLoadRef.current, [])
  const loadJumpContext = useCallback(async (timestamp: number) => {
    if (!activeGroupId || !channelId) return
    const page = await groupService.loadChannelMessageContext(activeGroupId, channelId, timestamp)
    // Le saut abandonne sans rien montrer si la page de contexte n'arrive pas.
    if (page === null) noticeHistoryError()
    else historyLoaded()
    return page
  }, [activeGroupId, channelId, noticeHistoryError, historyLoaded])
  // Même couture que le fil 1:1 : le contexte du saut s'arrête avant la
  // fenêtre récente, la suite se charge en approchant du dernier message.
  const loadNewerGapMessages = useCallback(async (cursor: MessageCursor, limit: number) => {
    if (!activeGroupId || !channelId) return []
    const page = await groupService.loadNewerChannelMessages(
      activeGroupId,
      channelId,
      cursor.timestamp,
      cursor.id,
      limit,
    )
    if (page === null) noticeHistoryError()
    else historyLoaded()
    return page
  }, [activeGroupId, channelId, noticeHistoryError, historyLoaded])
  const { gapArmed, armGap, onRangeChanged } = useNewerMessages({
    dataId: channelId || undefined,
    messages,
    firstItemIndex: paginationState.firstItemIndex,
    pageSize: HISTORY_PAGE_SIZE,
    loadNewer: loadNewerGapMessages,
  })
  const handleJumpPrepended = useCallback((added: number) => {
    setPagination((state) => {
      const base = state.key === historyKey ? state.firstItemIndex : FIRST_ITEM_INDEX
      return {
        key: historyKey,
        firstItemIndex: Math.max(0, base - added),
        exhausted: state.key === historyKey ? state.exhausted : false,
      }
    })
  }, [historyKey])
  const handleJumpStart = useCallback(() => setAtBottom(false), [])
  const highlightedMessageId = useMessageJump({
    request: jumpRequest,
    dataId: channelId || undefined,
    messages,
    firstItemIndex: paginationState.firstItemIndex,
    virtuosoRef,
    waitForInitialHistory,
    loadContext: loadJumpContext,
    onPrependedMessages: handleJumpPrepended,
    onNewerGap: armGap,
    onJumpStart: handleJumpStart,
  })

  // Tous les hooks sont appelés avant cette sortie : sans groupe, le composant
  // doit rendre le même nombre de hooks qu'avec, sinon React casse l'ordre.
  if (!activeGroup) {
    return <GroupEmptyState />
  }

  return (
    <div className="flex h-full">
      {/* Channel list */}
      <ChannelList />

      {/* Main message area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Group header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-asgard-border bg-asgard-surface/50 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-asgard-text-muted">#</span>
              <h3 className="text-sm font-semibold text-asgard-text-primary truncate">
                {activeChannel?.name ?? t('groups.general')}
              </h3>
            </div>
            {activeChannel?.description && (
              <p className="text-xs text-asgard-text-muted truncate mt-0.5">
                {activeChannel.description}
              </p>
            )}
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-1">
            {/* Group call buttons */}
            <HeaderButton
              aria-label={t('groups.startAudioGroupCall')}
              onClick={() => {
                if (!activeGroup || !identity) return
                const otherMembers = activeGroup.members
                  .filter((m) => m.publicKey !== identity.keyPair.publicKey)
                  .map((m) => m.publicKey)
                if (otherMembers.length === 0) return
                callService.startGroupCall(activeGroup.id, activeGroup.name, otherMembers, 'audio')
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
            </HeaderButton>
            <HeaderButton
              aria-label={t('groups.startVideoGroupCall')}
              onClick={() => {
                if (!activeGroup || !identity) return
                const otherMembers = activeGroup.members
                  .filter((m) => m.publicKey !== identity.keyPair.publicKey)
                  .map((m) => m.publicKey)
                if (otherMembers.length === 0) return
                callService.startGroupCall(activeGroup.id, activeGroup.name, otherMembers, 'video')
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            </HeaderButton>
            <HeaderButton
              aria-label={t('groups.toggleMembers')}
              active={showMembers}
              onClick={() => setShowMembers(!showMembers)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
            </HeaderButton>
            <MuteButton
              muted={groupMuted}
              mutedUntil={groupMutedUntil}
              onToggle={() => {
                if (!activeGroup) return
                useConversationStore.getState().muteConversation(activeGroup.id, !groupMuted)
              }}
            />
            <HeaderButton
              aria-label={t('groups.groupSettings')}
              onClick={() => setShowSettings(true)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
              </svg>
            </HeaderButton>
          </div>
        </div>

        {/* Messages */}
        <div className="relative flex-1 overflow-hidden">
          {messages.length === 0 ? (
            historyFailed ? (
              <HistoryFailureNotice onRetry={retryHistory} />
            ) : (
              <ChannelStartMessage
                channelName={activeChannel?.name ?? t('groups.general')}
                groupName={activeGroup.name}
              />
            )
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              data={messages}
              firstItemIndex={paginationState.firstItemIndex}
              startReached={() => { void loadOlderMessages() }}
              rangeChanged={onRangeChanged}
              followOutput={(atBottom) => (atBottom && !gapArmed ? 'smooth' : false)}
              atBottomStateChange={setAtBottom}
              className="h-full virtual-list"
              initialTopMostItemIndex={messages.length - 1}
              itemContent={(_, message) => (
                <React.Fragment key={message.id}>
                  {message.id === firstUnreadId && (
                    <UnreadDivider label={t('chat.newMessages')} />
                  )}
                  <MessageBubble
                    message={message}
                    isOwn={message.senderId === identity?.keyPair.publicKey}
                    senderName={getMemberName(activeGroup, message.senderId)}
                    showSender
                    highlighted={message.id === highlightedMessageId}
                    onReply={(msg) => {
                      setEditingMessage(undefined)
                      setReplyTo(msg)
                    }}
                    onEdit={(msg) => {
                      setReplyTo(undefined)
                      setEditingMessage(msg)
                    }}
                    onDelete={handleDelete}
                    onDeletePermanently={handleDeleteForMe}
                    onReaction={handleReaction}
                    onPin={canPin ? handlePin : undefined}
                    onForward={setForwardMessage}
                  />
                </React.Fragment>
              )}
              components={{
                Header: () => <div className="h-4" />,
                Footer: () => (
                  <TypingIndicator users={typingUsers.map((u) => u.publicKey)} />
                ),
              }}
            />
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

        {/* Transferts de fichiers actifs de ce canal */}
        <AnimatePresence>
          <ActiveTransfersWidget conversationId={channelId} />
        </AnimatePresence>

        {/* Message input */}
        <MessageInput
          conversationId={channelId}
          replyTo={replyTo}
          editingMessage={editingMessage}
          onSend={handleSend}
          onEditSubmit={handleEditSubmit}
          onTyping={handleTyping}
          onCancelEdit={() => setEditingMessage(undefined)}
          onFiles={handleFiles}
          onCancelReply={() => setReplyTo(undefined)}
          placeholder={t('groups.messageChannel', { channelName: activeChannel?.name ?? t('groups.general') })}
        />
      </div>

      {/* Member list */}
      <AnimatePresence>
        {showMembers && <MemberList />}
      </AnimatePresence>

      {/* Group settings modal */}
      <AnimatePresence>
        {showSettings && (
          <GroupSettings onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>

      {/* Forward modal */}
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

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getMemberName(
  group: { members: { publicKey: string; displayName: string }[] } | undefined,
  publicKey: string
): string {
  if (!group) return publicKey.slice(0, 8)
  const member = group.members.find((m: { publicKey: string; displayName: string }) => m.publicKey === publicKey)
  return member?.displayName ?? publicKey.slice(0, 8)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const GroupEmptyState: React.FC = () => {
  const { t } = useTranslation()
  return (
  <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
    <div className="w-20 h-20 rounded-3xl bg-asgard-nordic/10 border border-asgard-nordic/20 flex items-center justify-center mb-4">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier/40">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-asgard-text-primary mb-2">{t('groups.selectGroup')}</h3>
    <p className="text-sm text-asgard-text-muted max-w-xs">
      {t('groups.chooseGroup')}
    </p>
  </div>
  )
}

const ChannelStartMessage: React.FC<{ channelName: string; groupName: string }> = ({
  channelName,
  groupName,
}) => {
  const { t } = useTranslation()
  return (
  <div className="flex flex-col items-center justify-center h-full text-center px-8">
    <div className="w-16 h-16 rounded-2xl bg-asgard-nordic/10 flex items-center justify-center mb-4">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier/40">
        <path d="M20 10V8h-4V4h-2v4h-4V4H8v4H4v2h4v4H4v2h4v4h2v-4h4v4h2v-4h4v-2h-4v-4h4zm-6 4h-4v-4h4v4z" />
      </svg>
    </div>
    <h3 className="text-base font-semibold text-asgard-text-primary mb-1">
      {t('groups.welcomeToChannel', { channelName })}
    </h3>
    <p className="text-sm text-asgard-text-muted">
      {t('groups.channelIntro', { channelName, groupName })}
    </p>
  </div>
  )
}

const TypingIndicator: React.FC<{ users: string[] }> = ({ users }) => {
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
        {users.length === 1 ? t('groups.someoneIsTyping') : t('groups.peopleTyping', { count: users.length })}
      </span>
    </motion.div>
  )
}

const HeaderButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
> = ({ active, children, className, ...props }) => (
  <motion.button
    whileTap={{ scale: 0.9 }}
    className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${
      active
        ? 'bg-asgard-nordic/30 text-asgard-glacier'
        : 'text-asgard-text-muted hover:bg-asgard-surface-alt hover:text-asgard-text-primary'
    } ${className ?? ''}`}
    {...(props as any)}
  >
    {children}
  </motion.button>
)
