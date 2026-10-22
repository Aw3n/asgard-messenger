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

/** Laisse le temps de finir un mot avant d'interroger Hyperbee (IPC par conversation). */
const STORAGE_SEARCH_DEBOUNCE_MS = 250
const MAX_IN_MEMORY_MESSAGE_RESULTS = 20
const STORAGE_RESULTS_PER_CONVERSATION = 5

/**
 * useSearch — multi-source search hook for contacts, messages, and groups.
 * Also searches Hyperbee storage for messages not loaded in memory, debounced
 * and cancelled so a slow reply for an old query never overwrites the current one.
 */
export function useSearch(query: string) {
  const contacts = useContactStore((s) => Object.values(s.contacts))
  const conversations = useConversationStore((s) => s.conversations)
  const groups = useGroupStore((s) => s.groups)
  // Abonnement réactif : un message reçu pendant la frappe doit apparaître
  // dans les résultats, pas seulement au prochain changement de requête.
  const messagesByConversation = useMessageStore((s) => s.messages)
  const [storageMessages, setStorageMessages] = useState<Message[]>([])

  // Identité stable des conversations : évite de relancer la recherche à
  // chaque mise à jour d'aperçu ou de compteur non lu.
  const conversationIdsKey = Object.keys(conversations).join('|')

  useEffect(() => {
    const q = query.toLowerCase().trim()
    if (!q || !window.asgard?.storage?.searchMessages) {
      setStorageMessages([])
      return
    }

    const convIds = conversationIdsKey ? conversationIdsKey.split('|') : []
    let cancelled = false

    const timer = setTimeout(() => {
      const searchPromises = convIds.map(async (convId) => {
        try {
          return (await window.asgard.storage.searchMessages(
            convId,
            q,
            STORAGE_RESULTS_PER_CONVERSATION
          )) as unknown as Message[]
        } catch {
          return []
        }
      })

      void Promise.all(searchPromises).then((results) => {
        if (cancelled) return
        const byId = new Map<string, Message>()
        for (const msgs of results) {
          for (const msg of msgs) {
            if (!byId.has(msg.id)) byId.set(msg.id, msg)
          }
        }
        setStorageMessages(Array.from(byId.values()))
      })
    }, STORAGE_SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, conversationIdsKey])

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
    let messageCount = 0
    for (const conv of Object.values(conversations)) {
      if (messageCount >= MAX_IN_MEMORY_MESSAGE_RESULTS) break
      const messages = messagesByConversation[conv.id] ?? []
      for (const msg of messages) {
        if (msg.deleted || !msg.content?.toLowerCase().includes(q)) continue
        results.push({
          type: 'message',
          message: msg,
          highlight: msg.content.slice(0, 100),
        })
        inMemoryMsgIds.add(msg.id)
        messageCount++
        if (messageCount >= MAX_IN_MEMORY_MESSAGE_RESULTS) break
      }
    }

    // Add messages found in Hyperbee storage (deep search), sans doublon
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
  }, [query, contacts, groups, conversations, messagesByConversation, storageMessages])

  const contactResults = useMemo(() => results.filter((r) => r.type === 'contact'), [results])
  const messageResults = useMemo(() => results.filter((r) => r.type === 'message'), [results])
  const groupResults = useMemo(() => results.filter((r) => r.type === 'group'), [results])

  return { results, contactResults, messageResults, groupResults }
}
