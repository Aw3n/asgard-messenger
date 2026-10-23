/**
 * Sourdine temporisée : l'échéance est mémorisée, la minuterie lève la
 * sourdine sans interaction, et une session relancée solde les échéances
 * passées pendant l'arrêt tout en reprogrammant les autres.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConversationStore } from '@/stores/conversationStore'
import type { Conversation } from '@/types'

const ID = 'conv-timed'

const base: Conversation = {
  id: ID,
  type: 'direct',
  participantId: 'b'.repeat(64),
  unreadCount: 0,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
}

const conversation = (id: string) => useConversationStore.getState().conversations[id]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-23T10:00:00.000Z'))
  useConversationStore.setState({ conversations: { [ID]: { ...base } } })
})

afterEach(() => {
  useConversationStore.getState().muteConversation(ID, false)
  useConversationStore.setState({ conversations: {} })
  vi.useRealTimers()
})

describe('sourdine temporisée', () => {
  it('lève la sourdine à l’échéance', () => {
    useConversationStore.getState().muteConversation(ID, true, 60_000)

    expect(conversation(ID).muted).toBe(true)
    expect(conversation(ID).mutedUntil).toBe(Date.now() + 60_000)

    vi.advanceTimersByTime(59_999)
    expect(conversation(ID).muted).toBe(true)

    vi.advanceTimersByTime(1)
    expect(conversation(ID).muted).toBe(false)
    expect(conversation(ID).mutedUntil).toBeUndefined()
  })

  it('ne pose aucune échéance pour une sourdine illimitée', () => {
    useConversationStore.getState().muteConversation(ID, true)

    expect(conversation(ID).muted).toBe(true)
    expect(conversation(ID).mutedUntil).toBeUndefined()

    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000)
    expect(conversation(ID).muted).toBe(true)
  })

  it('au démarrage, solde les échéances passées et reprogramme les futures', () => {
    const until = Date.now() + 30_000
    useConversationStore.setState({
      conversations: {
        [ID]: { ...base, muted: true, mutedUntil: Date.now() - 1_000 },
        'conv-future': { ...base, id: 'conv-future', muted: true, mutedUntil: until },
        'conv-always': { ...base, id: 'conv-always', muted: true },
      },
    })

    useConversationStore.getState().resumeMuteTimers()

    expect(conversation(ID).muted).toBe(false)
    expect(conversation(ID).mutedUntil).toBeUndefined()
    expect(conversation('conv-future').muted).toBe(true)
    expect(conversation('conv-always').muted).toBe(true)

    vi.advanceTimersByTime(30_000)
    expect(conversation('conv-future').muted).toBe(false)
    expect(conversation('conv-future').mutedUntil).toBeUndefined()
    expect(conversation('conv-always').muted).toBe(true)
  })
})
