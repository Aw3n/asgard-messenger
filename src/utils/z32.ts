/**
 * Encodage z-base-32 (« z32 ») — portage fidèle du package npm `z32` utilisé
 * par tout l'écosystème Holepunch (hypercore-id-encoding, Pear, Keet) pour
 * représenter les clés ed25519 de 32 octets sous forme compacte et lisible
 * (52 caractères).
 *
 * Alphabet « human-oriented » z-base-32 : ybndrfg8ejkmcpqxot1uwisza345h769
 * (caractères choisis pour minimiser les confusions visuelles ; aucun 0/o,
 * 2/r, 5/s… n'apparaissent ensemble).
 *
 * Interopérabilité garantie avec Keet/Pear : même ordre des bits (MSB-first),
 * même découpage par blocs de 8 quintets → 5 octets et même gestion du reste
 * que le package officiel. Une clé encodée ici se décode dans
 * hypercore-id-encoding (et donc dans Keet) et réciproquement.
 */

const ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769'
const MIN = 0x31 // '1'
const MAX = 0x7a // 'z'
const REVERSE = new Int8Array(1 + MAX - MIN)
REVERSE.fill(-1)
for (let i = 0; i < ALPHABET.length; i++) {
  REVERSE[ALPHABET.charCodeAt(i) - MIN] = i
}

/** Valeur du caractère z32 en position i — 0 au-delà de la fin, comme le package officiel. */
function quintet(s: string, i: number): number {
  if (i >= s.length) return 0
  const v = s.charCodeAt(i)
  if (v < MIN || v > MAX) {
    throw new Error(`Invalid character in base32 input: "${s[i]}" at position ${i}`)
  }
  const bits = REVERSE[v - MIN]
  if (bits === -1) {
    throw new Error(`Invalid character in base32 input: "${s[i]}" at position ${i}`)
  }
  return bits
}

/**
 * Encode des octets en z-base-32 (MSB-first, 5 bits par caractère).
 * 32 octets → 52 caractères (format identifiant Keet/Pear/hypercore).
 */
export function z32Encode(buf: Uint8Array): string {
  const max = buf.byteLength * 8
  let s = ''
  for (let p = 0; p < max; p += 5) {
    const i = p >>> 3
    const j = p & 7
    if (j <= 3) {
      s += ALPHABET[(buf[i] >>> (3 - j)) & 0b11111]
      continue
    }
    const of = j - 3
    const h = (buf[i] << of) & 0b11111
    const l = i + 1 >= buf.byteLength ? 0 : buf[i + 1] >>> (8 - of)
    s += ALPHABET[h | l]
  }
  return s
}

/**
 * Décode une chaîne z-base-32 en octets. 52 caractères → 32 octets.
 * Throw sur caractère hors alphabet (comme le package officiel).
 */
export function z32Decode(s: string): Uint8Array {
  let pb = 0
  let ps = 0

  const r = s.length & 7
  const q = (s.length - r) / 8
  const out = new Uint8Array(Math.ceil((s.length * 5) / 8))

  // 8 quintets (40 bits) → 5 octets, par blocs complets
  for (let i = 0; i < q; i++) {
    const a = quintet(s, ps++)
    const b = quintet(s, ps++)
    const c = quintet(s, ps++)
    const d = quintet(s, ps++)
    const e = quintet(s, ps++)
    const f = quintet(s, ps++)
    const g = quintet(s, ps++)
    const h = quintet(s, ps++)

    out[pb++] = (a << 3) | (b >>> 2)
    out[pb++] = ((b & 0b11) << 6) | (c << 1) | (d >>> 4)
    out[pb++] = ((d & 0b1111) << 4) | (e >>> 1)
    out[pb++] = ((e & 0b1) << 7) | (f << 2) | (g >>> 3)
    out[pb++] = ((g & 0b111) << 5) | h
  }

  if (r === 0) return out.subarray(0, pb)

  // Reste : 2 quintets → 1 octet ; 4 → 2 ; 5 → 3 ; 7 → 4
  const a = quintet(s, ps++)
  const b = quintet(s, ps++)

  out[pb++] = (a << 3) | (b >>> 2)

  if (r <= 2) return out.subarray(0, pb)

  const c = quintet(s, ps++)
  const d = quintet(s, ps++)

  out[pb++] = ((b & 0b11) << 6) | (c << 1) | (d >>> 4)

  if (r <= 4) return out.subarray(0, pb)

  const e = quintet(s, ps++)

  out[pb++] = ((d & 0b1111) << 4) | (e >>> 1)

  if (r <= 5) return out.subarray(0, pb)

  const f = quintet(s, ps++)
  const g = quintet(s, ps++)

  out[pb++] = ((e & 0b1) << 7) | (f << 2) | (g >>> 3)

  if (r <= 7) return out.subarray(0, pb)

  const h = quintet(s, ps++)

  out[pb++] = ((g & 0b111) << 5) | h

  return out.subarray(0, pb)
}

/** Alphabet z-base-32 exposé pour les validations/regex externes. */
export const Z32_ALPHABET = ALPHABET
