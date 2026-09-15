import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Hyperswarm from 'hyperswarm'
import Protomux from 'protomux'
import * as c from 'compact-encoding'

describe('Holepunch P2P network message exchange simulation', () => {
  let swarmA: Hyperswarm
  let swarmB: Hyperswarm
  const topic = Buffer.from('test-topic-simulation')
  const protocol = 'test-chat'
  let cleanup: (() => Promise<void>)[] = []

  beforeEach(() => {
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

  // NOTE: This integration test requires a proper network environment.
  // Skipped in unit test context.
  // CONFORMITÉ HOLEPUNCH (protomux 3.12.0) : l'API réelle est
  // Protomux.from(stream) → mux.createChannel({ protocol }) →
  // channel.addMessage({ encoding, onmessage }) → channel.open() →
  // message.send(data). Les anciennes méthodes mux.channel(name) /
  // channel.write()/end()/on('data') n'existent pas. Côté initiateur de la
  // connexion : info.client (PeerInfo n'expose pas `initiator`).
  it.skip('should exchange a message via Protomux channel', async () => {
    return new Promise<void>((resolve, reject) => {
      let received = false

      const onConnection = (socket: any, info: { client: boolean }) => {
        // Pattern officiel : Protomux.from() partage le mux via stream.userData
        const mux = Protomux.from(socket)
        const channel = mux.createChannel({
          protocol,
          id: null,
          ondestroy: () => { /* channel teardown */ },
        })
        if (!channel) return

        const message = channel.addMessage({
          encoding: c.binary,
          onmessage: (data: any) => {
            expect(b4aToString(data)).toBe('Hello from A')
            received = true
            channel.close()
            socket.destroy()
          },
        })

        channel.open()

        if (info.client) {
          // Initiator sends a message after a short delay to ensure receiver is ready
          setTimeout(() => {
            message.send(Buffer.from('Hello from A'))
          }, 100)
        }
      }

      swarmA.on('connection', onConnection)
      swarmB.on('connection', onConnection)

      // Wait a bit for connections to form and message to be exchanged
      setTimeout(() => {
        if (received) {
          resolve()
        } else {
          reject(new Error('Message not received'))
        }
      }, 10000) // Increased timeout to 10 seconds
    })
  })
})

// Local helper (b4a.toString style) — évite un import supplémentaire
function b4aToString(data: unknown): string {
  return Buffer.isBuffer(data) ? data.toString('utf-8') : Buffer.from(data as Uint8Array).toString('utf-8')
}
