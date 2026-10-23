/**
 * Les gestes clavier réglés qui portent sur les messages du fil ouvert :
 * `settings.keyboardShortcuts` déclarait « Ctrl+C », « Ctrl+R », « Ctrl+F » et
 * « Ctrl+E » sans que rien ne les lise ailleurs que dans le menu à clic droit.
 *
 * La cible est la rangée sous le focus — Tab s'y arrête déjà — à défaut le
 * message qu'une recherche vient de faire briller. Sans cible, la frappe n'est
 * pas revendiquée : elle reste au navigateur.
 */

import { useEffect, useRef } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { copyMessageText } from '@/utils/clipboard'
import { MESSAGE_ACTION_SHORTCUTS, comboMatches, isTextEntry } from '@/utils/shortcuts'
import type { Message } from '@/types'

type MessageAction = (typeof MESSAGE_ACTION_SHORTCUTS)[number]

/** Attribut posé par `MessageBubble` sur sa rangée focalisable. */
const ROW_TARGET = '[data-message-id]'

export interface MessageActionHandlers {
  onReply?: (message: Message) => void
  onEdit?: (message: Message) => void
  onForward?: (message: Message) => void
}

export function useMessageActionShortcuts(options: {
  messages: Message[]
  /** Identifiant de l'expéditeur qui est soi : seul son message s'édite. */
  ownSenderId?: string | null
  /** Message mis en évidence par un saut de recherche. */
  highlightedMessageId?: string | null
  handlers: MessageActionHandlers
}): void {
  // Tout est lu à la frappe dans cette référence : ni le fil qui grossit, ni les
  // handlers passés en littéral à chaque rendu ne doivent ré-abonner l'écouteur.
  const stateRef = useRef(options)
  stateRef.current = options

  useEffect(() => {
    const rowId = () => {
      const focused = document.activeElement?.closest(ROW_TARGET)
      return focused?.getAttribute('data-message-id') ?? stateRef.current.highlightedMessageId ?? null
    }

    const findTarget = () => {
      const id = rowId()
      if (!id) return undefined
      return stateRef.current.messages.find((message) => message.id === id && !message.deleted)
    }

    // « Éditer le dernier message » se passe de cible : c'est le mien le plus
    // récent encore modifiable, comme le fait le geste dans les autres messageries.
    const lastOwnEditable = () => {
      const { messages, ownSenderId } = stateRef.current
      if (!ownSenderId) return undefined
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message && message.senderId === ownSenderId && !message.deleted && message.content) return message
      }
      return undefined
    }

    const run = (action: MessageAction): boolean => {
      if (action === 'editLastMessage') {
        const message = lastOwnEditable()
        // Sans gestionnaire, la frappe n'a rien à faire : elle reste au navigateur.
        if (!message || !stateRef.current.handlers.onEdit) return false
        stateRef.current.handlers.onEdit(message)
        return true
      }

      const message = findTarget()
      if (!message) return false
      const { handlers } = stateRef.current

      if (action === 'replyToMessage') {
        if (!handlers.onReply) return false
        handlers.onReply(message)
        return true
      }
      if (action === 'forwardMessage') {
        if (!handlers.onForward) return false
        handlers.onForward(message)
        return true
      }

      // Une sélection de texte en cours : la copie du navigateur est ce que
      // l'utilisateur attend, le geste ne la remplace pas.
      const selection = window.getSelection?.()?.toString() ?? ''
      if (selection.length > 0) return false
      return copyMessageText(message)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return
      // Un champ qui tient la frappe garde ses gestes : le composeur copie sa
      // sélection, un champ de recherche n'a rien à voir avec le fil.
      if (isTextEntry(e.target)) return
      // Un dialogue posé sur le fil commande l'écran : ses propres champs ont
      // priorité, sinon « Ctrl+F » du dialogue déclencherait un transfert.
      if (document.querySelector('[role="dialog"]')) return

      const shortcuts = useUIStore.getState().settings.keyboardShortcuts
      for (const action of MESSAGE_ACTION_SHORTCUTS) {
        if (!comboMatches(shortcuts[action], e)) continue
        // Revendiquée seulement quand l'action a trouvé à faire : la touche non
        // réclamée reste au navigateur.
        if (run(action)) e.preventDefault()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
