/**
 * Heures silencieuses : la fenêtre réglée doit couper l'alerte, rien d'autre.
 *
 * `notifications.dndFrom` et `dndTo` vivaient dans le type et dans les
 * exportations de paramètres depuis le premier commit sans qu'aucun lecteur ne
 * les regarde : seul l'interrupteur manuel « Ne pas déranger » décidait, et il
 * fallait le penser chaque soir. Ces tests fixent la géométrie de la fenêtre —
 * borne de début incluse, borne de fin exclue, franchissement de minuit — parce
 * qu'une plage inversée de quelques minutes endormirait toutes les alertes ou
 * n'en couperait aucune.
 */
import { describe, expect, it } from 'vitest'
import { inQuietWindow, isQuietNow, quietWindow } from '@/utils/quietHours'

const at = (hours: number, minutes = 0) => new Date(2026, 0, 15, hours, minutes)
const NOTIF = { dndMode: false, scheduledDnd: false, dndFrom: undefined, dndTo: undefined }

const describeWindow = (from: string, to: string) => quietWindow({ ...NOTIF, dndFrom: from, dndTo: to })

describe('fenêtre silencieuse posée', () => {
  it('lit deux heures valables en minutes locales', () => {
    expect(describeWindow('22:00', '07:00')).toEqual({ from: 22 * 60, to: 7 * 60 })
  })

  /** Une seule borne effacée rend la plage incohérente : elle ne doit rien couper. */
  it('ignore une fenêtre inachevée', () => {
    expect(describeWindow('22:00', '')).toBeNull()
    expect(describeWindow('', '07:00')).toBeNull()
    expect(describeWindow(undefined as unknown as string, undefined as unknown as string)).toBeNull()
  })

  /** Deux heures identiques signalaient un réglage inachevé, pas 24 h de silence. */
  it('refuse une plage qui durerait vingt-quatre heures', () => {
    expect(describeWindow('22:00', '22:00')).toBeNull()
  })

  it('tolère les espaces et une écriture à un chiffre', () => {
    expect(describeWindow(' 9:05 ', '17:00')).toEqual({ from: 9 * 60 + 5, to: 17 * 60 })
  })

  it('ignore les secondes d’une horloge à trois champs', () => {
    expect(describeWindow('22:00:30', '07:00:00')).toEqual({ from: 22 * 60, to: 7 * 60 })
  })

  it('jette une heure qui n’existe pas', () => {
    expect(describeWindow('25:00', '07:00')).toBeNull()
    expect(describeWindow('22:00', '07:60')).toBeNull()
    expect(describeWindow('0900', '1700')).toBeNull()
    expect(describeWindow('22:0', '07:00')).toBeNull()
    expect(describeWindow('diable', '07:00')).toBeNull()
  })

  it('jette une borne qui n’est pas une chaîne', () => {
    expect(describeWindow(42 as unknown as string, null as unknown as string)).toBeNull()
  })
})

describe('intérieur de la fenêtre', () => {
  const night = { from: 22 * 60, to: 7 * 60 }
  const day = { from: 9 * 60, to: 17 * 60 }

  it('dort une nuit qui franchit minuit', () => {
    expect(inQuietWindow(night, at(22))).toBe(true)
    expect(inQuietWindow(night, at(2, 30))).toBe(true)
    expect(inQuietWindow(night, at(6, 59))).toBe(true)
  })

  /** La borne de début coupe déjà : 22:00 précises, l’alerte est muette. */
  it('include la première minute', () => {
    expect(inQuietWindow(day, at(9))).toBe(true)
  })

  /** La borne de fin rend la parole : 07:00, les alertes reviennent. */
  it('exclut la dernière minute', () => {
    expect(inQuietWindow(night, at(7))).toBe(false)
    expect(inQuietWindow(day, at(17))).toBe(false)
  })

  it('veille hors d’une plage de journée', () => {
    expect(inQuietWindow(day, at(8, 59))).toBe(false)
    expect(inQuietWindow(day, at(13))).toBe(true)
    expect(inQuietWindow(day, at(23))).toBe(false)
  })

  /** La demi-heure compte : une plage qui commence à 09:30 ne dort pas à 09:20,
   *  et une horloge tronquée à l'heure rendrait le silence trop généreux. */
  it('compte les minutes, pas seulement les heures', () => {
    const half = { from: 9 * 60 + 30, to: 17 * 60 }
    expect(inQuietWindow(half, at(9, 20))).toBe(false)
    expect(inQuietWindow(half, at(9, 30))).toBe(true)
    expect(inQuietWindow(half, at(16, 50))).toBe(true)
  })
})

describe('décision d’alerte', () => {
  it('suit l’interrupteur manuel, calendrier ou pas', () => {
    expect(isQuietNow({ ...NOTIF, dndMode: true }, at(13))).toBe(true)
    expect(isQuietNow({ ...NOTIF, dndMode: true, scheduledDnd: false }, at(13))).toBe(true)
  })

  /** Le réglage est posé mais l’interrupteur du calendrier reste baissé. */
  it('ignore une plage que rien n’a armée', () => {
    expect(isQuietNow({ ...NOTIF, dndFrom: '22:00', dndTo: '07:00' }, at(23))).toBe(false)
  })

  it('endort les alertes pendant la plage armée', () => {
    const armed = { ...NOTIF, scheduledDnd: true, dndFrom: '22:00', dndTo: '07:00' }
    expect(isQuietNow(armed, at(23, 30))).toBe(true)
    expect(isQuietNow(armed, at(13))).toBe(false)
  })

  it('ne mute rien quand la plage est fausse', () => {
    const armed = { ...NOTIF, scheduledDnd: true, dndFrom: 'midi', dndTo: '07:00' }
    expect(isQuietNow(armed, at(23))).toBe(false)
  })

  /** L’heure courante par défaut : un réglage manuel levé se voit tout de suite. */
  it('se passe d’horloge fournie', () => {
    expect(isQuietNow({ ...NOTIF, dndMode: true })).toBe(true)
    expect(isQuietNow({ ...NOTIF })).toBe(false)
  })

  it('accepte les réglages absents du magasin', () => {
    expect(isQuietNow({} as never, at(3))).toBe(false)
  })
})
