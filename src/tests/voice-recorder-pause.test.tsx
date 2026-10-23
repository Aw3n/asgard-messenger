/**
 * La pause de l'enregistreur vocal.
 *
 * `isPaused` et `pausedDurationRef` étaient déclarés, lus, jamais activés : aucun
 * bouton ne les faisait basculer et l'intervalle les relisait figés dans sa
 * closure. Le chrono défilait sur une prise que rien ne suspendait. Ce que tiennent
 * ces tests, c'est le MediaRecorder lui-même : le geste doit couper l'encodeur,
 * geler la durée, et ne pas rendre au fichier le temps passé hors micro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { VoiceMessageRecorder } from '@/features/chat/components/VoiceMessageRecorder'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

class FakeTrack {
  stopped = false
  stop() { this.stopped = true }
}

class FakeStream {
  tracks = [new FakeTrack(), new FakeTrack()]
  getTracks() { return [...this.tracks] }
}

type RecorderState = 'inactive' | 'recording' | 'paused'

class FakeRecorder {
  static instances: FakeRecorder[] = []
  state: RecorderState = 'inactive'
  stream: FakeStream
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  pauseCount = 0
  resumeCount = 0
  stopCount = 0

  constructor(stream: FakeStream) {
    this.stream = stream
    FakeRecorder.instances.push(this)
  }

  start() { this.state = 'recording' }
  pause() {
    if (this.state !== 'recording') throw new Error('pause hors enregistrement')
    this.pauseCount++
    this.state = 'paused'
  }
  resume() {
    if (this.state !== 'paused') throw new Error('reprise hors pause')
    this.resumeCount++
    this.state = 'recording'
  }
  stop() {
    this.stopCount++
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['des-octets-audio'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

/** Encodeur muet : rien à suspendre, donc rien à proposer à l'écran. */
class BareRecorder extends FakeRecorder {
  pause = undefined as unknown as () => void
  resume = undefined as unknown as () => void
}

const recorder = () => FakeRecorder.instances[FakeRecorder.instances.length - 1]

async function mountRecorder(Recorder: typeof FakeRecorder = FakeRecorder) {
  FakeRecorder.instances = []
  vi.stubGlobal('MediaRecorder', Recorder as unknown as typeof MediaRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(async () => new FakeStream()) },
    configurable: true,
    writable: true,
  })
  const onSend = vi.fn()
  const onCancel = vi.fn()
  render(<VoiceMessageRecorder onSend={onSend} onCancel={onCancel} />)
  // L'acquisition est une promesse : la bande ne devient cliquable qu'après.
  await act(async () => {})
  return { onSend, onCancel }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('bouton de pause de l’enregistreur vocal', () => {
  it('se montre quand l’encodeur sait réellement suspendre', async () => {
    await mountRecorder()
    expect(screen.getByLabelText('chat.pauseRecording')).toBeTruthy()
  })

  it('ne se montre pas quand l’encodeur ne sait pas suspendre', async () => {
    await mountRecorder(BareRecorder)
    expect(screen.queryByLabelText('chat.pauseRecording')).toBeNull()
  })

  it('suspend l’encodeur et rend le nom accessible de la reprise', async () => {
    await mountRecorder()
    fireEvent.click(screen.getByLabelText('chat.pauseRecording'))
    expect(recorder().pauseCount).toBe(1)
    expect(recorder().state).toBe('paused')
    expect(screen.getByLabelText('chat.resumeRecording')).toBeTruthy()
  })

  it('rouvre l’encodeur quand on reprend', async () => {
    await mountRecorder()
    fireEvent.click(screen.getByLabelText('chat.pauseRecording'))
    fireEvent.click(screen.getByLabelText('chat.resumeRecording'))
    expect(recorder().resumeCount).toBe(1)
    expect(recorder().state).toBe('recording')
    expect(screen.getByLabelText('chat.pauseRecording')).toBeTruthy()
  })
})

describe('durée pendant la pause', () => {
  it('s’arrête de défiler au lieu de courir sur le silence', async () => {
    await mountRecorder()
    act(() => { vi.advanceTimersByTime(3_200) })
    expect(screen.getByText('0:03')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('chat.pauseRecording'))
    act(() => { vi.advanceTimersByTime(5_000) })
    expect(screen.getByText('0:03')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('chat.resumeRecording'))
    act(() => { vi.advanceTimersByTime(1_200) })
    expect(screen.getByText('0:04')).toBeTruthy()
  })

  it('ne rend pas le temps suspendu au message envoyé', async () => {
    const { onSend } = await mountRecorder()
    act(() => { vi.advanceTimersByTime(2_200) })
    fireEvent.click(screen.getByLabelText('chat.pauseRecording'))
    act(() => { vi.advanceTimersByTime(10_000) })
    fireEvent.click(screen.getByLabelText('chat.sendVoiceMessage'))

    expect(onSend).toHaveBeenCalledTimes(1)
    const [blob, sentDuration] = onSend.mock.calls[0] as [Blob, number]
    expect(sentDuration).toBe(2)
    expect(blob.size).toBeGreaterThan(0)
    expect(recorder().stopCount).toBe(1)
    // Le micro doit se libérer à l'envoi comme à l'annulation : une piste laissée
    // ouverte garde le bandeau d'accès allumé après le message.
    expect(recorder().stream.getTracks().every((track) => track.stopped)).toBe(true)
  })

  it('coupe les pistes à l’annulation et n’envoie rien', async () => {
    const { onSend, onCancel } = await mountRecorder()
    act(() => { vi.advanceTimersByTime(1_200) })
    fireEvent.click(screen.getByLabelText('chat.cancelRecording'))

    expect(onSend).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(recorder().stream.getTracks().every((track) => track.stopped)).toBe(true)
  })
})
