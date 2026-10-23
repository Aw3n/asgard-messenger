import { useEffect, useRef } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { comboMatches } from '@/utils/shortcuts'

/** Les contrôles atteignables au Tab, dans l'ordre du DOM. */
export const DIALOG_FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * La combinaison qui ferme un dialogue, lue au moment de la frappe :
 * `settings.keyboardShortcuts.closeModal` était écrit, persisté, jamais consulté
 * — cinq dialogues et la recherche fermaient sur « Escape » en dur, y compris
 * après un réglage changé.
 *
 * La forme décomposée plutôt que `KeyboardEvent` : un composeur React appelle
 * ici depuis son événement synthétique, et le geste d'annulation d'un fil
 * (réponse en cours, message en édition) suit le même réglage que les panneaux.
 */
export function isCloseKeypress(
  event: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }
): boolean {
  return comboMatches(useUIStore.getState().settings.keyboardShortcuts.closeModal, event)
}

// Pile des dialogues ouverts. Une confirmation se pose parfois par-dessus un
// panneau déjà modal : sans ce sommet commun, Échap fermerait les deux d'un
// geste et Tab serait piégé deux fois.
const dialogStack: symbol[] = []

/**
 * Les gestes clavier d'un dialogue : la combinaison de fermeture réglée qui
 * ferme, Tab qui reste piégé dans le panneau, focus qui revient à ce qui a
 * ouvert le dialogue.
 *
 * `ModalContainer` faisait déjà les trois pour les modales globales, mais
 * sept dialogues sont posés par leur propre vue par-dessus la page (réglages et
 * création de groupe, transfert, invitation, QR code, favoris, confirmation de
 * vidage) : sans Échap, la souris seule pouvait les refermer, et Tab filait
 * dans la page devenue inatteignable derrière eux.
 *
 * @param onClose fermeture demandée par Échap — la dernière passée gagne, son
 * identité de rendu ne doit pas remonter l'effet (il rendrait le focus entre deux).
 */
export function useDialogBehavior<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const containerRef = useRef<T>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const dialog = containerRef.current
    if (!dialog) return

    const token = Symbol('dialog')
    dialogStack.push(token)
    const isTopmost = () => dialogStack[dialogStack.length - 1] === token

    const previous = document.activeElement as HTMLElement | null
    // Un champ en autoFocus a déjà placé le focus dans le dialogue : ne pas lui
    // ravir la saisie. Sinon le dialogue s'ouvre sur lui-même et un lecteur
    // d'écran annonce son nom au lieu de rester muet.
    if (!dialog.contains(previous)) dialog.focus({ preventScroll: true })

    const handleKeyDown = (e: KeyboardEvent) => {
      // Échap qui annule une composition IME reste au champ : fermer effacerait
      // la saisie en cours.
      if (e.isComposing || e.keyCode === 229) return
      if (isCloseKeypress(e)) {
        if (!isTopmost()) return
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !isTopmost()) return

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      const at = dialogStack.lastIndexOf(token)
      if (at >= 0) dialogStack.splice(at, 1)
      // Sans ce rappel le focus retombe sur <body> et l'utilisateur clavier perd
      // sa place dans la liste qu'il venait de quitter.
      if (previous && previous !== document.body && document.contains(previous)) previous.focus()
    }
  }, [])

  return containerRef
}
