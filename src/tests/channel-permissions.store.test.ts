/**
 * Rôles d'écriture et nom des canaux.
 *
 * « Annonce » et « lecture seule » n'étaient que des libellés : tout canal
 * nouveau ouvrait l'écriture à tout membre, quel que soit son type, et deux
 * noms ne distinguant que par la casse ou les espaces coexistaient. Le
 * mapping vit dans `channelPermissionsFor` pour que le canal créé localement
 * et le canal reçu d'un pair promettent la même chose ; `canPostInChannel`,
 * lui, lit cette liste.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { ChannelType, Group, GroupChannel, MemberRole } from '@/types'
import {
  DEFAULT_SEND_ROLES,
  canPostInChannel,
  channelPermissionsFor,
  normalizeChannelName,
} from '@/utils/groupPermissions'
import { useGroupStore } from '@/stores/groupStore'

const GROUP_ID = 'groupe-abcdef123456'
const ME = 'b'.repeat(64)
const ALL_ROLES: MemberRole[] = ['owner', 'admin', 'moderator', 'member', 'guest']

const makeGroup = (channels: GroupChannel[], role: MemberRole = 'member'): Group => ({
  id: GROUP_ID,
  name: 'Équipe',
  members: [{ publicKey: ME, displayName: 'Moi', role, joinedAt: 0, canPost: true }],
  channels,
  createdAt: 0,
  ownerId: 'a'.repeat(64),
  isPublic: false,
  maxMembers: 50,
})

const channelOf = (type: ChannelType, id = `ch-${type}`): GroupChannel => ({
  id,
  groupId: GROUP_ID,
  name: normalizeChannelName(type),
  type,
  position: 0,
  permissions: channelPermissionsFor(type),
  unreadCount: 0,
})

const create = (params: { name: string; type: ChannelType; permissions?: GroupChannel['permissions'] }) =>
  useGroupStore.getState().addChannel(GROUP_ID, params)

describe('rôles d’écriture déclarés par le type du canal', () => {
  it('referme l’écriture d’une annonce sur les rôles qui modèrent', () => {
    expect(channelPermissionsFor('announcement').send).toEqual(['owner', 'admin', 'moderator'])
  })

  it('ne garde que les administrateurs en lecture seule', () => {
    expect(channelPermissionsFor('readonly').send).toEqual(['owner', 'admin'])
  })

  it('laisse les membres écrire dans un canal de texte et de voix', () => {
    expect(channelPermissionsFor('text').send).toEqual([...DEFAULT_SEND_ROLES])
    expect(channelPermissionsFor('voice').send).toEqual([...DEFAULT_SEND_ROLES])
  })

  /** Un canal fermé reste lisible : la restriction porte sur l'écriture, pas
   *  sur la lecture — sinon le « lecture seule » serait un canal invisible. */
  it('ouvre la lecture à tous les rôles y compris l’invité', () => {
    for (const type of ['text', 'voice', 'announcement', 'readonly'] as ChannelType[]) {
      expect(channelPermissionsFor(type).read).toEqual(ALL_ROLES)
      expect(channelPermissionsFor(type).manage).toEqual(['owner', 'admin'])
    }
  })

  /** Le repli DEFAULT_SEND_ROLES est partagé : un appel qui le renverrait tel
   *  quel se ferait muter par le prochain canal créé. */
  it('rend des listes neuves, que la muter ne contamine rien', () => {
    const first = channelPermissionsFor('text')
    const second = channelPermissionsFor('text')
    expect(first.send).not.toBe(second.send)

    first.send.push('guest')
    first.read.length = 0
    expect(channelPermissionsFor('text').send).toEqual([...DEFAULT_SEND_ROLES])
    expect(channelPermissionsFor('text').read).toEqual(ALL_ROLES)
    expect(DEFAULT_SEND_ROLES).not.toContain('guest')
  })
})

describe('nom de canal normalisé', () => {
  it('met en minuscules et remplace chaque blanc par un trait d’union', () => {
    expect(normalizeChannelName('  Général Discussion  ')).toBe('général-discussion')
    expect(normalizeChannelName('Annonces\timportantes\n')).toBe('annonces-importantes')
    expect(normalizeChannelName('A  B')).toBe('a-b')
  })

  it('garde la casse d’origine hors des blancs', () => {
    expect(normalizeChannelName('Sécurité IT')).toBe('sécurité-it')
  })
})

describe('canal créé par le store', () => {
  beforeEach(() => {
    useGroupStore.setState({ groups: { [GROUP_ID]: makeGroup([]) }, activeGroupId: GROUP_ID, activeChannelId: null })
  })

  it('porte les rôles de son type et son nom normalisé', () => {
    const channel = create({ name: 'Grandes Annonces', type: 'announcement' })

    expect(channel?.name).toBe('grandes-annonces')
    expect(channel?.permissions.send).toEqual(['owner', 'admin', 'moderator'])
    expect(useGroupStore.getState().groups[GROUP_ID].channels.map((ch) => ch.id)).toEqual([channel?.id])
  })

  it('respecte des rôles explicitement demandés', () => {
    const permissions = { send: ['owner'] as MemberRole[], read: ALL_ROLES, manage: ['owner'] as MemberRole[] }
    const channel = create({ name: 'Studio', type: 'text', permissions })

    expect(channel?.permissions).toEqual(permissions)
  })

  it('positionne le nouveau canal après les autres', () => {
    create({ name: 'un', type: 'text' })
    const second = create({ name: 'deux', type: 'text' })

    expect(second?.position).toBe(1)
  })

  it('refuse un groupe inconnu', () => {
    expect(useGroupStore.getState().addChannel('groupe-absent', { name: 'un', type: 'text' })).toBeNull()
  })

  it('ne vide jamais le dernier canal et déplace le canal actif', () => {
    const only = create({ name: 'unique', type: 'text' })
    useGroupStore.setState({ activeChannelId: only?.id ?? null })
    useGroupStore.getState().removeChannel(GROUP_ID, only!.id)
    expect(useGroupStore.getState().groups[GROUP_ID].channels).toHaveLength(1)

    const second = create({ name: 'second', type: 'text' })
    useGroupStore.getState().removeChannel(GROUP_ID, only!.id)

    expect(useGroupStore.getState().groups[GROUP_ID].channels.map((ch) => ch.id)).toEqual([second!.id])
    expect(useGroupStore.getState().activeChannelId).toBe(second!.id)
  })
})

describe('écriture dans un canal, lue par la même liste', () => {
  it('coupe la parole au membre hors des rôles d’une annonce', () => {
    const group = makeGroup([channelOf('announcement')])
    expect(canPostInChannel(group, 'ch-announcement', ME)).toBe(false)

    const moderator = makeGroup([channelOf('announcement')], 'moderator')
    expect(canPostInChannel(moderator, 'ch-announcement', ME)).toBe(true)
  })

  it('coupe la parole au modérateur en lecture seule', () => {
    const moderator = makeGroup([channelOf('readonly')], 'moderator')
    expect(canPostInChannel(moderator, 'ch-readonly', ME)).toBe(false)

    const admin = makeGroup([channelOf('readonly')], 'admin')
    expect(canPostInChannel(admin, 'ch-readonly', ME)).toBe(true)
  })

  it('refuse l’invité dans un canal de texte, comme à la création', () => {
    const guest = makeGroup([channelOf('text')], 'guest')
    expect(canPostInChannel(guest, 'ch-text', ME)).toBe(false)
  })

  it('laisse un canal sans déclaration ouvrir l’écriture au membre', () => {
    const channel = { ...channelOf('text'), permissions: { send: [], read: [], manage: [] } }
    const group = makeGroup([channel])

    expect(canPostInChannel(group, 'ch-text', ME)).toBe(true)
  })

  it('garde la sourdine d’un admin stricte même dans un canal ouvert', () => {
    const group = makeGroup([channelOf('text')])
    group.members[0].canPost = false

    expect(canPostInChannel(group, 'ch-text', ME)).toBe(false)
  })

  it('ignore un canal qui n’appartient pas au groupe', () => {
    expect(canPostInChannel(makeGroup([]), 'ch-inconnu', ME)).toBe(false)
  })
})
