/**
 * Time formatting utilities
 */

/**
 * Format a timestamp for display in conversations
 */
export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const dayMs = 24 * 60 * 60 * 1000

  if (diff < dayMs && date.getDate() === now.getDate()) {
    // Today — show time only
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diff < 2 * dayMs) {
    // Yesterday
    return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  } else if (diff < 7 * dayMs) {
    // This week — show day name
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  } else {
    // Older — show date
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
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

  if (diff < dayMs && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diff < 2 * dayMs) {
    return 'Yesterday'
  } else if (diff < 7 * dayMs) {
    return date.toLocaleDateString([], { weekday: 'short' })
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}

/**
 * Format a "last seen" relative time
 */
export function formatLastSeen(timestamp?: number): string {
  if (!timestamp) return 'Jamais'
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (diff < 60000) return 'À l\'instant'
  if (minutes < 60) return `Il y a ${minutes}min`
  if (hours < 24) return `Il y a ${hours}h`
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days}j`
  return `Il y a ${days} jours`
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
