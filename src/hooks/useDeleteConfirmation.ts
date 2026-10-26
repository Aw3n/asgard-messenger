/**
 * Demander la suppression d'un message et l'exécuter sont deux gestes séparés.
 *
 * Les deux entrées du menu à clic droit — « Supprimer » et « Supprimer
 * définitivement » — appelaient le service sans un mot, et la touche réglée
 * `deleteMessage` restait à l'écart du clavier pour cette raison : une frappe
 * mal placée effaçait un message. Le hook ne connaît ni le service ni la
 * conversation : il retient la demande, et ne la libère que sur un acquiescement.
 *
 * Trois sens réels, trois promesses différentes à l'écran :
 * - `forEveryone` laisse une mention de suppression chez les autres ;
 * - `permanently` efface partout, sans laisser de trace ;
 * - `forMe` ne retire le message que de cet appareil (dans un canal, les autres
 *   membres gardent leur copie).
 */
import { useCallback, useRef, useState } from 'react'
import type { Message } from '@/types'

export type DeleteMode = 'forEveryone' | 'permanently' | 'forMe'

/** Le nom du geste, une seule fois : le menu de la bulle et le bouton du
 *  dialogue lisent la même table, donc aucun des deux ne peut renommer ce que
 *  l'autre promet. */
export const DELETE_MODE_LABEL_KEYS: Record<DeleteMode, string> = {
  forEveryone: 'chat.deleteForEveryone',
  permanently: 'chat.deletePermanently',
  forMe: 'chat.deleteForMe',
}

/** Ce que chaque geste fait vraiment, dit avant de l'exécuter. */
export const DELETE_MODE_WARNING_KEYS: Record<DeleteMode, string> = {
  forEveryone: 'chat.deleteForEveryoneWarning',
  permanently: 'chat.deletePermanentlyWarning',
  forMe: 'chat.deleteForMeWarning',
}

export interface PendingDelete {
  message: Message
  mode: DeleteMode
}

export function useDeleteConfirmation(run: (message: Message, mode: DeleteMode) => void) {
  const [pending, setPending] = useState<PendingDelete | null>(null)

  // Les vues passent `run` en littéral à chaque rendu : lu à l'acquiescement,
  // il ne peut pas rester la closure d'un message déjà remplacé au fil.
  const runRef = useRef(run)
  runRef.current = run

  const requestDelete = useCallback((message: Message, mode: DeleteMode) => {
    setPending({ message, mode })
  }, [])

  const cancelDelete = useCallback(() => setPending(null), [])

  const confirmDelete = useCallback(() => {
    if (!pending) return
    runRef.current(pending.message, pending.mode)
    setPending(null)
  }, [pending])

  return { pending, requestDelete, cancelDelete, confirmDelete }
}
