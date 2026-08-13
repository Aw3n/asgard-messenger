import React, { useState, useCallback, useEffect } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { motion, AnimatePresence } from 'framer-motion'
import { useGroupStore } from '@/stores/groupStore'
import { useMessageStore } from '@/stores/messageStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useNetworkStore } from '@/stores/networkStore'
import { ChannelList } from './ChannelList'
import { MemberList } from './MemberList'
import { GroupSettings } from './GroupSettings'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { MessageInput } from '@/features/chat/components/MessageInput'
import { callService } from '@/services/CallService'
import { groupService } from '@/services/GroupService'
import { useTranslation } from 'react-i18next'

/**
 * GroupView — main view for a selected group.
 * Shows channel list (left), messages (center), and member list (right).
 */
export const GroupView: React.FC = () => {
  const { t } = useTranslation()
  const activeGroup = useGroupStore((s) => s.getActiveGroup())
  const activeChannel = useGroupStore((s) => s.getActiveChannel())
  const identity = useIdentityStore((s) => s.identity)
  const [showSettings, setShowSettings] = useState(false)
  const [showMembers, setShowMembers] = useState(true)
  const virtuosoRef = React.useRef<VirtuosoHandle>(null)

  if (!activeGroup) {
    return <GroupEmptyState />
  }

  const channelId = activeChannel?.id ?? ''
  // CRITICAL: Select messages reactively from the store
  const messages = useMessageStore((s) => channelId ? (s.messages[channelId] ?? []) : [])
  const typingUsers = useNetworkStore((s) => s.getTypingUsers(channelId))

  const handleSend = useCallback(
    (content: string) => {
      // Send message via P2P to group members
      if (!identity || !channelId || !activeGroup) return
      groupService.sendGroupMessage(activeGroup.id, channelId, content)
    },
    [identity, channelId, activeGroup]
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
        <div className="flex-1 overflow-hidden">
          {messages.length === 0 ? (
            <ChannelStartMessage
              channelName={activeChannel?.name ?? t('groups.general')}
              groupName={activeGroup.name}
            />
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              data={messages}
              followOutput="smooth"
              className="h-full virtual-list"
              initialTopMostItemIndex={messages.length - 1}
              itemContent={(_, message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isOwn={message.senderId === identity?.keyPair.publicKey}
                  senderName={getMemberName(activeGroup, message.senderId)}
                  showSender
                />
              )}
              components={{
                Header: () => <div className="h-4" />,
                Footer: () => (
                  <TypingIndicator users={typingUsers} />
                ),
              }}
            />
          )}
        </div>

        {/* Message input */}
        <MessageInput
          conversationId={channelId}
          onSend={handleSend}
          onFiles={handleFiles}
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
