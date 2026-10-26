/**
 * Plafond de cache et bascules de téléchargement automatique.
 *
 * La barre « utilisé sur 500 Mo » du panneau Stockage était décorative : `cacheSize`
 * n'était lu nulle part, et `autoDownload.images` était écrit par l'interrupteur
 * sans jamais être consulté — pis, une vignette imposait la matérialisation des
 * types pourtant refusés. Ces tests fixent ce que les réglages commandent
 * réellement sur le chemin de réception, et ce que le plafond ne fait pas : il
 * refuse, il ne purge rien et ne rend jamais muet un téléchargement manuel.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fileService } from '@/services/FileService'
import { storageService } from '@/services/StorageService'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'
import type { MessageAttachment, ProtocolMessage } from '@/types'

const MB = 1024 * 1024
const BOB = 'b'.repeat(64)

interface PrivateFileService {
  willAutoDownload(type: string, size: number): Promise<boolean>
  autoDownloadBySetting(type: string, size: number): boolean
  creditCacheBytes(size: number): void
  handleIncomingFile(msg: ProtocolMessage): Promise<void>
  handleBinaryChunk(from: string, data: Uint8Array, expectMarker: boolean): Promise<void>
  handleFileComplete(msg: ProtocolMessage): Promise<void>
  cacheBytes: number | null
  cacheMeasuredAt: number
  cacheLimitAnnounced: boolean
  receiveBuffers: Map<string, { attachment: MessageAttachment }>
  completedTransferIds: Set<string>
  orphanChunks: Map<string, unknown[]>
}

const service = fileService as unknown as PrivateFileService

const beforeStorage = useUIStore.getState().settings.storage
const beforeToasts = useUIStore.getState().toasts

/** La taille que le stockage répondrait à la mesure, null = mesure impossible. */
function measure(bytes: number | null) {
  return vi.spyOn(storageService, 'getSize').mockImplementation(async () => {
    if (bytes === null) throw new Error('storage unavailable')
    return bytes
  })
}

const patchStorage = (patch: Partial<typeof beforeStorage>) =>
  useUIStore.getState().updateSettings({
    storage: { ...useUIStore.getState().settings.storage, ...patch },
  })

const autoDownload = (patch: Partial<typeof beforeStorage.autoDownload>) =>
  patchStorage({
    autoDownload: { ...useUIStore.getState().settings.storage.autoDownload, ...patch },
  })

const warnings = () => useUIStore.getState().toasts.filter((t) => t.type === 'warning')

// jsdom n'implémente pas les URL d'objet : FileService en crée une par pièce
// jointe matérialisée, et c'est précisément ce que le plafond doit empêcher.
let urlSeq = 0
beforeAll(() => {
  const url = URL as unknown as { createObjectURL: unknown; revokeObjectURL: unknown }
  url.createObjectURL = vi.fn(() => `blob:mock/${++urlSeq}`)
  url.revokeObjectURL = vi.fn()
})

let transferSeq = 0

/** metadata → chunk → complétion, sur le chemin binaire réel du service. */
async function receiveBinary(
  attachmentOverrides: Record<string, unknown> = {},
): Promise<MessageAttachment> {
  const transferId = `transfer-cache-${++transferSeq}`
  const envelope = (type: string, payload: Record<string, unknown>) => ({
    id: `envelope-${type}-${transferId}`,
    from: BOB,
    to: BOB,
    type,
    timestamp: Date.now(),
    payload: {
      attachment: { id: 'att-1', type: 'video', name: 'clip.mp4', size: 1024, mimeType: 'video/mp4', ...attachmentOverrides },
      conversationId: 'conversation-x',
      transferId,
      ...payload,
    },
  }) as unknown as ProtocolMessage

  await service.handleIncomingFile(envelope('file:transfer', { binary: true, totalChunks: 1 }))
  const attachment = service.receiveBuffers.get(transferId)!.attachment

  const id = new TextEncoder().encode(transferId)
  const bytes = new Uint8Array([1, 2, 3, 4])
  const frame = new Uint8Array(1 + id.length + bytes.length)
  frame[0] = id.length
  frame.set(id, 1)
  frame.set(bytes, 1 + id.length)
  await service.handleBinaryChunk(BOB, frame, false)

  await service.handleFileComplete(envelope('file:complete', {}))
  return attachment
}

/** Le même contrat sur le chemin inline (petit fichier porté par la metadata). */
async function receiveInline(
  attachmentOverrides: Record<string, unknown> = {},
): Promise<MessageAttachment | undefined> {
  const transferId = `transfer-inline-${++transferSeq}`
  await service.handleIncomingFile({
    id: `envelope-inline-${transferId}`,
    from: BOB,
    to: BOB,
    type: 'file:transfer',
    timestamp: Date.now(),
    payload: {
      attachment: { id: 'att-2', type: 'image', name: 'photo.png', size: 4, mimeType: 'image/png', ...attachmentOverrides },
      conversationId: 'conversation-x',
      transferId,
      fileData: btoa('abcd'),
    },
  } as unknown as ProtocolMessage)

  const threads = Object.values(useMessageStore.getState().messages).flat()
  return threads.at(-1)?.attachments?.[0]
}

/** Sortie d'une mesure fraîche sous le plafond, toutes bascules de type allumées. */
beforeEach(() => {
  service.cacheBytes = null
  service.cacheMeasuredAt = 0
  service.cacheLimitAnnounced = false
  service.receiveBuffers.clear()
  service.orphanChunks.clear()
  service.completedTransferIds.clear()
  useMessageStore.setState({ messages: {}, loading: {}, hasMore: {}, pending: {}, drafts: {}, scheduledMessages: [], templates: [] })
  useUIStore.setState({ toasts: [] })
  patchStorage({ cacheSize: 500 })
  autoDownload({ images: true, videos: true, audio: true, documents: true, maxSize: 50 })
  measure(0)
  vi.spyOn(storageService, 'putBlob').mockResolvedValue('blob-test')
  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  patchStorage(beforeStorage)
  useUIStore.setState({ toasts: beforeToasts })
})

describe('bascules par type', () => {
  it('la bascule images commande bien les images', async () => {
    expect(await service.willAutoDownload('image', 1_024)).toBe(true)

    autoDownload({ images: false })

    expect(await service.willAutoDownload('image', 1_024)).toBe(false)
  })

  it('la bascule vidéos décide seule, vignette ou non', async () => {
    autoDownload({ videos: false })

    // L'ancienne règle court-circuitait tout : `hasThumbnail` remontait vrai dès
    // que la metadata annonçait une vignette, soit la quasi-totalité des vidéos.
    expect(await service.willAutoDownload('video', 1_024)).toBe(false)

    autoDownload({ videos: true })
    expect(await service.willAutoDownload('video', 1_024)).toBe(true)
  })

  it('chaque type a sa bascule, les documents compris', async () => {
    for (const [type, key] of [
      ['audio', 'audio'],
      ['voice', 'audio'],
      ['document', 'documents'],
    ] as const) {
      autoDownload({ [key]: false })
      expect(await service.willAutoDownload(type, 1_024)).toBe(false)
      autoDownload({ [key]: true })
      expect(await service.willAutoDownload(type, 1_024)).toBe(true)
    }
  })

  it('maxSize borne les fichiers lourds, pas les images', async () => {
    autoDownload({ maxSize: 1 })

    expect(service.autoDownloadBySetting('video', 5 * MB)).toBe(false)
    expect(service.autoDownloadBySetting('video', 512 * 1024)).toBe(true)
    // Écart assumé : une image reçue se montre dans le fil, et la couper sur une
    // taille ferait disparaître des photos de téléphone sans réglage pour le dire.
    expect(service.autoDownloadBySetting('image', 5 * MB)).toBe(true)
  })
})

describe('plafond de cache', () => {
  it('refuse la matérialisation quand la mesure atteint le plafond', async () => {
    measure(600 * MB)

    expect(await service.willAutoDownload('image', 1_024)).toBe(false)
  })

  it('laisse passer sous le plafond, sans rien annoncer', async () => {
    measure(499 * MB)

    expect(await service.willAutoDownload('image', 1_024)).toBe(true)
    expect(warnings()).toHaveLength(0)
  })

  it('annonce le refus une seule fois par franchissement', async () => {
    measure(600 * MB)

    await service.willAutoDownload('image', 1_024)
    await service.willAutoDownload('video', 1_024)
    await service.willAutoDownload('document', 1_024)

    expect(warnings()).toHaveLength(1)
  })

  it('dit le plafond dans l’annonce', async () => {
    patchStorage({ cacheSize: 800 })
    measure(900 * MB)

    await service.willAutoDownload('image', 1_024)

    const toast = warnings()[0]
    // Le message vient du catalogue des 25 langues : une clé absente se verrait
    // affichée telle quelle, placeholders compris.
    expect(toast.message).not.toContain('settings.cacheLimitReached')
    expect(toast.message).toContain('800')
    expect(toast.title).not.toContain('settings.')
  })

  it('n’annonce pas un type que l’utilisateur avait déjà refusé', async () => {
    measure(600 * MB)
    autoDownload({ images: false })

    expect(await service.willAutoDownload('image', 1_024)).toBe(false)
    expect(warnings()).toHaveLength(0)
  })

  it('réarme l’annonce quand le cache redescend sous le plafond', async () => {
    measure(600 * MB)
    await service.willAutoDownload('image', 1_024)
    expect(warnings()).toHaveLength(1)

    // Vider le cache (ou relever le plafond) puis le remplir de nouveau : le
    // utilisateur doit l'entendre une deuxième fois, pas un silence éternel.
    measure(0)
    service.cacheBytes = null
    expect(await service.willAutoDownload('image', 1_024)).toBe(true)

    measure(600 * MB)
    service.cacheBytes = null
    expect(await service.willAutoDownload('image', 1_024)).toBe(false)
    expect(warnings()).toHaveLength(2)
  })

  it('une mesure qui échoue ne bloque rien', async () => {
    measure(null)

    // Repli ouvert : un sondage raté ne doit pas priver l'utilisateur de ses
    // téléchargements automatiques, ni lui annoncer un cache plein qu'il ignore.
    expect(await service.willAutoDownload('image', 1_024)).toBe(true)
    expect(warnings()).toHaveLength(0)
  })

  it('un plafond absent ou nul ne borne pas', async () => {
    patchStorage({ cacheSize: 0 })
    const getSize = measure(9_999 * MB)

    expect(await service.willAutoDownload('image', 1_024)).toBe(true)
    expect(getSize).not.toHaveBeenCalled()
  })

  it('ne palpe le stockage qu’une fois par fenêtre', async () => {
    const getSize = measure(0)

    await service.willAutoDownload('image', 1_024)
    await service.willAutoDownload('video', 1_024)
    await service.willAutoDownload('document', 1_024)

    expect(getSize).toHaveBeenCalledTimes(1)
  })

  it('remesure après la fenêtre de fraîcheur', async () => {
    const getSize = measure(0)

    await service.willAutoDownload('image', 1_024)
    service.cacheMeasuredAt -= 31_000
    await service.willAutoDownload('image', 1_024)

    expect(getSize).toHaveBeenCalledTimes(2)
  })

  it('compte les octets qu’il vient lui-même d’écrire', async () => {
    // Sans ce crédit, la mesure gardée en mémoire sous-estimerait le cache de
    // tout ce qu'une salve y a ajouté : le plafond se franchirait sans se voir.
    const getSize = measure(400 * MB)

    expect(await service.willAutoDownload('image', 1_024)).toBe(true)
    service.creditCacheBytes(120 * MB)
    expect(await service.willAutoDownload('image', 1_024)).toBe(false)
    expect(getSize).toHaveBeenCalledTimes(1)
  })

  it('refuse au plafond pile, pas seulement au-delà', async () => {
    measure(500 * MB)

    expect(await service.willAutoDownload('image', 1_024)).toBe(false)
    expect(warnings()).toHaveLength(1)
  })

  it('ne crédite pas une mesure qui n’a pas eu lieu', () => {
    service.cacheBytes = null
    service.creditCacheBytes(50 * MB)
    expect(service.cacheBytes).toBeNull()
  })
})

describe('chemin de réception réel', () => {
  // Les deux sites d'appel sont testés de bout en bout : un plafond juste dans
  // la décision mais oublié à l'endroit où la bulle se remplit ne se voit pas.
  it('matérialise une vidéo acceptée au bout du chemin binaire', async () => {
    const attachment = await receiveBinary()

    expect(attachment.blobKey).toBe('blob-test')
    expect(attachment.localUrl).toMatch(/^blob:mock\//)
  })

  it('laisse la vidéo refusée se télécharger au clic', async () => {
    autoDownload({ videos: false })

    const attachment = await receiveBinary()

    // Le blob est bel et bien sur disque : c'est la référence locale qui manque,
    // et la bulle offre alors de le charger.
    expect(attachment.blobKey).toBe('blob-test')
    expect(attachment.localUrl).toBeUndefined()
  })

  it('borne le chemin binaire au plafond et l’annonce une fois', async () => {
    measure(600 * MB)

    const first = await receiveBinary()
    const second = await receiveBinary({ id: 'att-3', name: 'clip2.mp4' })

    expect(first.localUrl).toBeUndefined()
    expect(second.localUrl).toBeUndefined()
    expect(warnings()).toHaveLength(1)
  })

  it('applique la bascule images au chemin inline', async () => {
    const accepted = await receiveInline()
    expect(accepted?.localUrl).toMatch(/^blob:mock\//)

    autoDownload({ images: false })

    const refused = await receiveInline({ id: 'att-4', name: 'photo2.png' })
    expect(refused?.blobKey).toBe('blob-test')
    expect(refused?.localUrl).toBeUndefined()
  })

  it('refuse le chemin inline au plafond, sans rien purger', async () => {
    measure(600 * MB)

    const attachment = await receiveInline({ id: 'att-5', name: 'photo3.png' })

    expect(attachment?.localUrl).toBeUndefined()
    expect(attachment?.blobKey).toBe('blob-test')
    expect(warnings()).toHaveLength(1)
  })
})
