import { create } from 'zustand'
import type { Message, OutgoingMessage, LinkPreview, DraftMessage, ScheduledMessage, PollData, LocationData, ContactCard, MessageTemplate, MessageAttachment } from '@/types'
import { generateId } from '@/utils/id'

interface MessageState {
  /** Map of conversationId → Message[] */
  messages: Record<string, Message[]>
  /** Map of conversationId → loading state */
  loading: Record<string, boolean>
  /** Map of conversationId → has more pages */
  hasMore: Record<string, boolean>
  /** Record of message IDs currently being sent (messageId → true) */
  pending: Record<string, boolean>
  /** Draft messages per conversation */
  drafts: Record<string, DraftMessage>
  /** Scheduled messages */
  scheduledMessages: ScheduledMessage[]
  /** Message templates */
  templates: MessageTemplate[]

  // Actions
  addMessage: (message: Message) => void
  addMessages: (conversationId: string, messages: Message[]) => void
  sendMessage: (outgoing: OutgoingMessage, senderId: string) => Promise<Message>
  editMessage: (messageId: string, conversationId: string, newContent: string) => void
  deleteMessage: (messageId: string, conversationId: string) => void
  removeMessage: (messageId: string) => void
  deleteMessagePermanently: (messageId: string, conversationId: string) => void
  recallMessage: (messageId: string, conversationId: string, reason?: string) => void
  clearConversationMessages: (conversationId: string) => void
  updateMessageAttachment: (messageId: string, conversationId: string, updates: Partial<Message> & { status?: Message['status'] }) => void
  addReaction: (messageId: string, conversationId: string, emoji: string, userId: string) => void
  removeReaction: (messageId: string, conversationId: string, emoji: string, userId: string) => void
  markAsRead: (conversationId: string, upToTimestamp: number) => void
  markAllAsRead: (conversationId: string) => void
  markMessageRead: (messageId: string, readerPublicKey: string) => void
  updateStatus: (messageId: string, conversationId: string, status: Message['status']) => void
  updateLinkPreviews: (messageId: string, conversationId: string, previews: LinkPreview[]) => void
  setLoading: (conversationId: string, loading: boolean) => void
  getMessages: (conversationId: string) => Message[]
  getMessage: (messageId: string, conversationId: string) => Message | undefined
  searchMessages: (query: string, conversationId?: string, limit?: number) => Message[]
  // Draft actions
  saveDraft: (conversationId: string, content: string) => void
  getDraft: (conversationId: string) => DraftMessage | undefined
  clearDraft: (conversationId: string) => void
  // Scheduled message actions
  scheduleMessage: (message: ScheduledMessage) => void
  removeScheduledMessage: (id: string) => void
  getScheduledMessages: (conversationId?: string) => ScheduledMessage[]
  markScheduledAsSent: (id: string) => void
  markScheduledAsFailed: (id: string, error: string) => void
  // Thread actions
  getThreadMessages: (parentMessageId: string, conversationId: string) => Message[]
  updateThreadInfo: (parentMessageId: string, conversationId: string, replyCount: number, lastReplyAt: number) => void
  // Pin actions
  pinMessage: (messageId: string, conversationId: string) => void
  unpinMessage: (messageId: string, conversationId: string) => void
  getPinnedMessages: (conversationId: string) => Message[]
  isMessagePinned: (messageId: string, conversationId: string) => boolean
  // Poll actions
  createPoll: (messageId: string, conversationId: string, poll: PollData) => void
  voteOnPoll: (messageId: string, conversationId: string, optionId: string, voterPublicKey: string) => void
  removePollVote: (messageId: string, conversationId: string, optionId: string, voterPublicKey: string) => void
  closePoll: (messageId: string, conversationId: string) => void
  // Location actions
  updateLocation: (messageId: string, conversationId: string, location: LocationData) => void
  // Event actions
  rsvpEvent: (messageId: string, conversationId: string, rsvp: 'accepted' | 'declined' | 'tentative', publicKey: string) => void
  // Task actions
  toggleTaskComplete: (messageId: string, conversationId: string, completedBy: string) => void
  updateTaskAssignees: (messageId: string, conversationId: string, assignees: string[]) => void
  // Contact card actions
  updateContactCard: (messageId: string, conversationId: string, contactCard: ContactCard) => void
  // Template actions
  addTemplate: (template: MessageTemplate) => void
  updateTemplate: (id: string, updates: Partial<MessageTemplate>) => void
  deleteTemplate: (id: string) => void
  getTemplates: (category?: string) => MessageTemplate[]
  useTemplate: (id: string) => void
  // File actions
  deleteFileAttachment: (messageId: string, conversationId: string, attachmentId: string) => Promise<boolean>
  downloadFileAttachment: (attachment: MessageAttachment) => Promise<string>
  /**
   * Publie dans le store l'URL locale (ré)solue d'une pièce jointe. Nécessaire
   * parce que `FileService.downloadFile` mute l'objet en place : sans mise à
   * jour immuable du store, ni la bulle ni la galerie ne se re-rendent.
   */
  setAttachmentLocalUrl: (messageId: string, conversationId: string, attachmentId: string, localUrl: string) => void
  renderTemplate: (id: string, variables: Record<string, string>) => string
}

/**
 * Message store — manages all messages across conversations.
 * Uses plain immutable updates (no immer) for reliability.
 */
export const useMessageStore = create<MessageState>()((set, get) => ({
  messages: {},
  loading: {},
  hasMore: {},
  pending: {},
  drafts: {},
  scheduledMessages: [],
  templates: [],

  addMessage: (message) => {
    console.log('[MessageStore] addMessage | convId:', message.conversationId?.slice(0, 16), '| id:', message.id?.slice(0, 8), '| from:', message.senderId?.slice(0, 16))
    set((state) => {
      const convMessages = state.messages[message.conversationId] ?? []
      if (convMessages.some((m) => m.id === message.id)) return state
      return {
        messages: {
          ...state.messages,
          [message.conversationId]: [...convMessages, message].sort((a, b) => a.timestamp - b.timestamp),
        },
      }
    })
  },

  addMessages: (conversationId, messages) => {
    set((state) => {
      const existing = state.messages[conversationId] ?? []
      const existingIds = new Set(existing.map((m) => m.id))
      const newMessages = messages.filter((m) => !existingIds.has(m.id))
      if (newMessages.length === 0) return state
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existing, ...newMessages].sort((a, b) => a.timestamp - b.timestamp),
        },
      }
    })
  },

  sendMessage: async (outgoing, senderId) => {
    const id = generateId()
    const message: Message = {
      id,
      conversationId: outgoing.conversationId,
      senderId,
      type: outgoing.type,
      content: outgoing.content,
      timestamp: Date.now(),
      status: 'sending',
      replyTo: outgoing.replyTo
        ? {
            id: outgoing.replyTo,
            senderId: '',
            content: '',
            type: 'text',
          }
        : undefined,
    }

    set((state) => {
      const convMessages = state.messages[message.conversationId] ?? []
      return {
        pending: { ...state.pending, [id]: true },
        messages: {
          ...state.messages,
          [message.conversationId]: [...convMessages, message],
        },
      }
    })

    return message
  },

  editMessage: (messageId, conversationId, newContent) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = {
        ...newMsgs[idx],
        content: newContent,
        edits: [
          ...(newMsgs[idx].edits ?? []),
          { editedAt: Date.now(), previousContent: newMsgs[idx].content },
        ],
      }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  deleteMessage: (messageId, conversationId) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = { ...newMsgs[idx], deleted: true, content: '' }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  deleteMessagePermanently: (messageId, conversationId) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const filtered = messages.filter((m) => m.id !== messageId)
      if (filtered.length === messages.length) return state
      return { messages: { ...state.messages, [conversationId]: filtered } }
    })
  },

  // Remove a message across all conversations by ID
  removeMessage: (messageId) => {
    set((state) => {
      const newMessages: Record<string, Message[]> = {}
      for (const [convId, msgs] of Object.entries(state.messages)) {
        const filtered = msgs.filter((m) => m.id !== messageId)
        newMessages[convId] = filtered
      }
      return { messages: newMessages }
    })
  },

  recallMessage: (messageId, conversationId, reason) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = { 
        ...newMsgs[idx], 
        recalled: true, 
        recallReason: reason,
        content: '', // Clear content when recalled
        deleted: true,
      }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  clearConversationMessages: (conversationId) => {
    set((state) => {
      const newMessages = { ...state.messages }
      delete newMessages[conversationId]
      return { messages: newMessages }
    })
  },

  updateMessageAttachment: (messageId, conversationId, updates) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = { ...newMsgs[idx], ...updates }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  addReaction: (messageId, conversationId, emoji, userId) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const msg = messages[idx]
      const reactions = msg.reactions ?? []
      const existing = reactions.find((r) => r.emoji === emoji)
      let newReactions
      if (existing) {
        if (existing.users.includes(userId)) return state
        newReactions = reactions.map((r) =>
          r.emoji === emoji ? { ...r, users: [...r.users, userId], count: r.count + 1 } : r
        )
      } else {
        newReactions = [...reactions, { emoji, users: [userId], count: 1 }]
      }
      const newMsgs = [...messages]
      newMsgs[idx] = { ...msg, reactions: newReactions }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  removeReaction: (messageId, conversationId, emoji, userId) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const msg = messages[idx]
      const reactions = msg.reactions ?? []
      const existing = reactions.find((r) => r.emoji === emoji)
      if (!existing) return state
      const newUsers = existing.users.filter((u) => u !== userId)
      let newReactions
      if (newUsers.length === 0) {
        newReactions = reactions.filter((r) => r.emoji !== emoji)
      } else {
        newReactions = reactions.map((r) =>
          r.emoji === emoji ? { ...r, users: newUsers, count: newUsers.length } : r
        )
      }
      const newMsgs = [...messages]
      newMsgs[idx] = { ...msg, reactions: newReactions }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  markAsRead: (conversationId, upToTimestamp) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      let changed = false
      const newMsgs = messages.map((msg) => {
        if (msg.timestamp <= upToTimestamp && msg.status !== 'read') {
          changed = true
          return { ...msg, status: 'read' as const }
        }
        return msg
      })
      if (!changed) return state
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  markMessageRead: (messageId, readerPublicKey) => {
    set((state) => {
      // Find the message across all conversations
      for (const conversationId of Object.keys(state.messages)) {
        const messages = state.messages[conversationId]
        const idx = messages.findIndex((m) => m.id === messageId)
        if (idx !== -1) {
          const msg = messages[idx]
          // Don't mark own messages as read
          if (msg.senderId === readerPublicKey) return state
          // Update status to read
          const newMsgs = [...messages]
          newMsgs[idx] = { ...msg, status: 'read' as const }
          return { messages: { ...state.messages, [conversationId]: newMsgs } }
        }
      }
      return state
    })
  },

  updateStatus: (messageId, conversationId, status) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = { ...newMsgs[idx], status }
      const newPending = { ...state.pending }
      if (status === 'sent') delete newPending[messageId]
      return {
        messages: { ...state.messages, [conversationId]: newMsgs },
        pending: newPending,
      }
    })
  },

  updateLinkPreviews: (messageId, conversationId, previews) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = { ...newMsgs[idx], linkPreviews: previews }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },


  setLoading: (conversationId, loading) => {
    set((state) => ({
      loading: { ...state.loading, [conversationId]: loading },
    }))
  },

  getMessages: (conversationId) => {
    return get().messages[conversationId] ?? []
  },

  getMessage: (messageId, conversationId) => {
    return get().messages[conversationId]?.find((m) => m.id === messageId)
  },

  searchMessages: (query, conversationId, limit = 50) => {
    const { messages } = get()
    const results: Message[] = []
    const lowerQuery = query.toLowerCase()

    // If conversationId is specified, only search in that conversation
    const conversationsToSearch = conversationId
      ? { [conversationId]: messages[conversationId] ?? [] }
      : messages

    for (const convMessages of Object.values(conversationsToSearch)) {
      if (!convMessages) continue
      for (const msg of convMessages) {
        // Skip deleted messages
        if (msg.deleted) continue
        // Search in content
        if (msg.content.toLowerCase().includes(lowerQuery)) {
          results.push(msg)
          if (results.length >= limit) return results
        }
      }
    }

    // Sort by timestamp (most recent first)
    return results.sort((a, b) => b.timestamp - a.timestamp)
  },

  // ─── Draft Actions ─────────────────────────────────────────────────────

  saveDraft: (conversationId, content) => {
    set((state) => ({
      drafts: {
        ...state.drafts,
        [conversationId]: {
          conversationId,
          content,
          updatedAt: Date.now(),
        },
      },
    }))
  },

  getDraft: (conversationId) => {
    return get().drafts[conversationId]
  },

  clearDraft: (conversationId) => {
    set((state) => {
      const newDrafts = { ...state.drafts }
      delete newDrafts[conversationId]
      return { drafts: newDrafts }
    })
  },

  // ─── Scheduled Message Actions ─────────────────────────────────────────

  scheduleMessage: (message) => {
    set((state) => ({
      scheduledMessages: [...state.scheduledMessages, message],
    }))
  },

  removeScheduledMessage: (id) => {
    set((state) => ({
      scheduledMessages: state.scheduledMessages.filter((m) => m.id !== id),
    }))
  },

  getScheduledMessages: (conversationId) => {
    const { scheduledMessages } = get()
    if (conversationId) {
      return scheduledMessages.filter((m) => m.conversationId === conversationId)
    }
    return scheduledMessages
  },

  markScheduledAsSent: (id) => {
    set((state) => ({
      scheduledMessages: state.scheduledMessages.map((m) =>
        m.id === id ? { ...m, sent: true } : m
      ),
    }))
  },

  markScheduledAsFailed: (id, error) => {
    set((state) => ({
      scheduledMessages: state.scheduledMessages.map((m) =>
        m.id === id ? { ...m, error } : m
      ),
    }))
  },

  // ─── Thread Actions ────────────────────────────────────────────────────

  getThreadMessages: (parentMessageId, conversationId) => {
    const messages = get().messages[conversationId] ?? []
    return messages.filter((m) => m.thread?.parentMessageId === parentMessageId)
  },

  updateThreadInfo: (parentMessageId, conversationId, replyCount, lastReplyAt) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === parentMessageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = {
        ...newMsgs[idx],
        thread: {
          parentMessageId,
          replyCount,
          lastReplyAt,
        },
      }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  // ─── Pin Actions ───────────────────────────────────────────────────────

  pinMessage: (messageId, conversationId) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = { ...newMsgs[idx], pinned: true }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  unpinMessage: (messageId, conversationId) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = { ...newMsgs[idx], pinned: false }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  getPinnedMessages: (conversationId) => {
    const messages = get().messages[conversationId] ?? []
    return messages.filter((m) => m.pinned)
  },

  isMessagePinned: (messageId, conversationId) => {
    const messages = get().messages[conversationId] ?? []
    const msg = messages.find((m) => m.id === messageId)
    return msg?.pinned ?? false
  },

  // ─── Mark All As Read ──────────────────────────────────────────────────

  markAllAsRead: (conversationId) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const newMsgs = messages.map((msg) => {
        if (msg.status !== 'read') {
          return { ...msg, status: 'read' as const }
        }
        return msg
      })
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  // ─── Poll Actions ──────────────────────────────────────────────────────

  createPoll: (messageId, conversationId, poll) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = { ...newMsgs[idx], poll }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  voteOnPoll: (messageId, conversationId, optionId, voterPublicKey) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const msg = messages[idx]
      if (!msg.poll) return state

      const newMsgs = [...messages]
      const newOptions = msg.poll.options.map((opt) => {
        if (opt.id === optionId) {
          // Check if voter already voted for this option
          if (opt.votes.includes(voterPublicKey)) return opt
          return { ...opt, votes: [...opt.votes, voterPublicKey] }
        }
        // If not multiple answers, remove vote from other options
        if (!msg.poll!.multipleAnswers) {
          return { ...opt, votes: opt.votes.filter((v) => v !== voterPublicKey) }
        }
        return opt
      })
      newMsgs[idx] = { ...msg, poll: { ...msg.poll, options: newOptions } }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  removePollVote: (messageId, conversationId, optionId, voterPublicKey) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const msg = messages[idx]
      if (!msg.poll) return state

      const newMsgs = [...messages]
      const newOptions = msg.poll.options.map((opt) => {
        if (opt.id === optionId) {
          return { ...opt, votes: opt.votes.filter((v) => v !== voterPublicKey) }
        }
        return opt
      })
      newMsgs[idx] = { ...msg, poll: { ...msg.poll, options: newOptions } }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  closePoll: (messageId, conversationId) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const msg = messages[idx]
      if (!msg.poll) return state

      const newMsgs = [...messages]
      newMsgs[idx] = { ...msg, poll: { ...msg.poll, endsAt: Date.now() } }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  // ─── Location Actions ──────────────────────────────────────────────────

  updateLocation: (messageId, conversationId, location) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = { ...newMsgs[idx], location }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  // ─── Event Actions ─────────────────────────────────────────────────────

  rsvpEvent: (messageId, conversationId, rsvp, publicKey) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const msg = messages[idx]
      if (!msg.event) return state

      const newMsgs = [...messages]
      // Update the user's RSVP in attendees if not already there
      const attendees = msg.event.attendees.includes(publicKey)
        ? msg.event.attendees
        : [...msg.event.attendees, publicKey]
      newMsgs[idx] = { ...msg, event: { ...msg.event, attendees, rsvp } }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  // ─── Task Actions ──────────────────────────────────────────────────────

  toggleTaskComplete: (messageId, conversationId, completedBy) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const msg = messages[idx]
      if (!msg.task) return state

      const newMsgs = [...messages]
      const now = Date.now()
      newMsgs[idx] = {
        ...msg,
        task: {
          ...msg.task,
          completed: !msg.task.completed,
          completedAt: !msg.task.completed ? now : undefined,
          completedBy: !msg.task.completed ? completedBy : undefined,
        },
      }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  updateTaskAssignees: (messageId, conversationId, assignees) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const msg = messages[idx]
      if (!msg.task) return state

      const newMsgs = [...messages]
      newMsgs[idx] = { ...msg, task: { ...msg.task, assignees } }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  // ─── Contact Card Actions ──────────────────────────────────────────────

  updateContactCard: (messageId, conversationId, contactCard) => {
    set((state) => {
      const messages = state.messages[conversationId]
      if (!messages) return state
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const newMsgs = [...messages]
      newMsgs[idx] = { ...newMsgs[idx], contactCard }
      return { messages: { ...state.messages, [conversationId]: newMsgs } }
    })
  },

  // ─── Template Actions ──────────────────────────────────────────────────

  addTemplate: (template) => {
    set((state) => ({
      templates: [...state.templates, template],
    }))
  },

  updateTemplate: (id, updates) => {
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }))
  },

  deleteTemplate: (id) => {
    set((state) => ({
      templates: state.templates.filter((t) => t.id !== id),
    }))
  },

  getTemplates: (category) => {
    const templates = get().templates
    if (category) {
      return templates.filter((t) => t.category === category)
    }
    // Sort by usage count (most used first)
    return [...templates].sort((a, b) => b.usageCount - a.usageCount)
  },

  useTemplate: (id) => {
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id
          ? { ...t, usageCount: t.usageCount + 1, lastUsedAt: Date.now() }
          : t
      ),
    }))
  },

  renderTemplate: (id, variables) => {
    const template = get().templates.find((t) => t.id === id)
    if (!template) return ''

    let content = template.content
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
    }
    return content
  },

  deleteFileAttachment: async (messageId, conversationId, attachmentId) => {
    try {
      const { fileService } = await import('@/services/FileService')
      const msgs = get().messages[conversationId]
      if (!msgs) return false

      const msg = msgs.find((m) => m.id === messageId)
      if (!msg || !msg.attachments) return false

      const attachment = msg.attachments.find((a) => a.id === attachmentId)
      if (!attachment || !attachment.blobKey) return false

      // Delete the file via FileService
      const deleted = await fileService.deleteSentFile(attachment.blobKey)
      if (!deleted) return false

      // Le fichier n'est plus : l'URL d'objet qui servait à l'afficher ne sert
      // plus à rien et retiendrait le buffer en mémoire pour rien.
      fileService.releaseLocalUrl(attachment.localUrl)

      // Update the message to mark attachment as deleted
      set((state) => {
        const convMessages = state.messages[conversationId]
        if (!convMessages) return state
        return {
          messages: {
            ...state.messages,
            [conversationId]: convMessages.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    attachments: m.attachments?.map((a) =>
                      a.id === attachmentId ? { ...a, deleted: true } : a
                    ),
                  }
                : m
            ),
          },
        }
      })

      return true
    } catch (err) {
      console.error('[MessageStore] deleteFileAttachment failed:', err)
      return false
    }
  },

  setAttachmentLocalUrl: (messageId, conversationId, attachmentId, localUrl) => {
    set((state) => {
      const convMessages = state.messages[conversationId]
      if (!convMessages) return state
      let changed = false
      const next = convMessages.map((m) => {
        if (m.id !== messageId || !m.attachments) return m
        const target = m.attachments.find((a) => a.id === attachmentId)
        // Idempotent : une URL déjà à jour ne doit pas déclencher de re-rendu.
        if (!target || target.localUrl === localUrl) return m
        changed = true
        return {
          ...m,
          attachments: m.attachments.map((a) => (a.id === attachmentId ? { ...a, localUrl } : a)),
        }
      })
      return changed ? { messages: { ...state.messages, [conversationId]: next } } : state
    })
  },

  downloadFileAttachment: async (attachment) => {
    const { fileService } = await import('@/services/FileService')
    return fileService.downloadFile(attachment)
  },
}))
