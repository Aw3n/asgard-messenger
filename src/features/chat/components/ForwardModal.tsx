import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useConversationStore } from '@/stores/conversationStore'
import { useContactStore } from '@/stores/contactStore'
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
  const conversations = useConversationStore((s) => s.conversations)
  const getContact = useContactStore((s) => s.getContact)
  const navigate = useNavigate()

  const filteredConversations = useMemo(() => {
    const convList = Object.values(conversations)
    if (!search.trim()) return convList
    const q = search.toLowerCase()
    return convList.filter((conv) => {
      const contact = conv.participantId ? getContact(conv.participantId) : undefined
      const name = contact?.displayName ?? conv.id.slice(0, 16)
      return name.toLowerCase().includes(q)
    })
  }, [conversations, search, getContact])

  const handleForward = (conversationId: string) => {
    // Forward: send the message content to the target conversation
    // In a real implementation, this would use chatService to send
    const forwardContent = t('chat.forwardedMessageTemplate', { content: message.content ?? '' })
    // This is a simplified version — real implementation would go through chatService
    console.log('Forward to', conversationId, ':', forwardContent)
    onClose()
    navigate(`/conversations/${conversationId}`)
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
          <p className="text-sm text-asgard-text-primary line-clamp-2">{message.content}</p>
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
            const contact = conv.participantId ? getContact(conv.participantId) : undefined
            const name = contact?.displayName ?? conv.id.slice(0, 16)
            return (
              <button
                key={conv.id}
                onClick={() => handleForward(conv.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
                  'hover:bg-asgard-surface-alt transition-colors text-left'
                )}
              >
                <Avatar
                  name={name}
                  publicKey={conv.participantId}
                  src={contact?.avatar}
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
