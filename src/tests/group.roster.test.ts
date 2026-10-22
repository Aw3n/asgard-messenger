/**
 * Convergence de l'effectif de groupe.
 *
 * Le member:joined n'est diffusé qu'au moment de l'arrivée : un membre hors
 * ligne à cet instant ignorait le nouveau venu et rejetait ensuite ses
 * messages. Au recroisement, chaque membre échange son effectif ; ces tests
 * fixent ce que le snapshot peut faire (ajouter un inconnu) et ne peut pas
 * faire (promouvoir, rétrograder, retirer, s'ajouter soi-même).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { groupService } from '@/services/GroupService'
import { p2pService } from '@/services/P2PService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useGroupStore } from '@/stores/groupStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import type { GroupMember, ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)
const D = 'd'.repeat(64)

function member(publicKey: string, displayName: string, role: GroupMember['role']): GroupMember {
  return { publicKey, displayName, role, joinedAt: 1_700_000_000_000, canPost: true }
}

const dispatch = (payload: Record<string, unknown>, from: string): void => {
  const fn = (groupService as unknown as {
    handleGroupUpdate: (msg: ProtocolMessage) => void
  }).handleGroupUpdate.bind(groupService)
  fn({ id: 'envelope-1', from, to: A, type: 'group:update', timestamp: Date.now(), payload } as unknown as ProtocolMessage)
}

let groupId = ''
const group = () => useGroupStore.getState().getGroup(groupId)!
const memberKeys = () => group().members.map((m) => m.publicKey)
const key = (index: number) => String(index).padStart(3, '0') + 'x'.repeat(61)

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
  useConversationStore.setState({ conversations: {}, activeConversationId: null })
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
  useGroupStore.getState().addMember(created.id, member(B, 'Bob', 'admin'))
  useGroupStore.getState().addMember(created.id, member(C, 'Carol', 'member'))

  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'broadcastToPeers').mockResolvedValue({ sent: 1, failed: 0, unmapped: 0 })
  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.mocked(p2pService.sendMessage).mockRestore()
  vi.mocked(p2pService.broadcastToPeers).mockRestore()
  vi.mocked(storageService.saveMessage).mockRestore()
})

describe('snapshot d’effectif reçu', () => {
  it('ajoute les inconnus comme simples membres et préserve les rôles locaux', () => {
    dispatch({
      groupId,
      action: 'roster:sync',
      members: [
        { publicKey: A, displayName: 'Alice', role: 'member' },
        { publicKey: B, displayName: 'Bob', role: 'member' },
        { publicKey: D, displayName: 'Dave', role: 'owner' },
      ],
    }, B)

    expect(memberKeys()).toContain(D)
    expect(group().members.find((m) => m.publicKey === B)!.role).toBe('admin')
    expect(group().members.find((m) => m.publicKey === D)!.role).toBe('member')
    // L'absence des autres membres du snapshot ne retire personne.
    expect(memberKeys()).toEqual(expect.arrayContaining([A, B, C]))
  })

  it('ignore un snapshot venu d’un non-membre', () => {
    dispatch({
      groupId,
      action: 'roster:sync',
      members: [{ publicKey: D, displayName: 'Dave' }],
    }, D)

    expect(memberKeys()).not.toContain(D)
  })

  it('borne le nombre d’entrées traitées', () => {
    useGroupStore.getState().updateGroup(groupId, { maxMembers: 300 })
    const roster = Array.from({ length: 300 }, (_, index) => ({
      publicKey: key(index),
      displayName: `Membre ${index}`,
    }))

    dispatch({ groupId, action: 'roster:sync', members: roster }, B)

    expect(memberKeys()).toContain(key(255))
    expect(memberKeys()).not.toContain(key(256))
    expect(group().members).toHaveLength(3 + 256)
  })

  it('ignore un identifiant d’effectif démesuré ou non textuel', () => {
    dispatch({
      groupId,
      action: 'roster:sync',
      members: [{ publicKey: 'k'.repeat(300) }, { publicKey: 42 }, null],
    }, B)

    expect(group().members).toHaveLength(3)
  })
})

describe('snapshot d’effectif émis', () => {
  it('l’envoie aux seuls groupes partagés, sans rôles ni propriétaire', async () => {
    const other = useGroupStore.getState().createGroup({
      name: 'Sans Bob',
      ownerId: A,
      ownerDisplayName: 'Alice',
    })

    await groupService.syncGroupRostersWithPeer(B)

    const calls = vi.mocked(p2pService.sendMessage).mock.calls
    expect(calls).toHaveLength(1)
    const [peer, type, payload] = calls[0] as [string, string, Record<string, unknown>]
    expect(peer).toBe(B)
    expect(type).toBe('group:update')
    expect(payload.action).toBe('roster:sync')
    expect(payload.groupId).toBe(groupId)
    const roster = payload.members as Array<Record<string, unknown>>
    expect(roster.map((entry) => entry.publicKey)).toEqual(expect.arrayContaining([A, B, C]))
    for (const entry of roster) {
      expect(entry).not.toHaveProperty('role')
      expect(entry).not.toHaveProperty('ownerId')
    }
    expect(vi.mocked(p2pService.sendMessage).mock.calls.some(([, , sent]) =>
      (sent as Record<string, unknown>).groupId === other.id)).toBe(false)
  })

  it('ne s’envoie rien à soi-même', async () => {
    await groupService.syncGroupRostersWithPeer(A)
    expect(p2pService.sendMessage).not.toHaveBeenCalled()
  })
})
