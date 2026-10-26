/**
 * Ancre du séparateur « Nouveaux messages ».
 *
 * Le compteur non lu d'un fil ne dit pas OÙ commence la lecture. En remontant
 * depuis le dernier message et en comptant les messages du pair, on retrouve
 * le premier non lu sans dépendre d'un horodatage de lecture persistant.
 * `undefined` quand la fenêtre chargée ne contient pas ce point : mieux vaut
 * aucun séparateur qu'un trait posé au mauvais endroit.
 */
export function findFirstUnreadMessageId(
  messages: readonly { id: string; senderId: string }[],
  unreadCount: number,
  myPublicKey: string,
): string | undefined {
  if (unreadCount <= 0 || !myPublicKey) return undefined
  let remaining = unreadCount
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].senderId === myPublicKey) continue
    remaining -= 1
    if (remaining === 0) return messages[i].id
  }
  return undefined
}
