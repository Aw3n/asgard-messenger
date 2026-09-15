/**
 * Presence — source unique de vérité des statuts de présence.
 *
 * Le produit expose quatre statuts à l'utilisateur (en ligne, absent, occupé,
 * invisible), le protocole réseau n'en connaît que quatre aussi mais d'un autre
 * vocabulaire (`online`, `away`, `dnd`, `offline`), et le store de contacts en
 * stocke six (`busy` et `invisible` s'ajoutent aux quatre réseau). Trois
 * traductions successives avaient fini chacune dans leur coin — sept copies de
 * la chaîne de ternaires `status === 'busy' ? 'dnd' : …`, dont deux oubliaient
 * la règle de confidentialité et une oubliait le `dnd → busy` au retour. Elles
 * divergeaient donc silencieusement : un même contact pouvait apparaître
 * « en ligne » en 1:1 et « Ne pas déranger » dans son groupe.
 *
 * Tout passage interne ↔ réseau passe désormais par ce module.
 */
import type { UserStatus } from '@/types'

/** Les quatre valeurs que le protocole (P2P et DHT) sait transporter. */
export type NetworkStatus = 'online' | 'away' | 'offline' | 'dnd'

/**
 * Durée de vie d'une annonce de présence en groupe, en millisecondes : au-delà,
 * le membre est considéré hors ligne. Cette valeur est partagée par le store
 * (expiration) et par GroupService (rythme de la re-annonce forcée) ; ce rythme
 * doit rester plus court que la durée de vie, sinon un membre stable qui ne
 * change jamais de statut disparaissait de la liste « en ligne » une trentaine
 * de secondes à chaque cycle, le temps que sa re-annonce forcée arrive.
 */
export const GROUP_PRESENCE_TIMEOUT = 120_000

/**
 * Statut interne → statut réseau.
 *
 * `hidePresence` porte le réglage « laisser mes contacts voir mon statut » :
 * quand il est coupé, c'est ici et nulle part ailleurs que la présence devient
 * muette — y compris pour l'enregistrement DHT, qui sinon continuait à publier
 * le vrai statut alors que le P2P disait « hors ligne ».
 */
export function toNetworkStatus(
  internal: UserStatus | string | null | undefined,
  hidePresence = false,
): NetworkStatus {
  if (hidePresence) return 'offline'
  switch (String(internal ?? '').trim().toLowerCase()) {
    case 'away': return 'away'
    case 'busy':
    case 'dnd': return 'dnd'
    case 'offline':
    case 'invisible': return 'offline'
    default: return 'online'
  }
}

/**
 * Statut réseau → statut interne, pour l'affichage.
 *
 * `dnd` redevient `busy` (le mot du produit), et les valeurs qu'un pair plus
 * ancien pourrait encore envoyer sont acceptées plutôt que stockées telles
 * quelles : une chaîne inconnue dans `contact.status` ne s'affiche nulle part.
 * Une valeur absente ou méconnaissable devient « hors ligne » — jamais « en
 * ligne », ce qui inventerait une présence.
 *
 * La casse et les espaces sont normalisés : l'enregistrement DHT est une
 * chaîne lue depuis le réseau, écritée telle quelle par un client tiers, et un
 * `" DND "` non reconnu tombait silencieusement en « hors ligne ».
 */
const INCOMING: Record<string, UserStatus> = {
  online: 'online',
  away: 'away',
  dnd: 'busy',
  busy: 'busy',
  offline: 'offline',
  invisible: 'invisible',
}

export function fromNetworkStatus(status: string | null | undefined): UserStatus {
  return INCOMING[String(status ?? '').trim().toLowerCase()] ?? 'offline'
}

/**
 * Le message qui accompagne le statut dans l'enregistrement DHT.
 *
 * La partie libre saisie par l'utilisateur (`customStatus`) prime, sinon la
 * devise du profil (`about`). Les cinq écritures du record doivent composer ce
 * message identiquement : l'une d'elles OUBLIAIT le repli sur `about`, si bien
 * qu'un simple changement de statut effaçait la devise de notre enregistrement
 * jusqu'au prochain cycle de republication de 30 s.
 */
export function presenceMessage(profile: { customStatus?: string | null; about?: string | null }): string | undefined {
  const custom = String(profile.customStatus ?? '').trim()
  if (custom) return custom
  const about = String(profile.about ?? '').trim()
  return about || undefined
}

/**
 * Faut-il, au vu d'une simple activité du pair (message, accusé, transfert),
 * afficher ce pair « en ligne » ?
 *
 * Non quand le pair a déclaré un statut récent : `absent`, `occupé` et
 * `invisible` sont sa parole, et une activité ne doit ni les effacer ni — pour
 * `invisible`, qui arrive comme `offline` — révéler qu'il est bien là. On ne
 * promeut qu'en l'absence de déclaration (Pair jamais entendu, client ancien)
 * ou quand la déclaration est périmée.
 */
export function shouldPromoteToOnline(
  declaredAt: number | undefined,
  now: number,
  freshnessMs: number,
): boolean {
  return declaredAt === undefined || now - declaredAt > freshnessMs
}

/** Libellé et pastille d'un statut, pour tous les sélecteurs et les listes. */
export interface PresenceChoice {
  value: UserStatus
  labelKey: string
  dot: string
}

/**
 * Les quatre choix proposés à l'utilisateur, dans l'ordre de l'interface.
 * `status-*` sont les classes de `globals.css` déjà utilisées par l'avatar :
 * la pastille d'un statut est donc identique partout, sans palette parallèle.
 */
export const PRESENCE_CHOICES: readonly PresenceChoice[] = [
  { value: 'online', labelKey: 'common.online', dot: 'status-online' },
  { value: 'away', labelKey: 'common.away', dot: 'status-away' },
  { value: 'busy', labelKey: 'common.busy', dot: 'status-busy' },
  { value: 'invisible', labelKey: 'common.invisible', dot: 'status-offline' },
]

const META_BY_STATUS: Record<string, PresenceChoice> = {
  ...Object.fromEntries(PRESENCE_CHOICES.map((c) => [c.value, c])),
  offline: { value: 'offline', labelKey: 'common.offline', dot: 'status-offline' },
  dnd: { value: 'dnd', labelKey: 'common.busy', dot: 'status-busy' },
}

/** Métadonnées d'affichage d'un statut, y compris ceux qui ne se choisissent pas. */
export function presenceMeta(status: string | null | undefined): PresenceChoice {
  return META_BY_STATUS[String(status ?? '').trim().toLowerCase()] ?? { value: 'offline', labelKey: 'common.offline', dot: 'status-offline' }
}

/**
 * Le pair affirme être là (en ligne, absent, occupé) : l'interface affiche ce
 * statut tel quel. Pour les autres (`offline`, `invisible`, inconnu), on retombe
 * sur la dernière connexion vue, faute de quoi un contact « absent » apparaissait
 * comme déconnecté — c'est ce que faisaient les listes qui ne testaient que
 * `status === 'online'`.
 */
export function isLivePresence(status: string | null | undefined): boolean {
  const normalized = String(status ?? '').trim().toLowerCase()
  return normalized === 'online' || normalized === 'away' || normalized === 'busy'
}
