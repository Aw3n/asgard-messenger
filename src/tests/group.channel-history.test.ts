/**
 * Historique et lecture d'un canal de groupe.
 *
 * Les messages de groupe étaient bien écrits dans Hyperbee sous l'id du canal,
 * mais aucun chemin ne les relisait : après un redémarrage le canal paraissait
 * vide alors que tout était sur disque. Et le compteur de non-lus n'était
 * incrémenté qu'en dehors du canal actif sans jamais être remis à zéro : la
 * pastille restait allumée pour toujours après le premier message manqué.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { groupService } from '@/services/GroupService'
import { p2pService } from '@/services/P2PService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useGroupStore } from '@/stores/groupStore'
import { useMessageStore } from '@/stores/messageStore'
import type { GroupMember, Message } from '@/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

function member(publicKey: string, displayName: string): GroupMember {
  return { publicKey, displayName, role: 'member', joinedAt: 1_700_000_000_000, canPost: true }
}

function message(id: string, senderId: string, timestamp: number): Message {
  return {
    id,
    conversationId: channelId,
    senderId,
    type: 'text',
    content: id,
    timestamp,
    status: 'delivered',
  }
}

let groupId = ''
let channelId = ''

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: A, secretKey: 'f'.repeat(128) },
      profile: { publicKey: A, displayName: 'Alice', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useGroupStore.setState({
    groups: {},
    activeGroupId: null,
    activeChannelId: null,
    groupViewVisible: false,
    searchQuery: '',
    groupPresence: {},
    channelTyping: {},
  })
  useMessageStore.setState({
    messages: {},
    loading: {},
    hasMore: {},
    pending: {},
    drafts: {},
    scheduledMessages: [],
    templates: [],
  })

  const created = useGroupStore.getState().createGroup({
    name: 'Équipe',
    ownerId: A,
    ownerDisplayName: 'Alice',
  })
  groupId = created.id
  channelId = created.channels[0].id
  useGroupStore.getState().addMember(groupId, member(B, 'Bob'))

  vi.spyOn(p2pService, 'broadcastToPeers').mockResolvedValue({ sent: 1, failed: 0, unmapped: 0 })
})

afterEach(() => {
  vi.mocked(p2pService.broadcastToPeers).mockRestore()
  vi.restoreAllMocks()
})

describe('rechargement de l’historique d’un canal', () => {
  it('restaure les messages persistés sous l’id du canal, dans l’ordre du temps', async () => {
    const older = message('m-1', B, 1_000)
    const newer = message('m-2', A, 2_000)
    const getLast = vi.spyOn(storageService, 'getLastMessages').mockResolvedValue([newer, older])

    await groupService.loadChannelMessages(groupId, channelId)

    expect(getLast).toHaveBeenCalledWith(channelId, 50)
    expect(useMessageStore.getState().messages[channelId]?.map((m) => m.id)).toEqual(['m-1', 'm-2'])
  })

  it('ne lit pas un canal qui n’appartient pas au groupe', async () => {
    const getLast = vi.spyOn(storageService, 'getLastMessages').mockResolvedValue([])

    await groupService.loadChannelMessages(groupId, 'canal-inconnu')
    await groupService.loadChannelMessages('groupe-inconnu', channelId)

    expect(getLast).not.toHaveBeenCalled()
  })
})

describe('remonter l’historique d’un canal', () => {
  it('demande les messages avant la date et les rend dans l’ordre du temps', async () => {
    const getMessages = vi.spyOn(storageService, 'getMessages').mockResolvedValue([
      message('m-3', B, 3_000),
      message('m-2', A, 2_000),
    ])

    const returned = await groupService.loadOlderChannelMessages(groupId, channelId, 3_001, 50)

    expect(getMessages).toHaveBeenCalledWith(channelId, { before: 3_001, limit: 50, reverse: true })
    expect(returned.map((m) => m.id)).toEqual(['m-3', 'm-2'])
    expect(useMessageStore.getState().messages[channelId]?.map((m) => m.id)).toEqual(['m-2', 'm-3'])
  })

  it('ne lit ni un canal inconnu ni un groupe dont on n’est pas membre', async () => {
    const getMessages = vi.spyOn(storageService, 'getMessages').mockResolvedValue([])
    useIdentityStore.setState({
      identity: {
        keyPair: { publicKey: 'd'.repeat(64), secretKey: 'f'.repeat(128) },
        profile: { publicKey: 'd'.repeat(64), displayName: 'Dave', status: 'online', createdAt: 0, updatedAt: 0 },
      },
      isSetup: true,
    })

    await groupService.loadOlderChannelMessages(groupId, channelId, 3_001)
    useIdentityStore.setState({
      identity: {
        keyPair: { publicKey: A, secretKey: 'f'.repeat(128) },
        profile: { publicKey: A, displayName: 'Alice', status: 'online', createdAt: 0, updatedAt: 0 },
      },
      isSetup: true,
    })
    await groupService.loadOlderChannelMessages(groupId, 'canal-inconnu', 3_001)

    expect(getMessages).not.toHaveBeenCalled()
  })
})

describe('combler la couture d’un canal', () => {
  it('demande la page après la clé exacte et la fusionne', async () => {
    const getMessages = vi.spyOn(storageService, 'getMessages').mockResolvedValue([
      message('m-5', B, 5_000),
      message('m-6', A, 6_000),
    ])
    useMessageStore.getState().addMessages(channelId, [message('m-4', A, 4_000)])

    const returned = await groupService.loadNewerChannelMessages(
      groupId,
      channelId,
      4_000,
      'm-4',
      50,
    )

    expect(getMessages).toHaveBeenCalledWith(channelId, {
      after: 4_000,
      afterId: 'm-4',
      limit: 50,
    })
    expect(returned.map((m) => m.id)).toEqual(['m-5', 'm-6'])
    expect(useMessageStore.getState().messages[channelId]?.map((m) => m.id)).toEqual([
      'm-4',
      'm-5',
      'm-6',
    ])
  })

  it('ne lit ni un canal inconnu ni un groupe dont on n’est pas membre', async () => {
    const getMessages = vi.spyOn(storageService, 'getMessages').mockResolvedValue([])
    useIdentityStore.setState({
      identity: {
        keyPair: { publicKey: 'd'.repeat(64), secretKey: 'f'.repeat(128) },
        profile: { publicKey: 'd'.repeat(64), displayName: 'Dave', status: 'online', createdAt: 0, updatedAt: 0 },
      },
      isSetup: true,
    })

    await groupService.loadNewerChannelMessages(groupId, channelId, 3_001, 'm-3')
    useIdentityStore.setState({
      identity: {
        keyPair: { publicKey: A, secretKey: 'f'.repeat(128) },
        profile: { publicKey: A, displayName: 'Alice', status: 'online', createdAt: 0, updatedAt: 0 },
      },
      isSetup: true,
    })
    await groupService.loadNewerChannelMessages(groupId, 'canal-inconnu', 3_001, 'm-3')

    expect(getMessages).not.toHaveBeenCalled()
  })
})

describe('contexte d’un saut dans un canal', () => {
  it('rend les pages fusionnées dans l’ordre des clés du stockage', async () => {
    const getMessages = vi.spyOn(storageService, 'getMessages').mockImplementation(
      async (_channelId, options) => {
        if (options?.reverse) {
          return [
            message('cible-b', B, 1_000),
            message('cible-a', B, 1_000),
            message('avant', B, 900),
          ]
        }
        return [message('apres', A, 1_100)]
      },
    )

    const returned = await groupService.loadChannelMessageContext(groupId, channelId, 1_000, 50)

    expect(getMessages).toHaveBeenCalledWith(channelId, { before: 1_001, limit: 50, reverse: true })
    expect(getMessages).toHaveBeenCalledWith(channelId, { after: 1_000, limit: 50 })
    expect(returned.map((m) => m.id)).toEqual(['avant', 'cible-a', 'cible-b', 'apres'])
  })
})

describe('ouverture d’un canal = lecture', () => {
  it('remet le compteur à zéro et envoie les accusés de lecture', async () => {
    // createGroup sélectionne le groupe : un message n'est « non lu » que
    // lorsqu'on regarde ailleurs.
    useGroupStore.getState().setActiveGroup(null)
    useGroupStore.getState().incrementChannelUnread(groupId, channelId)
    expect(useGroupStore.getState().getGroup(groupId)?.channels[0].unreadCount).toBe(1)

    await groupService.markAsRead(groupId, channelId, ['m-1', 'm-2'])

    expect(useGroupStore.getState().getGroup(groupId)?.channels[0].unreadCount).toBe(0)
    expect(p2pService.broadcastToPeers).toHaveBeenCalledWith(
      expect.arrayContaining([B]),
      'group:receipt',
      expect.objectContaining({ groupId, channelId, messageIds: ['m-1', 'm-2'], status: 'read', readerPublicKey: A }),
    )
  })

  it('ne tait pas les messages d’un canal sélectionné mais quitté', () => {
    useGroupStore.getState().setActiveGroup(groupId)
    // Le canal reste « actif » dans le store alors que la page n'est plus
    // montée : le message doit tout de même compter comme non lu.
    useGroupStore.getState().incrementChannelUnread(groupId, channelId)
    expect(useGroupStore.getState().getGroup(groupId)?.channels[0].unreadCount).toBe(1)

    useGroupStore.getState().setGroupViewVisible(true)
    useGroupStore.getState().incrementChannelUnread(groupId, channelId)
    expect(useGroupStore.getState().getGroup(groupId)?.channels[0].unreadCount).toBe(1)
  })
})
