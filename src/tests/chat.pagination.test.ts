/**
 * Pagination de l'historique 1:1.
 *
 * L'ouverture d'un fil ne charge que les derniers messages. Sans lecture des
 * plus anciens, un fil dépassant la première page devenait définitivement
 * tronqué : ces tests fixent la requête (avant telle date, du plus récent au
 * plus ancien) et l'ordre chronologique restauré dans le store.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chatService } from '@/services/ChatService'
import { storageService } from '@/services/StorageService'
import { useMessageStore } from '@/stores/messageStore'
import type { Message } from '@/types'

const A = 'a'.repeat(64)

function message(id: string, timestamp: number): Message {
  return {
    id,
    conversationId: 'conv',
    senderId: A,
    type: 'text',
    content: id,
    timestamp,
    status: 'delivered',
  }
}

beforeEach(() => {
  useMessageStore.setState({
    messages: {},
    loading: {},
    hasMore: {},
    pending: {},
    drafts: {},
    scheduledMessages: [],
    templates: [],
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('remonter l’historique 1:1', () => {
  it('demande les messages avant la date et les rend dans l’ordre du temps', async () => {
    const getMessages = vi.spyOn(storageService, 'getMessages').mockResolvedValue([
      message('m-3', 3_000),
      message('m-2', 2_000),
    ])

    const returned = await chatService.loadOlderMessages('conv', 3_001, 50)

    expect(getMessages).toHaveBeenCalledWith('conv', { before: 3_001, limit: 50, reverse: true })
    expect(returned.map((m) => m.id)).toEqual(['m-3', 'm-2'])
    expect(useMessageStore.getState().messages.conv?.map((m) => m.id)).toEqual(['m-2', 'm-3'])
  })

  it('n’ajoute pas deux fois un message déjà affiché', async () => {
    useMessageStore.getState().addMessages('conv', [message('m-2', 2_000)])
    vi.spyOn(storageService, 'getMessages').mockResolvedValue([
      message('m-3', 3_000),
      message('m-2', 2_000),
    ])

    await chatService.loadOlderMessages('conv', 3_001, 50)

    expect(useMessageStore.getState().messages.conv?.map((m) => m.id)).toEqual(['m-2', 'm-3'])
  })

  it('rend une page vide sans jeter quand le stockage échoue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(storageService, 'getMessages').mockRejectedValue(new Error('stockage indisponible'))

    await expect(chatService.loadOlderMessages('conv', 1, 50)).resolves.toEqual([])
    expect(useMessageStore.getState().messages.conv).toBeUndefined()
  })
})
