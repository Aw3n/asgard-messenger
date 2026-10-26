/**
 * Titre de fenêtre avec le total des non-lus. Il apparaît dans la barre des
 * tâches, l'aperçu Alt+Tab et les lecteurs d'écran : un signe de plus pour
 * voir qu'il se passe quelque chose quand la fenêtre est derrière une autre.
 */
export function formatWindowTitle(appName: string, unread: number): string {
  if (unread <= 0) return appName
  return `(${unread > 99 ? '99+' : unread}) ${appName}`
}
