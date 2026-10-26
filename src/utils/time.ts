/**
 * Time formatting utilities
 */

import i18n from '../i18n/config'

/**
 * Get the current locale for date formatting
 */
function getLocale(): string {
  return i18n.language || 'fr'
}

/**
 * Nombre de jours calendaires entre deux instants. Deux dates séparées de
 * 47 h peuvent appartenir à deux jours ou à trois : un message d'avant-hier
 * à 22 h, lu le surlendemain à 10 h, reste à moins de 48 h et était annoncé
 * « hier ». Le calcul part de minuit pour chaque date, et l'arrondi absorbe
 * les journées de 23 ou 25 h des changements d'heure.
 */
function calendarDaysAgo(date: Date, now: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOfDay(now) - startOfDay(date)) / (24 * 60 * 60 * 1000))
}

/**
 * Format a timestamp for display in conversations
 * CHAT SETTINGS: `withSeconds` adds seconds to the time (chat.showSeconds).
 */
export function formatMessageTime(timestamp: number, opts?: { withSeconds?: boolean }): string {
  const date = new Date(timestamp)
  const locale = getLocale()
  const seconds = opts?.withSeconds ? { second: '2-digit' as const } : {}
  const days = calendarDaysAgo(date, new Date())

  if (days <= 0) {
    // Today — show time only
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...seconds })
  } else if (days === 1) {
    // Yesterday
    return `${i18n.t('time.yesterday')} ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...seconds })}`
  } else if (days < 7) {
    // This week — show day name
    return date.toLocaleDateString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit', ...seconds })
  } else {
    // Older — show date
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
  }
}

/**
 * Format a timestamp for conversation list (compact)
 */
export function formatConversationTime(timestamp: number): string {
  const date = new Date(timestamp)
  const locale = getLocale()
  const days = calendarDaysAgo(date, new Date())

  if (days <= 0) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  } else if (days === 1) {
    return i18n.t('time.yesterday')
  } else if (days < 7) {
    return date.toLocaleDateString(locale, { weekday: 'short' })
  } else {
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  }
}

/**
 * Format a "last seen" relative time
 */
export function formatLastSeen(timestamp?: number): string {
  if (!timestamp) return i18n.t('time.updated')
  const date = new Date(timestamp)
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = calendarDaysAgo(date, new Date())

  if (diff < 60000) return i18n.t('time.justNow')
  if (minutes < 60) return i18n.t('time.minutesAgo', { count: minutes })
  if (hours < 24) return i18n.t('time.hoursAgo', { count: hours })
  if (days === 1) return i18n.t('time.yesterday')
  // La journée de 25 h du retour à l'heure d'hiver peut laisser 24 h écoulées
  // dans la même date : « il y a 0 jours » n'aurait aucun sens.
  return i18n.t('time.daysAgo', { count: Math.max(days, 1) })
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exp = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, exp)).toFixed(1)} ${units[exp]}`
}
