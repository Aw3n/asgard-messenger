import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useConversationStore } from '@/stores/conversationStore'
import { useContactStore } from '@/stores/contactStore'
import { useGroupStore } from '@/stores/groupStore'
import { useUIStore } from '@/stores/uiStore'
import { chatService } from '@/services/ChatService'
import { groupService } from '@/services/GroupService'
import { Avatar } from '@/components/ui/Avatar'
import { Input } from '@/components/ui/Input'
import { cn } from '@/utils/cn'
import type { Message } from '@/types'

interface ForwardModalProps {
  message: Message
  onClose: () => void
}

/**
 * ForwardModal — forward a message to another conversation.
 */
export const ForwardModal: React.FC<ForwardModalProps> = ({ message, onClose }) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const conversations = useConversationStore((s) => s.conversations)
  const getContact = useContactStore((s) => s.getContact)
  const groups = useGroupStore((s) => s.groups)

  // Seules les conversations où l'on peut réellement écrire sont proposées :
  // un identifiant sans destinataire n'aurait aucun chemin d'envoi.
  const forwardTargets = useMemo(
    () => Object.values(conversations).filter(
      (conv) => (conv.type === 'direct' && !!conv.participantId) || (conv.type === 'group' && !!conv.groupId),
    ),
    [conversations],
  )

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return forwardTargets
    const q = search.toLowerCase()
    return forwardTargets.filter((conv) => {
      const group = conv.groupId ? groups[conv.groupId] : undefined
      const contact = conv.participantId ? getContact(conv.participantId) : undefined
      const name = group?.name ?? contact?.displayName ?? conv.id.slice(0, 16)
      return name.toLowerCase().includes(q)
    })
  }, [forwardTargets, groups, search, getContact])

  const handleForward = async (conversationId: string) => {
    if (sending) return
    const conv = conversations[conversationId]
    if (!conv) return

    setSending(conversationId)
    try {
      const body = message.content?.trim() || message.attachments?.[0]?.name || ''
      const content = t('chat.forwardedMessageTemplate', { content: body })

      if (conv.type === 'group' && conv.groupId) {
        const group = useGroupStore.getState().getGroup(conv.groupId)
        const channelId = group?.activeChannelId
          ?? group?.channels[0]?.id
        if (!group || !channelId) throw new Error('Group has no channel')
        await groupService.sendGroupMessage(conv.groupId, channelId, content)
        useUIStore.getState().addToast({ type: 'success', title: t('chat.forwardedMessage'), duration: 3000 })
      } else if (conv.participantId) {
        const outcome = await chatService.sendMessage(
          { conversationId: conv.id, type: 'text', content },
          conv.id,
          conv.participantId,
        )
        useUIStore.getState().addToast({
          type: outcome === 'queued' ? 'warning' : 'success',
          title: t(outcome === 'queued' ? 'chat.messageQueued' : 'chat.forwardedMessage'),
          duration: 3000,
        })
      } else {
        throw new Error('Conversation has no recipient')
      }
      onClose()
    } catch (err) {
      console.error('[ForwardModal] Forward failed:', err)
      useUIStore.getState().addToast({ type: 'error', title: t('chat.messageNotDelivered') })
    } finally {
      setSending(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative mica-card border border-asgard-border rounded-2xl shadow-modal p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-asgard-text-primary mb-4">{t('chat.forwardMessage')}</h3>

        {/* Preview of message being forwarded */}
        <div className="bg-asgard-surface-alt rounded-xl p-3 mb-4 border border-asgard-border">
          <p className="text-xs text-asgard-text-muted mb-1">{t('chat.forwarding')}</p>
          <p className="text-sm text-asgard-text-primary line-clamp-2">{message.content || message.attachments?.[0]?.name}</p>
        </div>

        {/* Search */}
        <Input
          placeholder={t('chat.searchConversations')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3"
        />

        {/* Conversation list */}
        <div className="max-h-52 overflow-y-auto">
          {filteredConversations.map((conv) => {
            const group = conv.groupId ? groups[conv.groupId] : undefined
            const contact = conv.participantId ? getContact(conv.participantId) : undefined
            const name = group?.name ?? contact?.displayName ?? conv.id.slice(0, 16)
            return (
              <button
                key={conv.id}
                onClick={() => handleForward(conv.id)}
                disabled={sending !== null}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
                  'hover:bg-asgard-surface-alt transition-colors text-left',
                  sending !== null && 'opacity-60 cursor-wait',
                )}
              >
                <Avatar
                  name={name}
                  publicKey={conv.participantId}
                  src={group?.avatar ?? contact?.avatar}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-asgard-text-primary truncate">{name}</p>
                  <p className="text-xs text-asgard-text-muted truncate">
                    {conv.lastMessage?.content?.slice(0, 40) || t('chat.noMessages')}
                  </p>
                </div>
              </button>
            )
          })}
          {filteredConversations.length === 0 && (
            <p className="text-sm text-asgard-text-muted text-center py-6">
              {t('chat.noConversationsFound')}
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
