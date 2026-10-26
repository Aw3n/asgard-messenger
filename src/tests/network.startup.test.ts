/**
 * Démarrage réseau non bloquant.
 *
 * Le bootstrap DHT (~6 s mesurées) et `swarm.listen()` ne doivent plus
 * retarder `setSeed()` : le renderer diale dès que le swarm est câblé. Les
 * dials partis trop tôt (table de routage vide) sont rejoués une fois le
 * réseau utilisable, et les topics attendent cette porte pour ne pas rater
 * leur première annonce.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

type Deferred = { promise: Promise<void>; resolve: () => void }

const h = vi.hoisted(() => {
  const deferred = (): Deferred => {
    let resolve!: () => void
    const promise = new Promise<void>((r) => { resolve = r })
    return { promise, resolve }
  }

  const state = {
    bootstrap: deferred(),
    listen: deferred(),
    swarmDialed: [] as string[],
    mutableGetCalls: 0,
    mutableGetValue: null as Buffer | null,
  }

  class FakeDHT {
    host = '127.0.0.1'
    port = 49737
    firewalled = true
    ephemeral = true
    static keyPair(): { publicKey: Buffer; secretKey: Buffer } {
      return { publicKey: Buffer.alloc(32, 1), secretKey: Buffer.alloc(64, 2) }
    }
    on(): this { return this }
    fullyBootstrapped(): Promise<void> { return state.bootstrap.promise }
    mutableGet(): Promise<{ value?: Buffer } | null> {
      state.mutableGetCalls++
      return Promise.resolve(state.mutableGetValue ? { value: state.mutableGetValue } : null)
    }
    toArray(): unknown[] { return [] }
    destroy(): Promise<void> { return Promise.resolve() }
  }

  class FakeSwarm {
    peers = new Map<string, { attempts: number; priority: number }>()
    keyPair = { publicKey: Buffer.alloc(32, 1), secretKey: Buffer.alloc(64, 2) }
    // Hyperswarm conserve l'instance DHT reçue en option et `getDHT()` la lit ici.
    dht: FakeDHT
    constructor(opts?: { dht?: FakeDHT }) {
      this.dht = opts?.dht ?? new FakeDHT()
    }
    on(): this { return this }
    listen(): Promise<void> { return state.listen.promise }
    joinPeer(publicKey: Buffer): void {
      const hex = publicKey.toString('hex')
      state.swarmDialed.push(hex)
      // Comme un pair déjà tenté plusieurs fois pendant le bootstrap.
      this.peers.set(hex, { attempts: 4, priority: 2 })
    }
    join(): { flushed: () => Promise<void> } {
      return { flushed: () => Promise.resolve() }
    }
    destroy(): Promise<void> { return Promise.resolve() }
  }

  return { deferred, state, FakeDHT, FakeSwarm }
})

vi.mock('hyperdht', () => ({ default: h.FakeDHT }))
vi.mock('hyperswarm', () => ({ default: h.FakeSwarm }))

type NetworkServiceModule = typeof import('../../electron/services/NetworkService')
type NetworkServiceInstance = InstanceType<NetworkServiceModule['NetworkService']>

let NetworkService: NetworkServiceModule['NetworkService']
let scratchAppData: string

beforeAll(async () => {
  scratchAppData = mkdtempSync(join(tmpdir(), 'asgard-startup-test-'))
  process.env.APPDATA = scratchAppData
  delete process.env.XDG_STATE_HOME
  NetworkService = (await import('../../electron/services/NetworkService')).NetworkService
})

afterAll(() => {
  try { rmSync(scratchAppData, { recursive: true, force: true }) } catch { /* temporaire déjà parti */ }
})

beforeEach(() => {
  h.state.bootstrap = h.deferred()
  h.state.listen = h.deferred()
  h.state.swarmDialed.length = 0
  h.state.mutableGetCalls = 0
  h.state.mutableGetValue = null
})

describe('démarrage non bloquant', () => {
  it('setSeed rend la main avant le bootstrap et rejoue les dials précoces', async () => {
    const svc: NetworkServiceInstance = new NetworkService()
    const started = Date.now()
    await svc.setSeed('aa'.repeat(32))
    expect(Date.now() - started).toBeLessThan(1000)
    expect((svc as unknown as { initialized: boolean }).initialized).toBe(true)

    const noise = 'bb'.repeat(32)
    svc.joinPeer(noise)
    expect(h.state.swarmDialed).toEqual([noise])

    h.state.bootstrap.resolve()
    await Promise.resolve()
    await Promise.resolve()
    h.state.listen.resolve()

    await vi.waitFor(() => {
      expect(h.state.swarmDialed.filter((key) => key === noise)).toHaveLength(2)
    })
    const swarm = (svc as unknown as { swarm: { peers: Map<string, { attempts: number }> } }).swarm
    expect(swarm.peers.get(noise)?.attempts).toBe(0)

    await svc.destroy()
  })

  it('retient les topics tant que la DHT n’est pas prête', async () => {
    const svc: NetworkServiceInstance = new NetworkService()
    await svc.setSeed('cc'.repeat(32))

    const topic = 'dd'.repeat(32)
    let joined = false
    const joinPromise = svc.join(topic).then(() => { joined = true })
    await new Promise((r) => setTimeout(r, 20))
    expect(joined).toBe(false)

    h.state.bootstrap.resolve()
    h.state.listen.resolve()
    await joinPromise
    expect(joined).toBe(true)
    expect((svc as unknown as { topics: Set<string> }).topics.has(topic)).toBe(true)

    await svc.destroy()
  })
})

describe('lecture DHT des profils — absence de record', () => {
  it('n’interroge qu’une fois un contact absent depuis deux cycles', async () => {
    const svc: NetworkServiceInstance = new NetworkService()
    await svc.setSeed('ee'.repeat(32))
    h.state.bootstrap.resolve()
    h.state.listen.resolve()
    await Promise.resolve()

    const key = 'ff'.repeat(32)
    const internals = svc as unknown as { profileMissStreak: Map<string, number> }
    internals.profileMissStreak.set(key, 2)

    const profile = await svc.fetchProfile(key)

    expect(profile).toBeNull()
    expect(h.state.mutableGetCalls).toBe(1)
    expect(internals.profileMissStreak.get(key)).toBe(3)

    await svc.destroy()
  })

  it('une lecture réussie remet le compteur à zéro et alimente le cache', async () => {
    const svc: NetworkServiceInstance = new NetworkService()
    await svc.setSeed('11'.repeat(32))
    h.state.bootstrap.resolve()
    h.state.listen.resolve()
    await Promise.resolve()

    const key = '22'.repeat(32)
    h.state.mutableGetValue = Buffer.from(JSON.stringify({
      displayName: 'Pair',
      status: 'online',
      timestamp: Date.now(),
    }))
    const internals = svc as unknown as { profileMissStreak: Map<string, number> }
    internals.profileMissStreak.set(key, 2)

    const first = await svc.fetchProfile(key)
    expect(first?.displayName).toBe('Pair')
    expect(h.state.mutableGetCalls).toBe(1)
    expect(internals.profileMissStreak.has(key)).toBe(false)

    const second = await svc.fetchProfile(key)
    expect(second?.displayName).toBe('Pair')
    expect(h.state.mutableGetCalls).toBe(1)

    await svc.destroy()
  })
})
