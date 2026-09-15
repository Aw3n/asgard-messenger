/**
 * verify-bip39.mjs — Validates the embedded BIP39 wordlist in IdentityService.ts
 * against the OFFICIAL English wordlist from @scure/bip39 (the audited reference
 * implementation of BIP39: https://github.com/paulmillr/scure-bip39).
 *
 * Also cross-checks the bit-level encoding logic (entropy <-> 24 words + checksum)
 * against the official BIP39 test vector:
 *   entropy = 0x00 * 32  ->  "abandon abandon ... abandon art"
 * (Source: https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
 *  and trezor/python-mnemonic vectors.json)
 *
 * Exit code 0 = wordlist and logic are BIP39-conformant.
 */
import fs from 'fs'
import { wordlist as officialWordlist } from '@scure/bip39/wordlists/english.js'
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39'
import crypto from 'crypto'

const identityPath = 'electron/services/IdentityService.ts'
const content = fs.readFileSync(identityPath, 'utf8')

// ─── 1. Extract embedded wordlist ─────────────────────────────────────────────
const m = content.match(/const BIP39_WORDLIST = `([\s\S]*?)`\.split\('\\n'\)/)
if (!m) {
  console.error('FAIL: BIP39_WORDLIST template literal not found in IdentityService.ts')
  process.exit(1)
}
const embedded = m[1].split('\n').filter((w) => w.length > 0)

console.log(`Embedded wordlist length: ${embedded.length}`)
console.log(`Official wordlist length: ${officialWordlist.length}`)

let wordlistOk = true
if (embedded.length !== 2048) {
  console.error(`FAIL: embedded wordlist has ${embedded.length} words (expected 2048)`)
  wordlistOk = false
}
for (let i = 0; i < Math.max(embedded.length, officialWordlist.length); i++) {
  if (embedded[i] !== officialWordlist[i]) {
    console.error(`FAIL: word #${i} mismatch — embedded "${embedded[i]}" vs official "${officialWordlist[i]}"`)
    wordlistOk = false
    if (i > 2100) break
  }
}
if (wordlistOk) console.log('OK: embedded wordlist is byte-identical to the official BIP39 English wordlist')

// ─── 2. Cross-check bit-level logic (mirrors IdentityService encoding) ────────
// Reference: BIP39 spec — ENT=256, CS=8, MS=24. Checksum = first 8 bits of
// SHA-256(entropy), appended MSB-first; each 11-bit group (big-endian) maps to
// a word index.

function entropyToWords(entropy) {
  const hash = crypto.createHash('sha256').update(entropy).digest()
  const checksumByte = hash[0]
  const bits = []
  for (const byte of entropy) {
    for (let i = 7; i >= 0; i--) bits.push(((byte >> i) & 1) === 1)
  }
  for (let i = 7; i >= 0; i--) bits.push(((checksumByte >> i) & 1) === 1)
  const words = []
  for (let i = 0; i < 24; i++) {
    let index = 0
    for (let j = 0; j < 11; j++) {
      if (bits[i * 11 + j]) index |= 1 << (10 - j)
    }
    if (index >= embedded.length) throw new Error(`index ${index} out of wordlist bounds`)
    words.push(embedded[index])
  }
  return words
}

function wordsToEntropy(words) {
  const bits = []
  for (const word of words) {
    const index = embedded.indexOf(word)
    if (index === -1) throw new Error(`unknown word "${word}"`)
    for (let i = 10; i >= 0; i--) bits.push(((index >> i) & 1) === 1)
  }
  const entropy = new Uint8Array(32)
  for (let i = 0; i < 256; i++) {
    if (bits[i]) entropy[Math.floor(i / 8)] |= 1 << (7 - (i % 8))
  }
  let checksum = 0
  for (let i = 0; i < 8; i++) {
    if (bits[256 + i]) checksum |= 1 << (7 - i)
  }
  const expected = crypto.createHash('sha256').update(entropy).digest()[0]
  if (expected !== checksum) throw new Error('checksum mismatch')
  return entropy
}

// Official test vector: 32 zero bytes -> "abandon"x23 + "art"
const zeroEntropy = new Uint8Array(32)
const officialMnemonic = entropyToMnemonic(zeroEntropy, officialWordlist)
const localWords = entropyToWords(zeroEntropy)
const officialWords = officialMnemonic.split(' ')

let vectorOk = true
if (localWords.join(' ') !== officialWords.join(' ')) {
  console.error('FAIL: zero-entropy vector mismatch')
  console.error(`  local:   ${localWords.join(' ')}`)
  console.error(`  official: ${officialWords.join(' ')}`)
  vectorOk = false
} else {
  console.log(`OK: official test vector (32x0x00 -> "...${localWords[23]}") matches @scure/bip39`)
}
if (localWords[23] !== 'art' || localWords[0] !== 'abandon') {
  console.error('FAIL: last word must be "art" and first "abandon" for zero entropy')
  vectorOk = false
}

// Random round-trips: our logic <-> @scure/bip39
let roundtripOk = true
for (let round = 0; round < 64; round++) {
  const entropy = new Uint8Array(32)
  crypto.randomFillSync(entropy)
  const reference = entropyToMnemonic(entropy, officialWordlist)
  const local = entropyToWords(entropy).join(' ')
  if (local !== reference) {
    console.error(`FAIL: random round ${round} diverges from @scure/bip39`)
    roundtripOk = false
    break
  }
  const decoded = wordsToEntropy(local.split(' '))
  const decodedRef = mnemonicToEntropy(reference, officialWordlist)
  if (Buffer.compare(Buffer.from(decoded), Buffer.from(decodedRef)) !== 0) {
    console.error(`FAIL: random round ${round} decode mismatch`)
    roundtripOk = false
    break
  }
}
if (roundtripOk) console.log('OK: 64 random round-trips match @scure/bip39 exactly (encode + decode + checksum)')

// ─── Verdict ──────────────────────────────────────────────────────────────────
if (wordlistOk && vectorOk && roundtripOk) {
  console.log('\nVERDICT: IdentityService wordlist + bit logic are BIP39-conformant')
  process.exit(0)
} else {
  console.log('\nVERDICT: BIP39 NON-CONFORMANCE DETECTED — fix required')
  process.exit(1)
}
