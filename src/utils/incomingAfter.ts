import type { Message } from '@/types'

/**
 * Nombre de messages reçus après `previousId` (exclu). `previousId` est le
 * dernier message présent quand l'utilisateur a quitté le bas du fil ; un
 * identifiant introuvable (fil remplacé, historique purgé) ne compte rien.
 * Les messages envoyés par soi-même ne sont jamais annoncés comme « en
 * dessous » : ils provoquent un retour au bas, pas une pastille.
 */
export function countIncomingAfter(
  messages: Message[],
  previousId: string | undefined,
  myPublicKey: string | undefined,
): number {
  if (!previousId) return 0
  const index = messages.findIndex((m) => m.id === previousId)
  if (index === -1) return 0
  return messages.slice(index + 1).filter((m) => m.senderId !== myPublicKey).length
}
