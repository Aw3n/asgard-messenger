/// <reference types="vitest/globals" />
/**
 * Vidéo sans contrôles natifs : lecture et pause restent possibles.
 *
 * Le réglage « afficher les contrôles » masque la barre Chromium. Avec
 * l'autoplay coupé — ou refusé par le navigateur quand la piste n'est pas
 * muette — la vidéo n'avait alors plus aucun geste de départ : un cadre figé,
 * sans même un bouton de lecture. Le bouton central reprend ce geste sans
 * réintroduire la barre native, et suit l'état réel de l'élément.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { FileAttachment } from '@/features/chat/components/FileAttachment'
import { fileService } from '@/services/FileService'
import { useUIStore } from '@/stores/uiStore'
import type { MessageAttachment } from '@/types'

// Libellés prévisibles : l'existence des clés dans les 25 langues est
// contrôlée par check:i18n et par l'audit du catalogue.
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr', changeLanguage: vi.fn() } }),
}))

const LIVE_URL = 'blob:file-service/live-video'

function videoAttachment(over: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    id: 'att-video-1',
    type: 'video',
    name: 'clip.mp4',
    size: 2_000_000,
    mimeType: 'video/mp4',
    blobKey: 'blob-key-video',
    localUrl: LIVE_URL,
    ...over,
  }
}

type MediaSettings = ReturnType<typeof useUIStore.getState>['settings']['media']
let beforeMedia: MediaSettings

function setMedia(patch: Partial<MediaSettings>): void {
  useUIStore.getState().updateSettings({ media: { ...beforeMedia, ...patch } })
}

/** `HTMLMediaElement.play` n'existe pas sous jsdom ; on le remplace par un espion. */
function stubPlayback(impl: () => Promise<void>) {
  const play = vi.fn(impl)
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { value: play, configurable: true, writable: true })
  const pause = vi.fn()
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { value: pause, configurable: true, writable: true })
  return { play, pause }
}

const videoElement = () => document.querySelector('video') as HTMLVideoElement

describe('vidéo sans barre native', () => {
  beforeEach(() => {
    beforeMedia = useUIStore.getState().settings.media
    vi.spyOn(fileService, 'isLiveUrl').mockImplementation((url?: string | null) => url === LIVE_URL)
  })

  afterEach(() => {
    cleanup()
    useUIStore.getState().updateSettings({ media: beforeMedia })
    vi.restoreAllMocks()
  })

  it('un bouton central lance la vidéo quand les contrôles sont masqués', () => {
    setMedia({ showVideoControls: false, autoPlayVideos: false })
    const { play } = stubPlayback(() => Promise.resolve())

    render(<FileAttachment attachment={videoAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)

    expect(videoElement().hasAttribute('controls')).toBe(false)
    fireEvent.click(screen.getByLabelText('chat.playVideo'))
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('le bouton devient « pause » pendant la lecture, puis revient à « lecture »', () => {
    setMedia({ showVideoControls: false, autoPlayVideos: false })
    const { pause } = stubPlayback(() => Promise.resolve())

    render(<FileAttachment attachment={videoAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)

    fireEvent(videoElement(), new Event('play'))
    fireEvent.click(screen.getByLabelText('chat.pauseVideo'))
    expect(pause).toHaveBeenCalledTimes(1)

    fireEvent(videoElement(), new Event('pause'))
    expect(screen.getByLabelText('chat.playVideo')).toBeTruthy()
  })

  it('ne double pas la barre native quand les contrôles sont affichés', () => {
    setMedia({ showVideoControls: true, autoPlayVideos: false })
    stubPlayback(() => Promise.resolve())

    render(<FileAttachment attachment={videoAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)

    expect(videoElement().hasAttribute('controls')).toBe(true)
    expect(screen.queryByLabelText('chat.playVideo')).toBeNull()
  })

  it('un autoplay refusé laisse le bouton de lecture disponible', async () => {
    setMedia({ showVideoControls: false, autoPlayVideos: true, muteByDefault: false })
    stubPlayback(() => Promise.reject(new DOMException('mock', 'NotAllowedError')))

    render(<FileAttachment attachment={videoAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)

    fireEvent.click(screen.getByLabelText('chat.playVideo'))
    // Le refus n'efface pas le fichier : le geste reste proposé.
    await waitFor(() => expect(screen.getByLabelText('chat.playVideo')).toBeTruthy())
    expect(videoElement()).toBeTruthy()
  })
})
