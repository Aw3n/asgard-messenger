/**
 * La mise en attente d'un appel.
 *
 * Le bouton existait depuis la première version, avec un état local au composant :
 * « reprendre » ne faisait rien du tout — micro et caméra restaient coupés, l'état
 * disparaissait au remontage, et le pair, lui, ne voyait qu'une image figée sans
 * savoir que l'autre côté avait posé l'appel. L'attente est désormais un état de
 * l'appel : le store la porte, les boucles d'envoi la lisent, et le pair est
 * prévenu par un signal — qu'un pair étranger à l'appel ne peut pas lui imposer.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { callService } from '@/services/CallService'
import { p2pService } from '@/services/P2PService'
import { useCallStore } from '@/stores/callStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useContactStore } from '@/stores/contactStore'
import type { CallRecord } from '@/stores/callStore'
import type { ProtocolMessage } from '@/types'

const ME = 'a'.repeat(64)
const BOB = 'b'.repeat(64)
const CAROL = 'c'.repeat(64)
const STRANGER = 'd'.repeat(64)

const internals = () => callService as unknown as {
  currentPeerId: string | null
  isGroupAudioCall: boolean
  useOpus: boolean
  audioBatchBuffer: Uint8Array[]
  handleCapturedAudio: (samples: Float32Array, rms: number) => void
  isAudioSendSuppressed: () => boolean
  isVideoSendSuppressed: () => boolean
}

function call(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id: 'call-1',
    peerId: BOB,
    peerName: 'Bob',
    type: 'audio',
    status: 'connected',
    direction: 'outgoing',
    startedAt: 1_700_000_000_000,
    connectedAt: 1_700_000_000_000,
    missed: false,
    ...overrides,
  }
}

function dispatch(type: 'call:hold', payload: unknown, from: string): void {
  const msg = { id: 'm1', from, to: ME, type, payload, timestamp: Date.now() } as unknown as ProtocolMessage
  p2pService.emit(`message:${type}`, msg)
}

beforeAll(() => {
  callService.initialize()
})

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'f'.repeat(128) },
      profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useContactStore.setState({ contacts: {} })
  useCallStore.setState({
    activeCall: call(),
    incomingCall: null,
    history: [],
    isMuted: false,
    isCameraOff: false,
    isScreenSharing: false,
    isOnHold: false,
    holdingPeers: [],
    callChatMessages: [],
    callReactions: [],
    showCallChat: false,
  })
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue()
})

afterEach(() => {
  internals().currentPeerId = null
  internals().audioBatchBuffer = []
  useCallStore.getState().endCall()
  vi.restoreAllMocks()
})

describe('attente demandée ici', () => {
  it('écrit l’état dans le store et le signale au pair', () => {
    callService.setHold(true)

    expect(useCallStore.getState().isOnHold).toBe(true)
    expect(p2pService.sendMessage).toHaveBeenCalledWith(BOB, 'call:hold', { held: true })
  })

  it('signale la reprise et rend l’état', () => {
    callService.setHold(true)
    vi.mocked(p2pService.sendMessage).mockClear()

    callService.setHold(false)

    expect(useCallStore.getState().isOnHold).toBe(false)
    expect(p2pService.sendMessage).toHaveBeenCalledWith(BOB, 'call:hold', { held: false })
  })

  it('ne rejoue pas un signal pour un état déjà pris', () => {
    callService.setHold(true)
    const after = vi.mocked(p2pService.sendMessage).mock.calls.length

    callService.setHold(true)

    expect(vi.mocked(p2pService.sendMessage)).toHaveBeenCalledTimes(after)
  })

  it('ignore la demande hors appel', () => {
    useCallStore.setState({ activeCall: null })

    callService.setHold(true)

    expect(useCallStore.getState().isOnHold).toBe(false)
    expect(p2pService.sendMessage).not.toHaveBeenCalled()
  })

  it('prévient chaque participant d’un appel de groupe, jamais soi-même', () => {
    useCallStore.setState({
      activeCall: call({
        peerId: 'g1', isGroupCall: true, groupId: 'g1', groupName: 'Équipe',
        participants: [ME, BOB, CAROL],
      }),
    })

    callService.setHold(true)

    const targets = vi.mocked(p2pService.sendMessage).mock.calls.map(([peerId]) => peerId)
    expect(targets.sort()).toEqual([BOB, CAROL])
  })

  it('bascule depuis le bouton sans que l’interface porte l’état', () => {
    callService.toggleHold()
    expect(useCallStore.getState().isOnHold).toBe(true)

    callService.toggleHold()
    expect(useCallStore.getState().isOnHold).toBe(false)
  })
})

describe('attente signalée par le pair', () => {
  it('ne retient que la parole du pair de l’appel', () => {
    dispatch('call:hold', { held: true }, STRANGER)
    expect(useCallStore.getState().holdingPeers).toEqual([])

    dispatch('call:hold', { held: true }, BOB)
    expect(useCallStore.getState().holdingPeers).toEqual([BOB])
  })

  it('en groupe, n’écoute que le roster de l’appel', () => {
    useCallStore.setState({
      activeCall: call({
        peerId: 'g1', isGroupCall: true, groupId: 'g1', groupName: 'Équipe',
        participants: [ME, BOB],
      }),
    })

    dispatch('call:hold', { held: true }, CAROL)
    expect(useCallStore.getState().holdingPeers).toEqual([])

    dispatch('call:hold', { held: true }, BOB)
    expect(useCallStore.getState().holdingPeers).toEqual([BOB])
  })

  it('refuse une charge utile qui ne dit pas vrai ou faux', () => {
    // Chaque envoi se vérifie seul : enchaîner les trois laisserait le dernier
    // effacer la marque du premier et la garde inutile passerait pour correcte.
    dispatch('call:hold', { held: 'yes' }, BOB)
    expect(useCallStore.getState().holdingPeers).toEqual([])

    dispatch('call:hold', {}, BOB)
    expect(useCallStore.getState().holdingPeers).toEqual([])

    dispatch('call:hold', undefined, BOB)
    expect(useCallStore.getState().holdingPeers).toEqual([])
  })

  it('rouvre la liste quand le pair reprend', () => {
    dispatch('call:hold', { held: true }, BOB)

    dispatch('call:hold', { held: false }, BOB)

    expect(useCallStore.getState().holdingPeers).toEqual([])
  })

  it('oublie le participant qui quitte l’appel de groupe', () => {
    useCallStore.setState({
      activeCall: call({
        peerId: 'g1', isGroupCall: true, groupId: 'g1', groupName: 'Équipe',
        participants: [ME, BOB, CAROL],
      }),
    })
    dispatch('call:hold', { held: true }, CAROL)

    useCallStore.getState().removeParticipant(CAROL)

    expect(useCallStore.getState().holdingPeers).toEqual([])
  })

  it('s’efface avec l’appel', () => {
    dispatch('call:hold', { held: true }, BOB)
    callService.setHold(true)

    useCallStore.getState().endCall()

    expect(useCallStore.getState().isOnHold).toBe(false)
    expect(useCallStore.getState().holdingPeers).toEqual([])
  })
})

describe('ce qui part réellement pendant l’attente', () => {
  // L'encodeur Opus n'existe pas dans jsdom : la voie de repli PCM empile ses
  // charges dans audioBatchBuffer, ce qui laisse mesurer l'arrêt de l'émission.
  const samples = () => new Float32Array(512).fill(0.4)

  beforeEach(() => {
    internals().currentPeerId = BOB
    internals().useOpus = false
    internals().audioBatchBuffer = []
  })

  it('met le micro en file quand l’appel est vivant', () => {
    internals().handleCapturedAudio(samples(), 0.1)

    expect(internals().audioBatchBuffer).toHaveLength(1)
  })

  it('ne met plus rien en file pendant l’attente, micro compris ouvert', () => {
    useCallStore.getState().setOnHold(true)

    internals().handleCapturedAudio(samples(), 0.1)

    expect(internals().audioBatchBuffer).toHaveLength(0)
    expect(internals().isAudioSendSuppressed()).toBe(true)
  })

  it('reprend l’émission à la reprise', () => {
    useCallStore.getState().setOnHold(true)
    internals().handleCapturedAudio(samples(), 0.1)

    useCallStore.getState().setOnHold(false)
    internals().handleCapturedAudio(samples(), 0.1)

    expect(internals().audioBatchBuffer).toHaveLength(1)
  })

  it('laisse la caméra éteinte tant que l’appel est en attente', () => {
    const table: Array<[boolean, boolean, boolean]> = [
      [false, false, false],
      [true, false, true],
      [false, true, true],
      [true, true, true],
    ]
    for (const [isCameraOff, isOnHold, expected] of table) {
      useCallStore.setState({ isCameraOff, isOnHold })
      expect(internals().isVideoSendSuppressed()).toBe(expected)
    }
  })
})

/**
 * Garde-fou statique : la vérité de l'attente se joue dans les boucles de
 * capture, porte par porte. Une porte qui relirait le seul micro, ou la seule
 * caméra, rétablirait silencieusement l'émission chez le pair — et le test
 * rendu, lui, ne verrait rien.
 */
describe('les portes d’envoi lisent l’attente', () => {
  it('ne teste plus le seul micro ou la seule caméra pour couper l’envoi', async () => {
    const source = (await import('node:fs')).readFileSync('src/services/CallService.ts', 'utf8')

    expect(source).not.toMatch(/if \(useCallStore\.getState\(\)\.isMuted\)/)
    expect(source).not.toMatch(/if \(useCallStore\.getState\(\)\.isCameraOff\)/)
    expect(source).toMatch(/if \(this\.isVideoSendSuppressed\(\)\)/)
    expect(source).toMatch(/if \(this\.isAudioSendSuppressed\(\)\)/)
  })
})
