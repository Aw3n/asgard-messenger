#!/usr/bin/env node
/**
 * Adds the voice-recorder pause labels (chat.pauseRecording / chat.resumeRecording)
 * to all 25 supported languages of src/i18n/translations.ts.
 *
 * Why this wording : VoiceMessageRecorder déclarait isPaused et pausedDurationRef
 * sans jamais les activer — aucun bouton, et l'intervalle lisait la valeur figée
 * dans sa closure. Le chrono repart donc sur une vraie pause de l'encodeur : les
 * deux libellés sont les deux états d'un même geste et doivent employer, dans
 * chaque langue, le nom d'« enregistrement » déjà posé par chat.cancelRecording,
 * pour qu'un même écran ne dise pas deux choses différentes de la même prise.
 *
 * Same in-place algorithm as add-call-hold-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.pauseRecording', 'chat.resumeRecording']

const DATA = {
  fr: { 'chat.pauseRecording': 'Mettre en pause l’enregistrement', 'chat.resumeRecording': 'Reprendre l’enregistrement' },
  en: { 'chat.pauseRecording': 'Pause recording', 'chat.resumeRecording': 'Resume recording' },
  nl: { 'chat.pauseRecording': 'Opname onderbreken', 'chat.resumeRecording': 'Opname hervatten' },
  de: { 'chat.pauseRecording': 'Aufnahme pausieren', 'chat.resumeRecording': 'Aufnahme fortsetzen' },
  it: { 'chat.pauseRecording': 'Metti in pausa la registrazione', 'chat.resumeRecording': 'Riprendi la registrazione' },
  es: { 'chat.pauseRecording': 'Pausar grabación', 'chat.resumeRecording': 'Reanudar grabación' },
  pt: { 'chat.pauseRecording': 'Pausar gravação', 'chat.resumeRecording': 'Retomar gravação' },
  el: { 'chat.pauseRecording': 'Παύση εγγραφής', 'chat.resumeRecording': 'Συνέχιση εγγραφής' },
  da: { 'chat.pauseRecording': 'Sæt optagelsen på pause', 'chat.resumeRecording': 'Genoptag optagelsen' },
  fi: { 'chat.pauseRecording': 'Keskeytä tallennus', 'chat.resumeRecording': 'Jatka tallennusta' },
  sv: { 'chat.pauseRecording': 'Pausa inspelningen', 'chat.resumeRecording': 'Återuppta inspelningen' },
  hr: { 'chat.pauseRecording': 'Zaustavi snimanje', 'chat.resumeRecording': 'Nastavi snimanje' },
  et: { 'chat.pauseRecording': 'Peata salvestamine', 'chat.resumeRecording': 'Jätka salvestamist' },
  hu: { 'chat.pauseRecording': 'Felvétel szüneteltetése', 'chat.resumeRecording': 'Felvétel folytatása' },
  lv: { 'chat.pauseRecording': 'Pauzēt ierakstu', 'chat.resumeRecording': 'Turpināt ierakstu' },
  lt: { 'chat.pauseRecording': 'Pristabdyti įrašymą', 'chat.resumeRecording': 'Tęsti įrašymą' },
  mt: { 'chat.pauseRecording': 'Pawża r-reġistrazzjoni', 'chat.resumeRecording': 'Kompli r-reġistrazzjoni' },
  pl: { 'chat.pauseRecording': 'Wstrzymaj nagrywanie', 'chat.resumeRecording': 'Wznów nagrywanie' },
  sk: { 'chat.pauseRecording': 'Pozastaviť nahrávanie', 'chat.resumeRecording': 'Pokračovať v nahrávaní' },
  sl: { 'chat.pauseRecording': 'Začasno ustavi snemanje', 'chat.resumeRecording': 'Nadaljuj snemanje' },
  cs: { 'chat.pauseRecording': 'Pozastavit nahrávání', 'chat.resumeRecording': 'Pokračovat v nahrávání' },
  bg: { 'chat.pauseRecording': 'Пауза на записа', 'chat.resumeRecording': 'Възобновяване на записа' },
  ga: { 'chat.pauseRecording': 'Cuir an taifeadadh ar sos', 'chat.resumeRecording': 'Lean den taifeadadh' },
  ro: { 'chat.pauseRecording': 'Pune în pauză înregistrarea', 'chat.resumeRecording': 'Reia înregistrarea' },
  uk: { 'chat.pauseRecording': 'Призупинити запис', 'chat.resumeRecording': 'Відновити запис' },
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
  const m = /^  ([a-z]{2}): \{\s*$/.exec(line)
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

// A block-level loop can silently drop a locale: count the keys again on the
// file as written, not on the counters.
const after = readFileSync(file, 'utf8')
for (const key of KEYS) {
  const at = after.split(`"${key}":`).length - 1
  if (at !== known.length) {
    console.error(`✗ "${key}" appears ${at} times, expected ${known.length}`)
    process.exit(1)
  }
}

console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
