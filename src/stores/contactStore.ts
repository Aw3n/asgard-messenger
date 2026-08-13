import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { Contact, UserStatus } from '@/types'

interface ContactState {
  contacts: Record<string, Contact>
  searchQuery: string

  // Actions
  addContact: (contact: Contact) => void
  updateContact: (publicKey: string, updates: Partial<Contact>) => void
  removeContact: (publicKey: string) => void
  blockContact: (publicKey: string) => void
  unblockContact: (publicKey: string) => void
  favoriteContact: (publicKey: string, favorite: boolean) => void
  setContactStatus: (publicKey: string, status: UserStatus, lastSeen?: number) => void
  setSearchQuery: (query: string) => void
  getContact: (publicKey: string) => Contact | undefined
  getFilteredContacts: () => Contact[]
  getFavorites: () => Contact[]
  getBlocked: () => Contact[]
}

/**
 * Contact store — manages peer contacts.
 */
export const useContactStore = create<ContactState>()(
  persist(
    immer((set, get) => ({
      contacts: {},
      searchQuery: '',

      addContact: (contact) => {
        set((state) => {
          state.contacts[contact.publicKey] = contact
        })
      },

      updateContact: (publicKey, updates) => {
        set((state) => {
          if (!state.contacts[publicKey]) return
          state.contacts[publicKey] = { ...state.contacts[publicKey], ...updates }
        })
      },

      removeContact: (publicKey) => {
        set((state) => {
          delete state.contacts[publicKey]
        })
      },

      blockContact: (publicKey) => {
        set((state) => {
          if (state.contacts[publicKey]) {
            state.contacts[publicKey].relation = 'blocked'
          }
        })
      },

      unblockContact: (publicKey) => {
        set((state) => {
          if (state.contacts[publicKey]) {
            state.contacts[publicKey].relation = 'contact'
          }
        })
      },

      favoriteContact: (publicKey, favorite) => {
        set((state) => {
          if (state.contacts[publicKey]) {
            state.contacts[publicKey].relation = favorite ? 'favorite' : 'contact'
          }
        })
      },

      setContactStatus: (publicKey, status, lastSeen) => {
        set((state) => {
          if (state.contacts[publicKey]) {
            state.contacts[publicKey].status = status
            if (lastSeen) state.contacts[publicKey].lastSeen = lastSeen
          }
        })
      },

      setSearchQuery: (query) => {
        set((state) => {
          state.searchQuery = query
        })
      },

      getContact: (publicKey) => get().contacts[publicKey],

      getFilteredContacts: () => {
        const { contacts, searchQuery } = get()
        let list = Object.values(contacts).filter((c) => c.relation !== 'blocked')

        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          list = list.filter(
            (c) =>
              c.displayName.toLowerCase().includes(q) ||
              c.publicKey.toLowerCase().includes(q)
          )
        }

        return list.sort((a, b) => {
          // Favorites first
          if (a.relation === 'favorite' && b.relation !== 'favorite') return -1
          if (a.relation !== 'favorite' && b.relation === 'favorite') return 1
          // Online first
          const statusOrder: Record<string, number> = { online: 0, away: 1, busy: 2, offline: 3, invisible: 4 }
          const aOrder = statusOrder[a.status] ?? 5
          const bOrder = statusOrder[b.status] ?? 5
          if (aOrder !== bOrder) return aOrder - bOrder
          return a.displayName.localeCompare(b.displayName)
        })
      },

      getFavorites: () => {
        return Object.values(get().contacts).filter((c) => c.relation === 'favorite')
      },

      getBlocked: () => {
        return Object.values(get().contacts).filter((c) => c.relation === 'blocked')
      },
    })),
    {
      name: 'asgard-contacts',
      storage: createJSONStorage(() => localStorage),
      // CRITICAL: Never persist contact status — it's a dynamic property that
      // must be determined by real-time P2P events, not restored from storage.
      // Without this, contacts appear 'online' after restart even if the
      // remote app is closed (because zustand/persist restores the last-known
      // status from localStorage before any P2P event has been received).
      partialize: (state) => ({
        ...state,
        contacts: Object.fromEntries(
          Object.entries(state.contacts).map(([key, contact]) => [
            key,
            { ...contact, status: 'offline' as UserStatus },
          ])
        ),
      }),
    }
  )
)
