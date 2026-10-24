/**
 * ChatService : l'avis de suppression définitive au pair doit pouvoir échouer.
 *
 * La copie locale et la copie persistée partent d'abord ; si l'avis réseau
 * échoue, le contact garde la sienne. Avaler cette erreur laissait croire à une
 * suppression partout. Le service la propage, l'interface la dit.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/types'

vi.mock('@/services/P2PService', () => ({
  p2pService: { sendMessage: vi.fn() },
}))

vi.mock('@/services/StorageService', () => ({
  storageService: { deleteMessage: vi.fn(async () => {}) },
}))

import { chatService } from '@/services/ChatService'
import { p2pService } from '@/services/P2PService'
import { storageService } from '@/services/StorageService'
import { useMessageStore } from '@/stores/messageStore'

const CONVERSATION_ID = 'conv-1'
const PEER = 'b'.repeat(64)

const message = (): Message => ({
  id: 'm1',
  conversationId: CONVERSATION_ID,
  senderId: 'a'.repeat(64),
  type: 'text',
  content: 'à supprimer',
  timestamp: 5_000,
  status: 'delivered',
})

beforeEach(() => {
  vi.clearAllMocks()
  useMessageStore.setState({ messages: { [CONVERSATION_ID]: [message()] } })
})

describe('ChatService.deleteMessagePermanently', () => {
  it('propage l’échec de l’avis au pair, après avoir retiré la copie locale', async () => {
    vi.mocked(p2pService.sendMessage).mockRejectedValueOnce(new Error('pair injoignable'))

    await expect(
      chatService.deleteMessagePermanently('m1', CONVERSATION_ID, PEER),
    ).rejects.toThrow('pair injoignable')

    expect(storageService.deleteMessage).toHaveBeenCalledWith(CONVERSATION_ID, 'm1')
    expect(useMessageStore.getState().messages[CONVERSATION_ID]?.some((m) => m.id === 'm1')).toBe(false)
  })

  it('reste silencieux quand l’avis au pair part', async () => {
    vi.mocked(p2pService.sendMessage).mockResolvedValueOnce(undefined)

    await expect(
      chatService.deleteMessagePermanently('m1', CONVERSATION_ID, PEER),
    ).resolves.toBeUndefined()
  })
})
