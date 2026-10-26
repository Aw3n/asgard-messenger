import type { NotificationSettings } from '../types/ui'

/**
 * Heures silencieuses réglables (notifications.scheduledDnd + dndFrom/dndTo).
 * Le simple bouton « Ne pas déranger » exige de le penser avant la soirée :
 * celui qui pose un calendrier 22:00 → 07:00 veut du silence chaque nuit, pas
 * seulement tant que l'interrupteur reste levé.
 */

/** Les deux bornes sont en minutes locales ; une borne absente ou fausse annule la fenêtre. */
export interface QuietWindow {
  from: number
  to: number
}

const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2})?$/

/** "22:00", " 22:00:30 " → 1320 ; "9:000", "25:00", "" , undefined → null. */
function toMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = TIME_PATTERN.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Fenêtre demandée par les réglages, ou null si elle n'existe pas.
 * from === to est traité comme une fenêtre non posée : deux heures identiques
 * signalaient plutôt un réglage inachevé qu'un silence de 24 heures qui coupe
 * toutes les alertes sans que personne l'ait voulu.
 */
export function quietWindow(notif: Pick<NotificationSettings, 'dndFrom' | 'dndTo'>): QuietWindow | null {
  const from = toMinutes(notif.dndFrom)
  const to = toMinutes(notif.dndTo)
  if (from === null || to === null || from === to) return null
  return { from, to }
}

/** Le silence programmé est-il en cours à l'instant donné ? */
export function inQuietWindow(
  window: QuietWindow,
  now: { getHours(): number; getMinutes(): number },
): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes()
  // Une fenêtre qui franchit minuit (22:00 → 07:00) est silencieuse après son
  // début OU avant sa fin ; une fenêtre de journée (09:00 → 17:00) est entre les deux.
  return window.from < window.to
    ? minutes >= window.from && minutes < window.to
    : minutes >= window.from || minutes < window.to
}

/**
 * Décision finale d'alerte : l'interrupteur manuel lève le silence tout de
 * suite, le calendrier le lève pendant sa fenêtre. Le déni reste silencieux,
 * non destructive — les non-lus et les accusés de lecture continuent.
 */
export function isQuietNow(
  notif: Pick<NotificationSettings, 'dndMode' | 'scheduledDnd' | 'dndFrom' | 'dndTo'>,
  now: Date = new Date(),
): boolean {
  if (notif.dndMode) return true
  if (!notif.scheduledDnd) return false
  const window = quietWindow(notif)
  return window !== null && inQuietWindow(window, now)
}
