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
import { useGroupStore } from '@/stores/groupStore'
import { useMessageStore } from '@/stores/messageStore'
import type { Conversation, Group, Message } from '@/types'

const CONV_ID = 'conv-1'
const GROUP_ID = 'group-1'
const CHANNEL_ID = 'channel-1'

function makeMessage(id: string, content: string, conversationId = CONV_ID): Message {
  return {
    id,
    conversationId,
    senderId: 'peer',
    type: 'text',
    content,
    timestamp: Date.now(),
    status: 'delivered',
  }
}

const group: Group = {
  id: GROUP_ID,
  name: 'Équipe',
  members: [],
  channels: [
    {
      id: CHANNEL_ID,
      groupId: GROUP_ID,
      name: 'général',
      type: 'text',
      position: 0,
      permissions: { send: ['member'], read: ['member'], manage: ['owner'] },
      unreadCount: 0,
    },
  ],
  createdAt: 0,
  ownerId: 'owner',
  isPublic: false,
  maxMembers: 50,
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
  useGroupStore.setState({ groups: {} })
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

  it('signale la recherche profonde tant que les IPC ne sont pas revenus', async () => {
    let resolveSearch: (value: Message[]) => void = () => {}
    searchMessages.mockImplementation(
      () => new Promise<Message[]>((resolve) => { resolveSearch = resolve })
    )

    const { result } = renderHook(() => useSearch('bonjour'))

    expect(result.current.isSearching).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(searchMessages).toHaveBeenCalledTimes(1)
    expect(result.current.isSearching).toBe(true)

    await act(async () => {
      resolveSearch([])
    })
    expect(result.current.isSearching).toBe(false)
  })

  it('ne signale rien quand aucune recherche profonde n’est lancée', () => {
    const { result } = renderHook(() => useSearch(''))

    expect(result.current.isSearching).toBe(false)
    expect(searchMessages).not.toHaveBeenCalled()
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

  it('rend la même liste d’un rendu à l’autre tant que rien n’a changé', () => {
    // Un sélecteur qui fabrique une liste neuve (Object.values dans le sélecteur)
    // change de référence à chaque rendu : toute la recherche se recalcule et les
    // effets qui lisent cette valeur n'ont plus de lane libre.
    const { result, rerender } = renderHook(() => useSearch('bonjour'))
    const first = result.current.messageResults

    rerender()
    rerender()

    expect(result.current.messageResults).toBe(first)
    expect(searchMessages).not.toHaveBeenCalled()
  })
})

describe('useSearch — messages de groupe', () => {
  beforeEach(() => {
    useGroupStore.setState({ groups: { [GROUP_ID]: group } })
  })

  it('trouve un message de groupe en mémoire avec sa destination', () => {
    act(() => {
      useMessageStore.setState((state) => ({
        messages: {
          ...state.messages,
          [CHANNEL_ID]: [makeMessage('g1', 'bonjour le canal', CHANNEL_ID)],
        },
      }))
    })

    const { result } = renderHook(() => useSearch('bonjour'))
    const hit = result.current.messageResults.find((r) => r.message?.id === 'g1')

    expect(hit).toMatchObject({
      groupId: GROUP_ID,
      channelId: CHANNEL_ID,
      sourceLabel: 'Équipe · #général',
    })
  })

  it('fouille aussi Hyperbee par canal et restitue le groupe', async () => {
    searchMessages.mockImplementation((id: string) =>
      Promise.resolve(id === CHANNEL_ID ? [makeMessage('g2', 'bonjour archivé', CHANNEL_ID)] : [])
    )

    const { result } = renderHook(() => useSearch('bonjour'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(searchMessages).toHaveBeenCalledWith(CHANNEL_ID, 'bonjour', 5)
    const hit = result.current.messageResults.find((r) => r.message?.id === 'g2')
    expect(hit).toMatchObject({
      groupId: GROUP_ID,
      channelId: CHANNEL_ID,
      sourceLabel: 'Équipe · #général',
    })
  })
})
