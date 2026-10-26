/**
 * Ancre du séparateur « Nouveaux messages ».
 *
 * Le compteur non lu ne porte pas d'identifiant : il faut le retrouver en
 * remontant depuis le dernier message. Un total plus grand que la fenêtre
 * chargée ne doit jamais produire un trait au mauvais endroit.
 */
import { describe, it, expect } from 'vitest'
import { findFirstUnreadMessageId } from '@/utils/unreadDivider'

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)

const msg = (id: string, senderId: string) => ({ id, senderId })

describe('findFirstUnreadMessageId', () => {
  it('trouve le premier non lu en remontant depuis la fin', () => {
    const messages = [
      msg('m1', PEER),
      msg('m2', ME),
      msg('m3', PEER),
      msg('m4', PEER),
    ]

    expect(findFirstUnreadMessageId(messages, 2, ME)).toBe('m3')
    expect(findFirstUnreadMessageId(messages, 1, ME)).toBe('m4')
  })

  it('ignore les messages envoyés par soi-même', () => {
    const messages = [msg('m1', PEER), msg('m2', ME), msg('m3', PEER)]

    expect(findFirstUnreadMessageId(messages, 2, ME)).toBe('m1')
  })

  it('ne pose rien si le point de lecture est hors de la fenêtre chargée', () => {
    const messages = [msg('m1', PEER), msg('m2', PEER)]

    expect(findFirstUnreadMessageId(messages, 5, ME)).toBeUndefined()
  })

  it('ne pose rien sans non-lus ou sans identité', () => {
    const messages = [msg('m1', PEER)]

    expect(findFirstUnreadMessageId(messages, 0, ME)).toBeUndefined()
    expect(findFirstUnreadMessageId(messages, 1, '')).toBeUndefined()
  })
})
