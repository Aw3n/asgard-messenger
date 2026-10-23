/**
 * Compteur de la pastille « messages en dessous » : seuls les messages reçus
 * après l'ancre comptent, et une ancre absente ne doit jamais inventer un
 * nombre (changement de fil, historique purgé).
 */
import { describe, it, expect } from 'vitest'
import { countIncomingAfter } from '@/utils/incomingAfter'
import type { Message } from '@/types'

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)

const msg = (id: string, senderId: string, timestamp: number): Message => ({
  id,
  conversationId: 'conv',
  senderId,
  type: 'text',
  content: id,
  timestamp,
  status: 'delivered',
})

const base = [msg('m1', PEER, 1), msg('m2', ME, 2), msg('m3', PEER, 3)]

describe('countIncomingAfter', () => {
  it('compte les messages du pair après l’ancre, jamais les siens', () => {
    const later = [...base, msg('m4', PEER, 4), msg('m5', ME, 5), msg('m6', PEER, 6)]
    expect(countIncomingAfter(later, 'm3', ME)).toBe(2)
  })

  it('ne compte rien sans ancre ou si l’ancre a disparu', () => {
    expect(countIncomingAfter(base, undefined, ME)).toBe(0)
    expect(countIncomingAfter(base, 'absent', ME)).toBe(0)
  })

  it('ne compte pas les messages antérieurs à l’ancre', () => {
    expect(countIncomingAfter(base, 'm2', ME)).toBe(1)
    expect(countIncomingAfter(base, 'm1', ME)).toBe(1)
  })
})
