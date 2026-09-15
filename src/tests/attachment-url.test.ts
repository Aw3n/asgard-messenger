/**
 * Cycle de vie des URL locales de pièces jointes.
 *
 * `attachment.localUrl` est une URL `blob:` créée pour la session navigateur qui
 * a reçu le fichier — mais elle est persistée avec le message. Après un
 * redémarrage la référence ne résout plus : la visionneuse affichait une image
 * cassée derrière son badge « 100 % » alors que le blob était toujours sur
 * disque. Ces tests verrouillent le contrat : une URL morte n'est jamais
 * renvoyée telle quelle, le blob est relu, et l'URL neuve est publiée dans le
 * store (mise à jour immuable, sinon ni la bulle ni la galerie ne se re-rendent).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { fileService } from '@/services/FileService'
import { storageService } from '@/services/StorageService'
import { useMessageStore } from '@/stores/messageStore'
import type { Message, MessageAttachment } from '@/types'

// jsdom n'implémente pas les URL d'objet (contrairement à Chromium) : on fournit
// le strict contrat attendu par FileService — une URL `blob:` unique par appel.
let seq = 0
beforeAll(() => {
  const url = URL as unknown as { createObjectURL: unknown; revokeObjectURL: unknown }
  url.createObjectURL = vi.fn(() => `blob:mock/${++seq}`)
  url.revokeObjectURL = vi.fn()
})

const attachment = (over: Partial<MessageAttachment> = {}): MessageAttachment => ({
  id: 'att-1',
  type: 'image',
  name: 'Avatar.webp',
  size: 128,
  mimeType: 'image/webp',
  ...over,
})

describe('FileService.isLiveUrl', () => {
  it('accepte les URL autonomes et refuse une URL de session éteinte', () => {
    expect(fileService.isLiveUrl(undefined)).toBe(false)
    expect(fileService.isLiveUrl('')).toBe(false)
    expect(fileService.isLiveUrl('data:image/jpeg;base64,miniature')).toBe(true)
    expect(fileService.isLiveUrl('https://exemple.io/photo.png')).toBe(true)
    expect(fileService.isLiveUrl('blob:https://app/00000000-0000-4000-8000-000000000000')).toBe(false)
  })
})

describe('FileService.downloadFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('relit le blob du disque au lieu de renvoyer une référence périmée', async () => {
    const dead = 'blob:https://app/session-precedente'
    const att = attachment({ localUrl: dead, blobKey: 'blob-k1' })
    const getBlob = vi.spyOn(storageService, 'getBlob').mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)

    const url = await fileService.downloadFile(att)

    expect(getBlob).toHaveBeenCalledWith('blob-k1')
    expect(url).not.toBe(dead)
    expect(fileService.isLiveUrl(url)).toBe(true)
    expect(att.localUrl).toBe(url)
  })

  it('ne relit jamais un fichier déjà résolu dans la session courante', async () => {
    const att = attachment({ blobKey: 'blob-k2' })
    const getBlob = vi.spyOn(storageService, 'getBlob').mockResolvedValue(new Uint8Array([4, 5]).buffer)

    const first = await fileService.downloadFile(att)
    const second = await fileService.downloadFile(att)

    expect(second).toBe(first)
    expect(getBlob).toHaveBeenCalledTimes(1)
  })

  it('oublie une URL libérée et en recrée une neuve si le fichier revient', async () => {
    const att = attachment({ blobKey: 'blob-k5' })
    vi.spyOn(storageService, 'getBlob').mockResolvedValue(new Uint8Array([7]).buffer)

    const first = await fileService.downloadFile(att)
    // Suppression du fichier côté store : l'URL est révoquée, le cache doit
    // l'oublier — sinon un futur blobKey réutilisé renverrait une URL morte.
    fileService.releaseLocalUrl(first)
    expect(fileService.isLiveUrl(first)).toBe(false)

    const second = await fileService.downloadFile(att)
    expect(second).not.toBe(first)
    expect(fileService.isLiveUrl(second)).toBe(true)
  })

  it('resolveLocalUrl répond null quand le fichier n’est pas encore local', async () => {
    expect(await fileService.resolveLocalUrl(attachment())).toBeNull()

    const missing = attachment({ blobKey: 'blob-absent' })
    vi.spyOn(storageService, 'getBlob').mockResolvedValue(null)
    expect(await fileService.resolveLocalUrl(missing)).toBeNull()
  })
})

describe('messageStore.setAttachmentLocalUrl', () => {
  const convId = 'conv-url'
  const message = (attachments: MessageAttachment[]): Message => ({
    id: 'msg-url',
    conversationId: convId,
    senderId: 'sender-pk',
    type: 'image',
    content: 'Avatar.webp',
    timestamp: Date.now(),
    status: 'sent',
    attachments,
  })

  beforeEach(() => {
    useMessageStore.setState({ messages: {}, loading: {}, hasMore: {}, pending: {} })
  })

  const stored = () => useMessageStore.getState().getMessages(convId)[0]?.attachments?.[0]

  it('publie l’URL neuve sans muter le message en place', () => {
    const att = attachment({ localUrl: 'blob:https://app/morte', blobKey: 'blob-k3' })
    useMessageStore.getState().addMessage(message([att]))
    const before = useMessageStore.getState().getMessages(convId)[0]

    useMessageStore.getState().setAttachmentLocalUrl('msg-url', convId, att.id, 'blob:mock/99')

    const after = useMessageStore.getState().getMessages(convId)[0]
    expect(after).not.toBe(before)
    expect(stored()?.localUrl).toBe('blob:mock/99')
    // L'objet d'origine n'est jamais touché : la bulle filtrait sur une URL
    // vivante, une mutation en place ne l'aurait pas prévenue.
    expect(before.attachments?.[0].localUrl).toBe('blob:https://app/morte')
  })

  it('reste muet quand l’URL est déjà à jour', () => {
    const att = attachment({ localUrl: 'blob:mock/1', blobKey: 'blob-k4' })
    useMessageStore.getState().addMessage(message([att]))
    const before = useMessageStore.getState().getMessages(convId)

    useMessageStore.getState().setAttachmentLocalUrl('msg-url', convId, att.id, 'blob:mock/1')

    expect(useMessageStore.getState().getMessages(convId)).toBe(before)
  })
})
