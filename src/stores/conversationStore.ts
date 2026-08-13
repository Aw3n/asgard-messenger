import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { Conversation, ConversationFilter } from '@/types'

interface ConversationState {
  conversations: Record<string, Conversation>
  activeConversationId: string | null
  filter: ConversationFilter

  // Actions
  addConversation: (conv: Conversation) => void
  updateConversation: (id: string, updates: Partial<Conversation>) => void
  removeConversation: (id: string) => void
  setActiveConversation: (id: string | null) => void
  incrementUnread: (id: string) => void
  clearUnread: (id: string) => void
  pinConversation: (id: string, pinned: boolean) => void
  muteConversation: (id: string, muted: boolean) => void
  archiveConversation: (id: string, archived: boolean) => void
  setDraft: (id: string, draft: string) => void
  setFilter: (filter: Partial<ConversationFilter>) => void
  setBroadcastMode: (id: string, enabled: boolean, broadcasterKey?: string) => void
  getFilteredConversations: () => Conversation[]
  getConversation: (id: string) => Conversation | undefined
  getDirectConversation: (participantId: string) => Conversation | undefined
  isBroadcastReadOnly: (id: string, userPublicKey: string) => boolean
}

/**
 * Conversation store — manages all conversations (direct + groups).
 */
export const useConversationStore = create<ConversationState>()(
  persist(
    immer((set, get) => ({
      conversations: {},
      activeConversationId: null,
      filter: {},

      addConversation: (conv) => {
        set((state) => {
          state.conversations[conv.id] = conv
        })
      },

      updateConversation: (id, updates) => {
        set((state) => {
          if (!state.conversations[id]) return
          state.conversations[id] = {
            ...state.conversations[id],
            ...updates,
            updatedAt: Date.now(),
          }
        })
      },

      removeConversation: (id) => {
        set((state) => {
          delete state.conversations[id]
          if (state.activeConversationId === id) {
            state.activeConversationId = null
          }
        })
      },

      setActiveConversation: (id) => {
        set((state) => {
          state.activeConversationId = id
          // Clear unread when opening
          if (id && state.conversations[id]) {
            state.conversations[id].unreadCount = 0
          }
        })
      },

      incrementUnread: (id) => {
        set((state) => {
          if (!state.conversations[id]) return
          // Don't increment if this is the active conversation
          if (state.activeConversationId === id) return
          state.conversations[id].unreadCount += 1
        })
      },

      clearUnread: (id) => {
        set((state) => {
          if (state.conversations[id]) {
            state.conversations[id].unreadCount = 0
          }
        })
      },

      pinConversation: (id, pinned) => {
        set((state) => {
          if (state.conversations[id]) {
            state.conversations[id].pinned = pinned
          }
        })
      },

      muteConversation: (id, muted) => {
        set((state) => {
          if (state.conversations[id]) {
            state.conversations[id].muted = muted
          }
        })
      },

      archiveConversation: (id, archived) => {
        set((state) => {
          if (state.conversations[id]) {
            state.conversations[id].archived = archived
          }
        })
      },

      setDraft: (id, draft) => {
        set((state) => {
          if (state.conversations[id]) {
            state.conversations[id].draft = draft
          }
        })
      },

      setFilter: (filter) => {
        set((state) => {
          state.filter = { ...state.filter, ...filter }
        })
      },

      setBroadcastMode: (id, enabled, broadcasterKey) => {
        set((state) => {
          if (state.conversations[id]) {
            state.conversations[id].broadcastMode = enabled
            if (broadcasterKey) {
              state.conversations[id].broadcasterKey = broadcasterKey
            }
          }
        })
      },

      getFilteredConversations: () => {
        const { conversations, filter } = get()
        let list = Object.values(conversations)

        if (filter.type) {
          list = list.filter((c) => c.type === filter.type)
        }
        if (filter.unreadOnly) {
          list = list.filter((c) => c.unreadCount > 0)
        }
        if (filter.archivedOnly) {
          list = list.filter((c) => c.archived)
        } else {
          list = list.filter((c) => !c.archived)
        }
        if (filter.search) {
          const q = filter.search.toLowerCase()
          list = list.filter(
            (c) =>
              c.id.toLowerCase().includes(q) ||
              c.lastMessage?.content?.toLowerCase().includes(q)
          )
        }

        // Sort: pinned first, then by updatedAt desc
        return list.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return b.updatedAt - a.updatedAt
        })
      },

      getConversation: (id) => get().conversations[id],

      getDirectConversation: (participantId) => {
        return Object.values(get().conversations).find(
          (c) => c.type === 'direct' && c.participantId === participantId
        )
      },

      isBroadcastReadOnly: (id, userPublicKey) => {
        const conv = get().conversations[id]
        if (!conv?.broadcastMode) return false
        // User can post if they are the broadcaster
        return conv.broadcasterKey !== userPublicKey
      },
    })),
    {
      name: 'asgard-conversations',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
