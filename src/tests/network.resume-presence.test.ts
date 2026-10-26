/**
 * Reprise du swarm : présence republiée, suspension voulue respectée.
 *
 * Deux chemins de reprise coexistaient. Celui branché sur l'écran appelait
 * `swarm.resume()` et rien d'autre : après une suspension longue, les
 * enregistrements DHT du profil et du statut avaient expiré, et l'app se
 * reconnectait sans être retrouvable par ses contacts. L'autre chemin (réseau
 * revenu) réannonçait tout — mais défaisait aussi une suspension demandée par
 * l'utilisateur à la première coupure passagère. Il n'en reste qu'un.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

type NetworkServiceModule = typeof import('../../electron/services/NetworkService')

let NetworkService: NetworkServiceModule['NetworkService']
let scratchAppData: string

beforeAll(async () => {
  scratchAppData = mkdtempSync(join(tmpdir(), 'asgard-resume-test-'))
  process.env.APPDATA = scratchAppData
  delete process.env.XDG_STATE_HOME
  NetworkService = (await import('../../electron/services/NetworkService')).NetworkService
})

afterAll(() => {
  try { rmSync(scratchAppData, { recursive: true, force: true }) } catch { /* temporaire déjà parti */ }
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function makeService() {
  const svc = new NetworkService()
  const topicStatus = { refresh: vi.fn().mockResolvedValue(undefined) }
  const swarm = {
    suspend: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue(topicStatus),
    server: { refresh: vi.fn() },
  }
  const internals = {
    swarm,
    server: swarm.server,
    topicStatus,
    publishProfile: vi.fn().mockResolvedValue(true),
    publishStatus: vi.fn().mockResolvedValue(true),
    flush: vi.fn().mockResolvedValue(undefined),
  }
  const target = svc as unknown as Record<string, unknown>
  Object.assign(target, internals)
  target.topics = new Set(['ab'.repeat(32)])
  target.lastDisplayName = 'Ada'
  target.currentStatusMessage = undefined
  return { svc, internals }
}

describe('reprise du swarm', () => {
  it('réannonce les topics et republie profil et statut', async () => {
    const { svc, internals } = makeService()

    await svc.suspend()
    await svc.resume()
    await tick()

    expect(internals.swarm.resume).toHaveBeenCalledTimes(1)
    expect(internals.topicStatus.refresh).toHaveBeenCalledTimes(1)
    expect(internals.publishProfile).toHaveBeenCalledWith('Ada')
    expect(internals.publishStatus).toHaveBeenCalledWith('online', undefined)
    expect(internals.flush).toHaveBeenCalled()
    expect(internals.server.refresh).not.toHaveBeenCalled()
  })

  it('ne défait pas une suspension demandée quand le réseau revient', async () => {
    const { svc, internals } = makeService()

    await svc.suspend()
    svc.handleNetworkChange(false)
    svc.handleNetworkChange(true)
    await tick()

    expect(internals.swarm.resume).not.toHaveBeenCalled()
    expect(internals.server.refresh).not.toHaveBeenCalled()
  })

  it('reprend de lui-même après une coupure si l’utilisateur n’a pas suspendu', async () => {
    const { svc, internals } = makeService()

    svc.handleNetworkChange(false)
    svc.handleNetworkChange(true)
    await tick()

    expect(internals.swarm.resume).toHaveBeenCalledTimes(1)
    expect(internals.server.refresh).toHaveBeenCalledTimes(1)
  })

  it('redevient auto-reprenable après une reprise demandée', async () => {
    const { svc, internals } = makeService()

    await svc.suspend()
    await svc.resume()
    svc.handleNetworkChange(false)
    svc.handleNetworkChange(true)
    await tick()

    expect(internals.swarm.resume).toHaveBeenCalledTimes(2)
  })
})
