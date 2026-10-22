/**
 * Publication du record DHT : seq mémorisé et écriture finale au shutdown.
 *
 * Le log réel de fermeture (2026-10-22 21:47:31) montrait la séquence
 * complète : lecture du seq échouée → écriture « offline » avec seq=1 (donc
 * rejetable) → swarm.destroy() ~1 s plus tard → mutablePut « Node destroyed ».
 * Le record restait « online » sur le réseau alors que l'application était
 * fermée. Ces tests fixent le comportement voulu : un seul seq mémorisé après
 * chaque écriture vérifiée, et au shutdown UN seul mutablePut sans lecture ni
 * relecture.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

type NetworkServiceModule = typeof import('../../electron/services/NetworkService')
type NetworkServiceInstance = InstanceType<NetworkServiceModule['NetworkService']>

let NetworkService: NetworkServiceModule['NetworkService']
let scratchAppData: string

beforeAll(async () => {
  scratchAppData = mkdtempSync(join(tmpdir(), 'asgard-publish-test-'))
  process.env.APPDATA = scratchAppData
  delete process.env.XDG_STATE_HOME
  NetworkService = (await import('../../electron/services/NetworkService')).NetworkService
})

afterAll(() => {
  try { rmSync(scratchAppData, { recursive: true, force: true }) } catch { /* temporaire déjà parti */ }
})

/** HyperDHT minimal : accepte un seq strictement croissant, comme les nœuds réels. */
class FakeDHT {
  host = '127.0.0.1'
  port = 49737
  firewalled = true
  ephemeral = true
  record: { value: Buffer; seq: number } | null = null
  gets = 0
  puts: Array<{ seq: number; value: Buffer }> = []

  static keyPair(): { publicKey: Buffer; secretKey: Buffer } {
    return { publicKey: Buffer.alloc(32, 1), secretKey: Buffer.alloc(64, 2) }
  }
  on(): this { return this }
  fullyBootstrapped(): Promise<void> { return Promise.resolve() }
  toArray(): unknown[] { return [] }
  destroy(): Promise<void> { return Promise.resolve() }

  async mutableGet(): Promise<{ value?: Buffer; seq?: number } | null> {
    this.gets++
    return this.record ? { value: this.record.value, seq: this.record.seq } : null
  }

  async mutablePut(_keyPair: unknown, value: Buffer, opts?: { seq?: number }): Promise<void> {
    const seq = opts?.seq ?? 0
    this.puts.push({ seq, value: Buffer.from(value) })
    // Comme hyperdht : la promise résout même quand les nœuds rejettent
    // (SEQ_TOO_LOW / SEQ_REUSED) — seul le contenu stocké compte.
    if (this.record && seq <= this.record.seq) return
    this.record = { value: Buffer.from(value), seq }
  }

  stored(): { displayName?: string; status?: string; lastSeen?: number } {
    return JSON.parse((this.record?.value ?? Buffer.from('{}')).toString())
  }
}

function wire(svc: NetworkServiceInstance, dht: FakeDHT): void {
  const swarm = {
    dht,
    keyPair: { publicKey: Buffer.alloc(32, 7), secretKey: Buffer.alloc(64, 8) },
    peers: new Map<string, unknown>(),
    suspended: false,
    joinPeer: (): void => {},
    destroy: async (): Promise<void> => {},
  }
  ;(svc as unknown as { swarm: unknown }).swarm = swarm
}

describe('publication DHT du statut', () => {
  it('réutilise le seq mémorisé au lieu de relire le record à chaque statut', async () => {
    const dht = new FakeDHT()
    const svc = new NetworkService()
    wire(svc, dht)

    await svc.publishProfile('Warjaz')
    expect(dht.gets).toBe(2) // lecture du seq + vérification de l'écriture
    expect(dht.puts.map((p) => p.seq)).toEqual([1])

    await svc.publishStatus('away', 'réunion')
    await svc.publishStatus('online')

    // Une seule lecture de plus par statut (la vérification), pas deux.
    expect(dht.gets).toBe(4)
    expect(dht.puts.map((p) => p.seq)).toEqual([1, 2, 3])
    expect(dht.stored()).toMatchObject({ displayName: 'Warjaz', status: 'online' })
  })

  it('se rétablit si un autre writer a fait avancer le seq stocké', async () => {
    const dht = new FakeDHT()
    const svc = new NetworkService()
    wire(svc, dht)

    await svc.publishStatus('online')
    dht.record = { value: Buffer.from(JSON.stringify({ displayName: 'Warjaz', status: 'online' })), seq: 5 }

    const landed = await svc.publishStatus('away')

    expect(landed).toBe(true)
    expect(dht.record?.seq).toBe(6)
    expect(dht.stored().status).toBe('away')
  })

  it('au shutdown, écrit « offline » en un seul mutablePut, sans lecture', async () => {
    const dht = new FakeDHT()
    const svc = new NetworkService()
    wire(svc, dht)

    await svc.publishStatus('online')
    const getsBefore = dht.gets
    const putsBefore = dht.puts.length

    await svc.destroy()

    // Le budget de fermeture ne paie plus lecture + écriture + relecture.
    expect(dht.gets).toBe(getsBefore)
    expect(dht.puts.length).toBe(putsBefore + 1)
    expect(dht.puts[dht.puts.length - 1].seq).toBe(2)
    expect(dht.stored().status).toBe('offline')
    expect(typeof dht.stored().lastSeen).toBe('number')

    const swarm = (svc as unknown as { swarm: unknown }).swarm
    expect(swarm).toBeNull()
  })

  it('au premier shutdown sans statut publié, garde le chemin vérifié', async () => {
    const dht = new FakeDHT()
    const svc = new NetworkService()
    wire(svc, dht)

    await svc.destroy()

    expect(dht.puts.map((p) => p.seq)).toEqual([1])
    expect(dht.stored().status).toBe('offline')
  })
})
