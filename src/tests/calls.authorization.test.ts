/**
 * Autorisation de la signalisation d'appel.
 *
 * L'enveloppe signe l'émetteur, pas ses intentions : n'importe quel pair
 * connecté pouvait accepter un appel (allumant caméra et micro), le terminer,
 * se déclarer participant d'un appel de groupe, ou injecter de l'audio/vidéo
 * dans une conversation en cours. Ces tests fixent la règle : un appel 1:1 ne
 * se pilote qu'avec son pair, un appel de groupe qu'avec les membres du groupe
 * et le roster de l'appel.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { callService } from '@/services/CallService'
import { p2pService } from '@/services/P2PService'
import { ringtoneService } from '@/services/RingtoneService'
import { useIdentityStore } from '@/stores/identityStore'
import { useGroupStore } from '@/stores/groupStore'
import { useCallStore } from '@/stores/callStore'
import { useContactStore } from '@/stores/contactStore'
import type { CallRecord } from '@/stores/callStore'
import type { GroupMember, ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)

let groupId = ''

function dispatch(type: string, payload: unknown, from: string): void {
  const msg = { id: 'm1', from, to: A, type, payload, timestamp: Date.now() } as unknown as ProtocolMessage
  p2pService.emit(`message:${type}`, msg)
}

function activeCall(overrides: Partial<CallRecord>): CallRecord {
  return {
    id: 'call-1',
    peerId: B,
    peerName: 'Bob',
    type: 'audio',
    status: 'connected',
    direction: 'outgoing',
    startedAt: Date.now(),
    missed: false,
    ...overrides,
  }
}

function member(publicKey: string, displayName: string, role: GroupMember['role']): GroupMember {
  return { publicKey, displayName, role, joinedAt: 1_700_000_000_000, canPost: true }
}

beforeAll(() => {
  callService.initialize()
})

beforeEach(() => {
  vi.useFakeTimers()
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
  useContactStore.setState({ contacts: {} })
  useCallStore.setState({
    activeCall: null,
    incomingCall: null,
    history: [],
    isMuted: false,
    isCameraOff: false,
    isScreenSharing: false,
    isPrivateMode: false,
    isLocalVideoFullscreen: false,
    isPeerVideoFullscreen: false,
    isCallMinimized: false,
    peerVideoFullscreenId: null,
    videoQuality: 'auto',
    callChatMessages: [],
    callReactions: [],
    showCallChat: false,
  })

  const created = useGroupStore.getState().createGroup({
    name: 'Équipe',
    ownerId: A,
    ownerDisplayName: 'Alice',
  })
  groupId = created.id
  useGroupStore.getState().addMember(created.id, member(B, 'Bob', 'member'))

  vi.spyOn(ringtoneService, 'startRingtone').mockImplementation(() => {})
  vi.spyOn(ringtoneService, 'stopRingtone').mockImplementation(() => {})
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('offre d’appel', () => {
  it('décline un appel d’un contact bloqué', () => {
    useContactStore.setState({
      contacts: {
        [B]: {
          publicKey: B,
          displayName: 'Bob',
          status: 'online',
          relation: 'blocked',
          verified: true,
          addedAt: Date.now(),
        },
      },
    })

    dispatch('call:offer', { type: 'audio', callerName: 'Bob' }, B)

    expect(useCallStore.getState().incomingCall).toBeNull()
    expect(p2pService.sendMessage).toHaveBeenCalledWith(B, 'call:reject', { reason: 'blocked' })
  })

  it('refuse un type autre que audio ou vidéo', () => {
    dispatch('call:offer', { type: 'hologram', callerName: 'Bob' }, B)
    expect(useCallStore.getState().incomingCall).toBeNull()
  })

  it('borne le nom affiché et refuse un avatar qui n’est pas une image encodée', () => {
    dispatch('call:offer', {
      type: 'audio',
      callerName: 'x'.repeat(500),
      callerAvatar: 'javascript:alert(1)',
    }, B)

    const incoming = useCallStore.getState().incomingCall
    expect(incoming?.peerName).toHaveLength(200)
    expect(incoming?.peerAvatar).toBeUndefined()
  })

  it('refuse un appel de groupe dont l’émetteur n’est pas membre', () => {
    dispatch('call:offer', {
      type: 'audio',
      callerName: 'Carol',
      isGroupCall: true,
      groupId,
      groupName: 'Équipe',
      participants: [C, A],
    }, C)

    expect(useCallStore.getState().incomingCall).toBeNull()
  })

  it('ne garde comme participants que les membres du groupe appelé', () => {
    dispatch('call:offer', {
      type: 'audio',
      callerName: 'Bob',
      isGroupCall: true,
      groupId,
      groupName: 'Équipe',
      participants: [B, C, 'pas-une-clé', A],
    }, B)

    const incoming = useCallStore.getState().incomingCall
    expect(incoming?.participants).toEqual([B, A])
  })

  it('nomme un appel de groupe sans nom dans la langue de l’interface', () => {
    useGroupStore.getState().updateGroup(groupId, { name: '' })
    dispatch('call:offer', {
      type: 'audio',
      callerName: 'Bob',
      isGroupCall: true,
      groupId,
      participants: [B, A],
    }, B)

    // « Group Call » restait anglais dans les 25 langues.
    expect(useCallStore.getState().incomingCall?.peerName).toBe('Appel de groupe')
  })

  it('décline un second appel au lieu de remplacer la sonnerie en cours', () => {
    dispatch('call:offer', { type: 'audio', callerName: 'Bob' }, B)
    dispatch('call:offer', { type: 'audio', callerName: 'Carol' }, C)

    expect(useCallStore.getState().incomingCall?.peerId).toBe(B)
    expect(p2pService.sendMessage).toHaveBeenCalledWith(C, 'call:reject', { reason: 'busy' })
  })

  it('décline un appel pendant un appel actif', () => {
    useCallStore.setState({ activeCall: activeCall({}) })
    dispatch('call:offer', { type: 'audio', callerName: 'Carol' }, C)

    expect(useCallStore.getState().activeCall?.peerId).toBe(B)
    expect(useCallStore.getState().incomingCall).toBeNull()
    expect(p2pService.sendMessage).toHaveBeenCalledWith(C, 'call:reject', { reason: 'busy' })
  })
})

describe('acceptation', () => {
  it('ignore l’acceptation d’un tiers sur un appel 1:1', () => {
    useCallStore.setState({ activeCall: activeCall({ status: 'outgoing' }) })
    dispatch('call:accept', {}, C)
    expect(useCallStore.getState().activeCall?.status).toBe('outgoing')
  })

  it('ignore une acceptation répétée une fois l’appel connecté', () => {
    useCallStore.setState({ activeCall: activeCall({ status: 'connected' }) })
    dispatch('call:accept', {}, B)
    expect(useCallStore.getState().activeCall?.status).toBe('connected')
  })

  it('n’accepte un membre du roster que dans l’appel de groupe concerné', () => {
    useCallStore.setState({
      activeCall: activeCall({
        peerId: groupId,
        isGroupCall: true,
        groupId,
        participants: [A, B],
        status: 'outgoing',
      }),
    })

    dispatch('call:accept', {}, C)
    expect(useCallStore.getState().activeCall?.status).toBe('outgoing')

    dispatch('call:accept', {}, B)
    expect(useCallStore.getState().activeCall?.status).toBe('connected')
  })
})

describe('fin d’appel', () => {
  it('un tiers ne peut pas raccrocher un appel 1:1', () => {
    useCallStore.setState({ activeCall: activeCall({}) })
    dispatch('call:end', {}, C)
    expect(useCallStore.getState().activeCall?.peerId).toBe(B)
  })

  it('le pair de l’appel peut le terminer', () => {
    useCallStore.setState({ activeCall: activeCall({}) })
    dispatch('call:end', {}, B)
    expect(useCallStore.getState().activeCall).toBeNull()
  })

  it('un tiers ne peut pas annuler une sonnerie entrante', () => {
    dispatch('call:offer', { type: 'audio', callerName: 'Bob' }, B)
    dispatch('call:reject', {}, C)
    expect(useCallStore.getState().incomingCall?.peerId).toBe(B)

    dispatch('call:reject', {}, B)
    expect(useCallStore.getState().incomingCall).toBeNull()
  })

  it('un non-participant ne peut pas clore un appel de groupe', () => {
    useCallStore.setState({
      activeCall: activeCall({
        peerId: groupId,
        isGroupCall: true,
        groupId,
        participants: [A, B],
      }),
    })
    dispatch('call:end', {}, C)
    expect(useCallStore.getState().activeCall).not.toBeNull()
  })

  it('le départ du dernier autre participant termine l’appel de groupe', () => {
    useCallStore.setState({
      activeCall: activeCall({
        peerId: groupId,
        isGroupCall: true,
        groupId,
        participants: [A, B],
      }),
    })
    dispatch('call:end', {}, B)
    expect(useCallStore.getState().activeCall).toBeNull()
  })
})

describe('membre du groupe appelé', () => {
  it('un non-membre ne peut pas rejoindre le maillage de l’appel', () => {
    useCallStore.setState({
      activeCall: activeCall({
        peerId: groupId,
        isGroupCall: true,
        groupId,
        participants: [A],
      }),
    })

    dispatch('call:participant:joined', { groupId }, C)
    expect(useCallStore.getState().activeCall?.participants).toEqual([A])

    dispatch('call:participant:joined', { groupId }, B)
    expect(useCallStore.getState().activeCall?.participants).toEqual([A, B])
    expect(p2pService.sendMessage).toHaveBeenCalledWith(B, 'call:participant:joined', expect.objectContaining({ groupId }))
  })

  it('ignore un participant annoncé pour un autre groupe', () => {
    useCallStore.setState({
      activeCall: activeCall({
        peerId: groupId,
        isGroupCall: true,
        groupId,
        participants: [A],
      }),
    })
    dispatch('call:participant:joined', { groupId: 'groupe-voisin' }, B)
    expect(useCallStore.getState().activeCall?.participants).toEqual([A])
  })
})

describe('média entrant', () => {
  const audio = new Uint8Array([0x01, 1, 2, 3])

  const spyMedia = () =>
    vi.spyOn(callService as unknown as { handleIncomingMedia: () => void }, 'handleIncomingMedia')
      .mockImplementation(() => {})

  it('refuse le média d’un tiers sur un appel 1:1', () => {
    const handler = spyMedia()
    useCallStore.setState({ activeCall: activeCall({}) })

    p2pService.emit('media:data', { from: C, data: audio })
    expect(handler).not.toHaveBeenCalled()

    p2pService.emit('media:data', { from: B, data: audio })
    expect(handler).toHaveBeenCalledWith(audio, B)
  })

  it('refuse le média d’un pair hors du roster de l’appel de groupe', () => {
    const handler = spyMedia()
    useCallStore.setState({
      activeCall: activeCall({
        peerId: groupId,
        isGroupCall: true,
        groupId,
        participants: [A, B],
      }),
    })

    p2pService.emit('media:data', { from: C, data: audio })
    expect(handler).not.toHaveBeenCalled()

    p2pService.emit('media:data', { from: B, data: audio })
    expect(handler).toHaveBeenCalledWith(audio, B)
  })
})
