import { useEffect, useRef, type RefObject } from 'react'
import { isCloseKeypress } from './useDialogBehavior'

/** Les entrées atteignables du menu, dans l'ordre du DOM. Le préfixe couvre
 *  `menuitem`, `menuitemradio` et `menuitemcheckbox`. */
export const MENU_ITEM_SELECTOR = '[role^="menuitem"]:not([disabled])'

interface MenuGestures {
  /** `false` = fermé. Le menu est rendu par l'appelant : l'effet ne fait que l'armer. */
  open: boolean
  menuRef: RefObject<HTMLElement | null>
  /** Ce qui a ouvert le menu : il récupère le focus si on le quitte au clavier. */
  triggerRef?: RefObject<HTMLElement | null>
  onClose: () => void
  /** Ouvert par Menu / Maj+F10 : le focus entre directement dans la liste. */
  fromKeyboard?: boolean
}

/**
 * useMenuGestures — ce que font les cinq menus contextuels de l'interface.
 *
 * Chaque liste écrivait son propre effect (conversations, groupes, canaux) avec
 * un « Escape » en dur : depuis que la touche de fermeture se règle dans les
 * paramètres, un utilisateur qui la changeait ouvrait un menu dont il ne pouvait
 * plus sortir au clavier. Le menu du message, lui, respectait déjà le réglage
 * mais ne se parcourait pas aux flèches ; celui de la pièce jointe n'avait aucun
 * geste clavier du tout.
 *
 * Un seul comportement pour les cinq : la combinaison réglée ferme et rend le
 * focus, les flèches, `Home`, `Fin` et `Tab` restent dans le menu, un clic hors
 * du menu le referme, et ouvrir au clavier pose le focus sur la première entrée.
 */
export function useMenuGestures({ open, menuRef, triggerRef, onClose, fromKeyboard = false }: MenuGestures) {
  // La fermeture ne doit pas dépendre de l'identité de la fonction : un effect
  // qui repartirait à chaque rendu irait reposer le focus sur la première entrée
  // pendant que l'utilisateur a déjà descendu de deux lignes.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    if (!menu) return

    const isInside = (node: Node | null) => !!node && menu.contains(node)
    const trigger = triggerRef?.current ?? null

    const onPointerDown = (event: PointerEvent) => {
      if (isInside(event.target as Node)) return
      // Le déclencheur gère lui-même son basculement : fermer ici, avant son
      // onClick, ferait rouvrir le menu dans la même frappe (fermé puis rouvert).
      if (trigger?.contains(event.target as Node)) return
      closeRef.current()
    }
    // Les entrées d'un menu de liste ne se ferment pas toutes elles-mêmes :
    // celles qui ouvrent une confirmation comptent sur ce clic-là.
    const onClick = () => closeRef.current()

    const onKeyDown = (event: KeyboardEvent) => {
      // Une frappe encore en composition appartient au champ qui la reçoit :
      // fermer ici jetterait ce que l'utilisateur est en train d'écrire.
      if (event.isComposing || event.keyCode === 229) return
      if (isCloseKeypress(event)) {
        event.preventDefault()
        closeRef.current()
        return
      }
      const items = Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR))
      if (items.length === 0) return
      const index = items.indexOf(document.activeElement as HTMLElement)
      const cycle = (step: number) =>
        items[(index + step + items.length) % items.length]?.focus()

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          event.preventDefault()
          // Rien dans le menu n'a encore le focus : la flèche y entre, sans
          // faire le tour d'une liste que l'utilisateur n'a pas atteinte.
          if (index === -1) items[event.key === 'ArrowDown' ? 0 : items.length - 1]?.focus()
          else cycle(event.key === 'ArrowDown' ? 1 : -1)
          return
        case 'Home':
          event.preventDefault()
          items[0]?.focus()
          return
        case 'End':
          event.preventDefault()
          items[items.length - 1]?.focus()
          return
        case 'Tab':
          // Tab reste piégé dans le menu : sinon la page derrière, devenue
          // inatteignable, se parcourt sans que le menu se soit refermé.
          event.preventDefault()
          if (index === -1) items[0]?.focus()
          else cycle(event.shiftKey ? -1 : 1)
          return
      }
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('click', onClick)
    window.addEventListener('keydown', onKeyDown)
    if (fromKeyboard) menu.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus()

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKeyDown)
      // L'entrée activée se détruit avec le menu et le focus retombe sur <body>.
      // On le rend à la ligne qui a ouvert le menu — sauf si quelque chose a
      // déjà pris la main (une confirmation ouverte par l'entrée, par exemple) :
      // dans ce cas le focus y est déjà et on n'y touche pas.
      const active = document.activeElement
      const focusLost = !active || active === document.body || isInside(active)
      if (focusLost && trigger?.isConnected) trigger.focus()
    }
  }, [open, fromKeyboard, menuRef, triggerRef])
}
