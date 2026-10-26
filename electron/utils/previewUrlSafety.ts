/**
 * Cible autorisée pour un aperçu de lien.
 *
 * L'URL vient d'un message, donc d'un pair : la faire récupérer telle quelle
 * par le MAIN process transforme la machine de l'utilisateur en sonde de son
 * propre réseau (localhost, LAN, métadonnées cloud en 169.254.169.254) et le
 * résultat revient dans le pair sous forme de titre. Seules les cibles http(s)
 * publiques, sur un port standard, sont acceptées ici. La résolution DNS et le
 * suivi des redirections sont vérifiés séparément dans handlers.ts.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
])

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan']

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

/** Vrai pour une adresse IPv4 pointée ou une IPv6 (crochets admis). */
export function isIpLiteral(host: string): boolean {
  const bare = stripBrackets(host)
  if (bare.includes(':')) return true
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(bare)
}

/** Vrai si l'adresse n'est pas routable publiquement (ou n'est pas une IP). */
export function isDisallowedIpAddress(rawAddress: string): boolean {
  const address = stripBrackets(rawAddress.trim().toLowerCase()).split('%')[0]
  if (!address) return true
  if (address.includes(':')) return isDisallowedIpv6(address)
  return isDisallowedIpv4(address)
}

function isDisallowedIpv4(address: string): boolean {
  const parts = address.split('.')
  if (parts.length !== 4) return true
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return true
    const value = Number(part)
    if (value > 255) return true
    octets.push(value)
  }
  const [a, b, c] = octets
  return (
    a === 0 || // réseau « ce réseau » / non spécifiée
    a === 10 || // RFC 1918
    a === 127 || // boucle locale
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // lien local + métadonnées cloud
    (a === 172 && b >= 16 && b <= 31) || // RFC 1918
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF / TEST-NET-1
    (a === 192 && b === 168) || // RFC 1918
    (a === 198 && (b === 18 || b === 19)) || // bancs d'essai
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, réservé, diffusion
  )
}

function ipv4FromGroups(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

/** Développe une IPv6 en huit groupes de 16 bits, ou null si malformée. */
function expandIpv6(address: string): number[] | null {
  let head = address
  // Queue pointée (::ffff:192.168.1.1) → deux groupes hexadécimaux.
  const dotted = head.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (dotted) {
    const octets = [dotted[2], dotted[3], dotted[4], dotted[5]].map(Number)
    if (octets.some((value) => value > 255)) return null
    head = `${dotted[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
  }

  const halves = head.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null

  const groups = [
    ...left,
    ...Array<string>(halves.length === 2 ? missing : 0).fill('0'),
    ...right,
  ]
  if (groups.length !== 8) return null
  const values = groups.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN))
  return values.every(Number.isFinite) ? values : null
}

function isDisallowedIpv6(address: string): boolean {
  const groups = expandIpv6(address)
  if (!groups) return true

  // ::, ::1 et l'ancien espace IPv4-compatible ::/96.
  if (groups.slice(0, 6).every((group) => group === 0)) return true

  const first = groups[0]
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 adresses uniques locales
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 lien local
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (first === 0x2001 && groups[1] === 0x0db8) return true // documentation
  if (first === 0x0100 && groups.slice(1, 4).every((group) => group === 0)) return true // 100::/64
  // 6to4 (2002:aabb:ccdd::/48) embarque l'IPv4 dans les deux groupes suivants.
  if (first === 0x2002) return isDisallowedIpv4(ipv4FromGroups(groups[1], groups[2]))

  // IPv4 projetée (::ffff:a.b.c.d) et NAT64 (64:ff9b::/96).
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  const nat64 = first === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)
  if (mapped || nat64) return isDisallowedIpv4(ipv4FromGroups(groups[6], groups[7]))

  return false
}

/** Vrai si le nom d'hôte désigne l'hôte local ou un réseau privé. */
export function isDisallowedHostname(hostname: string): boolean {
  const host = stripBrackets(hostname.trim().toLowerCase()).replace(/\.$/, '')
  if (!host) return true
  if (BLOCKED_HOSTNAMES.has(host)) return true
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
  if (isIpLiteral(host)) return isDisallowedIpAddress(host)
  return false
}

/** Politique complète côté URL : schéma, identifiants, port, hôte. */
export function isSafePreviewUrl(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  // Un `user:pass@` dans l'URL vient du pair et n'a aucune raison d'être.
  if (url.username || url.password) return false
  // URL normalise les ports par défaut (80/443) en chaîne vide : tout port
  // restant est non standard, donc suspect pour une simple carte d'aperçu.
  if (url.port !== '') return false
  return !isDisallowedHostname(url.hostname)
}
