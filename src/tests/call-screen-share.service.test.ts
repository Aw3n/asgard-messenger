/**
 * Partage d'écran : le bouton ne doit pas prétendre partager quand le
 * sélecteur est annulé, et la caméra doit revenir vivante à la fin.
 *
 * Le code précédent basculait `isScreenSharing` dans son `catch` — annuler le
 * sélecteur allumait donc le bouton « Écran » sans aucun flux. Il rangeait
 * aussi la piste caméra après l'avoir stoppée : une piste stoppée ne rend plus
 * d'images, la caméra restait noire après le partage.
 *
 * jsdom ne fournit ni MediaStream, ni getDisplayMedia, ni getUserMedia : les
 * pistes façonnées sont les observables — attachée au flux local, stoppée,
 * réacquise, `enabled`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/MediaDeviceService', () => ({
  mediaDeviceService: {
    getPreferences: () => ({ audioInput: null, videoInput: null, audioOutput: null }),
    buildCallConstraints: (kind: 'audio' | 'video') => (kind === 'audio'
      ? { audio: true, video: false }
      : { audio: false, video: { width: 640, height: 480 } }),
  },
}))

import { callService } from '@/services/CallService'
import { useCallStore } from '@/stores/callStore'

interface FakeTrack {
  kind: 'audio' | 'video'
  label: string
  enabled: boolean
  stopped: boolean
  onended: (() => void) | null
  stop(): void
  getSettings(): Record<string, unknown>
}

function fakeTrack(kind: 'audio' | 'video', enabled = true): FakeTrack {
  const track: FakeTrack = {
    kind,
    label: `fake-${kind}-${Math.random()}`,
    enabled,
    stopped: false,
    onended: null,
    // `stop()` n'émet pas `ended` (spec) : seul l'arrêt par le système le fait.
    stop: () => { track.stopped = true },
    getSettings: () => ({}),
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
  screenTrack: FakeTrack | null
}

let getDisplayMedia: ReturnType<typeof vi.fn>
let getUserMedia: ReturnType<typeof vi.fn>
let camera: FakeTrack

function stubMediaDevices(options: { display?: () => Promise<MediaStream>; camera?: () => Promise<MediaStream> } = {}) {
  getDisplayMedia = vi.fn(options.display ?? (async () => new FakeMediaStream([fakeTrack('video')])))
  getUserMedia = vi.fn(options.camera ?? (async () => new FakeMediaStream([fakeTrack('video')])))
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getDisplayMedia, getUserMedia },
    configurable: true,
    writable: true,
  })
}

function attachCallStream() {
  camera = fakeTrack('video')
  internals.localStream = new FakeMediaStream([fakeTrack('audio'), camera])
  internals.screenTrack = null
}

const sharing = () => useCallStore.getState().isScreenSharing
const videoTracks = () => internals.localStream?.getVideoTracks() ?? []

beforeEach(() => {
  vi.restoreAllMocks()
  useCallStore.setState({ isScreenSharing: false, isCameraOff: false })
  attachCallStream()
  stubMediaDevices()
})

afterEach(() => {
  useCallStore.setState({ isScreenSharing: false, isCameraOff: false })
  internals.localStream = null
  internals.screenTrack = null
})

describe('partage d’écran', () => {
  it('un sélecteur annulé laisse l’appel sans partage', async () => {
    stubMediaDevices({
      display: async () => { throw new DOMException('Permission denied', 'NotAllowedError') },
    })

    await callService.toggleScreenShare()

    expect(sharing()).toBe(false)
    expect(getDisplayMedia).toHaveBeenCalledTimes(1)
    // La caméra n'a pas été touchée : l'appel continue comme avant.
    expect(videoTracks()).toEqual([camera])
    expect(camera.stopped).toBe(false)
  })

  it('le partage remplace la caméra par l’écran', async () => {
    await callService.toggleScreenShare()

    const screen = internals.screenTrack
    expect(sharing()).toBe(true)
    expect(screen).not.toBeNull()
    expect(videoTracks()).toEqual([screen])
    expect(camera.stopped).toBe(true)
  })

  it('arrêter le partage redemande la caméra au lieu de rallumer une piste morte', async () => {
    await callService.toggleScreenShare()
    const screen = internals.screenTrack as FakeTrack

    await callService.toggleScreenShare()

    expect(sharing()).toBe(false)
    expect(screen.stopped).toBe(true)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    const [constraints] = getUserMedia.mock.calls[0]
    expect(constraints).toEqual({ video: { width: 640, height: 480 } })

    const [restored] = videoTracks()
    expect(restored).not.toBe(camera)
    expect(restored.stopped).toBe(false)
    expect(restored.enabled).toBe(true)
  })

  it('un arrêt depuis le sélecteur du système ramène aussi la caméra', async () => {
    await callService.toggleScreenShare()
    const screen = internals.screenTrack as FakeTrack

    screen.onended?.()

    await vi.waitFor(() => expect(sharing()).toBe(false))
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(videoTracks()[0].stopped).toBe(false)
  })

  it('une caméra déjà coupée ne se rallume pas après le partage', async () => {
    camera.enabled = false

    await callService.toggleScreenShare()
    await callService.toggleScreenShare()

    expect(sharing()).toBe(false)
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(videoTracks()).toEqual([])
  })

  it('basculer la caméra pendant le partage ne fige pas l’écran', async () => {
    await callService.toggleScreenShare()
    const screen = internals.screenTrack as FakeTrack

    await callService.toggleCamera()

    expect(screen.enabled).toBe(true)
    expect(useCallStore.getState().isCameraOff).toBe(true)

    await callService.toggleScreenShare()
    // L'intention « caméra coupée » est appliquée à la piste réacquise.
    expect(videoTracks()[0].enabled).toBe(false)
    expect(videoTracks()[0].stopped).toBe(false)
  })

  it('sans flux local, rien n’est demandé au sélecteur', async () => {
    internals.localStream = null

    await callService.toggleScreenShare()

    expect(getDisplayMedia).not.toHaveBeenCalled()
    expect(sharing()).toBe(false)
  })
})
