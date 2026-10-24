/**
 * Arbitre d'activation de l'icône de tray.
 *
 * Windows émet `click` à chaque clic ET `double-click` au second : brancher les
 * deux directement ferait basculer la fenêtre trois fois lors d'un double-clic
 * (visible comme un clignotement). Un clic simple attend donc la fenêtre de
 * double-clic ; si le second clic arrive, l'activation est laissée au
 * `double-click`. Sur les plateformes qui n'émettent que `click` (activation
 * Linux), le même arbitre déclenche après le délai.
 */
export interface TrayActivation {
  click: () => void
  doubleClick: () => void
  cancel: () => void
}

export const TRAY_DOUBLE_CLICK_DELAY = 250

export function createTrayActivation(
  onActivate: () => void,
  delay = TRAY_DOUBLE_CLICK_DELAY
): TrayActivation {
  let pending: ReturnType<typeof setTimeout> | null = null

  const cancel = (): void => {
    if (pending === null) return
    clearTimeout(pending)
    pending = null
  }

  return {
    click: () => {
      // Second clic de la paire : le double-click qui suit porte l'action.
      if (pending !== null) {
        cancel()
        return
      }
      pending = setTimeout(() => {
        pending = null
        onActivate()
      }, delay)
    },
    doubleClick: () => {
      cancel()
      onActivate()
    },
    cancel,
  }
}
