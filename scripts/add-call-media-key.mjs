#!/usr/bin/env node
/**
 * Adds calls.mediaUnavailable to all 25 supported languages.
 *
 * Why: dans CallService, une acquisition micro/caméra qui échoue après trois
 * tentatives terminait l'appel en silence — chez l'appelé l'écran se vidait,
 * l'appelant sonnait jusqu'au délai de 30 s, et le correspondant déjà accepté
 * restait devant une image noire. Une panne de matériel doit se dire.
 *
 * Same in-place algorithm as add-dht-profile-failure-key.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['calls.mediaUnavailable']

const DATA = {
  fr: { 'calls.mediaUnavailable': 'Micro ou caméra indisponible' },
  en: { 'calls.mediaUnavailable': 'Microphone or camera unavailable' },
  nl: { 'calls.mediaUnavailable': 'Microfoon of camera niet beschikbaar' },
  de: { 'calls.mediaUnavailable': 'Mikrofon oder Kamera nicht verfügbar' },
  it: { 'calls.mediaUnavailable': 'Microfono o fotocamera non disponibile' },
  es: { 'calls.mediaUnavailable': 'Micrófono o cámara no disponible' },
  pt: { 'calls.mediaUnavailable': 'Microfone ou câmara indisponível' },
  el: { 'calls.mediaUnavailable': 'Το μικρόφωνο ή η κάμερα δεν είναι διαθέσιμα' },
  da: { 'calls.mediaUnavailable': 'Mikrofon eller kamera er ikke tilgængelig' },
  fi: { 'calls.mediaUnavailable': 'Mikrofoni tai kamera ei ole käytettävissä' },
  sv: { 'calls.mediaUnavailable': 'Mikrofonen eller kameran är inte tillgänglig' },
  hr: { 'calls.mediaUnavailable': 'Mikrofon ili kamera nije dostupan' },
  et: { 'calls.mediaUnavailable': 'Mikrofon või kaamera pole saadaval' },
  hu: { 'calls.mediaUnavailable': 'A mikrofon vagy a kamera nem elérhető' },
  lv: { 'calls.mediaUnavailable': 'Mikrofons vai kamera nav pieejama' },
  lt: { 'calls.mediaUnavailable': 'Mikrofonas arba kamera nepasiekiami' },
  mt: { 'calls.mediaUnavailable': 'Il-mikrofonu jew il-kamera mhumiex disponibbli' },
  pl: { 'calls.mediaUnavailable': 'Mikrofon lub kamera niedostępne' },
  sk: { 'calls.mediaUnavailable': 'Mikrofón alebo kamera nie je dostupná' },
  sl: { 'calls.mediaUnavailable': 'Mikrofon ali kamera ni na voljo' },
  cs: { 'calls.mediaUnavailable': 'Mikrofon nebo kamera není dostupná' },
  bg: { 'calls.mediaUnavailable': 'Микрофонът или камерата не са налични' },
  ga: { 'calls.mediaUnavailable': 'Níl an micreafón nó an ceamara ar fáil' },
  ro: { 'calls.mediaUnavailable': 'Microfonul sau camera nu este disponibilă' },
  uk: { 'calls.mediaUnavailable': 'Мікрофон або камера недоступні' },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

// Each locale block starts with `  <code>: {` at two-space indent and holds one
// nested `translation` object made of flat "a.b" keys.
const marks = []
lines.forEach((line, i) => {
  const m = /^ {2}([a-z]{2}): \{\s*$/.exec(line)
  if (m) marks.push({ code: m[1], i })
})

const known = Object.keys(DATA)
const missing = known.filter((c) => !marks.some((m) => m.code === c))
if (missing.length) {
  console.error(`✗ locale blocks not found in translations.ts: ${missing.join(', ')}`)
  process.exit(1)
}
const unknownBlocks = marks.filter((m) => !known.includes(m.code)).map((m) => m.code)
if (unknownBlocks.length) {
  console.error(`✗ translations.ts has locales without data: ${unknownBlocks.join(', ')}`)
  process.exit(1)
}

let replaced = 0
let inserted = 0

// Walk backwards: splicing a block must not shift the indexes of the previous ones.
for (let b = marks.length - 1; b >= 0; b--) {
  const code = marks[b].code
  const start = marks[b].i + 1
  const end = b + 1 < marks.length ? marks[b + 1].i : lines.length
  const block = lines.slice(start, end)
  const table = DATA[code]
  const pending = []

  for (const key of KEYS) {
    const line = `      "${key}": "${escapeValue(table[key])}",`
    const re = new RegExp('^[ \\t]*"' + key.replace(/\./g, '\\.') + '":\\s*"(?:[^"\\\\]|\\\\.)*",?[ \\t]*$')
    const at = block.findIndex((l) => re.test(l))
    if (at >= 0) {
      if (block[at] !== line) { block[at] = line; replaced++ }
    } else {
      pending.push(line)
    }
  }

  if (pending.length) {
    // Insert before the closing brace of the `translation` object (four-space
    // indent), not before the locale's own brace.
    let close = -1
    for (let i = block.length - 1; i >= 0; i--) {
      if (/^ {4}\}\s*,?\s*$/.test(block[i])) { close = i; break }
    }
    if (close < 0) {
      console.error(`✗ could not find the closing brace of the translation object in the ${code} block`)
      process.exit(1)
    }
    block.splice(close, 0, ...pending)
    inserted += pending.length
  }

  lines.splice(start, end - start, ...block)
}

writeFileSync(file, lines.join(eol), 'utf8')
console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
