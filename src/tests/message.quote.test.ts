/**
 * Citation d'un message dans sa propre bulle : l'auteur doit voir l'aperçu du
 * message visé, comme le destinataire, et non un « ??? » vide.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useMessageStore } from '@/stores/messageStore'
import type { Message } from '@/types'

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)

beforeEach(() => {
  useMessageStore.setState({ messages: {}, pending: {} })
})

describe('citation locale', () => {
  it('remplit l’aperçu depuis le message visé', async () => {
    useMessageStore.getState().addMessage({
      id: 'm-origin',
      conversationId: 'conv',
      senderId: PEER,
      type: 'text',
      content: 'message d’origine',
      timestamp: 1,
      status: 'delivered',
    } as Message)

    const sent = await useMessageStore.getState().sendMessage(
      { conversationId: 'conv', type: 'text', content: 'ma réponse', replyTo: 'm-origin' },
      ME,
    )

    expect(sent.replyTo).toEqual({
      id: 'm-origin',
      senderId: PEER,
      content: 'message d’origine',
      type: 'text',
    })
  })
})
