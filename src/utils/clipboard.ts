import type { Message } from '@/types'

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
  navigator.clipboard.writeText(text).catch(() => {})
  return true
}
