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
 * Format a timestamp for display in conversations
 * CHAT SETTINGS: `withSeconds` adds seconds to the time (chat.showSeconds).
 */
export function formatMessageTime(timestamp: number, opts?: { withSeconds?: boolean }): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const locale = getLocale()
  const seconds = opts?.withSeconds ? { second: '2-digit' as const } : {}

  if (diff < dayMs && date.getDate() === now.getDate()) {
    // Today — show time only
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...seconds })
  } else if (diff < 2 * dayMs) {
    // Yesterday
    return `${i18n.t('time.yesterday')} ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...seconds })}`
  } else if (diff < 7 * dayMs) {
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
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const locale = getLocale()

  if (diff < dayMs && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  } else if (diff < 2 * dayMs) {
    return i18n.t('time.yesterday')
  } else if (diff < 7 * dayMs) {
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
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (diff < 60000) return i18n.t('time.justNow')
  if (minutes < 60) return i18n.t('time.minutesAgo', { count: minutes })
  if (hours < 24) return i18n.t('time.hoursAgo', { count: hours })
  if (days === 1) return i18n.t('time.yesterday')
  if (days < 7) return i18n.t('time.daysAgo', { count: days })
  return i18n.t('time.daysAgo', { count: days })
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
