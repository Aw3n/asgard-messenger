/**
 * Réception des avatars par canal média : les octets ne sont pas signés au
 * niveau applicatif. La validation (format, taille) et les droits (icône de
 * groupe réservée aux admins, avatar de membre réservé aux membres) doivent
 * donc être faits avant d'écrire dans les stores.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { chatService } from '@/services/ChatService'
import { useGroupStore } from '@/stores/groupStore'
import { useContactStore } from '@/stores/contactStore'
import type { GroupMember } from '@/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)
const D = '9'.repeat(64)

const AVATAR = 'data:image/webp;base64,' + 'A'.repeat(64)

const storeAvatar = (key: string, data: string, target: string, groupId?: string): void => {
  const fn = (chatService as unknown as {
    storeAvatar: (ed25519Key: string, avatar: string, target: string, group?: string) => void
  }).storeAvatar.bind(chatService)
  fn(key, data, target, groupId)
}

function member(publicKey: string, displayName: string, role: GroupMember['role']): GroupMember {
  return { publicKey, displayName, role, joinedAt: 1, canPost: true }
}

let groupId = ''
const group = () => useGroupStore.getState().getGroup(groupId)!
const memberOf = (key: string) => group().members.find((m) => m.publicKey === key)

beforeEach(() => {
  useGroupStore.setState({
    groups: {},
    activeGroupId: null,
    activeChannelId: null,
    searchQuery: '',
    groupPresence: {},
    channelTyping: {},
  })
  useContactStore.setState({ contacts: {}, searchQuery: '' })

  const created = useGroupStore.getState().createGroup({
    name: 'Équipe',
    ownerId: A,
    ownerDisplayName: 'Alice',
  })
  groupId = created.id
  useGroupStore.getState().addMember(created.id, member(B, 'Bob', 'admin'))
  useGroupStore.getState().addMember(created.id, member(C, 'Carol', 'member'))
})

describe('icône de groupe', () => {
  it('ignore un envoi venu d’un non-membre', () => {
    storeAvatar(D, AVATAR, 'group_icon', groupId)
    expect(group().avatar).toBeUndefined()
  })

  it('ignore un envoi venu d’un simple membre', () => {
    storeAvatar(C, AVATAR, 'group_icon', groupId)
    expect(group().avatar).toBeUndefined()
  })

  it('accepte l’icône poussée par un admin', () => {
    storeAvatar(B, AVATAR, 'group_icon', groupId)
    expect(group().avatar).toBe(AVATAR)
  })
})

describe('avatar de membre', () => {
  it('ignore un expéditeur absent du groupe', () => {
    storeAvatar(D, AVATAR, 'group_member', groupId)
    expect(memberOf(D)).toBeUndefined()
  })

  it('applique l’avatar d’un membre connu et synchronise son contact', () => {
    useContactStore.getState().addContact({
      publicKey: C,
      displayName: 'Carol',
      status: 'offline',
      relation: 'contact',
      verified: false,
      addedAt: 1,
    })

    storeAvatar(C, AVATAR, 'group_member', groupId)
    expect(memberOf(C)?.avatar).toBe(AVATAR)
    expect(useContactStore.getState().getContact(C)?.avatar).toBe(AVATAR)
  })

  it('ne confond pas l’icône du groupe avec l’avatar de l’admin qui l’envoie', () => {
    useContactStore.getState().addContact({
      publicKey: B,
      displayName: 'Bob',
      status: 'offline',
      relation: 'contact',
      verified: false,
      addedAt: 1,
    })

    storeAvatar(B, AVATAR, 'group_icon', groupId)
    expect(group().avatar).toBe(AVATAR)
    expect(useContactStore.getState().getContact(B)?.avatar).toBeUndefined()
  })
})

describe('validation des données', () => {
  it('refuse un data URL qui n’est pas une image', () => {
    storeAvatar(B, 'data:text/html;base64,PHNjcmlwdD4=', 'group_icon', groupId)
    expect(group().avatar).toBeUndefined()
  })

  it('refuse un avatar au-delà de la taille limite', () => {
    const huge = 'data:image/webp;base64,' + 'A'.repeat(2 * 1024 * 1024)
    storeAvatar(B, huge, 'group_icon', groupId)
    expect(group().avatar).toBeUndefined()
  })
})

describe('avatar de contact', () => {
  it('n’écrit rien pour une clé inconnue', () => {
    storeAvatar(D, AVATAR, 'contact')
    expect(useContactStore.getState().getContact(D)).toBeUndefined()
  })

  it('met à jour un contact existant', () => {
    useContactStore.getState().addContact({
      publicKey: C,
      displayName: 'Carol',
      status: 'offline',
      relation: 'contact',
      verified: false,
      addedAt: 1,
    })

    storeAvatar(C, AVATAR, 'contact')
    expect(useContactStore.getState().getContact(C)?.avatar).toBe(AVATAR)
  })
})
