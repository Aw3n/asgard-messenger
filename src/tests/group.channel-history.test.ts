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
})
