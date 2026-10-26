import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActiveTransfersWidget } from '@/features/chat/components/ActiveTransfersWidget'
import { FileAttachment } from '@/features/chat/components/FileAttachment'
import { fileService, PeerUnreachableError, SEND_DIAL_TIMEOUT_MS, TransferCancelledError } from '@/services/FileService'
import { p2pService } from '@/services/P2PService'
import { storageService } from '@/services/StorageService'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'
import { translations } from '@/i18n/translations'
import type { MessageAttachment } from '@/types'
import type { ProtocolMessage } from '@/types/network'

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
  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'sendFileDataBatch').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'isPeerConnected').mockReturnValue(true)
  // initialize() est appelé par plusieurs cas et empile ses handlers sur le
  // singleton eventemitter3 : sans purge, un chunk émis serait traité N fois et
  // le buffer se complèterait à tort. En production p2pService.destroy() purge
  // tout au changement d'identité — on rétablit le même état ici.
  for (const event of ['message:file:transfer', 'message:file:complete', 'message:file:cancel', 'file:data', 'media:data']) {
    p2pService.removeAllListeners(event)
  }
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
    vi.mocked(p2pService.sendFileDataBatch).mockReturnValue(chunk.promise)
    vi.mocked(p2pService.sendMessage).mockImplementation(async (_peer, type) => {
      if (type === 'file:complete') await completion.promise
    })
    render(<ActiveTransfersWidget />)
    let sending!: ReturnType<typeof fileService.sendFile>
    act(() => { sending = fileService.sendFile(video(), 'conversation', 'peer') })

    expect(screen.getByText('video.mp4')).toBeInTheDocument()
    expect(screen.getByText('chat.sendingFile')).toBeInTheDocument()
    expect(fileService.getTransfers()[0].progress).toBe(0)
    // La barre porte la valeur pour un lecteur d'écran, pas seulement sa largeur.
    const bar = screen.getByRole('progressbar', { name: 'video.mp4' })
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(p2pService.sendFileDataBatch).not.toHaveBeenCalled()

    await act(async () => { compression.resolve(video('video.webm')) })
    expect(screen.getByText('video.webm')).toBeInTheDocument()
    expect(p2pService.sendFileDataBatch).toHaveBeenCalledTimes(1)
    expect(p2pService.sendMessage).not.toHaveBeenCalledWith('peer', 'file:complete', expect.anything())

    await act(async () => { chunk.resolve() })
    expect(screen.getByText('video.webm')).toBeInTheDocument()
    expect(fileService.getTransfers()[0]).toMatchObject({ progress: 99, status: 'uploading' })
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'video.webm' })).toHaveAttribute('aria-valuenow', '99'))
    await act(async () => { completion.resolve(); await sending })
    expect(screen.queryByText('chat.sendingFile')).not.toBeInTheDocument()
    expect(fileService.getTransfers()).toEqual([])
  })

  it('groupe quatre chunks par lot et n’en laisse voler que deux', async () => {
    const batches: ReturnType<typeof deferred<void>>[] = []
    const sizes: number[] = []
    vi.mocked(p2pService.sendFileDataBatch).mockImplementation((_peer, chunks) => {
      sizes.push(chunks.length)
      const batch = deferred<void>()
      batches.push(batch)
      return batch.promise
    })
    const sending = fileService.sendFile(video('longue.mp4', 9), 'conversation', 'peer')

    // Neuf chunks ne coûtent plus neuf aller-retours : quatre puis quatre, et la
    // boucle attend que l'un des deux se vide avant d'en cadre un troisième.
    await waitFor(() => expect(batches).toHaveLength(2))
    expect(sizes).toEqual([4, 4])
    batches[0].resolve()
    await waitFor(() => expect(batches).toHaveLength(3))
    expect(sizes[2]).toBe(1)
    expect(fileService.getTransfers()[0].progress).toBe(44)
    expect(p2pService.sendMessage).not.toHaveBeenCalledWith('peer', 'file:complete', expect.anything())
    for (const batch of batches) batch.resolve()
    await sending
    expect(p2pService.sendFileDataBatch).toHaveBeenCalledTimes(3)
    expect(fileService.getTransfers()).toEqual([])
  })

  it('retire uniquement le transfert échoué et conserve l’autre vidéo active', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    vi.mocked(p2pService.sendFileDataBatch)
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
    // Deux rangs actifs : chaque bouton Annuler nomme son propre fichier.
    expect(screen.getByRole('button', { name: 'common.cancel — premiere.mp4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.cancel — seconde.mp4' })).toBeInTheDocument()
    const failed = expect(a).rejects.toThrow('déconnecté')
    await act(async () => { first.reject(new Error('déconnecté')); await failed })
    expect(screen.queryByText('premiere.mp4')).not.toBeInTheDocument()
    expect(screen.getByText('seconde.mp4')).toBeInTheDocument()
    await act(async () => { second.resolve(); await b })
    expect(fileService.getTransfers()).toEqual([])
  })

  it('n’annonce jamais file:complete quand un lot échoue hors de la fenêtre de course', async () => {
    const batches: ReturnType<typeof deferred<void>>[] = []
    vi.mocked(p2pService.sendFileDataBatch).mockImplementation(() => {
      const batch = deferred<void>()
      batches.push(batch)
      return batch.promise
    })
    // Douze chunks par lots de quatre : trois lots si tout se vide.
    const sending = fileService.sendFile(video('tronquee.mp4', 12), 'conversation', 'peer')
    await waitFor(() => expect(batches).toHaveLength(2))

    // Le lot 0 gagne la course et le lot 1 échoue au même instant : sa perte
    // n'est plus visible depuis Promise.race, c'était exactement le cas silencieux
    // où le pair recevait un binaire tronqué annoncé comme complet.
    // La faute doit être attendue avant que le lot ne rejette : sinon la
    // promesse de l'envoi rejette un tick avant l'écouteur et Vitest la signale.
    const failed = expect(sending).rejects.toThrow('pair parti')
    await act(async () => {
      batches[0].resolve()
      batches[1].reject(new Error('pair parti'))
    })
    // L'émission s'arrête sur la première faute : le troisième lot n'est jamais cadré.
    expect(batches).toHaveLength(2)
    await failed

    expect(p2pService.sendMessage).not.toHaveBeenCalledWith('peer', 'file:complete', expect.anything())
    expect(fileService.getTransfers()).toEqual([])
  })

  it('n’affiche que les transferts de la conversation montée', async () => {
    const batches: ReturnType<typeof deferred<void>>[] = []
    vi.mocked(p2pService.sendFileDataBatch).mockImplementation(() => {
      const batch = deferred<void>()
      batches.push(batch)
      return batch.promise
    })
    const versB = fileService.sendFile(video('vers-b.mp4', 2), 'conversation-b', 'peer-b')
    const versC = fileService.sendFile(video('vers-c.mp4', 2), 'conversation-c', 'peer-c')
    await waitFor(() => expect(batches).toHaveLength(2))

    const view = render(<ActiveTransfersWidget conversationId="conversation-b" />)
    await waitFor(() => expect(screen.getByText('vers-b.mp4')).toBeInTheDocument())
    expect(screen.queryByText('vers-c.mp4')).not.toBeInTheDocument()

    view.rerender(<ActiveTransfersWidget conversationId="conversation-c" />)
    await waitFor(() => expect(screen.getByText('vers-c.mp4')).toBeInTheDocument())
    expect(screen.queryByText('vers-b.mp4')).not.toBeInTheDocument()

    view.unmount()
    for (const batch of batches) batch.resolve()
    await versB
    await versC
  })

  it('ne laisse aucun transfert fantôme après une erreur de stockage ou de métadonnées', async () => {
    vi.mocked(storageService.putBlob).mockRejectedValueOnce(new Error('disque'))
    await expect(fileService.sendFile(video(), 'conversation', 'peer')).rejects.toThrow('disque')
    expect(fileService.getTransfers()).toEqual([])
    vi.mocked(p2pService.sendMessage).mockRejectedValueOnce(new Error('metadata'))
    await expect(fileService.sendFile(video(), 'conversation', 'peer')).rejects.toThrow('metadata')
    expect(fileService.getTransfers()).toEqual([])
    expect(p2pService.sendFileDataBatch).not.toHaveBeenCalled()
  })

  it('choisit le mode inline à partir de la taille après compression', async () => {
    const compressed = new File(['small'], 'small.webm', { type: 'video/webm' })
    Object.defineProperty(compressed, 'arrayBuffer', { value: async () => new ArrayBuffer(5) })
    vi.mocked(fileService.compressForNetwork).mockResolvedValue(compressed)
    await fileService.sendFile(video(), 'conversation', 'peer')
    expect(p2pService.sendFileDataBatch).not.toHaveBeenCalled()
    expect(p2pService.sendMessage).toHaveBeenCalledWith('peer', 'file:transfer', expect.objectContaining({ fileData: expect.any(String) }))
  })

  it('préserve les réceptions et le repliage du widget', async () => {
    vi.spyOn(fileService, 'getActiveReceives').mockReturnValue([{
      transferId: 'incoming', fileName: 'recue.mp4', fileSize: 1024, progress: 50, type: 'video',
      conversationId: 'conversation',
      attachment: { id: 'incoming-attachment', name: 'recue.mp4', size: 1024, type: 'video', mimeType: 'video/mp4' },
    }])
    render(<ActiveTransfersWidget />)
    expect(screen.getByText('chat.receivingFile')).toBeInTheDocument()
    expect(screen.getByText('recue.mp4')).toBeInTheDocument()
    // Le premier bouton reste l'en-tête repliable (le rang porte désormais
    // sa propre action Annuler).
    const header = screen.getAllByRole('button')[0]
    // Sans cet état, un lecteur d'écran annonçait un simple bouton et laissait
    // ignorer que la liste pouvait être masquée.
    expect(header).toHaveAttribute('aria-expanded', 'true')
    const listId = header.getAttribute('aria-controls')
    expect(listId).toBeTruthy()
    expect(document.getElementById(listId as string)).toHaveTextContent('recue.mp4')
    // Le chevron ne porte aucune information : son sens est déjà dans l'état.
    expect(header.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    fireEvent.click(header)
    await waitFor(() => expect(screen.queryByText('recue.mp4')).not.toBeInTheDocument())
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(listId as string)).toBeNull()
    fireEvent.click(header)
    expect(screen.getByText('recue.mp4')).toBeInTheDocument()
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(listId as string)).not.toBeNull()
  })

  it('borne la fenêtre des envois groupés sur le même chemin par lot', async () => {
    const batches: ReturnType<typeof deferred<void>>[] = []
    const sizes: number[] = []
    vi.mocked(p2pService.sendFileDataBatch).mockImplementation((_peer, chunks) => {
      sizes.push(chunks.length)
      const batch = deferred<void>()
      batches.push(batch)
      return batch.promise
    })
    const progress = vi.fn()
    const bytes = new Uint8Array(9 * 256 * 1024)
    const attachment = { id: 'group-video', type: 'video' as const, name: 'groupe.mp4', size: bytes.length, mimeType: 'video/mp4' }
    const sender = fileService as unknown as {
      sendBlobToPeer: (bytes: Uint8Array, peer: string, attachment: MessageAttachment, channel: string, group: string, onProgress: (value: number) => void) => Promise<void>
    }
    const sending = sender.sendBlobToPeer(bytes, 'peer', attachment, 'channel', 'group', progress)
    await waitFor(() => expect(batches).toHaveLength(2))
    expect(sizes).toEqual([4, 4])
    batches[0].resolve()
    await waitFor(() => expect(batches).toHaveLength(3))
    expect(progress).toHaveBeenLastCalledWith(44)
    expect(progress).not.toHaveBeenCalledWith(100)
    for (const batch of batches) batch.resolve()
    await sending
    expect(p2pService.sendFileDataBatch).toHaveBeenCalledTimes(3)
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
    const batches: ReturnType<typeof deferred<void>>[] = []
    vi.mocked(p2pService.sendFileDataBatch).mockImplementation(() => {
      const batch = deferred<void>()
      batches.push(batch)
      return batch.promise
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

    vi.mocked(p2pService.sendFileDataBatch).mockResolvedValue(undefined)
    for (const batch of batches) batch.resolve()
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

describe('coalescence des notifications de transfert', () => {
  it('n’émet pas une notification par lot pendant un envoi', async () => {
    const batches: ReturnType<typeof deferred<void>>[] = []
    vi.mocked(p2pService.sendFileDataBatch).mockImplementation(() => {
      const batch = deferred<void>()
      batches.push(batch)
      return batch.promise
    })
    const listener = vi.fn()
    const unsubscribe = fileService.subscribeTransfers(listener)
    // Quarante chunks par lots de quatre : dix notifications de progression brutes.
    const sending = fileService.sendFile(video('gros.mp4', 40), 'conversation', 'peer')
    await waitFor(() => expect(batches).toHaveLength(2))

    listener.mockClear()
    vi.mocked(p2pService.sendFileDataBatch).mockResolvedValue(undefined)
    for (const batch of batches) batch.resolve()
    await act(async () => { await sending })
    unsubscribe()

    // Dix lots mènent l'envoi plus la transition terminale : sans coalescence le
    // compteur dépasserait 11, et chaque appel recalculait toute la liste des
    // transferts dans chaque widget monté.
    expect(listener.mock.calls.length).toBeLessThanOrEqual(3)
    expect(fileService.getTransfers()).toEqual([])
  })

  it('notifie la progression d’une réception, qui restait muette', async () => {
    fileService.initialize()
    const listener = vi.fn()
    const unsubscribe = fileService.subscribeTransfers(listener)
    const from = 'pair-de-bruit'
    const transferId = 'recu-notifie'
    const idBytes = new TextEncoder().encode(transferId)
    const frame = (payload: Uint8Array): Uint8Array => {
      const out = new Uint8Array(1 + idBytes.length + payload.length)
      out[0] = idBytes.length
      out.set(idBytes, 1)
      out.set(payload, 1 + idBytes.length)
      return out
    }

    const msg = {
      id: 'm1', from, to: 'self', type: 'file:transfer', timestamp: Date.now(),
      payload: {
        attachment: { id: 'att-recue', type: 'video', name: 'recue.mp4', size: 512, mimeType: 'video/mp4' },
        conversationId: 'conversation', transferId, binary: true, totalChunks: 2,
      },
    } as unknown as ProtocolMessage
    p2pService.emit('message:file:transfer', msg)
    await waitFor(() => expect(fileService.getActiveReceives()).toHaveLength(1))

    listener.mockClear()
    p2pService.emit('file:data', { from, data: frame(new Uint8Array(256)) })

    expect(fileService.getActiveReceives()[0].progress).toBe(50)
    // La notification est différée d'au plus l'intervalle de coalescence.
    await waitFor(() => expect(listener).toHaveBeenCalled(), { timeout: 1000 })
    unsubscribe()
  })
})

describe('annulation des transferts', () => {
  it('annule un envoi 1:1 : la boucle s’arrête, le pair est prévenu, aucun file:complete', async () => {
    const batches: ReturnType<typeof deferred<void>>[] = []
    vi.mocked(p2pService.sendFileDataBatch).mockImplementation(() => {
      const batch = deferred<void>()
      batches.push(batch)
      return batch.promise
    })
    const sending = fileService.sendFile(video('annulee.mp4', 9), 'conversation', 'peer')
    await waitFor(() => expect(batches).toHaveLength(2))
    const id = fileService.getTransfers()[0].id

    const cancelled = expect(sending).rejects.toBeInstanceOf(TransferCancelledError)
    fileService.cancelTransfer(id)
    // Le rang disparaît immédiatement, avant même que les lots en vol retombent.
    expect(fileService.getTransfers()).toEqual([])
    expect(p2pService.sendMessage).toHaveBeenCalledWith('peer', 'file:cancel', { transferId: id })

    await act(async () => {
      batches[0].resolve()
      batches[1].resolve()
    })
    await cancelled

    // Le troisième lot n'a jamais été cadré et le pair n'a jamais vu arriver
    // file:complete pour un fichier tronqué.
    expect(p2pService.sendFileDataBatch).toHaveBeenCalledTimes(2)
    expect(p2pService.sendMessage).not.toHaveBeenCalledWith('peer', 'file:complete', expect.anything())
    // Le tombstone est levé une fois la boucle déroulée.
    expect(fileService.isTransferCancelled(id)).toBe(false)
  })

  it('file:cancel reçu pendant l’émission arrête les lots en cours', async () => {
    fileService.initialize()
    const batches: ReturnType<typeof deferred<void>>[] = []
    vi.mocked(p2pService.sendFileDataBatch).mockImplementation(() => {
      const batch = deferred<void>()
      batches.push(batch)
      return batch.promise
    })
    const sending = fileService.sendFile(video('refusee.mp4', 9), 'conversation', 'peer')
    await waitFor(() => expect(batches).toHaveLength(2))
    const id = fileService.getTransfers()[0].id

    const cancelled = expect(sending).rejects.toBeInstanceOf(TransferCancelledError)
    p2pService.emit('message:file:cancel', {
      id: 'cancel-1', from: 'peer', to: 'self', type: 'file:cancel', timestamp: Date.now(),
      payload: { transferId: id },
    } as unknown as ProtocolMessage)

    expect(fileService.getTransfers()).toEqual([])
    await act(async () => {
      batches[0].resolve()
      batches[1].resolve()
    })
    await cancelled

    expect(p2pService.sendFileDataBatch).toHaveBeenCalledTimes(2)
    expect(p2pService.sendMessage).not.toHaveBeenCalledWith('peer', 'file:complete', expect.anything())
  })

  it('annuler une réception retire la bulle « réception… » et prévient l’expéditeur', async () => {
    fileService.initialize()
    const from = 'pair-refus'
    const transferId = 'recu-annule'
    // Ciblé par ids : les tests précédents du fichier laissent des buffers et
    // des bulles derrière eux, un comptage global mesurerait leur résidu.
    const hasReceive = () => fileService.getActiveReceives().some((recv) => recv.transferId === transferId)
    const countIn = () => useMessageStore.getState().messages['conversation']?.length ?? 0
    const before = countIn()

    p2pService.emit('message:file:transfer', {
      id: 'm-refus', from, to: 'self', type: 'file:transfer', timestamp: Date.now(),
      payload: {
        attachment: { id: 'att-refus', type: 'video', name: 'refusee.mp4', size: 512, mimeType: 'video/mp4' },
        conversationId: 'conversation', transferId, binary: true, totalChunks: 2,
      },
    } as unknown as ProtocolMessage)
    await waitFor(() => expect(hasReceive()).toBe(true))
    expect(countIn()).toBe(before + 1)

    fileService.cancelTransfer(transferId)

    expect(hasReceive()).toBe(false)
    expect(countIn()).toBe(before)
    expect(p2pService.sendMessage).toHaveBeenCalledWith(from, 'file:cancel', expect.objectContaining({ transferId }))
    // Tombstone posé : les lots encore en vol ne recréeront rien.
    expect(fileService.isTransferCancelled(transferId)).toBe(true)
    // La metadata rejouée ne ressuscite pas de buffer non plus.
    p2pService.emit('message:file:transfer', {
      id: 'm-refus-2', from, to: 'self', type: 'file:transfer', timestamp: Date.now(),
      payload: {
        attachment: { id: 'att-refus', type: 'video', name: 'refusee.mp4', size: 512, mimeType: 'video/mp4' },
        conversationId: 'conversation', transferId, binary: true, totalChunks: 2,
      },
    } as unknown as ProtocolMessage)
    expect(hasReceive()).toBe(false)
    expect(countIn()).toBe(before)
  })

  it('annule un envoi de groupe : chaque pair reçoit file:cancel portant l’id de groupe', () => {
    const service = fileService as unknown as {
      transfers: Map<string, unknown>
      groupTransfers: Map<string, unknown>
    }
    service.transfers.set('groupe-annule', {
      id: 'groupe-annule', fileName: 'vers-groupe.mp4', fileSize: 256, progress: 0,
      status: 'uploading', type: 'video', conversationId: 'canal',
    })
    service.groupTransfers.set('groupe-annule', {
      peerProgress: new Map([['pair-a', 0], ['pair-b', 0]]),
    })

    fileService.cancelTransfer('groupe-annule')

    expect(fileService.getTransfers()).toEqual([])
    expect(p2pService.sendMessage).toHaveBeenCalledWith('pair-a', 'file:cancel', { transferId: 'groupe-annule', groupTransferId: 'groupe-annule' })
    expect(p2pService.sendMessage).toHaveBeenCalledWith('pair-b', 'file:cancel', { transferId: 'groupe-annule', groupTransferId: 'groupe-annule' })
  })

  it('le widget propose Annuler par rang et affiche transféré / total', async () => {
    const batches: ReturnType<typeof deferred<void>>[] = []
    vi.mocked(p2pService.sendFileDataBatch).mockImplementation(() => {
      const batch = deferred<void>()
      batches.push(batch)
      return batch.promise
    })
    // Conversation dédiée : le widget ne montre que ce rang, hors du résidu des
    // tests précédents du fichier.
    render(<ActiveTransfersWidget conversationId="annulation-ui" />)
    let sending!: ReturnType<typeof fileService.sendFile>
    act(() => { sending = fileService.sendFile(video('a-annuler.mp4', 1), 'annulation-ui', 'peer') })
    await waitFor(() => expect(batches).toHaveLength(1))
    const id = fileService.getTransfers()[0].id

    expect(screen.getByText('a-annuler.mp4')).toBeInTheDocument()
    // 256 Ko d'un seul chunk, rien de transféré : le rang détaille les deux bornes.
    expect(screen.getByText('0 B / 256.0 KB')).toBeInTheDocument()

    const cancelled = expect(sending).rejects.toBeInstanceOf(TransferCancelledError)
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel — a-annuler.mp4' }))
    await waitFor(() => expect(screen.queryByText('a-annuler.mp4')).not.toBeInTheDocument())
    expect(p2pService.sendMessage).toHaveBeenCalledWith('peer', 'file:cancel', { transferId: id })

    await act(async () => { batches[0].resolve() })
    await cancelled
  })
})

describe('réception incomplète', () => {
  const from = 'pair-tronque'
  const conversationId = 'conversation'

  function frameFor(transferId: string, payload: Uint8Array): Uint8Array {
    const idBytes = new TextEncoder().encode(transferId)
    const out = new Uint8Array(1 + idBytes.length + payload.length)
    out[0] = idBytes.length
    out.set(idBytes, 1)
    out.set(payload, 1 + idBytes.length)
    return out
  }

  function announce(transferId: string, name: string, totalChunks: number) {
    p2pService.emit('message:file:transfer', {
      id: `m-${transferId}`, from, to: 'self', type: 'file:transfer', timestamp: Date.now(),
      payload: {
        attachment: { id: `att-${transferId}`, type: 'document', name, size: totalChunks * 256 * 1024, mimeType: 'application/octet-stream' },
        conversationId, transferId, binary: true, totalChunks,
      },
    } as unknown as ProtocolMessage)
  }

  function complete(transferId: string) {
    p2pService.emit('message:file:complete', {
      id: `c-${transferId}`, from, to: 'self', type: 'file:complete', timestamp: Date.now(),
      payload: { transferId },
    } as unknown as ProtocolMessage)
  }

  const messageNamed = (name: string) =>
    useMessageStore.getState().messages[conversationId]?.find((m) => m.attachments?.some((a) => a.name === name))

  it('jette les données tronquées et marque la bulle en échec au lieu de livrer un fichier corrompu', async () => {
    fileService.initialize()
    const name = 'tronquee.bin'
    const transferId = 'recu-incomplet'
    const hasReceive = () => fileService.getActiveReceives().some((recv) => recv.transferId === transferId)

    announce(transferId, name, 2)
    await waitFor(() => expect(hasReceive()).toBe(true))

    // Un seul des deux chunks arrive : le tampon restera incomplet.
    p2pService.emit('file:data', { from, data: frameFor(transferId, new Uint8Array(256)) })
    await waitFor(() => expect(fileService.getActiveReceives().find((r) => r.transferId === transferId)?.progress).toBe(50))

    complete(transferId)

    await waitFor(() => expect(hasReceive()).toBe(false))
    // Aucun blob : le partiel n'est jamais matérialisé.
    expect(storageService.putBlob).not.toHaveBeenCalled()
    const message = messageNamed(name)
    expect(message?.status).toBe('failed')
    expect(message?.attachments?.[0]?.failed).toBe(true)
    expect(message?.attachments?.[0]?.blobKey).toBeUndefined()
    // L'utilisateur est prévenu avec la chaîne traduite, pas la clé brute.
    const toasts = useUIStore.getState().toasts
    expect(toasts.some((toast) => toast.title === translations.fr.translation['chat.downloadFailed'])).toBe(true)
    expect(toasts.some((toast) => toast.title === 'chat.downloadFailed')).toBe(false)
  })

  it('livre le fichier quand tous les chunks sont arrivés, sans écraser l’id de la bulle', async () => {
    fileService.initialize()
    const name = 'intacte.bin'
    const transferId = 'recu-complet'
    const hasReceive = () => fileService.getActiveReceives().some((recv) => recv.transferId === transferId)

    announce(transferId, name, 2)
    await waitFor(() => expect(hasReceive()).toBe(true))
    const placeholderId = messageNamed(name)?.id
    expect(placeholderId).toBeDefined()

    p2pService.emit('file:data', { from, data: frameFor(transferId, new Uint8Array(256)) })
    p2pService.emit('file:data', { from, data: frameFor(transferId, new Uint8Array(256)) })
    complete(transferId)

    await waitFor(() => expect(messageNamed(name)?.status).toBe('delivered'))
    // L'id du message reste celui de la bulle : la suppression s'appuie dessus
    // pour retrouver la ligne en base (l'id de la pièce jointe l'écrasait).
    const delivered = useMessageStore.getState().messages[conversationId]?.find((m) => m.id === placeholderId)
    expect(delivered?.attachments?.[0]?.blobKey).toBe('test-blob')
    expect(delivered?.attachments?.[0]?.failed).toBeUndefined()
  })
})
