import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

type NetworkServiceModule = typeof import('../../electron/services/NetworkService')
type NetworkServiceInstance = InstanceType<NetworkServiceModule['NetworkService']>
type Message = { send: (data: Buffer) => boolean }
type Channel = { closed: boolean; cork?: () => void; uncork?: () => void }
type Peer = {
  socket: { destroyed: boolean; destroying: boolean; flush: () => Promise<boolean> }
  sendFile?: Message
  sendMedia?: Message
  sendMessage?: Message
}
type Inspectable = {
  peers: Map<string, Peer>
  peerChannels: Map<string, { main: Channel | null; media: Channel | null; file: Channel | null }>
  bandwidth: { up: number; down: number }
}
const inspect = (svc: NetworkServiceInstance): Inspectable => svc as unknown as Inspectable

let NetworkService: NetworkServiceModule['NetworkService']
let scratchAppData: string | undefined
const originalAppData = process.env.APPDATA
const originalStateHome = process.env.XDG_STATE_HOME

beforeAll(async () => {
  // Comme network.shutdown : charger le module après avoir isolé ses logs.
  scratchAppData = mkdtempSync(join(tmpdir(), 'asgard-file-transfer-test-'))
  process.env.APPDATA = scratchAppData
  delete process.env.XDG_STATE_HOME
  NetworkService = (await import('../../electron/services/NetworkService')).NetworkService
})

afterAll(() => {
  if (originalAppData === undefined) delete process.env.APPDATA
  else process.env.APPDATA = originalAppData
  if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME
  else process.env.XDG_STATE_HOME = originalStateHome
  if (scratchAppData) rmSync(scratchAppData, { recursive: true, force: true })
})

const noiseId = 'a'.repeat(64)
const ed25519Key = 'b'.repeat(64)
const payload = new Uint8Array([0x11, 0x22, 0x33])

function fixture(route: 'file' | 'media' = 'file') {
  const svc = new NetworkService()
  const state = inspect(svc)
  const sendFile = vi.fn((_data: Buffer) => true)
  const sendMedia = vi.fn((_data: Buffer) => true)
  const sendMain = vi.fn((_data: Buffer) => true)
  const flush = vi.fn(async () => true)
  const cork = vi.fn()
  const uncork = vi.fn()
  const peer: Peer = {
    socket: { destroyed: false, destroying: false, flush },
    sendFile: route === 'file' ? { send: sendFile } : undefined,
    sendMedia: { send: sendMedia },
    sendMessage: { send: sendMain },
  }
  const channels = {
    main: { closed: false },
    // Un seul couple cork/uncork partagé : côté Protomux le cork est
    // référencé sur le mux, identique pour tous les canaux du pair.
    media: { closed: false, cork, uncork },
    file: route === 'file' ? { closed: false, cork, uncork } : null,
  }
  state.peers.set(noiseId, peer)
  state.peerChannels.set(noiseId, channels)
  return { svc, state, peer, channels, sendFile, sendMedia, sendMain, flush, cork, uncork }
}

describe('NetworkService.sendFileDataBatch()', () => {
  it.each([false, true])('rejette un pair absent (mapping obsolète : %s)', async (mapped) => {
    const { svc, state, sendFile, sendMedia, flush } = fixture()
    state.peers.clear()
    if (mapped) svc.getPeerPublicKeyMap().set(noiseId, ed25519Key)

    await expect(svc.sendFileDataBatch(mapped ? ed25519Key : noiseId, [payload])).rejects.toThrow(/peer.*not found/i)
    expect(sendFile).not.toHaveBeenCalled()
    expect(sendMedia).not.toHaveBeenCalled()
    expect(flush).not.toHaveBeenCalled()
    expect(state.bandwidth.up).toBe(0)
  })

  it.each(['destroyed', 'destroying'] as const)('rejette un socket %s avant tout envoi', async (flag) => {
    const { svc, state, peer, sendFile, sendMedia, flush } = fixture()
    peer.socket[flag] = true

    await expect(svc.sendFileDataBatch(noiseId, [payload])).rejects.toThrow(/socket.*closed/i)
    expect(sendFile).not.toHaveBeenCalled()
    expect(sendMedia).not.toHaveBeenCalled()
    expect(flush).not.toHaveBeenCalled()
    expect(state.bandwidth.up).toBe(0)
  })

  it('rejette sans message fichier/média et ne se rabat pas sur le canal principal', async () => {
    const { svc, state, peer, sendMain, flush } = fixture()
    peer.sendFile = undefined
    peer.sendMedia = undefined

    await expect(svc.sendFileDataBatch(noiseId, [payload])).rejects.toThrow(/channel.*not available/i)
    expect(sendMain).not.toHaveBeenCalled()
    expect(flush).not.toHaveBeenCalled()
    expect(state.bandwidth.up).toBe(0)
  })

  describe.each(['file', 'media'] as const)('canal %s', (route) => {
    const expectedData = route === 'file' ? Buffer.from(payload) : Buffer.from([0x04, ...payload])

    it.each([true, false])('attend le flush différé même si send retourne %s', async (sendResult) => {
      const { svc, state, sendFile, sendMedia, sendMain, flush } = fixture(route)
      const send = route === 'file' ? sendFile : sendMedia
      send.mockReturnValue(sendResult)
      let finishFlush!: (success: boolean) => void
      flush.mockReturnValue(new Promise<boolean>((resolve) => { finishFlush = resolve }))
      const settled = vi.fn()
      const sending = svc.sendFileDataBatch(noiseId, [payload])
      void sending.then(settled, settled)

      try {
        await Promise.resolve()
        await Promise.resolve()
        expect(send).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenCalledWith(expectedData)
        expect(route === 'file' ? sendMedia : sendFile).not.toHaveBeenCalled()
        expect(sendMain).not.toHaveBeenCalled()
        expect(flush).toHaveBeenCalledTimes(1)
        expect(send.mock.invocationCallOrder[0]).toBeLessThan(flush.mock.invocationCallOrder[0])
        expect(settled).not.toHaveBeenCalled()
        expect(state.bandwidth.up).toBe(0)
      } finally {
        finishFlush(true)
        await sending
      }

      expect(settled).toHaveBeenCalledTimes(1)
      expect(state.bandwidth).toEqual({ up: expectedData.length, down: 0 })
    })

    it.each(['map absente', 'canal absent', 'canal fermé'] as const)('rejette : %s', async (condition) => {
      const { svc, state, sendFile, sendMedia, sendMain, flush } = fixture(route)
      if (condition === 'map absente') state.peerChannels.clear()
      else state.peerChannels.get(noiseId)![route] = condition === 'canal absent' ? null : { closed: true }

      await expect(svc.sendFileDataBatch(noiseId, [payload])).rejects.toThrow(/channel.*(?:not available|closed)/i)
      expect(sendFile).not.toHaveBeenCalled()
      expect(sendMedia).not.toHaveBeenCalled()
      expect(sendMain).not.toHaveBeenCalled()
      expect(flush).not.toHaveBeenCalled()
      expect(state.bandwidth.up).toBe(0)
    })

    it('rejette flush=false sans comptabiliser les octets', async () => {
      const { svc, state, flush } = fixture(route)
      flush.mockResolvedValue(false)

      await expect(svc.sendFileDataBatch(noiseId, [payload])).rejects.toThrow(/flush/i)
      expect(flush).toHaveBeenCalledTimes(1)
      expect(state.bandwidth.up).toBe(0)
    })

    it('propage le rejet du flush sans comptabiliser les octets', async () => {
      const { svc, state, flush } = fixture(route)
      const error = new Error('transport failed')
      flush.mockRejectedValue(error)

      await expect(svc.sendFileDataBatch(noiseId, [payload])).rejects.toBe(error)
      expect(state.bandwidth.up).toBe(0)
    })

    it('propage les exceptions send sans flusher ni comptabiliser les octets', async () => {
      const { svc, state, sendFile, sendMedia, flush } = fixture(route)
      const error = new Error('encoding failed')
      const send = route === 'file' ? sendFile : sendMedia
      send.mockImplementation(() => { throw error })

      await expect(svc.sendFileDataBatch(noiseId, [payload])).rejects.toBe(error)
      expect(flush).not.toHaveBeenCalled()
      expect(state.bandwidth.up).toBe(0)
    })

    it('résout Ed25519 vers Noise pour le pair et vérifie uniquement le canal utilisé', async () => {
      const { svc, state, channels, sendFile, sendMedia, flush } = fixture(route)
      svc.getPeerPublicKeyMap().set(noiseId, ed25519Key)
      // Un canal inutilisé fermé ne doit pas invalider celui qui transporte le fichier.
      state.peerChannels.get(noiseId)![route === 'file' ? 'media' : 'file'] = { closed: true }
      channels.main.closed = true

      await expect(svc.sendFileDataBatch(ed25519Key, [payload])).resolves.toBeUndefined()
      const send = route === 'file' ? sendFile : sendMedia
      expect(send).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenCalledWith(expectedData)
      expect(flush).toHaveBeenCalledTimes(1)
      expect(state.bandwidth.up).toBe(expectedData.length)
    })
  })

  describe.each(['file', 'media'] as const)('lot de deux chunks, canal %s', (route) => {
    const second = new Uint8Array([0x55, 0x66, 0x77])
    const frame = (data: Uint8Array) =>
      route === 'file' ? Buffer.from(data) : Buffer.from([0x04, ...data])

    it('n’attend qu’un seul flush pour tout le lot, encadré par un cork équilibré', async () => {
      const { svc, state, sendFile, sendMedia, flush, cork, uncork } = fixture(route)
      const send = route === 'file' ? sendFile : sendMedia

      await svc.sendFileDataBatch(noiseId, [payload, second])

      expect(send).toHaveBeenCalledTimes(2)
      expect(send).toHaveBeenNthCalledWith(1, frame(payload))
      expect(send).toHaveBeenNthCalledWith(2, frame(second))
      // Le lot est le point du correctif : un flush, pas deux.
      expect(flush).toHaveBeenCalledTimes(1)
      expect(cork).toHaveBeenCalledTimes(1)
      expect(uncork).toHaveBeenCalledTimes(1)
      // Le cork doit précéder les envois et l'uncork précéder le flush : vidé
      // dans l'autre ordre, les trames resteraient coincées dans le mux.
      expect(cork.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0])
      expect(uncork.mock.invocationCallOrder[0]).toBeLessThan(flush.mock.invocationCallOrder[0])
      expect(state.bandwidth.up).toBe(frame(payload).length + frame(second).length)
    })

    it('décorke et propage la faute d’un chunk en milieu de lot sans flush', async () => {
      const { svc, state, sendFile, sendMedia, flush, uncork } = fixture(route)
      const send = route === 'file' ? sendFile : sendMedia
      const error = new Error('encoding failed')
      send.mockImplementationOnce(() => true).mockImplementationOnce(() => { throw error })

      await expect(svc.sendFileDataBatch(noiseId, [payload, second])).rejects.toBe(error)
      // Un cork resté fermé figerait tous les canaux du pair, appels inclus.
      expect(uncork).toHaveBeenCalledTimes(1)
      expect(flush).not.toHaveBeenCalled()
      expect(state.bandwidth.up).toBe(0)
    })

    it('rejette un pair injoignable sur tout le lot, sans envoyer le premier chunk', async () => {
      const { svc, state, sendFile, sendMedia, flush } = fixture(route)
      state.peers.clear()

      await expect(svc.sendFileDataBatch(noiseId, [payload, second]))
        .rejects.toThrow(/peer.*not found/i)
      expect(sendFile).not.toHaveBeenCalled()
      expect(sendMedia).not.toHaveBeenCalled()
      expect(flush).not.toHaveBeenCalled()
    })
  })

  it('ne touche ni au canal, ni au cork, ni au transport pour un lot vide', async () => {
    const { svc, sendFile, flush, cork, uncork } = fixture()
    await expect(svc.sendFileDataBatch(noiseId, [])).resolves.toBeUndefined()
    expect(sendFile).not.toHaveBeenCalled()
    expect(flush).not.toHaveBeenCalled()
    expect(cork).not.toHaveBeenCalled()
    expect(uncork).not.toHaveBeenCalled()
  })
})
