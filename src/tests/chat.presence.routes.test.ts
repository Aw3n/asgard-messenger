/**
 * Routes de présence dans ChatService — ce qui se passe quand un message arrive.
 *
 * `presence.coherence.test.ts` verrouille les maillons isolés (mapping,
 * affichage, groupes). Le défaut réel n'est dans aucun de ces maillons : il est
 * dans l'ORDRE des appels. P2PService.ts:676-677 dispatche `message:<type>`
 * puis le `message` générique, donc `markPeerActive()` s'exécute APRÈS
 * `applyPresenceUpdate()` et, tant qu'il forçait « online », effaçait la
 * déclaration du pair toutes les 5 s — « absent », « occupé » et « invisible »
 * ne paraissaient jamais en face.
 *
 * Ces tests passent donc par le bus réel (`p2pService.emit`) et par le
 * `initialize()` de production, sans jamais appeler une méthode privée : ils
 * échoueraient si l'un des deux pièges revenait. L'activité est représentée par
 * `presence:pong`, le battement que le pair renvoie réellement ; les autres
 * types (chat, fichier) ont des auditeurs qui creusent le chiffrement et les
 * stores, ce n'est pas ce qu'on teste ici.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { p2pService } from '@/services/P2PService'
import { chatService } from '@/services/ChatService'
import { useContactStore } from '@/stores/contactStore'
import type { Contact, ProtocolMessage, UserStatus } from '@/types'
import type { NetworkStatus } from '@/utils/presence'

/** Une clé par test : les Maps internes du service sont partagées entre eux. */
let peerSeq = 0
function newPeer(): string {
  peerSeq += 1
  return peerSeq.toString(16).padStart(2, '0').repeat(32)
}

function seedContact(publicKey: string, status: UserStatus): Contact {
  const contact: Contact = {
    publicKey,
    displayName: 'Fabien',
    status,
    relation: 'contact',
    verified: true,
    addedAt: Date.now() - 86_400_000,
    lastSeen: Date.now() - 86_400_000,
  }
  useContactStore.getState().addContact(contact)
  return contact
}

const statusOf = (publicKey: string): UserStatus | undefined =>
  useContactStore.getState().getContact(publicKey)?.status

/**
 * Reproduction exacte de la remise P2PService : l'événement typé d'abord, le
 * générique ensuite. Le test « contrat d'ordre » plus bas vérifie que cet ordre
 * est bien toujours celui du code.
 */
function dispatch(type: string, payload: unknown, from: string): void {
  const msg = { id: 'm1', from, to: 'self', type, payload, timestamp: Date.now() } as unknown as ProtocolMessage
  p2pService.emit(`message:${type}`, msg)
  p2pService.emit('message', msg)
}

/** Ce que le pair dit de lui : `presence:update`. */
const declare = (status: NetworkStatus, extra: Record<string, unknown> = {}) =>
  dispatch('presence:update', { status, ...extra }, currentPeer)

/** Battement du pair : de l'activité, aucune déclaration. */
const heartbeat = (from: string = currentPeer) =>
  dispatch('presence:pong', { timestamp: Date.now() }, from)

let currentPeer = ''

beforeAll(() => {
  // auditeurs réels : c'est `initialize()` de production qui les branche
  chatService.initialize()
})

beforeEach(() => {
  currentPeer = newPeer()
  seedContact(currentPeer, 'offline')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('présence reçue : la déclaration du pair a la main', () => {
  it('« occupé » survit à l\'activité qui suit immédiatement la déclaration', () => {
    declare('dnd')
    expect(statusOf(currentPeer)).toBe('busy')

    heartbeat()
    expect(statusOf(currentPeer)).toBe('busy')
  })

  it('« absent » survit à une salve d\'activité', () => {
    declare('away')
    expect(statusOf(currentPeer)).toBe('away')
    for (let i = 0; i < 3; i++) heartbeat()
    expect(statusOf(currentPeer)).toBe('away')
  })

  it('« invisible » reste muet : le pair ne devient jamais « en ligne »', () => {
    // la confidentialité se traduit par le silence sur le réseau : seule la
    // valeur « offline » circule, et l'activité ne doit pas la contredire
    declare('offline')
    expect(statusOf(currentPeer)).toBe('offline')
    heartbeat()
    expect(statusOf(currentPeer)).toBe('offline')
  })

  it('« en ligne » déclaré est confirmé par l\'activité', () => {
    declare('online')
    expect(statusOf(currentPeer)).toBe('online')
    heartbeat()
    expect(statusOf(currentPeer)).toBe('online')
  })

  it('le message personnalisé et le nom voyagent avec le statut', () => {
    declare('dnd', { customStatus: 'En réunion', displayName: 'Fabien B.' })
    const contact = useContactStore.getState().getContact(currentPeer)
    expect(contact?.customStatus).toBe('En réunion')
    expect(contact?.displayName).toBe('Fabien B.')
  })
})

describe('aucune déclaration : l\'activité redevient la seule preuve', () => {
  it('montre « en ligne » le pair dont on n\'a jamais reçu le statut', () => {
    // le filet pour les anciennes versions du client en face, qui ne
    // redéclarent jamais : un simple battement suffit
    heartbeat()
    expect(statusOf(currentPeer)).toBe('online')
  })

  it('réaffiche « en ligne » quand la déclaration est périmée (45 s)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    declare('dnd')
    expect(statusOf(currentPeer)).toBe('busy')

    // le pair a changé d'état sans oser le redire : au-delà du timeout de
    // présence, une activité redevient une preuve
    vi.setSystemTime(1_000 + 46_000)
    heartbeat()
    expect(statusOf(currentPeer)).toBe('online')
  })

  it('tient la déclaration juste avant le timeout', () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000)
    declare('away')
    vi.setSystemTime(2_000 + 44_000)
    heartbeat()
    expect(statusOf(currentPeer)).toBe('away')
  })
})

describe('presence arrivée avant le contact', () => {
  it('est mise en file puis appliquée, pas perdue', () => {
    const unknown = newPeer() // aucun contact ne porte encore cette clé
    dispatch('presence:update', { status: 'dnd' }, unknown)
    expect(statusOf(unknown)).toBeUndefined()

    seedContact(unknown, 'offline')
    chatService.flushPendingPresence()
    expect(statusOf(unknown)).toBe('busy')
  })
})

describe('contrat d\'ordre', () => {
  it('P2PService émet bien l\'événement typé avant le générique', () => {
    // toute la série ci-dessus dépend de cet ordre : inversé, `markPeerActive()`
    // écraserait la déclaration — et ces tests cacheraient la régression s'ils
    // appelaient les méthodes privées dans l'autre sens
    const src = readFileSync(resolve(process.cwd(), 'src/services/P2PService.ts'), 'utf8')
    const typed = src.indexOf('this.emit(`message:${msg.type}`, msg)')
    const generic = src.indexOf(`this.emit('message', msg)`)
    expect(typed).toBeGreaterThan(-1)
    expect(generic).toBeGreaterThan(typed)
  })
})
