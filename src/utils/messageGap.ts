import type { Message } from '@/types'

/**
 * Position exacte d'un message dans l'historique.
 *
 * L'horodatage seul ne suffit pas : plusieurs messages peuvent partager la
 * même milliseconde, et une pagination `après tel horodatage` les sauterait.
 * Le couple (horodatage, identifiant) correspond à la clé Hyperbee.
 */
export interface MessageCursor {
  timestamp: number
  id: string
}

export function compareMessageCursor(a: MessageCursor, b: MessageCursor): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Curseur du message le plus récent d'une page, ou null si elle est vide. */
export function newestMessageCursor(messages: Message[]): MessageCursor | null {
  let newest: MessageCursor | null = null
  for (const message of messages) {
    const cursor = { timestamp: message.timestamp, id: message.id }
    if (!newest || compareMessageCursor(cursor, newest) > 0) newest = cursor
  }
  return newest
}

/** Ordre du stockage : horodatage puis identifiant, comme la clé Hyperbee. */
export function sortMessagesByCursor(messages: Message[]): Message[] {
  return [...messages].sort(compareMessageCursor)
}
