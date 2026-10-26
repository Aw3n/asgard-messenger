import type { Message } from '@/types'

/**
 * Copie du texte et dit si le presse-papiers l'a réellement pris.
 *
 * `navigator.clipboard.writeText` rejette quand la fenêtre n'a pas le focus ou
 * que la permission est refusée. Aucun écran ne l'attendait : les boutons
 * affichaient « Copié » avant même la réponse, et le rejet finissait en
 * « unhandled promise rejection » dans la console.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Le texte d'un message dans le presse-papiers. Le menu de la rangée et le
 * geste clavier `copyMessage` passent par ici : un seul endroit décide qu'un
 * message sans texte n'a rien à copier.
 *
 * @returns `false` quand il n'y avait rien à copier : l'appelant ne doit pas,
 * dans ce cas, prendre la touche au navigateur.
 */
export function copyMessageText(message: Message): boolean {
  const text = message.content
  if (!text) return false
  void copyToClipboard(text)
  return true
}
