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
  /** Groupe et canal d'un message de groupe — la navigation doit rouvrir le canal, pas un fil 1:1. */
  groupId?: string
  channelId?: string
  /** Origine affichée (« Équipe · #général ») pour un message de groupe. */
  sourceLabel?: string
  highlight: string
}

/** Résultat de recherche profonde, avec son canal d'origine. */
interface StoredMatch {
  message: Message
  groupId?: string
  channelId?: string
  sourceLabel?: string
}

interface SearchTarget {
  id: string
  groupId?: string
  channelId?: string
  sourceLabel?: string
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
  const [storageMessages, setStorageMessages] = useState<StoredMatch[]>([])

  // Identité stable des conversations : évite de relancer la recherche à
  // chaque mise à jour d'aperçu ou de compteur non lu. Les canaux de groupe
  // sont joints à l'identique pour que leur historique soit fouillé aussi.
  const conversationIdsKey = Object.keys(conversations).join('|')
  const groupChannelsKey = Object.values(groups)
    .flatMap((group) => group.channels.map((channel) => `${group.id}:${group.name}:${channel.id}:${channel.name}`))
    .join('|')

  useEffect(() => {
    const q = query.toLowerCase().trim()
    if (!q || !window.asgard?.storage?.searchMessages) {
      setStorageMessages([])
      return
    }

    const targets: SearchTarget[] = conversationIdsKey ? conversationIdsKey.split('|').map((id) => ({ id })) : []
    for (const group of Object.values(groups)) {
      for (const channel of group.channels) {
        targets.push({
          id: channel.id,
          groupId: group.id,
          channelId: channel.id,
          sourceLabel: `${group.name} · #${channel.name}`,
        })
      }
    }
    if (targets.length === 0) {
      setStorageMessages([])
      return
    }
    let cancelled = false

    const timer = setTimeout(() => {
      const searchPromises = targets.map(async (target) => {
        try {
          const matches = (await window.asgard.storage.searchMessages(
            target.id,
            q,
            STORAGE_RESULTS_PER_CONVERSATION
          )) as unknown as Message[]
          return matches.map((message) => ({
            message,
            groupId: target.groupId,
            channelId: target.channelId,
            sourceLabel: target.sourceLabel,
          }))
        } catch {
          return []
        }
      })

      void Promise.all(searchPromises).then((results) => {
        if (cancelled) return
        const byKey = new Map<string, StoredMatch>()
        for (const matches of results) {
          for (const match of matches) {
            const key = `${match.channelId ?? match.message.conversationId}:${match.message.id}`
            if (!byKey.has(key)) byKey.set(key, match)
          }
        }
        setStorageMessages(Array.from(byKey.values()))
      })
    }, STORAGE_SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, conversationIdsKey, groupChannelsKey])

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

    // Search messages (in-memory), fils 1:1 puis canaux de groupe
    const inMemoryMsgKeys = new Set<string>()
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
        inMemoryMsgKeys.add(`${conv.id}:${msg.id}`)
        messageCount++
        if (messageCount >= MAX_IN_MEMORY_MESSAGE_RESULTS) break
      }
    }
    for (const group of Object.values(groups)) {
      if (messageCount >= MAX_IN_MEMORY_MESSAGE_RESULTS) break
      for (const channel of group.channels) {
        if (messageCount >= MAX_IN_MEMORY_MESSAGE_RESULTS) break
        const messages = messagesByConversation[channel.id] ?? []
        for (const msg of messages) {
          if (msg.deleted || !msg.content?.toLowerCase().includes(q)) continue
          results.push({
            type: 'message',
            message: msg,
            groupId: group.id,
            channelId: channel.id,
            sourceLabel: `${group.name} · #${channel.name}`,
            highlight: msg.content.slice(0, 100),
          })
          inMemoryMsgKeys.add(`${channel.id}:${msg.id}`)
          messageCount++
          if (messageCount >= MAX_IN_MEMORY_MESSAGE_RESULTS) break
        }
      }
    }

    // Add messages found in Hyperbee storage (deep search), sans doublon
    for (const match of storageMessages) {
      const msg = match.message
      const key = `${match.channelId ?? msg.conversationId}:${msg.id}`
      if (!msg.deleted && !inMemoryMsgKeys.has(key) && msg.content?.toLowerCase().includes(q)) {
        results.push({
          type: 'message',
          message: msg,
          groupId: match.groupId,
          channelId: match.channelId,
          sourceLabel: match.sourceLabel,
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
