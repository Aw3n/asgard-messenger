import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  fileExtensionOf,
  pickVideoRecorderMimeType,
  probeVideo,
  resolveAttachmentType,
  resolveMimeType,
  fileService,
} from '@/services/FileService'
import { p2pService } from '@/services/P2PService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'

/**
 * Le transfert multimédia doit fonctionner pour tous les formats, y compris
 * ceux dont le système d'exploitation ne déclare aucun type MIME (.mkv, .flac,
 * .heic…). Ces tests figent les deux décisions qui en découlent : classifier
 * par extension, et ne jamais laisser la compression préalable bloquer ou faire
 * échouer un envoi.
 */

const BLOB = 'blob:asgard/fixture'

function mediaFile(name: string, bytes: number, type = ''): File {
  const buffer = new ArrayBuffer(bytes)
  const file = new File([buffer], name, { type })
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(buffer) })
  return file
}

/** Surface minimale de `<video>` utilisée par la sonde et le réencodage. */
interface FakeVideoElement {
  preload: string
  muted: boolean
  playsInline: boolean
  videoWidth: number
  videoHeight: number
  duration: number
  src: string
  pause(): void
  load(): void
  removeAttribute(qualifiedName: string): void
  play(): Promise<void>
  onloadedmetadata: (() => void) | null
  onerror: (() => void) | null
}

/**
 * Écran d'un élément `<video>` dont on contrôle la réponse : `loaded` fait
 * démarrer la lecture, `error` signale un conteneur indécodable, `silent` ne
 * répond jamais (le cas réel d'un codec inconnu qui n'émet aucun événement).
 */
function installVideoElement(
  outcome: 'loaded' | 'error' | 'silent',
  meta = { width: 1280, height: 720, duration: 3 }
): FakeVideoElement {
  const node: FakeVideoElement = {
    preload: '',
    muted: false,
    playsInline: false,
    videoWidth: 0,
    videoHeight: 0,
    duration: 0,
    pause: () => {},
    load: () => {},
    removeAttribute: () => {},
    play: () => Promise.resolve(),
    onloadedmetadata: null,
    onerror: null,
    set src(_value: string) {
      if (outcome === 'error') node.onerror?.()
      if (outcome === 'loaded') {
        // La sonde lit `videoWidth`/`videoHeight`, pas les dimensions CSS.
        node.videoWidth = meta.width
        node.videoHeight = meta.height
        node.duration = meta.duration
        queueMicrotask(() => node.onloadedmetadata?.())
      }
    },
  }
  const createElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) =>
    tag === 'video' ? (node as unknown as HTMLElement) : createElement(tag, options)) as typeof document.createElement)
  return node
}

beforeEach(() => {
  // jsdom ne fournit pas les URL d’objet : les affecter plutôt que les espionner.
  const urls = URL as unknown as { createObjectURL: unknown; revokeObjectURL: unknown }
  urls.createObjectURL = vi.fn(() => BLOB)
  urls.revokeObjectURL = vi.fn()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('classification des fichiers sans type MIME', () => {
  it.each([
    ['video.mkv', 'video'],
    ['film.avi', 'video'],
    ['concert.flac', 'audio'],
    ['voix.opus', 'audio'],
    ['photo.heic', 'image'],
    ['archive.7z', 'document'],
    ['sans-extension', 'document'],
  ])('rang %s en %s quand le système ne donne aucun MIME', (name, expected) => {
    expect(resolveAttachmentType('', name)).toBe(expected)
  })

  it('laisse le type MIME primer sur l’extension', () => {
    expect(resolveAttachmentType('application/pdf', 'clip.mp4')).toBe('document')
  })

  it('ignore un MIME générique qui masque une extension connue', () => {
    expect(resolveAttachmentType('application/octet-stream', 'clip.mov')).toBe('video')
    expect(resolveMimeType('application/octet-stream', 'clip.mov')).toBe('video/quicktime')
  })

  it.each([
    ['video.mkv', 'video/x-matroska'],
    ['concert.flac', 'audio/flac'],
    ['photo.heic', 'image/heic'],
    ['inconnu.xyz', 'application/octet-stream'],
  ])('dérive le MIME de %s de son extension', (name, expected) => {
    expect(resolveMimeType('', name)).toBe(expected)
  })

  // Chaque format que le transfert doit reconnaître est figé ici : une faute de
  // frappe ou une clé retirée par erreur fait rougir un test au lieu de
  // dégrader silencieusement la bulle chez le destinataire.
  it.each([
    ['morceau.wav', 'audio', 'audio/wav'],
    ['nappe.aiff', 'audio', 'audio/aiff'],
    ['ancienne.au', 'audio', 'audio/basic'],
    ['flux.raw', 'audio', 'audio/L16'],
    ['bruit.pcm', 'audio', 'audio/L16'],
    ['album.flac', 'audio', 'audio/flac'],
    ['pomme.alac', 'audio', 'audio/alac'],
    ['vieux.wma', 'audio', 'audio/x-ms-wma'],
    ['chanson.mp3', 'audio', 'audio/mpeg'],
    ['casque.aac', 'audio', 'audio/aac'],
    ['sculpture.ogg', 'audio', 'audio/ogg'],
    ['voix.opus', 'audio', 'audio/opus'],
    ['gsm.amr', 'audio', 'audio/amr'],
    ['radio.mp2', 'audio', 'audio/mp2'],
    ['dolby.ac3', 'audio', 'audio/ac3'],
    ['piano.mid', 'audio', 'audio/midi'],
    ['sequence.mp4', 'video', 'video/mp4'],
    ['film.mkv', 'video', 'video/x-matroska'],
    ['cinema.avi', 'video', 'video/x-msvideo'],
    ['iphone.mov', 'video', 'video/quicktime'],
    ['windows.wmv', 'video', 'video/x-ms-wmv'],
    ['flash.flv', 'video', 'video/x-flv'],
    ['navigateur.webm', 'video', 'video/webm'],
    ['camera.mts', 'video', 'video/mp2t'],
    ['galette.m2ts', 'video', 'video/mp2t'],
    ['bande.ts', 'video', 'video/mp2t'],
    ['disque.avchd', 'video', 'video/mp2t'],
    ['promo.mpeg', 'video', 'video/mpeg'],
    ['mobile.3gp', 'video', 'video/3gpp'],
    ['mobile2.3g2', 'video', 'video/3gpp2'],
    ['theora.ogv', 'video', 'video/ogg'],
    ['lecteur.asf', 'video', 'video/x-ms-asf'],
    ['dos.zip', 'document', 'application/zip'],
    ['rarwin.rar', 'document', 'application/vnd.rar'],
    ['septz.7z', 'document', 'application/x-7z-compressed'],
    ['ruban.tar', 'document', 'application/x-tar'],
    ['source.gz', 'document', 'application/gzip'],
    ['noyau.bz2', 'document', 'application/x-bzip2'],
    ['archive.xz', 'document', 'application/x-xz'],
    ['bloc.lzma', 'document', 'application/x-lzma'],
    ['unix.z', 'document', 'application/x-compress'],
    ['lha.lzh', 'document', 'application/x-lzh-compressed'],
    ['notes.txt', 'document', 'text/plain'],
    ['facture.pdf', 'document', 'application/pdf'],
    ['lettre.doc', 'document', 'application/msword'],
    ['lettre.docx', 'document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['these.odt', 'document', 'application/vnd.oasis.opendocument.text'],
    ['courrier.rtf', 'document', 'application/rtf'],
    ['page.html', 'document', 'text/html'],
    ['vieille-page.htm', 'document', 'text/html'],
    ['roman.epub', 'document', 'application/epub+zip'],
    ['livre.mobi', 'document', 'application/x-mobipocket-ebook'],
    ['kindle.azw', 'document', 'application/vnd.amazon.ebook'],
    ['article.tex', 'document', 'application/x-tex'],
    ['README.md', 'document', 'text/markdown'],
  ])('reconnaît %s en %s / %s sans aucun MIME du système', (name, kind, mime) => {
    expect(resolveAttachmentType('', name)).toBe(kind)
    expect(resolveMimeType('', name)).toBe(mime)
  })

  it.each([
    ['/home/user/Vidéos/CLIP.MKV', 'mkv'],
    ['archive.tar.gz', 'gz'],
    ['.gitignore', ''],
    ['LICENSE', ''],
  ])('lit l’extension de %s', (name, expected) => {
    expect(fileExtensionOf(name)).toBe(expected)
  })
})

describe('probeVideo()', () => {
  it('rend le conteneur indécodable comme non compressible', async () => {
    installVideoElement('error')
    await expect(probeVideo(mediaFile('clip.avi', 10), 100)).resolves.toEqual({ decodable: false, duration: 0 })
  })

  it('rend null quand le média ne répond jamais', async () => {
    vi.useFakeTimers()
    installVideoElement('silent')
    const probing = probeVideo(mediaFile('clip.xyz', 10), 5_000)
    let settled: MediaProbeLike | undefined
    void probing.then((value) => { settled = value ?? null })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await probing).toBeNull()
    expect(settled).toBeNull()
    vi.useRealTimers()
  })

  it('mesure la durée réelle d’une vidéo lisible', async () => {
    installVideoElement('loaded', { width: 640, height: 360, duration: 7.5 })
    await expect(probeVideo(mediaFile('clip.mp4', 10), 100)).resolves.toEqual({ decodable: true, duration: 7.5 })
  })

  it('déclare non lisible une piste sans dimensions', async () => {
    installVideoElement('loaded', { width: 0, height: 0, duration: 4 })
    await expect(probeVideo(mediaFile('clip.mp4', 10), 100)).resolves.toEqual({ decodable: false, duration: 4 })
  })
})

type MediaProbeLike = { decodable: boolean; duration: number } | null

describe('pickVideoRecorderMimeType()', () => {
  it('rend null quand MediaRecorder est absent', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    expect(pickVideoRecorderMimeType()).toBeNull()
  })

  it('rend null quand aucun format n’est supporté ici', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false })
    expect(pickVideoRecorderMimeType()).toBeNull()
  })

  it('retient le premier format accepté par la machine', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (type: string) => type === 'video/webm;codecs=vp8',
    })
    expect(pickVideoRecorderMimeType()).toBe('video/webm;codecs=vp8')
  })
})

describe('compressForNetwork()', () => {
  const compressVideoSpy = () => vi.spyOn(fileService, 'compressVideo')
  const compressImageSpy = () => vi.spyOn(fileService, 'compressImage')
  const recorder = (mimeType: string | null) => vi.stubGlobal('MediaRecorder', mimeType
    ? { isTypeSupported: (type: string) => type === mimeType }
    : { isTypeSupported: () => false })

  const setMediaPrefs = (compressVideos: boolean, compressImages: boolean) => {
    const state = useUIStore.getState()
    vi.spyOn(useUIStore, 'getState').mockReturnValue({
      ...state,
      settings: { ...state.settings, media: { ...state.settings.media, compressVideos, compressImages } },
    })
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('ne touche pas à un fichier déjà petit', async () => {
    recorder('video/webm;codecs=vp8')
    setMediaPrefs(true, true)
    const file = mediaFile('petit.mp4', 1024)
    await expect(fileService.compressForNetwork(file)).resolves.toBe(file)
    expect(compressVideoSpy()).not.toHaveBeenCalled()
  })

  it('laisse audio et documents intacts, quel que soit le réglage', async () => {
    setMediaPrefs(true, true)
    for (const name of ['musique.flac', 'voix.opus', 'memoire.pdf', 'archive.rar']) {
      const file = mediaFile(name, 2 * 1024 * 1024)
      await expect(fileService.compressForNetwork(file)).resolves.toBe(file)
    }
    expect(compressVideoSpy()).not.toHaveBeenCalled()
    expect(compressImageSpy()).not.toHaveBeenCalled()
  })

  it('n’engage aucun réencodage vidéo sans codec disponible', async () => {
    recorder(null)
    setMediaPrefs(true, false)
    const file = mediaFile('clip.mkv', 2 * 1024 * 1024)
    await expect(fileService.compressForNetwork(file)).resolves.toBe(file)
    expect(compressVideoSpy()).not.toHaveBeenCalled()
  })

  it('envoie l’original quand le navigateur ne sait pas décoder la vidéo', async () => {
    recorder('video/webm;codecs=vp8')
    setMediaPrefs(true, false)
    installVideoElement('error')
    const file = mediaFile('clip.avi', 2 * 1024 * 1024)
    await expect(fileService.compressForNetwork(file)).resolves.toBe(file)
    expect(compressVideoSpy()).not.toHaveBeenCalled()
  })

  it('renonce aux vidéos trop longues plutôt que de geler le transfert', async () => {
    recorder('video/webm;codecs=vp8')
    setMediaPrefs(true, false)
    installVideoElement('loaded', { width: 1920, height: 1080, duration: 600 })
    const file = mediaFile('film.mp4', 4 * 1024 * 1024)
    await expect(fileService.compressForNetwork(file)).resolves.toBe(file)
    expect(compressVideoSpy()).not.toHaveBeenCalled()
  })

  it('garde l’original si le réencodage ne fait pas gagner de place', async () => {
    recorder('video/webm;codecs=vp8')
    setMediaPrefs(true, false)
    installVideoElement('loaded', { width: 640, height: 360, duration: 3 })
    const file = mediaFile('deja-compresse.webm', 2 * 1024 * 1024)
    const bigger = mediaFile('deja-compresse.webm', 3 * 1024 * 1024, 'video/webm')
    const spy = compressVideoSpy().mockResolvedValue({ file: bigger, ratio: 1.5 })
    await expect(fileService.compressForNetwork(file)).resolves.toBe(file)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('remplace la vidéo par le fichier réellement compressé', async () => {
    recorder('video/webm;codecs=vp8')
    setMediaPrefs(true, false)
    installVideoElement('loaded', { width: 1920, height: 1080, duration: 3 })
    const file = mediaFile('brute.mp4', 4 * 1024 * 1024)
    const smaller = mediaFile('brute.webm', 1024 * 1024, 'video/webm')
    compressVideoSpy().mockResolvedValue({ file: smaller, ratio: 0.25 })
    await expect(fileService.compressForNetwork(file)).resolves.toBe(smaller)
  })

  it('passe outre une image de compression qui échoue', async () => {
    setMediaPrefs(false, true)
    const file = mediaFile('photo.heic', 2 * 1024 * 1024)
    compressImageSpy().mockRejectedValue(new Error('Image load failed'))
    await expect(fileService.compressForNetwork(file)).resolves.toBe(file)
  })

  it('ne réencode jamais un GIF ni un SVG', async () => {
    setMediaPrefs(false, true)
    for (const name of ['anime.gif', 'schema.svg']) {
      const file = mediaFile(name, 2 * 1024 * 1024)
      await expect(fileService.compressForNetwork(file)).resolves.toBe(file)
    }
    expect(compressImageSpy()).not.toHaveBeenCalled()
  })

  it('rend l’original quand le réencodage vidéo échoue après une sonde favorable', async () => {
    recorder('video/webm;codecs=vp8')
    setMediaPrefs(true, false)
    installVideoElement('loaded', { width: 1280, height: 720, duration: 3 })
    const file = mediaFile('clip.mp4', 4 * 1024 * 1024)
    compressVideoSpy().mockRejectedValue(new Error('Video recording failed'))
    await expect(fileService.compressForNetwork(file)).resolves.toBe(file)
  })
})

describe('envoi d’un fichier sans type MIME', () => {
  beforeEach(() => {
    vi.spyOn(fileService, 'compressForNetwork').mockImplementation(async (file) => file)
    vi.spyOn(storageService, 'putBlob').mockResolvedValue('blob-key')
    vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
    vi.spyOn(p2pService, 'sendFileData').mockResolvedValue(undefined)
  })

  it('publie le type et le MIME déduits de l’extension au pair', async () => {
    await fileService.sendFile(mediaFile('seance.mkv', 300 * 1024), 'conversation', 'peer')

    const metadata = vi.mocked(p2pService.sendMessage).mock.calls
      .find(([_, type]) => type === 'file:transfer')?.[2] as { attachment: { type: string; mimeType: string } }
    expect(metadata.attachment).toMatchObject({ type: 'video', mimeType: 'video/x-matroska' })
  })

  it('classe une piste audio sans MIME d’après son extension', async () => {
    await fileService.sendFile(mediaFile('ambiant.ogg', 300 * 1024), 'conversation', 'peer')

    const metadata = vi.mocked(p2pService.sendMessage).mock.calls
      .find(([_, type]) => type === 'file:transfer')?.[2] as { attachment: { type: string } }
    expect(metadata.attachment.type).toBe('audio')
  })

  it.each([
    ['concert.wma', 'audio', 'audio/x-ms-wma'],
    ['jeu.lzh', 'document', 'application/x-lzh-compressed'],
    ['camerascript.mts', 'video', 'video/mp2t'],
  ])('transporte %s jusqu’au pair avec son type et son MIME', async (name, kind, mime) => {
    await fileService.sendFile(mediaFile(name, 300 * 1024), 'conversation', 'peer')

    const metadata = vi.mocked(p2pService.sendMessage).mock.calls
      .find(([_, type]) => type === 'file:transfer')?.[2] as {
        attachment: { type: string; mimeType: string }
        binary: boolean
      }
    expect(metadata.attachment).toMatchObject({ type: kind, mimeType: mime })
    expect(metadata.binary).toBe(true)
    expect(fileService.getTransfers()).toEqual([])
  })

  it('ne laisse aucune barre accrochée si la préparation de l’envoi échoue', async () => {
    vi.mocked(fileService.compressForNetwork).mockImplementation(async () => {
      throw new Error('sonde indisponible')
    })
    await expect(fileService.sendFile(mediaFile('clip.mp4', 300 * 1024), 'conversation', 'peer'))
      .rejects.toThrow('sonde indisponible')
    // Le rejet remonte mais ne laisse aucune barre de progression accrochée.
    expect(fileService.getTransfers()).toEqual([])
  })

  it('suivait un envoi groupé dans le widget et le retire à la fin', async () => {
    const identityState = useIdentityStore.getState()
    vi.spyOn(useIdentityStore, 'getState').mockReturnValue({
      ...identityState,
      identity: identityState.identity ?? { keyPair: { publicKey: 'k'.repeat(64) } },
    } as never)

    const seen: number[] = []
    const unsubscribe = fileService.subscribeTransfers(() => {
      for (const transfer of fileService.getTransfers()) {
        if (transfer.status === 'uploading') seen.push(transfer.progress)
      }
    })
    const attachment = await fileService.sendFileToMulticast(
      mediaFile('court-metrage.mkv', 300 * 1024),
      'group',
      ['peer-a', 'peer-b'],
      'channel'
    )
    expect(attachment.type).toBe('video')
    expect(attachment.mimeType).toBe('video/x-matroska')
    expect(seen.length).toBeGreaterThan(0)
    expect(fileService.getTransfers()).toEqual([])
    unsubscribe()
  })
})
