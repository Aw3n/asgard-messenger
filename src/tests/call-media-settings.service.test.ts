/**
 * Le panneau de réglages d'un appel affichait trois boutons qui ne commandaient
 * rien : un `useState` local que CallService ne lisait jamais. Il lit et écrit
 * maintenant l'état du service — ces tests suivent le trajet entier, pas le rendu.
 *
 * jsdom n'implémente ni MediaStream ni getUserMedia : les pistes sont des objets
 * façonnés qui enregistrent les consignes reçues. « la piste de micro a bien reçu
 * noiseSuppression: false » se lit sur le fil réel ; « le bouton est bleu » ne se
 * lit nulle part.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/MediaDeviceService', () => ({
  mediaDeviceService: {
    getPreferences: () => ({ audioInput: null, videoInput: null, audioOutput: null }),
    buildCallConstraints: (kind: 'audio' | 'video') => (kind === 'audio'
      ? { audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true }, video: false }
      : { audio: false, video: true }),
  },
}))

import { callService } from '@/services/CallService'
import { useCallStore } from '@/stores/callStore'
import { useUIStore } from '@/stores/uiStore'

interface FakeTrack {
  kind: 'audio' | 'video'
  label: string
  contentHint: string
  /** Consignes successivement appliquées à la piste — l'observable du test. */
  applied: Record<string, unknown>[]
  getConstraints(): Record<string, unknown>
  applyConstraints(c: Record<string, unknown>): Promise<void>
  stop(): void
}

function fakeTrack(kind: 'audio' | 'video', constraints: Record<string, unknown> = {}): FakeTrack {
  const track: FakeTrack = {
    kind,
    label: `fake-${kind}`,
    contentHint: '',
    applied: [],
    getConstraints: () => constraints,
    applyConstraints: async (c) => { track.applied.push(c) },
    stop: () => {},
  }
  return track
}

class FakeMediaStream {
  tracks: FakeTrack[]
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = tracks
  }
  getTracks() { return [...this.tracks] }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio') }
  getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video') }
  addTrack(track: FakeTrack) { this.tracks.push(track) }
  removeTrack(track: FakeTrack) { this.tracks = this.tracks.filter((t) => t !== track) }
}

vi.stubGlobal('MediaStream', FakeMediaStream)

const internals = callService as unknown as {
  localStream: FakeMediaStream | null
  getLocalMedia: (type: 'audio' | 'video') => Promise<MediaStream>
}

const beforeMedia = { ...useUIStore.getState().settings.media }

/** Pistes de l'appel courant : micro + caméra, avec leurs consignes d'origine. */
function attachStream(micConstraints: Record<string, unknown> = {}) {
  const mic = fakeTrack('audio', micConstraints)
  const cam = fakeTrack('video')
  internals.localStream = new FakeMediaStream([mic, cam])
  return { mic, cam }
}

/** Ce que le device renverrait à l'acquisition. */
function stubGetUserMedia(tracks: FakeTrack[]) {
  const getUserMedia = vi.fn(async () => new FakeMediaStream(tracks))
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
    writable: true,
  })
  return getUserMedia
}

const acquire = () => internals.getLocalMedia.bind(callService)('audio')

beforeEach(() => {
  // Comme au sortir d'une acquisition réussie : les deux traitements demandés
  // sont allumés, aucune qualité imposée. Par l'API publique, sans toucher aux
  // champs privés du service.
  callService.setNoiseSuppression(true)
  callService.setEchoCancellation(true)
  callService.setVideoQuality('auto')
})

afterEach(() => {
  internals.localStream = null
  useUIStore.getState().updateSettings({ media: beforeMedia })
  callService.setVideoQuality('auto')
})

describe('CallService — qualité vidéo appliquée en appel', () => {
  it('abaisse le plafond d’envoi et requiert la caméra à la nouvelle taille', () => {
    const { cam } = attachStream()

    callService.setVideoQuality('low')

    expect(useCallStore.getState().videoQuality).toBe('low')
    expect(callService.getVideoQualityCeiling()).toEqual({ width: 640, height: 360 })
    expect(cam.applied.at(-1)).toEqual({ width: { ideal: 640 }, height: { ideal: 360 } })
  })

  it('rend la main à l’adaptatif sans imposer de taille à la caméra', () => {
    const { cam } = attachStream()
    callService.setVideoQuality('low')
    const afterLow = cam.applied.length

    callService.setVideoQuality('auto')

    expect(useCallStore.getState().videoQuality).toBe('auto')
    expect(callService.getVideoQualityCeiling()).toEqual({ width: 960, height: 540 })
    // 'auto', c'est aucun plafond personnel : la caméra garde ce qu'elle fait.
    expect(cam.applied).toHaveLength(afterLow)
  })

  it('marche sans caméra : le store et le plafond bougent, rien ne casse', () => {
    internals.localStream = null

    callService.setVideoQuality('medium')

    expect(useCallStore.getState().videoQuality).toBe('medium')
    expect(callService.getVideoQualityCeiling()).toEqual({ width: 854, height: 480 })
  })
})

describe('CallService — traitement du micro appliqué en appel', () => {
  it('propage la réduction de bruit et l’anti-écho à la piste de micro', () => {
    const { mic } = attachStream({ noiseSuppression: true, echoCancellation: true, autoGainControl: true })

    callService.setNoiseSuppression(false)

    expect(mic.applied.at(-1)).toEqual({ echoCancellation: true, noiseSuppression: false })
    expect(callService.getAudioProcessingStatus().noiseReduction).toBe(false)

    callService.setEchoCancellation(false)

    expect(mic.applied.at(-1)).toEqual({ echoCancellation: false, noiseSuppression: false })
    expect(callService.getAudioProcessingStatus().echoCancellation).toBe(false)
  })

  it('ne touche pas l’auto-gain : applyConstraints remplace ce qu’il nomme', () => {
    const { mic } = attachStream({ noiseSuppression: true, echoCancellation: true, autoGainControl: true })

    callService.setNoiseSuppression(true)
    callService.setEchoCancellation(false)

    // Nommer autoGainControl ici l'éteindrait au premier clic sur un autre
    // commutateur : ce que la piste a obtenu à l'acquisition doit survivre.
    expect(mic.applied).toHaveLength(2)
    for (const constraints of mic.applied) {
      expect(constraints).not.toHaveProperty('autoGainControl')
    }
  })

  it('sans micro, le drapeau suit la demande et rien ne casse', () => {
    internals.localStream = null

    callService.setNoiseSuppression(false)
    expect(callService.getAudioProcessingStatus().noiseReduction).toBe(false)

    callService.setNoiseSuppression(true)
    expect(callService.getAudioProcessingStatus().noiseReduction).toBe(true)
  })
})

describe('CallService — l’acquisition aligne l’état du panneau', () => {
  it('lit le traitement réellement obtenu par la piste de micro', async () => {
    const mic = fakeTrack('audio', { noiseSuppression: false, echoCancellation: true, autoGainControl: true })
    stubGetUserMedia([mic])

    await acquire()

    // Un micro qui refuse la réduction de bruit doit l'afficher éteinte : sinon
    // le commutateur du panneau reste bleu sans rien derrière.
    expect(callService.getAudioProcessingStatus()).toMatchObject({
      noiseReduction: false,
      echoCancellation: true,
      autoGainControl: true,
    })
  })

  it('repasse au plafond de la préférence et l’affiche comme choix en cours', async () => {
    stubGetUserMedia([fakeTrack('audio', {})])
    callService.setVideoQuality('low')
    useUIStore.getState().updateSettings({ media: { ...beforeMedia, videoQuality: 'medium' as const } })

    await acquire()

    // L'override d'appel ne survit pas à l'appel suivant : la préférence reprend
    // la main, et le panneau doit montrer « Moyenne », pas le dernier clic.
    expect(useCallStore.getState().videoQuality).toBe('medium')
    expect(callService.getVideoQualityCeiling()).toEqual({ width: 854, height: 480 })
  })
})
