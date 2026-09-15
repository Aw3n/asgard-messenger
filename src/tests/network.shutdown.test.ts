/**
 * Fermeture du service réseau : deux races qui affichaient une boîte
 * « A JavaScript error occurred in the main process » chez l'utilisateur.
 *
 * 1. `TypeError: Cannot set properties of null (setting 'queued')` — Hyperswarm
 *    draine sa file de pairs à connecter depuis les handlers `close` de ses
 *    streams (`_connectDone` → `_attemptClientConnections`). Pendant le
 *    teardown, les connexions meurent une à une et la file, cohérente en
 *    apparence (`length > 0`), ne fournit plus qu'un `peerInfo` null. Le test
 *    reproduit le mécanisme sur le prototype réel de la librairie, puis prouve
 *    que le drapeau `suspended` — celui que `NetworkService.quiesceSwarm()` pose
 *    maintenant — coupe court à ce drain.
 * 2. Un DHT injoignable qui ne répond jamais immobilisait la fermeture, volait
 *    le budget du filet « force-exit 5 s » et affamait le teardown du stockage.
 *
 * Le cas 1 est traité sur deux étages : le gel `suspended` du teardown, et un
 * blindage posé à la création du swarm pour les fermetures qui court-circuitent
 * ce teardown (cf. le second `describe`).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

type NetworkServiceModule = typeof import('../../electron/services/NetworkService')
type NetworkServiceInstance = InstanceType<NetworkServiceModule['NetworkService']>

/** Accès aux membres privés, le temps de vérifier l'ordre du teardown. */
type Inspectable = {
  swarm: unknown
  shuttingDown: boolean
  updatePeerScores: () => void
  publishStatus: (status: string, message?: string) => Promise<boolean>
}
const inspect = (svc: NetworkServiceInstance): Inspectable => svc as unknown as Inspectable

let NetworkService: NetworkServiceModule['NetworkService']
let scratchAppData: string

beforeAll(async () => {
  // NetworkService écrit un log du process principal dès le chargement du
  // module : on le dévie vers un répertoire temporaire pour ne pas polluer les
  // diagnostics réels de l'utilisateur (%APPDATA%\asgard-network.log).
  scratchAppData = mkdtempSync(join(tmpdir(), 'asgard-test-'))
  process.env.APPDATA = scratchAppData
  delete process.env.XDG_STATE_HOME
  NetworkService = (await import('../../electron/services/NetworkService')).NetworkService
})

afterAll(() => {
  try { rmSync(scratchAppData, { recursive: true, force: true }) } catch { /* temporaire déjà parti */ }
})

describe('race de re-connexion dans hyperswarm', () => {
  it('se reproduit exactement là où elle éclatait, et le drapeau suspended l’arrête', async () => {
    const { default: Hyperswarm } = await import('hyperswarm')
    const drain = (Hyperswarm as unknown as {
      prototype: { _attemptClientConnections: () => void }
    }).prototype._attemptClientConnections

    // État minimal d'un swarm dont les streams sont en train de mourir : la file
    // annonce encore un élément (`length > 0`) mais sa tête est déjà null.
    const swarm = {
      _drainingQueue: false,
      suspended: false,
      explicitPeers: new Set<unknown>(),
      connecting: 0,
      maxParallel: 3,
      _shouldConnect: () => true,
      _queue: { length: 1, shift: () => null },
    }

    expect(() => drain.call(swarm)).toThrow(/Cannot set properties of (?:null|undefined)/)

    // Le garde-fou posé par NetworkService.quiesceSwarm() : la boucle de drain
    // est court-circuitée avant même de toucher la file.
    swarm.suspended = true
    expect(() => drain.call(swarm)).not.toThrow()
  })
})

/**
 * Le même `peerInfo` null, mais quand notre teardown ne tourne pas : fin de
 * session brutale, force-exit à 5 s, ou version installée plus ancienne que le
 * correctif. `NetworkService.hardenSwarmQueueDrain()` est posé à la création du
 * swarm et tient donc quelle que soit la route d'arrêt.
 */
describe('file d’essaimage corrompue, en dehors de tout teardown', () => {
  /** Accès au blindage, privé par construction. */
  const harden = (svc: NetworkServiceInstance, swarm: unknown): void => {
    const target = svc as unknown as { hardenSwarmQueueDrain: (s: unknown) => void }
    target.hardenSwarmQueueDrain(swarm)
  }

  /** Le vrai drain de la librairie, posé en propriété d'instance pour être enveloppé. */
  const realDrain = async (): Promise<() => void> => {
    const { default: Hyperswarm } = await import('hyperswarm')
    return (Hyperswarm as unknown as {
      prototype: { _attemptClientConnections: () => void }
    }).prototype._attemptClientConnections
  }

  it('franchit le trou de la file et reprend le drain là où il s’arrêtait', async () => {
    const drain = await realDrain()
    const svc = new NetworkService()
    const peer = { queued: true, priority: 0 }
    const connected: unknown[] = []
    let shifts = 0

    const swarm = {
      _attemptClientConnections: drain,
      _drainingQueue: false,
      suspended: false,
      explicitPeers: new Set<unknown>(),
      connecting: 0,
      maxParallel: 3,
      _shouldConnect: () => true,
      _flushAllMaybe: (): void => {},
      _connect: (info: unknown): void => { connected.push(info) },
      // Un trou dans le seau : `length` le compte toujours, et le premier tirage
      // ne rend rien ; le suivant, qui remélange, retombe sur le pair.
      _queue: {
        get length (): number { return shifts < 2 ? 1 : 0 },
        shift: () => { shifts++; return shifts === 1 ? null : peer },
      },
    }

    harden(svc, swarm)
    expect(() => swarm._attemptClientConnections()).not.toThrow()

    // Ni figé, ni perdu : le pair attendu finit connecté, son drapeau est remis,
    // et la garde d'entrée n'est pas restée à true (sinon plus aucun essaimage).
    expect(connected).toEqual([peer])
    expect(peer.queued).toBe(false)
    expect(shifts).toBe(2)
    expect(swarm._drainingQueue).toBe(false)
  })

  it('borne le drain d’une file définitivement incohérente au lieu de le propager', async () => {
    const drain = await realDrain()
    const svc = new NetworkService()
    const shift = vi.fn(() => null)

    const swarm = {
      _attemptClientConnections: drain,
      _drainingQueue: false,
      suspended: false,
      explicitPeers: new Set<unknown>(),
      connecting: 0,
      maxParallel: 3,
      _shouldConnect: () => true,
      _flushAllMaybe: (): void => {},
      _connect: (): void => {},
      _queue: { length: 1, shift },
    }

    harden(svc, swarm)
    expect(() => swarm._attemptClientConnections()).not.toThrow()

    // Quatre tirages, pas une boucle sans fin sur un trou incurable.
    expect(shift).toHaveBeenCalledTimes(4)
    expect(swarm._drainingQueue).toBe(false)
  })
})

describe('NetworkService.destroy()', () => {
  const makeSwarm = (events: string[], destroy: () => Promise<void>) => ({
    suspended: false,
    connecting: 0,
    connections: new Set<unknown>(),
    destroyOpts: [] as Array<{ force?: boolean }>,
    async destroy(options?: { force?: boolean }): Promise<void> {
      events.push('swarm:destroy')
      this.destroyOpts.push(options ?? {})
      return destroy()
    },
  })

  it('gèle la machinerie de re-connexion avant la moindre attente réseau', async () => {
    vi.useFakeTimers()
    try {
      const events: string[] = []
      const svc = new NetworkService()
      const swarm = makeSwarm(events, async () => {})
      inspect(svc).swarm = swarm

      const suspendedAtPublish: boolean[] = []
      const publish = vi.fn(async () => {
        suspendedAtPublish.push(swarm.suspended)
        events.push('publish')
        // DHT qui ne répond jamais : la fermeture ne doit pas en dépendre.
        return await new Promise<boolean>(() => {})
      })
      inspect(svc).publishStatus = publish

      const finished = vi.fn()
      void svc.destroy().then(finished)
      await vi.advanceTimersByTimeAsync(10_000)

      expect(finished).toHaveBeenCalledTimes(1)
      expect(publish).toHaveBeenCalledWith('offline')
      // L'ordre est le correctif : le drapeau doit être levé AVANT que le
      // teardown n'attende quoi que ce soit, sinon les `close` arrivent pendant
      // l'attente et c'est exactement la course qui faisait planter.
      expect(suspendedAtPublish).toEqual([true])
      expect(events).toEqual(['publish', 'swarm:destroy'])
      expect(swarm.destroyOpts).toEqual([{ force: true }])
      expect(inspect(svc).swarm).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('libère la fermeture même si le swarm ne répond pas', async () => {
    vi.useFakeTimers()
    try {
      const events: string[] = []
      const svc = new NetworkService()
      const swarm = makeSwarm(events, () => new Promise<void>(() => {}))
      inspect(svc).swarm = swarm
      inspect(svc).publishStatus = async () => true

      const finished = vi.fn()
      void svc.destroy().then(finished)
      await vi.advanceTimersByTimeAsync(10_000)

      expect(finished).toHaveBeenCalledTimes(1)
      expect(events).toEqual(['swarm:destroy'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('ne réémet plus aucun statut une fois la fermeture engagée', () => {
    const svc = new NetworkService()
    const onUpdate = vi.fn()
    svc.on('status:update', onUpdate)

    // Tant que le service vit, les scores sont poussés à l'UI.
    inspect(svc).updatePeerScores()
    expect(onUpdate).toHaveBeenCalledTimes(1)

    inspect(svc).shuttingDown = true
    inspect(svc).updatePeerScores()
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
})
