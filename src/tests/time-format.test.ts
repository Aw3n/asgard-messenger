/**
 * Les libellés « hier » des horodatages partageaient une fenêtre de 48 h :
 * un message d'avant-hier à 22 h, lu le surlendemain à 10 h, restait annoncé
 * « hier ». Le décompte part désormais de minuit.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/config', () => ({
  default: {
    language: 'fr',
    t: (key: string, opts?: { count?: number }) =>
      opts?.count === undefined ? key : `${key}:${opts.count}`,
  },
}))

import { formatConversationTime, formatLastSeen, formatMessageTime } from '@/utils/time'

const setNow = (date: Date) => {
  vi.useFakeTimers()
  vi.setSystemTime(date)
}

const heure = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })

afterEach(() => {
  vi.useRealTimers()
})

describe('formatMessageTime', () => {
  it('garde l’heure seule pour un message du jour', () => {
    setNow(new Date(2026, 2, 11, 10, 0))
    const timestamp = new Date(2026, 2, 11, 9, 5).getTime()

    expect(formatMessageTime(timestamp)).toBe(heure(timestamp))
  })

  it('nomme la veille', () => {
    setNow(new Date(2026, 2, 11, 10, 0))
    const timestamp = new Date(2026, 2, 10, 22, 0).getTime()

    expect(formatMessageTime(timestamp)).toBe(`time.yesterday ${heure(timestamp)}`)
  })

  it('ne nomme pas « hier » un message d’avant-hier resté sous 48 h', () => {
    setNow(new Date(2026, 2, 11, 10, 0))
    const timestamp = new Date(2026, 2, 9, 22, 0).getTime()
    const libelle = formatMessageTime(timestamp)

    expect(libelle.startsWith('time.yesterday')).toBe(false)
    expect(libelle).toBe(
      new Date(timestamp).toLocaleDateString('fr', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    )
  })
})

describe('formatConversationTime', () => {
  it('nomme la veille', () => {
    setNow(new Date(2026, 2, 11, 10, 0))
    const timestamp = new Date(2026, 2, 10, 22, 0).getTime()

    expect(formatConversationTime(timestamp)).toBe('time.yesterday')
  })

  it('affiche le jour de la semaine pour avant-hier, pas « hier »', () => {
    setNow(new Date(2026, 2, 11, 10, 0))
    const timestamp = new Date(2026, 2, 9, 22, 0).getTime()

    expect(formatConversationTime(timestamp)).toBe(
      new Date(timestamp).toLocaleDateString('fr', { weekday: 'short' }),
    )
  })
})

describe('formatLastSeen', () => {
  it('compte en heures tant que la dernière présence date de moins de 24 h', () => {
    setNow(new Date(2026, 2, 11, 10, 0))

    expect(formatLastSeen(Date.now() - 2 * 3600000)).toBe('time.hoursAgo:2')
  })

  it('nomme la veille dès que la présence dépasse 24 h', () => {
    setNow(new Date(2026, 2, 11, 23, 59))
    const timestamp = new Date(2026, 2, 10, 22, 0).getTime()

    expect(formatLastSeen(timestamp)).toBe('time.yesterday')
  })

  it('ne nomme pas « hier » une présence d’avant-hier restée sous 48 h', () => {
    setNow(new Date(2026, 2, 11, 10, 0))
    const timestamp = new Date(2026, 2, 9, 22, 0).getTime()

    expect(formatLastSeen(timestamp)).toBe('time.daysAgo:2')
  })
})
