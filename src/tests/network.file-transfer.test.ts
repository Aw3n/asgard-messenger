import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

type NetworkServiceModule = typeof import('../../electron/services/NetworkService')
type NetworkServiceInstance = InstanceType<NetworkServiceModule['NetworkService']>
type Message = { send: (data: Buffer) => boolean }
type Channel = { closed: boolean }
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
  const peer: Peer = {
    socket: { destroyed: false, destroying: false, flush },
    sendFile: route === 'file' ? { send: sendFile } : undefined,
    sendMedia: { send: sendMedia },
    sendMessage: { send: sendMain },
  }
  const channels = {
    main: { closed: false },
    media: { closed: false },
    file: route === 'file' ? { closed: false } : null,
  }
  state.peers.set(noiseId, peer)
  state.peerChannels.set(noiseId, channels)
  return { svc, state, peer, channels, sendFile, sendMedia, sendMain, flush }
}

describe('NetworkService.sendFileData()', () => {
  it.each([false, true])('rejette un pair absent (mapping obsolète : %s)', async (mapped) => {
    const { svc, state, sendFile, sendMedia, flush } = fixture()
    state.peers.clear()
    if (mapped) svc.getPeerPublicKeyMap().set(noiseId, ed25519Key)

    await expect(svc.sendFileData(mapped ? ed25519Key : noiseId, payload)).rejects.toThrow(/peer.*not found/i)
    expect(sendFile).not.toHaveBeenCalled()
    expect(sendMedia).not.toHaveBeenCalled()
    expect(flush).not.toHaveBeenCalled()
    expect(state.bandwidth.up).toBe(0)
  })

  it.each(['destroyed', 'destroying'] as const)('rejette un socket %s avant tout envoi', async (flag) => {
    const { svc, state, peer, sendFile, sendMedia, flush } = fixture()
    peer.socket[flag] = true

    await expect(svc.sendFileData(noiseId, payload)).rejects.toThrow(/socket.*closed/i)
    expect(sendFile).not.toHaveBeenCalled()
    expect(sendMedia).not.toHaveBeenCalled()
    expect(flush).not.toHaveBeenCalled()
    expect(state.bandwidth.up).toBe(0)
  })

  it('rejette sans message fichier/média et ne se rabat pas sur le canal principal', async () => {
    const { svc, state, peer, sendMain, flush } = fixture()
    peer.sendFile = undefined
    peer.sendMedia = undefined

    await expect(svc.sendFileData(noiseId, payload)).rejects.toThrow(/channel.*not available/i)
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
      const sending = svc.sendFileData(noiseId, payload)
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

      await expect(svc.sendFileData(noiseId, payload)).rejects.toThrow(/channel.*(?:not available|closed)/i)
      expect(sendFile).not.toHaveBeenCalled()
      expect(sendMedia).not.toHaveBeenCalled()
      expect(sendMain).not.toHaveBeenCalled()
      expect(flush).not.toHaveBeenCalled()
      expect(state.bandwidth.up).toBe(0)
    })

    it('rejette flush=false sans comptabiliser les octets', async () => {
      const { svc, state, flush } = fixture(route)
      flush.mockResolvedValue(false)

      await expect(svc.sendFileData(noiseId, payload)).rejects.toThrow(/flush/i)
      expect(flush).toHaveBeenCalledTimes(1)
      expect(state.bandwidth.up).toBe(0)
    })

    it('propage le rejet du flush sans comptabiliser les octets', async () => {
      const { svc, state, flush } = fixture(route)
      const error = new Error('transport failed')
      flush.mockRejectedValue(error)

      await expect(svc.sendFileData(noiseId, payload)).rejects.toBe(error)
      expect(state.bandwidth.up).toBe(0)
    })

    it('propage les exceptions send sans flusher ni comptabiliser les octets', async () => {
      const { svc, state, sendFile, sendMedia, flush } = fixture(route)
      const error = new Error('encoding failed')
      const send = route === 'file' ? sendFile : sendMedia
      send.mockImplementation(() => { throw error })

      await expect(svc.sendFileData(noiseId, payload)).rejects.toBe(error)
      expect(flush).not.toHaveBeenCalled()
      expect(state.bandwidth.up).toBe(0)
    })

    it('résout Ed25519 vers Noise pour le pair et vérifie uniquement le canal utilisé', async () => {
      const { svc, state, channels, sendFile, sendMedia, flush } = fixture(route)
      svc.getPeerPublicKeyMap().set(noiseId, ed25519Key)
      // Un canal inutilisé fermé ne doit pas invalider celui qui transporte le fichier.
      state.peerChannels.get(noiseId)![route === 'file' ? 'media' : 'file'] = { closed: true }
      channels.main.closed = true

      await expect(svc.sendFileData(ed25519Key, payload)).resolves.toBeUndefined()
      const send = route === 'file' ? sendFile : sendMedia
      expect(send).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenCalledWith(expectedData)
      expect(flush).toHaveBeenCalledTimes(1)
      expect(state.bandwidth.up).toBe(expectedData.length)
    })
  })
})
