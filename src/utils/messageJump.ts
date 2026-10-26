/**
 * Cible d'un résultat de recherche profonde : la vue doit ouvrir le fil sur ce
 * message précis, pas sur le bas de l'historique.
 */
export interface MessageJumpState {
  messageId: string
  messageTimestamp: number
  /** Fil 1:1 ou identifiant de canal : la destination doit correspondre. */
  conversationId: string
}

/** Lit l'état de navigation sans faire confiance à sa forme (route publique). */
export function parseMessageJump(
  state: unknown,
  conversationId: string | undefined,
): MessageJumpState | null {
  if (!conversationId || !state || typeof state !== 'object') return null
  const candidate = state as Partial<MessageJumpState>
  if (
    candidate.conversationId !== conversationId ||
    typeof candidate.messageId !== 'string' ||
    typeof candidate.messageTimestamp !== 'number'
  ) {
    return null
  }
  return {
    messageId: candidate.messageId,
    messageTimestamp: candidate.messageTimestamp,
    conversationId: candidate.conversationId,
  }
}
