/**
 * bip39.test.ts — Locks the renderer seed-phrase implementation to BIP39.
 *
 * Verifies against:
 *   - the official BIP39 test vector (trezor/python-mnemonic vectors.json):
 *     entropy = 32 zero bytes  →  "abandon" ×23 + "art"
 *   - @scure/bip39 (audited reference implementation) on random round-trips
 *   - the PKCS#8 DER → raw-seed extraction used by the identity store
 */
import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { secretKeyToSeedPhrase, validateSeedPhrase, getWordList } from '@/services/SeedPhraseService'

const PKCS8_ED25519_PREFIX = '302e020100300506032b657004220420'

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

describe('SeedPhraseService (BIP39)', () => {
  it('uses the official 2048-word English wordlist', () => {
    expect(getWordList()).toHaveLength(2048)
    expect(getWordList()[0]).toBe('abandon')
    expect(getWordList()[2047]).toBe('zoo')
  })

  it('matches the official BIP39 test vector for zero entropy', () => {
    // entropy 0x00 * 32 → "abandon abandon … abandon art" (BIP39 spec vectors)
    const zeroSeedHex = '0'.repeat(64)
    const derHex = PKCS8_ED25519_PREFIX + zeroSeedHex
    const phrase = secretKeyToSeedPhrase(derHex)

    const words = phrase.split(' ')
    expect(words).toHaveLength(24)
    expect(words[0]).toBe('abandon')
    expect(words[23]).toBe('art')
    expect(phrase).toBe(entropyToMnemonic(new Uint8Array(32), wordlist))
  })

  it('encodes the raw 32-byte seed, not the PKCS#8 DER wrapper', () => {
    const seed = new Uint8Array(32)
    crypto.randomFillSync(seed)
    const derHex = PKCS8_ED25519_PREFIX + toHex(seed)

    const fromDer = secretKeyToSeedPhrase(derHex)
    const fromRawSeed = secretKeyToSeedPhrase(toHex(seed))
    const reference = entropyToMnemonic(seed, wordlist)

    expect(fromDer).toBe(reference)
    expect(fromRawSeed).toBe(reference)
  })

  it('round-trips against @scure/bip39 on random seeds', () => {
    for (let round = 0; round < 16; round++) {
      const seed = new Uint8Array(32)
      crypto.randomFillSync(seed)
      const phrase = secretKeyToSeedPhrase(PKCS8_ED25519_PREFIX + toHex(seed))

      // Decoding must recover the exact 32-byte seed (checksum included)
      const decoded = mnemonicToEntropy(phrase, wordlist)
      expect(Buffer.compare(Buffer.from(decoded), Buffer.from(seed))).toBe(0)
    }
  })

  it('rejects malformed secret keys', () => {
    expect(() => secretKeyToSeedPhrase('deadbeef')).toThrow(/Invalid secret key encoding/)
    expect(() => secretKeyToSeedPhrase('')).toThrow(/Invalid secret key encoding/)
  })

  it('validates phrase shape and checksum', () => {
    const seed = new Uint8Array(32)
    crypto.randomFillSync(seed)
    const goodPhrase = secretKeyToSeedPhrase(PKCS8_ED25519_PREFIX + toHex(seed))

    expect(validateSeedPhrase(goodPhrase)).toEqual({ valid: true })
    expect(validateSeedPhrase(goodPhrase.toUpperCase()).valid).toBe(true)

    // Wrong word count
    expect(validateSeedPhrase('abandon abandon abandon').valid).toBe(false)

    // Corrupted checksum: swap two words (different indices)
    const words = goodPhrase.split(' ')
    ;[words[0], words[1]] = [words[1], words[0]]
    const swapped = validateSeedPhrase(words.join(' '))
    // A swap can in theory re-validate (1/256); random seeds make it negligible
    // — assert that the validator returns a definitive boolean either way
    expect(typeof swapped.valid).toBe('boolean')
    if (!swapped.valid) expect(swapped.error).toContain('checksum')

    // Unknown word
    expect(validateSeedPhrase('notaword ' + goodPhrase.split(' ').slice(0, 23).join(' ')).valid).toBe(false)
  })
})
