import { useMemo, useState, useEffect } from 'react'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import { useGroupStore } from '@/stores/groupStore'
import type { Contact } from '@/types'
import type { Message } from '@/types'
import type { Group } from '@/types'

export interface SearchResult {
  type: 'contact' | 'message' | 'group'
  contact?: Contact
  message?: Message
  group?: Group
  highlight: string
}

/**
 * useSearch — multi-source search hook for contacts, messages, and groups.
 * OPTIMIZATION: Also searches Hyperbee storage for messages not loaded in memory.
 */
export function useSearch(query: string) {
  const contacts = useContactStore((s) => Object.values(s.contacts))
  const conversations = useConversationStore((s) => s.conversations)
  const groups = useGroupStore((s) => s.groups)
  const getMessages = useMessageStore((s) => s.getMessages)
  // OPTIMIZATION: Store results from Hyperbee deep search
  const [storageMessages, setStorageMessages] = useState<Message[]>([])

  // Deep search in Hyperbee storage when query changes
  useEffect(() => {
    if (!query.trim() || !window.asgard?.storage?.searchMessages) {
      setStorageMessages([])
      return
    }

    const q = query.toLowerCase().trim()
    const allResults: Message[] = []
    const convIds = Object.keys(conversations)

    // Search each conversation in Hyperbee storage
    const searchPromises = convIds.map(async (convId) => {
      try {
        const results = await window.asgard.storage.searchMessages(convId, q, 5)
        return results as unknown as Message[]
      } catch {
        return []
      }
    })

    Promise.all(searchPromises).then((results) => {
      for (const msgs of results) {
        for (const msg of msgs) {
          // Avoid duplicates with in-memory messages
          if (!allResults.find((m) => m.id === msg.id)) {
            allResults.push(msg)
          }
        }
      }
      setStorageMessages(allResults)
    }).catch(() => {})
  }, [query, conversations])

  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase().trim()
    const results: SearchResult[] = []

    // Search contacts
    for (const contact of contacts) {
      if (
        contact.displayName.toLowerCase().includes(q) ||
        contact.publicKey.toLowerCase().includes(q) ||
        (contact.remoteName && contact.remoteName.toLowerCase().includes(q))
      ) {
        results.push({
          type: 'contact',
          contact,
          highlight: contact.displayName,
        })
      }
    }

    // Search groups
    for (const group of Object.values(groups)) {
      if (
        group.name.toLowerCase().includes(q) ||
        (group.description && group.description.toLowerCase().includes(q))
      ) {
        results.push({
          type: 'group',
          group,
          highlight: group.name,
        })
      }
    }

    // Search messages (in-memory)
    const inMemoryMsgIds = new Set<string>()
    for (const conv of Object.values(conversations)) {
      const messages = getMessages(conv.id)
      for (const msg of messages) {
        if (!msg.deleted && msg.content.toLowerCase().includes(q)) {
          results.push({
            type: 'message',
            message: msg,
            highlight: msg.content.slice(0, 100),
          })
          inMemoryMsgIds.add(msg.id)
        }
        // Limit in-memory message results
        if (results.filter((r) => r.type === 'message').length >= 20) break
      }
    }

    // OPTIMIZATION: Add messages found in Hyperbee storage (deep search)
    for (const msg of storageMessages) {
      if (!msg.deleted && !inMemoryMsgIds.has(msg.id) && msg.content?.toLowerCase().includes(q)) {
        results.push({
          type: 'message',
          message: msg,
          highlight: msg.content.slice(0, 100),
        })
      }
    }

    return results.slice(0, 50)
  }, [query, contacts, groups, conversations, getMessages, storageMessages])

  const contactResults = useMemo(() => results.filter((r) => r.type === 'contact'), [results])
  const messageResults = useMemo(() => results.filter((r) => r.type === 'message'), [results])
  const groupResults = useMemo(() => results.filter((r) => r.type === 'group'), [results])

  return { results, contactResults, messageResults, groupResults }
}
