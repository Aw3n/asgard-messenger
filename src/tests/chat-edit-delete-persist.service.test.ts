/**
 * ChatService : éditer ou supprimer pour tous un message 1:1 doit être écrit
 * sur disque, pas seulement appliqué à l'écran. Sans cette écriture, le texte
 * d'origine revenait au redémarrage chez l'auteur, alors que le contact
 * gardait l'édition — ou la suppression — reçue.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/types'

const { saveMessage } = vi.hoisted(() => ({ saveMessage: vi.fn(async () => {}) }))

vi.mock('@/services/P2PService', () => ({
  p2pService: { sendMessage: vi.fn(async () => {}) },
}))

vi.mock('@/services/StorageService', () => ({
  storageService: { saveMessage, deleteMessage: vi.fn(async () => {}) },
}))

import { chatService } from '@/services/ChatService'
import { p2pService } from '@/services/P2PService'
import { useMessageStore } from '@/stores/messageStore'

const CONVERSATION_ID = 'conv-1'
const PEER = 'b'.repeat(64)
const MESSAGE_ID = 'm1'

const original = (): Message => ({
  id: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  senderId: 'a'.repeat(64),
  type: 'text',
  content: 'texte d’origine',
  timestamp: 5_000,
  status: 'delivered',
})

const savedCall = () => {
  const calls = vi.mocked(saveMessage).mock.calls
  expect(calls).toHaveLength(1)
  const [conversationId, message] = calls[0] as unknown as [string, Message]
  return { conversationId, message }
}

beforeEach(() => {
  vi.clearAllMocks()
  useMessageStore.setState({ messages: { [CONVERSATION_ID]: [original()] } })
})

describe('ChatService.editMessage', () => {
  it('persiste le texte corrigé, avec son historique d’édition', async () => {
    await chatService.editMessage(MESSAGE_ID, CONVERSATION_ID, 'texte corrigé', PEER)

    const { conversationId, message } = savedCall()
    expect(conversationId).toBe(CONVERSATION_ID)
    expect(message.content).toBe('texte corrigé')
    expect(message.edits?.map((edit) => edit.previousContent)).toEqual(['texte d’origine'])
  })

  it('diffuse l’édition même si l’écriture locale échoue', async () => {
    saveMessage.mockRejectedValueOnce(new Error('disque plein'))

    await expect(
      chatService.editMessage(MESSAGE_ID, CONVERSATION_ID, 'texte corrigé', PEER),
    ).resolves.toBeUndefined()

    expect(saveMessage).toHaveBeenCalledTimes(1)
    expect(p2pService.sendMessage).toHaveBeenCalledWith(PEER, 'chat:edit', {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      newContent: 'texte corrigé',
    })
  })
})

describe('ChatService.deleteMessage', () => {
  it('persiste le tombeau de la suppression pour tous', async () => {
    await chatService.deleteMessage(MESSAGE_ID, CONVERSATION_ID, PEER)

    const { conversationId, message } = savedCall()
    expect(conversationId).toBe(CONVERSATION_ID)
    expect(message.deleted).toBe(true)
    expect(message.content).toBe('')
  })
})
