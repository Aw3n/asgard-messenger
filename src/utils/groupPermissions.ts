/**
 * Un canal déclare les rôles autorisés à y écrire (`permissions.send`), cette
 * liste voyage dans les `group:update` et survit dans le store — mais aucun
 * chemin ne la lisait : un canal « annonce » ou « lecture seule » restait
 * entièrement publiable. Le calcul vit ici pour que le composeur, l'envoi et la
 * réception décident exactement de la même chose.
 */
import type { ChannelType, Group, GroupChannel, MemberRole } from '@/types'

/** Rôles qui publient quand un canal n'en déclare aucun : le repli reprend les
 *  défauts posés à la création. Une liste vide venue d'un client plus ancien ne
 *  doit pas couper la parole à tout le groupe — la sourdine, elle, reste stricte. */
export const DEFAULT_SEND_ROLES: readonly MemberRole[] = ['owner', 'admin', 'moderator', 'member']

const ALL_READ_ROLES: readonly MemberRole[] = ['owner', 'admin', 'moderator', 'member', 'guest']

/**
 * Le type d'un canal est la déclaration de ce que les gens peuvent y faire :
 * « annonce » et « lecture seule » n'avaient aucun sens tant que le défaut
 * d'écriture restait ouvert à tout membre. Le mapping est ici pour que le canal
 * créé localement et le canal reçu d'un pair portent la même promesse.
 */
export function channelPermissionsFor(type: ChannelType): GroupChannel['permissions'] {
  const read = [...ALL_READ_ROLES]
  const manage: MemberRole[] = ['owner', 'admin']
  switch (type) {
    case 'announcement':
      return { send: ['owner', 'admin', 'moderator'], read, manage }
    case 'readonly':
      return { send: ['owner', 'admin'], read, manage }
    default:
      return { send: [...DEFAULT_SEND_ROLES], read, manage }
  }
}

/** Nom de canal tel que la liste l'affiche : minuscules, traits d'union. */
export function normalizeChannelName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

export function canPostInChannel(group: Group, channelId: string, publicKey: string): boolean {
  const member = group.members.find((m) => m.publicKey === publicKey)
  if (!member || member.canPost === false) return false

  const channel = group.channels.find((c) => c.id === channelId)
  if (!channel) return false

  const send = channel.permissions?.send ?? []
  return (send.length > 0 ? send : DEFAULT_SEND_ROLES).includes(member.role)
}
