/**
 * SeedPhraseService — Generates and validates the 24-word recovery phrase
 * shown in onboarding and Settings → Security.
 *
 * Implements BIP39 (ENT=256 → 24 words) via @scure/bip39 — the audited
 * reference implementation — so the phrase is interoperable with the
 * main-process IdentityService.importSeedPhrase() and with any standard
 * BIP39 tool.
 *
 * The secret key handled by the renderer is the PKCS#8 DER hex encoding
 * (48 bytes = 16-byte DER header + 32-byte raw Ed25519 seed); only the
 * 32-byte seed is encoded into the mnemonic.
 */

import { entropyToMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

// PKCS#8 DER prefix for an Ed25519 private key: 16-byte header + 32-byte raw seed.
const PKCS8_ED25519_PREFIX = '302e020100300506032b657004220420'

/**
 * Generate a 24-word BIP39 seed phrase from an Ed25519 secret key.
 * @param secretKeyHex hex-encoded secret key — PKCS#8 DER (96 hex chars)
 *   as stored by the identity store, or a raw 32-byte seed (64 hex chars).
 * @returns the mnemonic as a single space-separated string (24 words).
 */
export function secretKeyToSeedPhrase(secretKeyHex: string): string {
  const seed = extractEd25519Seed(secretKeyHex)
  return entropyToMnemonic(seed, wordlist)
}

/**
 * Validate a seed phrase: 24 words, all in the official BIP39 English
 * wordlist, and a valid SHA-256 checksum.
 */
export function validateSeedPhrase(seedPhrase: string): { valid: boolean; error?: string } {
  const phrase = seedPhrase.toLowerCase().trim().replace(/\s+/g, ' ')
  const words = phrase.split(' ')

  if (words.length !== 24) {
    return { valid: false, error: `Seed phrase must be 24 words, got ${words.length}` }
  }

  if (!validateMnemonic(phrase, wordlist)) {
    return { valid: false, error: 'Invalid seed phrase checksum — words may be in wrong order or corrupted' }
  }

  return { valid: true }
}

/**
 * Get the official BIP39 English wordlist (2048 words) for display/autocomplete.
 */
export function getWordList(): readonly string[] {
  return wordlist
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts the raw 32-byte Ed25519 seed from a secret key hex string.
 * Accepts the PKCS#8 DER encoding (48 bytes) sent over IPC by the main
 * process, or a bare 32-byte seed.
 */
function extractEd25519Seed(secretKeyHex: string): Uint8Array {
  const hex = secretKeyHex.trim().toLowerCase()

  if (hex.length === 96 && hex.startsWith(PKCS8_ED25519_PREFIX)) {
    return hexToBytes(hex.slice(32)) // strip the 16-byte DER header
  }
  if (hex.length === 64) {
    return hexToBytes(hex) // raw seed
  }

  throw new Error(`Invalid secret key encoding: ${hex.length / 2} bytes (expected 32-byte seed or 48-byte PKCS#8 DER)`)
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}
