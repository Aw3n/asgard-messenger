/**
 * Parsing/normalisation des identifiants pour l'ajout de contact.
 *
 * COMPATIBILITÉ ASGARD ↔ KEET (écosystème Holepunch) : une clé publique
 * ed25519 peut être représentée de trois façons, toutes acceptées en entrée :
 * - Asgard (canonique) : DER SPKI hex, 88 caractères, préfixe
 *   `302a300506032b6570032100` — format généré par IdentityService
 *   (generateKeyPairSync type 'spki') et stocké partout dans l'app.
 * - Hypercore : clé brute hex, 64 caractères — format accepté par
 *   hypercore-id-encoding (holepunchto). Re-préfixée en DER Asgard.
 * - Keet/Pear : z-base-32, 52 caractères — le format d'identifiant de
 *   l'écosystème Holepunch (hypercore-id-encoding → package z32).
 *   Décodée puis re-préfixée en DER Asgard.
 *
 * Accepte en plus les liens `asgard://invite/<clé>?name=<displayName>`
 * (généré par ContactInviteModal et livré par les deep links OS — voir
 * main.ts forwardDeepLink) et les liens `pear://<z32>` / `keet://<z32>`
 * (premier segment du chemin, comme hypercore-id-encoding.decode).
 */

import { z32Decode, z32Encode } from './z32'

export interface ParsedInvite {
  publicKey: string
  name?: string
}

/** Préfixe DER SPKI standard d'une clé publique ed25519 (12 octets devant la clé brute). */
export const SPKI_ED25519_PREFIX = '302a300506032b6570032100'

const HEX_RE = /^[0-9a-f]+$/
const Z32_RE = /^[ybndrfg8ejkmcpqxot1uwisza345h769]+$/

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * Normalise n'importe quelle représentation d'une clé publique ed25519 en
 * DER SPKI hex canonique Asgard (88 caractères minuscules).
 *
 * @returns la clé canonique, ou null si l'entrée n'est AUCUNE représentation
 *   valide — garantit qu'aucun contact fantôme n'atteint le store (les couches
 *   aval — Buffer.from(key,'hex'), hexToBytes, deriveNoisePublicKey —
 *   décodent silencieusement en octets nuls/partiels une clé mal formée).
 */
export function normalizeAsgardPublicKey(input: string): string | null {
  let text = input.trim().replace(/\s+/g, '')
  if (!text) return null

  // Liens pear:// et keet:// — premier segment du chemin, comme
  // hypercore-id-encoding.decode (un lien pear:// simple porte la clé z32
  // directement après le scheme).
  const lower = text.toLowerCase()
  if (lower.startsWith('pear://') || lower.startsWith('keet://')) {
    text = text.slice(7).split('/')[0]
  }

  // DER SPKI hex 88 (format canonique Asgard) — casse indifférente.
  if (text.length === 88) {
    const der = text.toLowerCase()
    if (HEX_RE.test(der) && der.startsWith(SPKI_ED25519_PREFIX)) return der
    return null
  }

  // Clé brute hex 64 (format hypercore-id-encoding / compact) → re-préfixée.
  if (text.length === 64) {
    const raw = text.toLowerCase()
    if (HEX_RE.test(raw)) return SPKI_ED25519_PREFIX + raw
    return null
  }

  // z-base-32 52 (format Keet/Pear/hypercore-id) → décodée puis re-préfixée.
  if (text.length === 52 && Z32_RE.test(text)) {
    try {
      const bytes = z32Decode(text)
      if (bytes.byteLength !== 32) return null
      return SPKI_ED25519_PREFIX + bytesToHex(bytes)
    } catch {
      return null
    }
  }

  return null
}

/**
 * DER SPKI hex Asgard (88) → identifiant z-base-32 Keet/Pear (52 caractères).
 * C'est le format à partager pour être ajouté depuis Keet/Pear.
 * @returns null si l'entrée n'est pas une clé DER Asgard valide.
 */
export function asgardToZ32Id(derHex: string): string | null {
  const hex = derHex.trim().toLowerCase()
  if (hex.length !== 88 || !hex.startsWith(SPKI_ED25519_PREFIX)) return null
  const raw = hex.slice(SPKI_ED25519_PREFIX.length)
  if (!HEX_RE.test(raw)) return null
  return z32Encode(hexToBytes(raw))
}

/**
 * Parse une entrée du champ « ajouter un contact ».
 *
 * Accepte indifféremment : un lien d'invitation complet
 * `asgard://invite/<publicKey>?name=<displayName>` (la clé pouvant être dans
 * n'importe lequel des trois formats), un lien pear:// ou keet://, ou une clé
 * brute (hex 88 Asgard, hex 64 Hypercore, z32 52 Keet).
 *
 * @returns null si l'entrée est vide ou n'est aucune représentation valide ;
 *   sinon la clé publique canonique Asgard (espaces/sauts de ligne nettoyés)
 *   et le nom optionnel extrait du lien d'invitation.
 */
export function parseInviteInput(input: string): ParsedInvite | null {
  const text = input.trim()
  if (!text) return null

  if (text.toLowerCase().startsWith('asgard://')) {
    try {
      const parsed = new URL(text)
      if (parsed.protocol !== 'asgard:' || parsed.hostname !== 'invite') return null
      const rawKey = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim()
      // COMPATIBILITÉ KEET : le lien peut porter la clé dans n'importe quel
      // format (DER Asgard, hex 64 brut, z32 Keet) — toujours normalisée.
      const publicKey = normalizeAsgardPublicKey(rawKey)
      if (!publicKey) return null
      return { publicKey, name: parsed.searchParams.get('name')?.trim() || undefined }
    } catch {
      return null
    }
  }

  // Clé brute (trois formats) ou lien pear:// / keet://
  const publicKey = normalizeAsgardPublicKey(text)
  if (!publicKey) return null
  return { publicKey }
}
