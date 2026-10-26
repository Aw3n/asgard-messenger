#!/usr/bin/env node
/**
 * Adds the history pagination failure key (chat.historyLoadFailed) to all 25
 * supported languages of src/i18n/translations.ts.
 *
 * Why a script: the project rule is that no UI string ships in fewer than the 25
 * locales — `fallbackLng: 'fr'` would otherwise silently display French to a
 * Polish user. Same in-place algorithm as add-lightbox-error-keys.mjs: existing
 * lines are rewritten whatever their indentation, missing ones are inserted
 * before the closing brace of the nested `translation` object (four spaces).
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.historyLoadFailed']

const DATA = {
  fr: { 'chat.historyLoadFailed': "Impossible de charger l’historique" },
  en: { 'chat.historyLoadFailed': 'History could not be loaded' },
  nl: { 'chat.historyLoadFailed': 'Geschiedenis kon niet worden geladen' },
  de: { 'chat.historyLoadFailed': 'Verlauf konnte nicht geladen werden' },
  it: { 'chat.historyLoadFailed': "Impossibile caricare la cronologia" },
  es: { 'chat.historyLoadFailed': 'No se pudo cargar el historial' },
  pt: { 'chat.historyLoadFailed': 'Não foi possível carregar o histórico' },
  el: { 'chat.historyLoadFailed': 'Το ιστορικό δεν μπόρεσε να φορτωθεί' },
  da: { 'chat.historyLoadFailed': 'Historikken kunne ikke indlæses' },
  fi: { 'chat.historyLoadFailed': 'Historiaa ei voitu ladata' },
  sv: { 'chat.historyLoadFailed': 'Historiken kunde inte laddas' },
  hr: { 'chat.historyLoadFailed': 'Povijest se nije mogla učitati' },
  et: { 'chat.historyLoadFailed': 'Ajalugu ei saanud laadida' },
  hu: { 'chat.historyLoadFailed': 'Az előzmények nem tölthetők be' },
  lv: { 'chat.historyLoadFailed': 'Vēsturi nevarēja ielādēt' },
  lt: { 'chat.historyLoadFailed': 'Istorijos nepavyko įkelti' },
  mt: { 'chat.historyLoadFailed': "L-istorja ma setgħetx titgħabba" },
  pl: { 'chat.historyLoadFailed': 'Nie udało się załadować historii' },
  sk: { 'chat.historyLoadFailed': 'Históriu sa nepodarilo načítať' },
  sl: { 'chat.historyLoadFailed': 'Zgodovine ni bilo mogoče naložiti' },
  cs: { 'chat.historyLoadFailed': 'Historici se nepodařilo načíst' },
  bg: { 'chat.historyLoadFailed': 'Историята не можа да се зареди' },
  ga: { 'chat.historyLoadFailed': 'Níorbh fhéidir an stair a lódáil' },
  ro: { 'chat.historyLoadFailed': 'Istoricul nu a putut fi încărcat' },
  uk: { 'chat.historyLoadFailed': 'Історію не вдалося завантажити' },
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
console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
