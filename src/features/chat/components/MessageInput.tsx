import React, { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'
import { useUIStore } from '@/stores/uiStore'
import type { Message } from '@/types'

interface MessageInputProps {
  conversationId: string
  replyTo?: Message
  onSend: (content: string, type?: 'text') => void
  onFiles?: (files: File[]) => void
  onCancelReply?: () => void
  onTyping?: (typing: boolean) => void
  disabled?: boolean
  placeholder?: string
  /** BROADCAST MODE: When true, show read-only banner instead of input */
  broadcastReadOnly?: boolean
}

/**
 * MessageInput — rich text input with reply, emoji, and file attachment support.
 */
export const MessageInput: React.FC<MessageInputProps> = ({
  replyTo,
  onSend,
  onFiles,
  onCancelReply,
  onTyping,
  disabled = false,
  placeholder,
  broadcastReadOnly = false,
}) => {
  const { t } = useTranslation()
  const effectivePlaceholder = placeholder ?? t('chat.typeMessage')
  // CHAT SETTINGS: Enter sends the message, or requires Ctrl+Enter when disabled
  const sendOnEnter = useUIStore((s) => s.settings.chat.sendOnEnter)
  const [content, setContent] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [content])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    handleTyping(true)
  }

  const handleTyping = useCallback(
    (typing: boolean) => {
      if (!onTyping) return
      if (typing && !isTypingRef.current) {
        isTypingRef.current = true
        onTyping(true)
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (typing) {
        typingTimerRef.current = setTimeout(() => {
          isTypingRef.current = false
          onTyping(false)
        }, 3000)
      } else {
        isTypingRef.current = false
        onTyping(false)
      }
    },
    [onTyping]
  )

  const handleSend = useCallback(() => {
    const trimmed = content.trim()
    if ((!trimmed && pendingFiles.length === 0) || disabled) return

    // Send files first if any
    if (pendingFiles.length > 0 && onFiles) {
      onFiles(pendingFiles)
      setPendingFiles([])
    }

    if (trimmed) {
      onSend(trimmed)
      setContent('')
    }
    handleTyping(false)
    textareaRef.current?.focus()
  }, [content, pendingFiles, disabled, onSend, onFiles, handleTyping])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // Ctrl+Enter always sends (explicit user intent)
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        handleSend()
        return
      }
      // CHAT SETTINGS: Enter sends only when sendOnEnter is enabled;
      // otherwise Enter inserts a newline and Ctrl+Enter sends.
      if (!e.shiftKey && sendOnEnter) {
        e.preventDefault()
        handleSend()
      }
    }
    if (e.key === 'Escape' && replyTo) {
      onCancelReply?.()
    }
  }

  const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '✅']

  // File handling
  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setPendingFiles((prev) => [...prev, ...files])
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      setPendingFiles((prev) => [...prev, ...files])
    }
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || [])
    const imageItems = items.filter((item) => item.type.startsWith('image/'))
    if (imageItems.length > 0) {
      e.preventDefault()
      const files = imageItems.map((item) => item.getAsFile()).filter(Boolean) as File[]
      setPendingFiles((prev) => [...prev, ...files])
    }
  }, [])

  return (
    <div
      className={cn(
        'flex-shrink-0 bg-asgard-surface/50 border-t border-asgard-border relative',
        isDragOver && 'ring-2 ring-asgard-glacier/50'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Broadcast mode banner */}
      {broadcastReadOnly && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-asgard-nordic/10 border-b border-asgard-border">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-nordic">
            <path d="M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39-.4-.34-.95-.8-1.41-1.21-.27-.24-.49-.46-.65-.63-.43-.46-.84-.91-1.14-1.25-.16-.18-.28-.32-.36-.42-.08-.1-.1-.13-.1-.13H4V4h16v12.17h-2V6H6v10h7.54c.14.17.32.39.53.61z"/>
            <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm0 16.17l-1.17-1.17H4V4h16v14.17z"/>
          </svg>
          <span className="text-sm text-asgard-text-secondary">
            {t('groups.broadcastModeHint')}
          </span>
        </div>
      )}
      {/* Hidden file input — every format, like drag-and-drop already allows */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      {/* Reply preview */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-2 border-l-2 border-asgard-glacier mx-3 mt-2 bg-asgard-border/30 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-asgard-glacier mb-0.5">
                  {t('messageInput.replyingTo')} {replyTo.senderId.slice(0, 8)}…
                </p>
                <p className="text-xs text-asgard-text-muted truncate">
                  {replyTo.deleted ? t('messageInput.messageDeleted') : replyTo.content}
                </p>
              </div>
              <button
                onClick={onCancelReply}
                className="flex-shrink-0 text-asgard-text-muted hover:text-asgard-text-primary transition-colors"
                aria-label={t('messageInput.cancelReply')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick emoji picker */}
      <AnimatePresence>
        {showEmoji && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-center gap-2 px-4 py-2 border-t border-asgard-border"
          >
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setContent((c) => c + emoji)}
                className="text-xl hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending files preview */}
      <AnimatePresence>
        {pendingFiles.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-asgard-border/30">
              {pendingFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 bg-asgard-surface-alt border border-asgard-border rounded-lg px-2 py-1.5">
                  {file.type.startsWith('image/') ? (
                    <div className="w-8 h-8 rounded bg-asgard-surface-alt overflow-hidden flex-shrink-0">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded bg-asgard-nordic/20 flex items-center justify-center flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                        <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                      </svg>
                    </div>
                  )}
                  <span className="text-xs text-asgard-text-secondary truncate max-w-[120px]">{file.name}</span>
                  <button
                    onClick={() => removePendingFile(index)}
                    className="text-asgard-text-muted hover:text-asgard-text-primary transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-asgard-glacier/5 border-2 border-dashed border-asgard-glacier/30 flex items-center justify-center z-10 pointer-events-none"
          >
            <div className="text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier mx-auto mb-2">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
              </svg>
              <p className="text-sm text-asgard-glacier">{t('messageInput.dropFiles')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input row - hidden in broadcast read-only mode */}
      {!broadcastReadOnly && (
        <div className="flex items-end gap-2 px-3 py-3">
          {/* Attachment button */}
          <ActionButton aria-label={t('messageInput.attachFile')} onClick={handleFileSelect}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
            </svg>
          </ActionButton>

          {/* Text area */}
          <div className={cn(
            'flex-1 relative bg-asgard-surface-alt border border-asgard-border rounded-2xl',
            'focus-within:border-asgard-glacier/40 transition-colors'
          )}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={disabled}
              placeholder={effectivePlaceholder}
              rows={1}
              className={cn(
                'w-full bg-transparent resize-none px-4 py-2.5',
                'text-sm text-asgard-text-primary placeholder:text-asgard-text-muted',
                'outline-none leading-5 min-h-[40px] max-h-40',
                'disabled:opacity-50'
              )}
            />
          </div>

          {/* Emoji button */}
          <ActionButton
            aria-label={t('messageInput.emoji')}
            active={showEmoji}
            onClick={() => setShowEmoji((s) => !s)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
            </svg>
          </ActionButton>

          {/* Send button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleSend}
            disabled={(!content.trim() && pendingFiles.length === 0) || disabled}
            aria-label={t('messageInput.send')}
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center transition-all',
              (content.trim() || pendingFiles.length > 0) && !disabled
                ? 'bg-gradient-to-br from-asgard-nordic to-asgard-nordic-light text-white shadow-md hover:shadow-asgard-nordic/40'
                : 'bg-asgard-surface-alt text-asgard-text-muted cursor-not-allowed'
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </motion.button>
        </div>
      )}
    </div>
  )
}

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  children: React.ReactNode
}

const ActionButton: React.FC<ActionButtonProps> = ({ active, className, children, ...props }) => (
  <motion.button
    whileTap={{ scale: 0.9 }}
    className={cn(
      'w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0',
      'transition-colors duration-150',
      active
        ? 'bg-asgard-nordic/30 text-asgard-glacier'
        : 'text-asgard-text-muted hover:bg-asgard-surface-alt hover:text-asgard-text-secondary',
      className
    )}
    {...(props as any)}
  >
    {children}
  </motion.button>
)
