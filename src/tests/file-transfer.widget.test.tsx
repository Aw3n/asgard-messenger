import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActiveTransfersWidget } from '@/features/chat/components/ActiveTransfersWidget'
import { FileAttachment } from '@/features/chat/components/FileAttachment'
import { fileService, PeerUnreachableError, SEND_DIAL_TIMEOUT_MS } from '@/services/FileService'
import { p2pService } from '@/services/P2PService'
import { storageService } from '@/services/StorageService'
import type { MessageAttachment } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function video(name = 'video.mp4', chunks = 1) {
  const buffer = new ArrayBuffer(chunks * 256 * 1024)
  const file = new File([buffer], name, { type: 'video/mp4' })
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(buffer) })
  return file
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(fileService, 'compressForNetwork').mockImplementation(async file => file)
  vi.spyOn(storageService, 'putBlob').mockResolvedValue('test-blob')
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'sendFileData').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'isPeerConnected').mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('widget de transfert vidéo', () => {
  it('apparaît immédiatement pendant la compression, puis reste jusqu’à la fin de l’envoi', async () => {
    const compression = deferred<File>()
    const chunk = deferred<void>()
    const completion = deferred<void>()
    vi.mocked(fileService.compressForNetwork).mockReturnValue(compression.promise)
    vi.mocked(p2pService.sendFileData).mockReturnValue(chunk.promise)
    vi.mocked(p2pService.sendMessage).mockImplementation(async (_peer, type) => {
      if (type === 'file:complete') await completion.promise
    })
    render(<ActiveTransfersWidget />)
    let sending!: ReturnType<typeof fileService.sendFile>
    act(() => { sending = fileService.sendFile(video(), 'conversation', 'peer') })

    expect(screen.getByText('video.mp4')).toBeInTheDocument()
    expect(screen.getByText('chat.sendingFile')).toBeInTheDocument()
    expect(fileService.getTransfers()[0].progress).toBe(0)
    expect(p2pService.sendFileData).not.toHaveBeenCalled()

    await act(async () => { compression.resolve(video('video.webm')) })
    expect(screen.getByText('video.webm')).toBeInTheDocument()
    expect(p2pService.sendFileData).toHaveBeenCalledTimes(1)
    expect(p2pService.sendMessage).not.toHaveBeenCalledWith('peer', 'file:complete', expect.anything())

    await act(async () => { chunk.resolve() })
    expect(screen.getByText('video.webm')).toBeInTheDocument()
    expect(fileService.getTransfers()[0]).toMatchObject({ progress: 99, status: 'uploading' })
    await act(async () => { completion.resolve(); await sending })
    expect(screen.queryByText('chat.sendingFile')).not.toBeInTheDocument()
    expect(fileService.getTransfers()).toEqual([])
  })

  it('borne les chunks en vol à quatre même après les premières résolutions', async () => {
    const chunks: ReturnType<typeof deferred<void>>[] = []
    vi.mocked(p2pService.sendFileData).mockImplementation(() => {
      const chunk = deferred<void>()
      chunks.push(chunk)
      return chunk.promise
    })
    const sending = fileService.sendFile(video('longue.mp4', 9), 'conversation', 'peer')
    await waitFor(() => expect(chunks).toHaveLength(4))
    chunks[0].resolve()
    await waitFor(() => expect(chunks).toHaveLength(5))
    expect(fileService.getTransfers()[0].progress).toBe(11)
    chunks[1].resolve()
    await waitFor(() => expect(chunks).toHaveLength(6))
    expect(p2pService.sendMessage).not.toHaveBeenCalledWith('peer', 'file:complete', expect.anything())
    vi.mocked(p2pService.sendFileData).mockResolvedValue(undefined)
    for (const chunk of chunks) chunk.resolve()
    await sending
    expect(p2pService.sendFileData).toHaveBeenCalledTimes(9)
    expect(fileService.getTransfers()).toEqual([])
  })

  it('retire uniquement le transfert échoué et conserve l’autre vidéo active', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    vi.mocked(p2pService.sendFileData)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    render(<ActiveTransfersWidget />)
    let a!: ReturnType<typeof fileService.sendFile>
    let b!: ReturnType<typeof fileService.sendFile>
    await act(async () => {
      a = fileService.sendFile(video('premiere.mp4'), 'conversation', 'peer')
      b = fileService.sendFile(video('seconde.mp4'), 'conversation', 'peer')
    })
    expect(screen.getByText('premiere.mp4')).toBeInTheDocument()
    expect(screen.getByText('seconde.mp4')).toBeInTheDocument()
    const failed = expect(a).rejects.toThrow('déconnecté')
    await act(async () => { first.reject(new Error('déconnecté')); await failed })
    expect(screen.queryByText('premiere.mp4')).not.toBeInTheDocument()
    expect(screen.getByText('seconde.mp4')).toBeInTheDocument()
    await act(async () => { second.resolve(); await b })
    expect(fileService.getTransfers()).toEqual([])
  })

  it('n’annonce jamais file:complete quand un chunk échoue hors de la fenêtre de course', async () => {
    const chunks: ReturnType<typeof deferred<void>>[] = []
    vi.mocked(p2pService.sendFileData).mockImplementation(() => {
      const chunk = deferred<void>()
      chunks.push(chunk)
      return chunk.promise
    })
    const sending = fileService.sendFile(video('tronquee.mp4', 9), 'conversation', 'peer')
    await waitFor(() => expect(chunks).toHaveLength(4))

    // Le chunk 0 gagne la course, le chunk 2 échoue dans le même lot : sa perte
    // n'est plus visible depuis Promise.race, c'était exactement le cas silencieux
    // où le pair recevait un binaire tronqué annoncé comme complet.
    await act(async () => {
      chunks[0].resolve()
      chunks[2].reject(new Error('pair parti'))
    })
    expect(chunks).toHaveLength(4)

    const failed = expect(sending).rejects.toThrow('pair parti')
    await act(async () => { chunks[1].resolve(); chunks[3].resolve(); await failed })

    expect(p2pService.sendMessage).not.toHaveBeenCalledWith('peer', 'file:complete', expect.anything())
    expect(fileService.getTransfers()).toEqual([])
  })

  it('ne laisse aucun transfert fantôme après une erreur de stockage ou de métadonnées', async () => {
    vi.mocked(storageService.putBlob).mockRejectedValueOnce(new Error('disque'))
    await expect(fileService.sendFile(video(), 'conversation', 'peer')).rejects.toThrow('disque')
    expect(fileService.getTransfers()).toEqual([])
    vi.mocked(p2pService.sendMessage).mockRejectedValueOnce(new Error('metadata'))
    await expect(fileService.sendFile(video(), 'conversation', 'peer')).rejects.toThrow('metadata')
    expect(fileService.getTransfers()).toEqual([])
    expect(p2pService.sendFileData).not.toHaveBeenCalled()
  })

  it('choisit le mode inline à partir de la taille après compression', async () => {
    const compressed = new File(['small'], 'small.webm', { type: 'video/webm' })
    Object.defineProperty(compressed, 'arrayBuffer', { value: async () => new ArrayBuffer(5) })
    vi.mocked(fileService.compressForNetwork).mockResolvedValue(compressed)
    await fileService.sendFile(video(), 'conversation', 'peer')
    expect(p2pService.sendFileData).not.toHaveBeenCalled()
    expect(p2pService.sendMessage).toHaveBeenCalledWith('peer', 'file:transfer', expect.objectContaining({ fileData: expect.any(String) }))
  })

  it('préserve les réceptions et le repliage du widget', async () => {
    vi.spyOn(fileService, 'getActiveReceives').mockReturnValue([{
      transferId: 'incoming', fileName: 'recue.mp4', fileSize: 1024, progress: 50, type: 'video',
      attachment: { id: 'incoming-attachment', name: 'recue.mp4', size: 1024, type: 'video', mimeType: 'video/mp4' },
    }])
    render(<ActiveTransfersWidget />)
    expect(screen.getByText('chat.receivingFile')).toBeInTheDocument()
    expect(screen.getByText('recue.mp4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.queryByText('recue.mp4')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('recue.mp4')).toBeInTheDocument()
  })

  it('conserve une fenêtre bornée pour les envois groupés utilisant le même transport', async () => {
    const chunks: ReturnType<typeof deferred<void>>[] = []
    vi.mocked(p2pService.sendFileData).mockImplementation(() => {
      const chunk = deferred<void>()
      chunks.push(chunk)
      return chunk.promise
    })
    const progress = vi.fn()
    const bytes = new Uint8Array(9 * 256 * 1024)
    const attachment = { id: 'group-video', type: 'video' as const, name: 'groupe.mp4', size: bytes.length, mimeType: 'video/mp4' }
    const sender = fileService as unknown as {
      sendBlobToPeer: (bytes: Uint8Array, peer: string, attachment: MessageAttachment, channel: string, group: string, onProgress: (value: number) => void) => Promise<void>
    }
    const sending = sender.sendBlobToPeer(bytes, 'peer', attachment, 'channel', 'group', progress)
    await waitFor(() => expect(chunks).toHaveLength(4))
    chunks[0].resolve()
    await waitFor(() => expect(chunks).toHaveLength(5))
    expect(progress).toHaveBeenLastCalledWith(11)
    expect(progress).not.toHaveBeenCalledWith(100)
    vi.mocked(p2pService.sendFileData).mockResolvedValue(undefined)
    for (const chunk of chunks) chunk.resolve()
    await sending
    expect(p2pService.sendFileData).toHaveBeenCalledTimes(9)
    expect(progress).toHaveBeenLastCalledWith(100)
  })

  it('désabonne le widget au démontage', () => {
    const unsubscribe = vi.fn()
    vi.spyOn(fileService, 'subscribeTransfers').mockReturnValue(unsubscribe)
    const view = render(<ActiveTransfersWidget />)
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('bulle de pièce jointe homonyme', () => {
  it('n’affiche la progression que sur la bulle du transfert en cours', async () => {
    const chunks: ReturnType<typeof deferred<void>>[] = []
    vi.mocked(p2pService.sendFileData).mockImplementation(() => {
      const chunk = deferred<void>()
      chunks.push(chunk)
      return chunk.promise
    })
    let sending!: ReturnType<typeof fileService.sendFile>
    act(() => { sending = fileService.sendFile(video('setup.exe'), 'conversation', 'peer') })
    const liveId = fileService.getTransfers()[0].id

    const active: MessageAttachment = {
      id: 'att-live', type: 'document', name: 'setup.exe', size: 222,
      mimeType: 'application/octet-stream', blobKey: 'blob-live', transferId: liveId,
    }
    // Transfert passé, même nom mais autre contenu : aucun transfert actif ne
    // doit plus se refléter dans cette bulle.
    const older: MessageAttachment = {
      id: 'att-old', type: 'document', name: 'setup.exe', size: 111,
      mimeType: 'application/octet-stream', blobKey: 'blob-old', transferId: 'transfert-terminé',
    }
    render(
      <>
        <FileAttachment attachment={older} isOwn />
        <FileAttachment attachment={active} isOwn />
      </>
    )

    expect(screen.getByText('222 B — 0%')).toBeInTheDocument()
    expect(screen.getByText('111 B')).toBeInTheDocument()
    expect(screen.queryByText('111 B — 0%')).not.toBeInTheDocument()

    vi.mocked(p2pService.sendFileData).mockResolvedValue(undefined)
    for (const chunk of chunks) chunk.resolve()
    await act(async () => { await sending })
    await waitFor(() => expect(screen.queryByText('222 B — 0%')).not.toBeInTheDocument())
    expect(screen.getByText('222 B')).toBeInTheDocument()
  })
})

describe('destinataire injoignable', () => {
  it('renonce avant la compression et n’écrit aucun blob', async () => {
    vi.mocked(p2pService.isPeerConnected).mockReturnValue(false)
    vi.spyOn(p2pService, 'dialPeer').mockResolvedValue(false)

    await expect(fileService.sendFile(video(), 'conversation', 'peer'))
      .rejects.toBeInstanceOf(PeerUnreachableError)

    expect(p2pService.dialPeer).toHaveBeenCalledWith('peer', SEND_DIAL_TIMEOUT_MS)
    expect(fileService.compressForNetwork).not.toHaveBeenCalled()
    expect(storageService.putBlob).not.toHaveBeenCalled()
    expect(p2pService.sendMessage).not.toHaveBeenCalled()
    expect(fileService.getTransfers()).toEqual([])
  })

  it('poursuit l’envoi quand la composition aboutit', async () => {
    vi.mocked(p2pService.isPeerConnected).mockReturnValue(false)
    vi.spyOn(p2pService, 'dialPeer').mockResolvedValue(true)

    await fileService.sendFile(video(), 'conversation', 'peer')

    expect(storageService.putBlob).toHaveBeenCalledOnce()
    expect(p2pService.sendMessage).toHaveBeenCalledWith('peer', 'file:transfer', expect.anything())
  })
})
