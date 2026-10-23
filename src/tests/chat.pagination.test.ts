/**
 * Pagination de l'historique 1:1.
 *
 * L'ouverture d'un fil ne charge que les derniers messages. Sans lecture des
 * plus anciens, un fil dépassant la première page devenait définitivement
 * tronqué : ces tests fixent la requête (avant telle date, du plus récent au
 * plus ancien) et l'ordre chronologique restauré dans le store.
 *
 * Une page rendue `null` est une panne de lecture, jamais une fin d'historique :
 * la vue qui la confondait avec une page vide déclarait la pagination épuisée
 * et le trou du haut ne se rouvrait plus.
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
    expect(returned?.map((m) => m.id)).toEqual(['m-3', 'm-2'])
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

  it('rend null quand la lecture échoue, pour ne pas croire l’historique fini', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(storageService, 'getMessages').mockRejectedValue(new Error('stockage indisponible'))

    await expect(chatService.loadOlderMessages('conv', 1, 50)).resolves.toBeNull()
    expect(error).toHaveBeenCalled()
    expect(useMessageStore.getState().messages.conv).toBeUndefined()
  })
})

describe('combler la couture vers les messages récents', () => {
  it('demande la page après la clé exacte et la fusionne', async () => {
    const getMessages = vi.spyOn(storageService, 'getMessages').mockResolvedValue([
      message('m-5', 5_000),
      message('m-6', 6_000),
    ])
    useMessageStore.getState().addMessages('conv', [message('m-4', 4_000)])

    const returned = await chatService.loadNewerMessages('conv', 4_000, 'm-4', 50)

    expect(getMessages).toHaveBeenCalledWith('conv', { after: 4_000, afterId: 'm-4', limit: 50 })
    expect(returned?.map((m) => m.id)).toEqual(['m-5', 'm-6'])
    expect(useMessageStore.getState().messages.conv?.map((m) => m.id)).toEqual([
      'm-4',
      'm-5',
      'm-6',
    ])
  })

  it('rend null quand la lecture échoue, pour que la couture se retente', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(storageService, 'getMessages').mockRejectedValue(new Error('stockage indisponible'))

    await expect(chatService.loadNewerMessages('conv', 1, 'm-1', 50)).resolves.toBeNull()
    expect(useMessageStore.getState().messages.conv).toBeUndefined()
  })
})

describe('contexte autour d’un message', () => {
  it('rend les pages fusionnées dans l’ordre des clés du stockage', async () => {
    const getMessages = vi.spyOn(storageService, 'getMessages').mockImplementation(
      async (_conversationId, options) => {
        if (options?.reverse) {
          // Page « avant » : du plus récent au plus ancien, avec deux
          // messages qui partagent la milliseconde de la cible.
          return [
            message('cible-b', 1_000),
            message('cible-a', 1_000),
            message('avant', 900),
          ]
        }
        return [message('apres', 1_100)]
      },
    )

    const returned = await chatService.loadMessageContext('conv', 1_000, 50)

    expect(getMessages).toHaveBeenCalledWith('conv', { before: 1_001, limit: 50, reverse: true })
    expect(getMessages).toHaveBeenCalledWith('conv', { after: 1_000, limit: 50 })
    expect(returned?.map((m) => m.id)).toEqual(['avant', 'cible-a', 'cible-b', 'apres'])
    expect(useMessageStore.getState().messages.conv?.map((m) => m.id)).toEqual([
      'avant',
      'cible-a',
      'cible-b',
      'apres',
    ])
  })

  it('rend null quand la page de contexte ne vient pas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(storageService, 'getMessages').mockRejectedValue(new Error('stockage indisponible'))

    await expect(chatService.loadMessageContext('conv', 1_000, 50)).resolves.toBeNull()
  })
})

describe('page de démarrage', () => {
  it('rend null quand le fil n’a pas pu être lu, [] quand il est vide', async () => {
    const getLastMessages = vi.spyOn(storageService, 'getLastMessages')

    getLastMessages.mockResolvedValue([])
    await expect(chatService.loadMessages('conv')).resolves.toEqual([])

    vi.spyOn(console, 'error').mockImplementation(() => {})
    getLastMessages.mockRejectedValue(new Error('stockage indisponible'))
    await expect(chatService.loadMessages('conv')).resolves.toBeNull()
  })
})
