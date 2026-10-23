/**
 * Observe si la fenêtre est réellement devant l'utilisateur : une vue montée
 * ne suffit pas, une fenêtre réduite ou au second plan garde tout son arbre
 * React vivant. `onChange` reçoit l'état courant puis chaque transition.
 */
export function watchWindowVisibility(onChange: (visible: boolean) => void): () => void {
  const sync = () => {
    onChange(document.visibilityState !== 'hidden' && document.hasFocus())
  }
  sync()
  window.addEventListener('focus', sync)
  window.addEventListener('blur', sync)
  document.addEventListener('visibilitychange', sync)
  return () => {
    window.removeEventListener('focus', sync)
    window.removeEventListener('blur', sync)
    document.removeEventListener('visibilitychange', sync)
  }
}
