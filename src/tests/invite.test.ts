import { describe, it, expect } from 'vitest'
import { z32Encode, z32Decode } from '@/utils/z32'
import {
  parseInviteInput,
  normalizeAsgardPublicKey,
  asgardToZ32Id,
  SPKI_ED25519_PREFIX,
} from '@/utils/invite'

const RAW_KEY = 'aa'.repeat(32)
const DER_KEY = SPKI_ED25519_PREFIX + RAW_KEY

describe('z32 encoding (Holepunch interop)', () => {
  it('32 bytes encode to 52 characters', () => {
    const bytes = new Uint8Array(32).fill(0xab)
    const id = z32Encode(bytes)
    expect(id).toHaveLength(52)
  })

  // Vecteurs connus — valident l'ordre des bits MSB-first du package z32
  // officiel (hypercore-id-encoding / Keet / Pear) :
  it('all-zero key encodes to 52 × y', () => {
    expect(z32Encode(new Uint8Array(32))).toBe('y'.repeat(52))
  })

  it('all-0xFF key encodes to 51 × 9 + o (last char carries 1 padding bit)', () => {
    expect(z32Encode(new Uint8Array(32).fill(0xff))).toBe('9'.repeat(51) + 'o')
  })

  it('0xAA repeated encodes to the alternating ik pattern + y', () => {
    expect(z32Encode(new Uint8Array(32).fill(0xaa))).toBe('ik'.repeat(25) + 'iy')
  })

  it('round-trips random 32-byte keys', () => {
    for (let round = 0; round < 50; round++) {
      const bytes = new Uint8Array(32)
      for (let i = 0; i < 32; i++) bytes[i] = (Math.random() * 256) | 0
      const decoded = z32Decode(z32Encode(bytes))
      expect(Array.from(decoded)).toEqual(Array.from(bytes))
    }
  })

  it('round-trips arbitrary lengths', () => {
    for (let len = 1; len <= 128; len++) {
      const bytes = new Uint8Array(len).fill((len * 7) & 0xff)
      const decoded = z32Decode(z32Encode(bytes))
      expect(Array.from(decoded)).toEqual(Array.from(bytes))
    }
  })

  it('throws on invalid characters', () => {
    expect(() => z32Decode('0'.repeat(52))).toThrow() // 0 not in alphabet
    expect(() => z32Decode('l'.repeat(52))).toThrow() // l not in alphabet
    expect(() => z32Decode('Y'.repeat(52))).toThrow() // uppercase not in alphabet
  })
})

describe('normalizeAsgardPublicKey (Asgard ↔ Keet compatibility)', () => {
  it('accepts the canonical Asgard DER SPKI hex (88 chars)', () => {
    expect(normalizeAsgardPublicKey(DER_KEY)).toBe(DER_KEY)
  })

  it('normalizes uppercase DER keys to lowercase', () => {
    expect(normalizeAsgardPublicKey(DER_KEY.toUpperCase())).toBe(DER_KEY)
  })

  it('accepts a raw 64-hex Hypercore key and re-prefixes it to DER', () => {
    expect(normalizeAsgardPublicKey(RAW_KEY)).toBe(DER_KEY)
  })

  it('accepts a 52-char z32 Keet/Pear id and decodes it to DER', () => {
    const z32 = z32Encode(new Uint8Array(32).fill(0xaa))
    expect(normalizeAsgardPublicKey(z32)).toBe(DER_KEY)
  })

  it('accepts pear:// links (first path segment, like hypercore-id-encoding)', () => {
    const z32 = z32Encode(new Uint8Array(32).fill(0xaa))
    expect(normalizeAsgardPublicKey(`pear://${z32}`)).toBe(DER_KEY)
  })

  it('accepts keet:// links', () => {
    const z32 = z32Encode(new Uint8Array(32).fill(0xaa))
    expect(normalizeAsgardPublicKey(`keet://${z32}`)).toBe(DER_KEY)
  })

  it('cleans spaces and newlines from copy/paste', () => {
    expect(normalizeAsgardPublicKey(`  ${RAW_KEY.slice(0, 32)}\n${RAW_KEY.slice(32)} `)).toBe(DER_KEY)
  })

  it('rejects invalid inputs (no more ghost contacts)', () => {
    expect(normalizeAsgardPublicKey('')).toBeNull()
    expect(normalizeAsgardPublicKey('hello world this is long enough!!')).toBeNull()
    expect(normalizeAsgardPublicKey('zz'.repeat(44))).toBeNull() // 88 chars, not SPKI
    expect(normalizeAsgardPublicKey('g'.repeat(63))).toBeNull() // 63 hex chars
    expect(normalizeAsgardPublicKey('g'.repeat(65))).toBeNull() // 65 hex chars
    expect(normalizeAsgardPublicKey('y'.repeat(51))).toBeNull() // 51 z32 chars
    expect(normalizeAsgardPublicKey('0'.repeat(52))).toBeNull() // 52 chars, invalid alphabet
    expect(normalizeAsgardPublicKey(SPKI_ED25519_PREFIX)).toBeNull() // prefix alone
  })
})

describe('asgardToZ32Id (sharing for Keet)', () => {
  it('converts an Asgard DER key to a 52-char z32 id', () => {
    expect(asgardToZ32Id(DER_KEY)).toBe('ik'.repeat(25) + 'iy')
  })

  it('round-trips through normalizeAsgardPublicKey', () => {
    const z32 = asgardToZ32Id(DER_KEY)
    expect(z32).not.toBeNull()
    expect(normalizeAsgardPublicKey(z32!)).toBe(DER_KEY)
  })

  it('returns null for non-DER inputs', () => {
    expect(asgardToZ32Id(RAW_KEY)).toBeNull()
    expect(asgardToZ32Id('not-a-key')).toBeNull()
  })
})

describe('parseInviteInput', () => {
  it('parses a full asgard:// invite link with DER key and name', () => {
    const link = `asgard://invite/${DER_KEY}?name=${encodeURIComponent('Alice')}`
    expect(parseInviteInput(link)).toEqual({ publicKey: DER_KEY, name: 'Alice' })
  })

  it('parses an asgard:// link carrying a z32 key', () => {
    const z32 = asgardToZ32Id(DER_KEY)!
    expect(parseInviteInput(`asgard://invite/${z32}?name=Bob`)).toEqual({
      publicKey: DER_KEY,
      name: 'Bob',
    })
  })

  it('parses an asgard:// link carrying a raw hex 64 key', () => {
    expect(parseInviteInput(`asgard://invite/${RAW_KEY}`)).toEqual({ publicKey: DER_KEY })
  })

  it('parses bare keys in all three formats', () => {
    expect(parseInviteInput(DER_KEY)).toEqual({ publicKey: DER_KEY })
    expect(parseInviteInput(RAW_KEY.toUpperCase())).toEqual({ publicKey: DER_KEY })
    expect(parseInviteInput(asgardToZ32Id(DER_KEY)!)).toEqual({ publicKey: DER_KEY })
  })

  it('parses pear:// and keet:// links', () => {
    const z32 = asgardToZ32Id(DER_KEY)!
    expect(parseInviteInput(`pear://${z32}`)).toEqual({ publicKey: DER_KEY })
    expect(parseInviteInput(`keet://${z32}`)).toEqual({ publicKey: DER_KEY })
  })

  it('returns null for invalid or empty inputs', () => {
    expect(parseInviteInput('')).toBeNull()
    expect(parseInviteInput('random text pasted by mistake')).toBeNull()
    expect(parseInviteInput('asgard://invite/not-a-key')).toBeNull()
    expect(parseInviteInput('asgar://invite/' + DER_KEY)).toBeNull()
  })
})
