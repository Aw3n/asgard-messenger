import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import type { Message } from '@/types'

interface MessageEditModalProps {
  message: Message
  onSave: (messageId: string, newContent: string) => void
  onClose: () => void
}

/**
 * MessageEditModal — modal for editing a message's content.
 */
export const MessageEditModal: React.FC<MessageEditModalProps> = ({ message, onSave, onClose }) => {
  const { t } = useTranslation()
  const [content, setContent] = useState(message.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
    textareaRef.current?.setSelectionRange(content.length, content.length)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    if (content.trim() && content !== message.content) {
      onSave(message.id, content.trim())
    }
    onClose()
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
        className="relative mica-card border border-asgard-border rounded-2xl shadow-modal p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-asgard-text-primary mb-4">{t('chat.editMessageTitle')}</h3>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="asgard-input w-full p-3 text-sm resize-none min-h-24"
          rows={4}
          maxLength={4000}
        />

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-asgard-text-muted">
            {t('chat.editMessageCounter', { count: content.length })}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!content.trim() || content === message.content}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
