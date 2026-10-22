/**
 * useSearch — la recherche profonde Hyperbee est un IPC par conversation.
 * Sans debounce ni annulation, chaque frappe lançait N requêtes et une réponse
 * lente pour une ancienne requête pouvait écraser les résultats courants.
 * Les résultats mémoire doivent aussi suivre le store en direct.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearch } from '@/hooks/useSearch'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import type { Conversation, Message } from '@/types'

const CONV_ID = 'conv-1'

function makeMessage(id: string, content: string): Message {
  return {
    id,
    conversationId: CONV_ID,
    senderId: 'peer',
    type: 'text',
    content,
    timestamp: Date.now(),
    status: 'delivered',
  }
}

const conversation: Conversation = {
  id: CONV_ID,
  type: 'direct',
  participantId: 'peer',
  unreadCount: 0,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
}

let searchMessages: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  searchMessages = vi.fn().mockResolvedValue([])
  Object.assign(window.asgard.storage, { searchMessages })
  useConversationStore.setState({ conversations: { [CONV_ID]: conversation } })
  useMessageStore.setState({
    messages: { [CONV_ID]: [makeMessage('m1', 'bonjour le monde')] },
    loading: {},
    hasMore: {},
    pending: {},
    drafts: {},
    scheduledMessages: [],
    templates: [],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSearch', () => {
  it('trouve les messages en mémoire immédiatement et fusionne le stockage sans doublon', async () => {
    searchMessages.mockResolvedValue([
      makeMessage('m1', 'bonjour le monde'), // déjà en mémoire
      makeMessage('m2', 'bonjour depuis Hyperbee'),
    ])

    const { result } = renderHook(() => useSearch('bonjour'))

    // Résultat mémoire disponible sans attendre le debounce.
    expect(result.current.messageResults).toHaveLength(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(searchMessages).toHaveBeenCalledWith(CONV_ID, 'bonjour', 5)
    const ids = result.current.messageResults.map((r) => r.message?.id)
    expect(ids).toEqual(['m1', 'm2'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('annule la requête obsolète quand la saisie change avant le debounce', async () => {
    const { result, rerender } = renderHook(({ q }) => useSearch(q), {
      initialProps: { q: 'bonjour' },
    })

    rerender({ q: 'perdu' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(searchMessages).toHaveBeenCalledTimes(1)
    expect(searchMessages).toHaveBeenCalledWith(CONV_ID, 'perdu', 5)
    expect(result.current.messageResults).toHaveLength(0)
  })

  it('affiche un message reçu après le montage sans changer la requête', () => {
    const { result } = renderHook(() => useSearch('bonjour'))
    expect(result.current.messageResults).toHaveLength(1)

    act(() => {
      useMessageStore.setState((state) => ({
        messages: {
          ...state.messages,
          [CONV_ID]: [...state.messages[CONV_ID], makeMessage('m3', 'bonjour tardif')],
        },
      }))
    })

    expect(result.current.messageResults).toHaveLength(2)
  })
})
