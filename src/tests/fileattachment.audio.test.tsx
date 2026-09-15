// c:\Users\Ael\Desktop\Asgard!\src\tests\fileattachment.audio.test.tsx
/// <reference types="vitest/globals" />
/**
 * Verrous du widget de pièce jointe audio.
 *
 * Le signalement d'origine montrait le lecteur natif de Chromium (`controls`),
 * dont la barre violette ne suit pas le thème, avec le bouton « supprimer »
 * posé en surimpression juste au-dessus de la taille du fichier. Ces tests
 * gèlent ce qui a été corrigé et, surtout, les deux comportements qui ne se
 * voient pas sur une capture :
 *   - un rejet *transitoire* de `play()` ne doit pas faire croire que le
 *     fichier a disparu (sinon le lecteur se transforme en bouton de
 *     téléchargement alors que tout est en place) ;
 *   - la récupération du fichier doit publier son URL dans le store, sinon le
 *     widget reste bloqué sur « télécharger » même une fois le blob lu.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { FileAttachment } from '@/features/chat/components/FileAttachment'
import { fileService } from '@/services/FileService'
import { useMessageStore } from '@/stores/messageStore'
import type { MessageAttachment } from '@/types'

// Libellés prévisibles : on teste le câblage des clés, pas le vocabulaire (la
// détection de langue rendrait les textes instables). L'existence réelle des
// clés dans les 25 locales est vérifiée par scripts/verify-audio-keys.mjs.
vi.mock('react-i18next', () => ({
  // `src/i18n/config.ts`, chargé en transit par StorageService, s'enregistre
  // auprès du plugin React : le mock doit le fournir.
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr', changeLanguage: vi.fn() } }),
}))

const LIVE_URL = 'blob:file-service/live-audio'
const LIVE_URL_B = 'blob:file-service/live-audio-b'

function audioAttachment(over: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    id: 'att-audio-1',
    type: 'audio',
    name: 'hello.ogg',
    size: 76_089,
    mimeType: 'audio/ogg',
    blobKey: 'blob-key-1',
    localUrl: LIVE_URL,
    ...over,
  }
}

/** `live` = les URL que le service reconnaît comme encore valides. */
function stubFileService(live: string[]) {
  return vi.spyOn(fileService, 'isLiveUrl')
    .mockImplementation((url?: string | null) => !!url && live.includes(String(url)))
}

/** `HTMLMediaElement.play` n'existe pas sous jsdom ; on le remplace par un espion. */
function stubPlayback(impl: () => Promise<void>) {
  const play = vi.fn(impl)
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { value: play, configurable: true, writable: true })
  const pause = vi.fn()
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { value: pause, configurable: true, writable: true })
  return { play, pause }
}

function rejectWith(name: string): Promise<never> {
  return Promise.reject(new DOMException('mock', name))
}

/** Simule la fin du chargement des métadonnées, source de la durée affichée. */
function emitMetadata(seconds: number) {
  const el = document.querySelector('audio') as HTMLAudioElement
  expect(el).toBeTruthy()
  Object.defineProperty(el, 'duration', { value: seconds, configurable: true })
  fireEvent(el, new Event('loadedmetadata'))
  return el
}

const rowOf = () => document.querySelector('.group.relative') as HTMLElement

describe('widget audio d’une pièce jointe', () => {
  beforeEach(() => {
    stubFileService([LIVE_URL, LIVE_URL_B])
    vi.spyOn(fileService, 'resolveLocalUrl').mockResolvedValue(LIVE_URL)
    stubPlayback(() => Promise.resolve())
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('ne délègue plus le rendu des contrôles au navigateur', () => {
    render(<FileAttachment attachment={audioAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)
    const el = document.querySelector('audio') as HTMLAudioElement
    expect(el).toBeTruthy()
    // L'attribut `controls` est exactement ce qui produisait la barre native.
    expect(el.hasAttribute('controls')).toBe(false)
    expect(el.getAttribute('preload')).toBe('metadata')
    expect(document.querySelector('input[type="range"]')).toBeTruthy()
  })

  it('affiche ext, taille et durée plutôt que le nom répété', () => {
    render(<FileAttachment attachment={audioAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)
    emitMetadata(12.5)
    const row = rowOf()
    expect(row.textContent).toContain('OGG · 74.3 KB')
    expect(row.textContent).toContain('0:12')
    // Le nom est déjà le texte du message : le répéter dans la pastille la charge.
    expect(row.textContent).not.toContain('hello.ogg')
  })

  it('réserve la place du bouton supprimer sur un message mien', () => {
    render(<FileAttachment attachment={audioAttachment()} isOwn messageId="m1" conversationId="c1" />)
    emitMetadata(3)
    expect(rowOf().className).toContain('pr-10')
    expect(document.querySelector('button.absolute')).toBeTruthy()
    cleanup()
    render(<FileAttachment attachment={audioAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)
    emitMetadata(3)
    // Côté réception, il n'y a pas de corbeille : rien n'est volé à la piste.
    expect(rowOf().className).not.toContain('pr-10')
    expect(document.querySelector('button.absolute')).toBeNull()
  })

  it('garde le lecteur quand play() rejette pour une raison transitoire', async () => {
    stubPlayback(() => rejectWith('AbortError'))
    render(<FileAttachment attachment={audioAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)
    emitMetadata(8)
    fireEvent.click(screen.getByLabelText('chat.playAudio'))
    await waitFor(() => expect(document.querySelector('audio')).toBeTruthy())
    // `AbortError` = pause() pendant le chargement ; le fichier est bien là.
    expect(document.querySelector('input[type="range"]')).toBeTruthy()
    expect(screen.queryByLabelText('chat.downloadFile')).toBeNull()
  })

  it('propose la récupération quand le fichier n’est plus lisible', async () => {
    stubPlayback(() => rejectWith('NotSupportedError'))
    render(<FileAttachment attachment={audioAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)
    emitMetadata(8)
    fireEvent.click(screen.getByLabelText('chat.playAudio'))
    await waitFor(() => expect(screen.getByLabelText('chat.downloadFile')).toBeTruthy())
    expect(document.querySelector('input[type="range"]')).toBeNull()
  })

  it('publie l’URL récupérée pour que le lecteur réapparaisse', async () => {
    const published = vi.spyOn(useMessageStore.getState(), 'setAttachmentLocalUrl')
    const att = audioAttachment({ localUrl: undefined })
    render(<FileAttachment attachment={att} isOwn={false} messageId="m1" conversationId="c1" />)
    expect(document.querySelector('input[type="range"]')).toBeNull()
    fireEvent.click(screen.getByLabelText('chat.downloadFile'))
    await waitFor(() => expect(published).toHaveBeenCalledWith('m1', 'c1', 'att-audio-1', LIVE_URL))
  })

  it('ne laisse qu’un seul extrait jouer à la fois', async () => {
    const play = vi.fn(() => Promise.resolve())
    const pause = vi.fn()
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { value: play, configurable: true, writable: true })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { value: pause, configurable: true, writable: true })
    render(
      <div>
        <FileAttachment attachment={audioAttachment()} isOwn={false} messageId="m1" conversationId="c1" />
        <FileAttachment attachment={audioAttachment({ id: 'att-audio-2', localUrl: LIVE_URL_B })} isOwn={false} messageId="m2" conversationId="c1" />
      </div>,
    )
    const first = document.querySelectorAll('audio')[0]
    Object.defineProperty(first, 'duration', { value: 5, configurable: true })
    fireEvent(first, new Event('loadedmetadata'))
    // Les deux boutons sont saisis avant tout clic : une fois la lecture
    // déclarée, le premier change d'étiquette et n'est plus « playAudio ».
    const [buttonA, buttonB] = screen.getAllByLabelText('chat.playAudio')
    fireEvent.click(buttonA)
    // Sous jsdom l'élément ne joue vraiment pas : `paused` reste à true, seul
    // l'appel à `play()` compte pour la suite du scénario.
    expect(first.paused).toBe(true)
    fireEvent(first, new Event('play'))
    expect(buttonA.getAttribute('aria-label')).toBe('chat.pauseAudio')
    fireEvent.click(buttonB)
    // Le premier lecteur est celui qui doit être mis en pause par le registre.
    expect(pause).toHaveBeenCalledTimes(1)
    expect(pause.mock.instances[0]).toBe(first)
  })

  it('met en pause et libère le slot unique au démontage', () => {
    const pause = vi.fn()
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { value: pause, configurable: true, writable: true })
    const view = render(<FileAttachment attachment={audioAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)
    emitMetadata(5)
    fireEvent.click(screen.getByLabelText('chat.playAudio'))
    const el = document.querySelector('audio') as HTMLAudioElement
    fireEvent(el, new Event('play'))
    pause.mockClear()
    view.unmount()
    expect(pause).toHaveBeenCalledTimes(1)
    expect(pause.mock.instances[0]).toBe(el)
  })

  it('cherche à la position demandée sur la piste', () => {
    render(<FileAttachment attachment={audioAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)
    const el = emitMetadata(10)
    const range = document.querySelector('input[type="range"]') as HTMLInputElement
    expect(range.disabled).toBe(false)
    expect(Number(range.max)).toBe(10)
    fireEvent.change(range, { target: { value: '4' } })
    expect(el.currentTime).toBe(4)
  })

  it('reste inutilisable tant que la durée est inconnue', () => {
    render(<FileAttachment attachment={audioAttachment()} isOwn={false} messageId="m1" conversationId="c1" />)
    const range = document.querySelector('input[type="range"]') as HTMLInputElement
    // Pas de durée = pas de pouce : la piste est là mais ne se manipule pas.
    expect(range.disabled).toBe(true)
    expect(range.max).toBe('0')
  })
})
