/**
 * Présence de groupe : une annonce est une auto-déclaration signée. Sans ce
 * contrôle, n'importe quel pair connaissant un groupId pouvait gonfler le
 * compteur « en ligne », et un membre pouvait usurper le statut d'un autre.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { groupService } from '@/services/GroupService'
import { useIdentityStore } from '@/stores/identityStore'
import { useGroupStore } from '@/stores/groupStore'
import { useContactStore } from '@/stores/contactStore'
import type { GroupMember, ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const C = 'c'.repeat(64)
const D = '9'.repeat(64)

const presence = (groupId: string, publicKey: string, displayName = 'Carol') =>
  ({
    id: 'm1',
    from: publicKey,
    to: A,
    type: 'group:presence',
    timestamp: Date.now(),
    payload: {
      groupId,
      publicKey,
      displayName,
      status: 'dnd',
      customStatus: 'En réunion',
      timestamp: Date.now(),
    },
  }) as unknown as ProtocolMessage

const dispatch = (msg: ProtocolMessage): void => {
  const handler = (groupService as unknown as {
    handleGroupPresence: (message: ProtocolMessage) => void
  }).handleGroupPresence.bind(groupService)
  handler(msg)
}

let groupId = ''

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
  useContactStore.setState({ contacts: {}, searchQuery: '' })

  const group = useGroupStore.getState().createGroup({
    name: 'Équipe',
    ownerId: A,
    ownerDisplayName: 'Alice',
  })
  groupId = group.id
  const carol: GroupMember = {
    publicKey: C,
    displayName: 'Carol',
    role: 'member',
    joinedAt: Date.now() - 1000,
    canPost: true,
  }
  useGroupStore.getState().addMember(group.id, carol)
  useContactStore.getState().addContact({
    publicKey: C,
    displayName: 'Carol',
    status: 'offline',
    relation: 'contact',
    verified: false,
    addedAt: Date.now(),
  })
})

describe('handleGroupPresence — auto-déclaration uniquement', () => {
  it('applique la présence d’un membre et son profil', () => {
    dispatch(presence(groupId, C, 'Carol renommée'))

    const member = useGroupStore.getState().getGroup(groupId)!.members.find((m) => m.publicKey === C)!
    expect(member.status).toBe('busy')
    expect(member.customStatus).toBe('En réunion')
    expect(member.displayName).toBe('Carol renommée')
    expect(useGroupStore.getState().getOnlineMembers(groupId)).toContain(C)
    expect(useContactStore.getState().getContact(C)?.status).toBe('busy')
  })

  it('refuse qu’un pair parle au nom d’un autre membre', () => {
    dispatch(presence(groupId, C))

    // Même payload (déclare C), expéditeur différent : ignoré.
    const spoofed = { ...presence(groupId, C, 'Usurpateur'), from: D } as unknown as ProtocolMessage
    dispatch(spoofed)

    expect(useGroupStore.getState().getGroup(groupId)!.members.find((m) => m.publicKey === C)!.displayName)
      .toBe('Carol')
    expect(useGroupStore.getState().groupPresence[groupId][C]).toBe('busy')
  })

  it('ignore la présence d’un non-membre', () => {
    dispatch(presence(groupId, D, 'Intrus'))

    expect(useGroupStore.getState().groupPresence[groupId]?.[D]).toBeUndefined()
    expect(useGroupStore.getState().getOnlineMembers(groupId)).not.toContain(D)
  })
})
