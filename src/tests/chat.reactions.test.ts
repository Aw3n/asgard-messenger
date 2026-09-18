/**
 * Réactions emoji dans la conversation — le défaut signalé : « mon contact me
 * transmet ses likes emoji et je ne les vois pas ».
 *
 * Ni le rendu ni le store n'étaient en cause : `MessageBubble` affiche bien
 * `message.reactions` sans filtre, et `deriveConversationId()` trie les deux clés
 * donc l'identifiant de conversation est le même des deux côtés. Les trois
 * maillons cassés étaient en amont et en aval de l'émission :
 *   1. `NetworkService.send()` ignorait la valeur de `channel.send()` et logguait
 *      « ✅ SEND SUCCESS » même sur un canal Protomux fermé — la trame était
 *      avalée et l'émetteur ne pouvait ni la remettre en file ni la journaliser ;
 *   2. `toggleReaction()` était un `fire-and-forget` terminé par
 *      `.catch(() => {})` : aucun pair hors-ligne ne recevait jamais rien ;
 *   3. la réaction n'était écrite dans Hyperbee par personne, ni chez l'émetteur
 *      ni chez le receveur — elle mourait au redémarrage.
 *
 * Comme pour `chat.presence.routes.test.ts`, on passe par le bus réel
 * (`p2pService.emit`) et par le `initialize()` de production.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { p2pService } from '@/services/P2PService'
import { chatService } from '@/services/ChatService'
import { cryptoService } from '@/services/CryptoService'
import { useMessageStore } from '@/stores/messageStore'
import { useIdentityStore } from '@/stores/identityStore'
import type { LocalIdentity, Message, ProtocolMessage } from '@/types'

const MY_PK = 'a'.repeat(64)
const PEER_PK = 'b'.repeat(64)

function dispatch(type: string, payload: unknown, from: string): void {
  const msg = { id: 'm1', from, to: MY_PK, type, payload, timestamp: Date.now() } as unknown as ProtocolMessage
  p2pService.emit(`message:${type}`, msg)
  p2pService.emit('message', msg)
}

const fakeIdentity = {
  keyPair: { publicKey: MY_PK, secretKey: new Uint8Array(64) },
  profile: { displayName: 'Moi', status: 'online' },
} as unknown as LocalIdentity

/** Le message dont je suis l'auteur, chargé dans la conversation commune. */
function seedOwnMessage(id: string): Message {
  const message: Message = {
    id,
    conversationId: cryptoService.deriveConversationId(MY_PK, PEER_PK),
    senderId: MY_PK,
    type: 'text',
    content: 'Salut !',
    timestamp: Date.now(),
    status: 'delivered',
  }
  useMessageStore.getState().addMessage(message)
  return message
}

const reactionOf = (messageId: string, emoji: string) =>
  useMessageStore.getState()
    .getMessages(cryptoService.deriveConversationId(MY_PK, PEER_PK))
    .find((m) => m.id === messageId)
    ?.reactions?.find((r) => r.emoji === emoji)

beforeAll(() => {
  chatService.initialize()
})

afterEach(() => {
  useMessageStore.setState({ messages: {}, loading: {}, hasMore: {}, pending: {} })
  useIdentityStore.setState({ identity: null })
  vi.restoreAllMocks()
})

describe('réaction reçue du pair', () => {
  it('apparaît sur mon message sous la clé publique du pair', () => {
    const { id } = seedOwnMessage('msg-1')
    dispatch('chat:reaction', {
      messageId: id,
      conversationId: cryptoService.deriveConversationId(PEER_PK, MY_PK),
      emoji: '👍',
      action: 'add',
    }, PEER_PK)

    expect(reactionOf(id, '👍')?.count).toBe(1)
    expect(reactionOf(id, '👍')?.users).toEqual([PEER_PK])
  })

  it('se cumule avec la mienne sur le même emoji', () => {
    const { id } = seedOwnMessage('msg-2')
    useMessageStore.getState().addReaction(id, cryptoService.deriveConversationId(MY_PK, PEER_PK), '❤️', MY_PK)
    dispatch('chat:reaction', {
      messageId: id,
      conversationId: 'conv-du-pair-qui-ne-me-connaît-pas',
      emoji: '❤️',
      action: 'add',
    }, PEER_PK)

    // conversationId du chargeur ignoré : la résolution locale reprend la main
    expect(reactionOf(id, '❤️')?.count).toBe(2)
  })

  it('ne fait rien sur un message inconnu, sans lever', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    dispatch('chat:reaction', { messageId: 'msg-inconnu', conversationId: 'x', emoji: '👍', action: 'add' }, PEER_PK)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('chat:reaction'))
  })
})

describe('réaction émise vers un pair injoignable', () => {
  it('part sur le réseau et reste lisible localement quand tout va bien', async () => {
    useIdentityStore.setState({ identity: fakeIdentity })
    const { id } = seedOwnMessage('msg-3')
    const send = vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)

    await chatService.toggleReaction(id, cryptoService.deriveConversationId(MY_PK, PEER_PK), '👍', PEER_PK)

    expect(send).toHaveBeenCalledWith(PEER_PK, 'chat:reaction', {
      messageId: id,
      conversationId: cryptoService.deriveConversationId(MY_PK, PEER_PK),
      emoji: '👍',
      action: 'add',
    })
  })

  it('est remis en file puis délivré à la reconnexion du pair', async () => {
    useIdentityStore.setState({ identity: fakeIdentity })
    const { id } = seedOwnMessage('msg-4')
    const convId = cryptoService.deriveConversationId(MY_PK, PEER_PK)
    const send = vi.spyOn(p2pService, 'sendMessage')
      .mockRejectedValueOnce(new Error('Protomux channel closed for peer'))
      .mockResolvedValueOnce(undefined)

    await chatService.toggleReaction(id, convId, '🔥', PEER_PK)
    expect(send).toHaveBeenCalledTimes(1)
    // rien n'est perdu côté réseau, mais l'UI garde la réaction
    expect(reactionOf(id, '🔥')?.count).toBe(1)

    await chatService.flushPendingReactions(PEER_PK)
    expect(send).toHaveBeenCalledTimes(2)
    expect(reactionOf(id, '🔥')?.count).toBe(1)

    // la file est vide : une seconde remise ne renvoie rien
    await chatService.flushPendingReactions(PEER_PK)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('abandonne la réaction après trois tentatives ratées', async () => {
    useIdentityStore.setState({ identity: fakeIdentity })
    const { id } = seedOwnMessage('msg-5')
    const convId = cryptoService.deriveConversationId(MY_PK, PEER_PK)
    const send = vi.spyOn(p2pService, 'sendMessage').mockRejectedValue(new Error('Peer not found'))

    await chatService.toggleReaction(id, convId, '😮', PEER_PK)
    for (let i = 0; i < 4; i++) await chatService.flushPendingReactions(PEER_PK)

    // 1 émission ratée mise en file + 3 remises, la dernière abandonnant l'entrée
    expect(send).toHaveBeenCalledTimes(4)

    await chatService.flushPendingReactions(PEER_PK)
    expect(send).toHaveBeenCalledTimes(4)
  })
})
