import React from 'react'
import { motion } from 'framer-motion'
import { useGroupStore } from '@/stores/groupStore'
import { cn } from '@/utils/cn'
import type { GroupChannel } from '@/types'
import { useTranslation } from 'react-i18next'

/**
 * ChannelList — Discord-style channel sidebar within a group.
 * Shows text, voice, announcement, and readonly channels with unread indicators.
 */
export const ChannelList: React.FC = () => {
  const { t } = useTranslation()
  const activeGroup = useGroupStore((s) => s.getActiveGroup())
  const activeChannelId = useGroupStore((s) => s.activeChannelId)
  const setActiveChannel = useGroupStore((s) => s.setActiveChannel)
  const getChannels = useGroupStore((s) => s.getChannels)
  // La frappe vit dans le GroupStore et expire après 5 s sans événement ;
  // typingTick force la ré-évaluation pour la voir disparaître sans nouveau
  // message. Même convention que GroupItem et la liste 1:1.
  const channelTyping = useGroupStore((s) => s.channelTyping)
  const [typingTick, setTypingTick] = React.useState(0)

  const channels = activeGroup ? getChannels(activeGroup.id) : []
  const typingChannelIds = React.useMemo(() => {
    const ids = new Set<string>()
    if (!activeGroup) return ids
    const store = useGroupStore.getState()
    for (const ch of channels) {
      if (store.getChannelTypingUsers(activeGroup.id, ch.id).length > 0) ids.add(ch.id)
    }
    return ids
  }, [activeGroup, channels, channelTyping, typingTick])

  React.useEffect(() => {
    if (typingChannelIds.size === 0) return
    const timer = setTimeout(() => setTypingTick((n) => n + 1), 1000)
    return () => clearTimeout(timer)
  }, [typingChannelIds.size, typingTick])

  if (!activeGroup) return null

  // Group channels by type
  const textChannels = channels.filter((ch) => ch.type === 'text')
  const voiceChannels = channels.filter((ch) => ch.type === 'voice')
  const announcementChannels = channels.filter((ch) => ch.type === 'announcement')
  const readonlyChannels = channels.filter((ch) => ch.type === 'readonly')

  return (
    <div className="w-48 flex-shrink-0 bg-asgard-deep-black/60 border-r border-asgard-border overflow-y-auto">
      {/* Group header */}
      <div className="px-3 py-3 border-b border-asgard-border">
        <h3 className="text-sm font-semibold text-asgard-text-primary truncate">
          {activeGroup.name}
        </h3>
        <p className="text-xxs text-asgard-text-muted mt-0.5">
          {t('groups.memberCount', { count: activeGroup.members.length })}
        </p>
      </div>

      <div className="py-2">
        {/* Text channels */}
        {textChannels.length > 0 && (
          <ChannelSection title={t('groups.textChannels')}>
            {textChannels.map((ch) => (
              <ChannelItem
                key={ch.id}
                channel={ch}
                isActive={ch.id === activeChannelId}
                onClick={() => setActiveChannel(ch.id)}
                typing={typingChannelIds.has(ch.id)}
                icon={<HashIcon />}
              />
            ))}
          </ChannelSection>
        )}

        {/* Announcement channels */}
        {announcementChannels.length > 0 && (
          <ChannelSection title={t('groups.announcements')}>
            {announcementChannels.map((ch) => (
              <ChannelItem
                key={ch.id}
                channel={ch}
                isActive={ch.id === activeChannelId}
                onClick={() => setActiveChannel(ch.id)}
                typing={typingChannelIds.has(ch.id)}
                icon={<MegaphoneIcon />}
              />
            ))}
          </ChannelSection>
        )}

        {/* Read-only channels */}
        {readonlyChannels.length > 0 && (
          <ChannelSection title={t('groups.readOnly')}>
            {readonlyChannels.map((ch) => (
              <ChannelItem
                key={ch.id}
                channel={ch}
                isActive={ch.id === activeChannelId}
                onClick={() => setActiveChannel(ch.id)}
                typing={typingChannelIds.has(ch.id)}
                icon={<LockIcon />}
              />
            ))}
          </ChannelSection>
        )}

        {/* Voice channels */}
        {voiceChannels.length > 0 && (
          <ChannelSection title={t('groups.voiceChannels')}>
            {voiceChannels.map((ch) => (
              <ChannelItem
                key={ch.id}
                channel={ch}
                isActive={ch.id === activeChannelId}
                onClick={() => setActiveChannel(ch.id)}
                typing={typingChannelIds.has(ch.id)}
                icon={<SpeakerIcon />}
              />
            ))}
          </ChannelSection>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ChannelSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="mb-2">
    <p className="px-3 py-1 text-xxs font-semibold text-asgard-text-muted uppercase tracking-wider">
      {title}
    </p>
    {children}
  </div>
)

interface ChannelItemProps {
  channel: GroupChannel
  isActive: boolean
  onClick: () => void
  icon: React.ReactNode
  typing?: boolean
}

const ChannelItem: React.FC<ChannelItemProps> = ({ channel, isActive, onClick, icon, typing }) => {
  const { t } = useTranslation()
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-asgard-nordic/20 text-asgard-glacier'
          : channel.unreadCount > 0
          ? 'text-asgard-text-primary hover:bg-asgard-surface-alt'
          : 'text-asgard-text-muted hover:bg-asgard-surface-alt hover:text-asgard-text-secondary'
      )}
    >
      <span className="flex-shrink-0 opacity-70">{icon}</span>
      <span className="truncate flex-1 text-left text-xs">{channel.name}</span>
      {typing && (
        <>
          <span className="sr-only">{t('chat.typing')}</span>
          <span
            className="flex items-end gap-0.5 h-2 flex-shrink-0"
            aria-hidden="true"
            title={t('chat.typing')}
            data-testid={`channel-typing-${channel.id}`}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-asgard-glacier animate-typing"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        </>
      )}
      {channel.unreadCount > 0 && (
        <span className="min-w-4 h-4 flex items-center justify-center bg-asgard-glacier text-asgard-deep-black text-xxs font-bold rounded-full px-1 flex-shrink-0">
          {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
        </span>
      )}
    </motion.button>
  )
}

// ─── Icons ──────────────────────────────────────────────────────────────────────

const HashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 10V8h-4V4h-2v4h-4V4H8v4H4v2h4v4H4v2h4v4h2v-4h4v4h2v-4h4v-2h-4v-4h4zm-6 4h-4v-4h4v4z" />
  </svg>
)

const MegaphoneIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z" />
  </svg>
)

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
  </svg>
)

const SpeakerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
)
