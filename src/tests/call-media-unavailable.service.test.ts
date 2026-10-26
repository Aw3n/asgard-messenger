/**
 * Micro et caméra refusés pendant un appel.
 *
 * `getLocalMedia` lève quand aucune piste n'a pu être obtenue (permission
 * refusée, matériel absent). Trois chemins avalaient cette panne : décrocher
 * vidait l'écran du côté appelé et laissait l'appelant sonner 30 s, répondre
 * après `call:accept` laissait les deux côtés « connectés » devant une image
 * noire, et lancer un appel de groupe fermait la fenêtre sans un mot. Le
 * service doit refuser ou raccrocher chez l'autre bout et dire pourquoi.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { callService } from '@/services/CallService'
import { p2pService } from '@/services/P2PService'
import { useCallStore } from '@/stores/callStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import i18n from '@/i18n/config'
import type { CallRecord } from '@/stores/callStore'
import type { ProtocolMessage } from '@/types'

const ME = 'a'.repeat(64)
const BOB = 'b'.repeat(64)

/** jsdom n'implémente pas MediaStream : getLocalMedia construit un flux vide. */
class FakeMediaStream {
  private tracks: unknown[] = []
  getTracks() { return [...this.tracks] }
  getAudioTracks() { return [] }
  getVideoTracks() { return [] }
  addTrack(track: unknown) { this.tracks.push(track) }
}

vi.stubGlobal('MediaStream', FakeMediaStream)

function call(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id: 'call-1',
    peerId: BOB,
    peerName: 'Bob',
    type: 'audio',
    status: 'incoming',
    direction: 'incoming',
    startedAt: 1_700_000_000_000,
    missed: false,
    ...overrides,
  }
}

const mediaUnavailableToasts = () =>
  useUIStore.getState().toasts.filter((toast) => toast.title === i18n.t('calls.mediaUnavailable'))

/** Tout refus : aucune piste audio ni vidéo, y compris les replis. */
function refuseAllMedia(): void {
  const getUserMedia = vi.fn(async () => { throw new Error('NotAllowedError') })
  const enumerateDevices = vi.fn(async () => [])
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia, enumerateDevices },
    configurable: true,
    writable: true,
  })
}

function dispatch(type: 'call:accept', peerId: string): void {
  const msg = { id: 'm1', from: peerId, to: ME, type, payload: {}, timestamp: Date.now() } as unknown as ProtocolMessage
  p2pService.emit(`message:${type}`, msg)
}

beforeAll(() => {
  callService.initialize()
})

beforeEach(() => {
  vi.useFakeTimers()
  refuseAllMedia()
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'f'.repeat(128) },
      profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useCallStore.setState({
    activeCall: null,
    incomingCall: null,
    history: [],
    isMuted: false,
    isCameraOff: false,
    isOnHold: false,
    holdingPeers: [],
  })
  useUIStore.setState({ toasts: [] })
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('décrocher sans micro ni caméra', () => {
  it('refuse l’appel chez l’appelant au lieu de le laisser sonner', async () => {
    useCallStore.setState({ incomingCall: call() })

    const accepting = callService.acceptCall()
    await vi.advanceTimersByTimeAsync(5_000)
    await accepting

    expect(useCallStore.getState().incomingCall).toBeNull()
    expect(vi.mocked(p2pService.sendMessage)).toHaveBeenCalledWith(
      BOB,
      'call:reject',
      expect.objectContaining({ reason: 'media_failed' }),
    )
    expect(mediaUnavailableToasts()).toHaveLength(1)
  })
})

describe('répondre puis perdre le média', () => {
  it('raccroche chez le pair et le dit, au lieu de rester « connecté »', async () => {
    useCallStore.setState({ activeCall: call({ status: 'outgoing', direction: 'outgoing' }) })

    dispatch('call:accept', BOB)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(useCallStore.getState().activeCall).toBeNull()
    expect(vi.mocked(p2pService.sendMessage)).toHaveBeenCalledWith(BOB, 'call:end', {})
    expect(mediaUnavailableToasts()).toHaveLength(1)
  })
})

describe('appel de groupe sans média', () => {
  it('ferme la fenêtre sans envoyer d’offre et dit pourquoi', async () => {
    await callService.startGroupCall('g1', 'Équipe', [BOB], 'audio')

    expect(useCallStore.getState().activeCall).toBeNull()
    expect(vi.mocked(p2pService.sendMessage)).not.toHaveBeenCalled()
    expect(mediaUnavailableToasts()).toHaveLength(1)
  })
})
