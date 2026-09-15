import { describe, it, beforeEach, afterEach } from 'vitest'
import Hyperswarm from 'hyperswarm'
import { tmpdir } from 'os'
import { join } from 'path'
import { rm, mkdtemp } from 'fs/promises'

describe('Corestore replication over Hyperswarm (Holepunch network simulation)', () => {
  let dirA: string
  let dirB: string
  let storeA: any
  let storeB: any
  let swarmA: Hyperswarm
  let swarmB: Hyperswarm
  const topic = Buffer.from('test-replication-topic')
  let cleanup: (() => Promise<void>)[] = []
  let Corestore: any
  let Hyperbee: any

  beforeEach(async () => {
    // Dynamically import modules to match project style
    const corestoreModule = await import('corestore')
    Corestore = corestoreModule.default
    const hyperbeeModule = await import('hyperbee')
    Hyperbee = hyperbeeModule.default

    // Create temporary directories for storage
    dirA = await mkdtemp(join(tmpdir(), 'asgard-test-rep-a-'))
    dirB = await mkdtemp(join(tmpdir(), 'asgard-test-rep-b-'))
    // Initialize Corestore instances
    storeA = new Corestore(dirA)
    storeB = new Corestore(dirB)
    await storeA.ready()
    await storeB.ready()
    cleanup.push(async () => {
      await storeA.close()
      await storeB.close()
      await rm(dirA, { recursive: true, force: true })
      await rm(dirB, { recursive: true, force: true })
    })

    // Create Hyperswarm instances
    swarmA = new Hyperswarm()
    swarmB = new Hyperswarm()
    cleanup.push(async () => {
      await swarmA.destroy()
      await swarmB.destroy()
    })

    // Join the same topic on both swarms
    swarmA.join(topic, { client: true, server: true })
    swarmB.join(topic, { client: true, server: true })
  })

  afterEach(async () => {
    // Run cleanup functions in reverse order
    for (const fn of cleanup.slice().reverse()) {
      await fn()
    }
    cleanup = []
  })

  // NOTE: This integration test requires compatible versions of corestore/hyperbee/hyperswarm
  // and a proper network environment. Skipped in unit test context.
  // CONFORMITÉ HOLEPUNCH (corestore 7.12.5 + hyperbee 2.27.3) : le constructeur
  // Hyperbee est (core, opts) — pas (store, name, opts). Le pattern officiel de
  // réplication sur socket Hyperswarm est store.replicate(socket) directement dans
  // le handler 'connection' (isStream → réutilise le mux Protomux du socket) —
  // l'ancien style replication.pipe(socket).pipe(replication) est pré-protomux.
  it.skip('should replicate a Hyperbee feed between two instances via Hyperswarm', async () => {
    // Cores nommés via corestore.get({ name }) — les DEUX instances doivent
    // utiliser le même core pour répliquer (récupérer la key partagée).
    const coreA = storeA.get({ name: 'test-db' })
    await coreA.ready()
    const dbA = new Hyperbee(coreA, {
      valueEncoding: 'utf-8',
      keyEncoding: 'utf-8'
    })
    await dbA.ready()

    // storeB ouvre le même core par sa KEY (publiée côté A)
    const coreB = storeB.get({ key: coreA.key })
    await coreB.ready()
    const dbB = new Hyperbee(coreB, {
      valueEncoding: 'utf-8',
      keyEncoding: 'utf-8'
    })
    await dbB.ready()

    // Pattern officiel : replication directe du socket dans le handler connection
    swarmA.on('connection', (socket: any) => {
      storeA.replicate(socket)
    })
    swarmB.on('connection', (socket: any) => {
      storeB.replicate(socket)
    })

    return new Promise<void>((resolve, reject) => {
      let received = false
      // Wait for the value to appear in dbB
      const check = async () => {
        const entry = await dbB.get('test-key')
        if (entry && entry.value === 'test-value') {
          received = true
          clearInterval(interval)
          resolve()
        }
      }
      const interval = setInterval(check, 100)

      // Put a value in dbA after a short delay to allow replication setup
      setTimeout(() => {
        dbA.put('test-key', 'test-value')
      }, 200)

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!received) {
          clearInterval(interval)
          reject(new Error('Value not replicated within timeout'))
        }
      }, 5000)
    })
  })
})
