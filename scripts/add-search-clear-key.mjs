#!/usr/bin/env node
/**
 * Adds the search-field clear button label (search.clearQuery) to all 25
 * supported languages of src/i18n/translations.ts.
 *
 * Why this wording : la croix du champ de recherche efface la saisie, elle ne
 * referme pas la modale — l'appeler « Fermer » faisait annoncer au lecteur
 * d'écran une action que le clic ne faisait pas. Same in-place algorithm as
 * add-search-more-results-key.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['search.clearQuery']

const DATA = {
  fr: { 'search.clearQuery': 'Effacer la recherche' },
  en: { 'search.clearQuery': 'Clear search' },
  nl: { 'search.clearQuery': 'Zoekopdracht wissen' },
  de: { 'search.clearQuery': 'Suche löschen' },
  it: { 'search.clearQuery': 'Cancella ricerca' },
  es: { 'search.clearQuery': 'Borrar la búsqueda' },
  pt: { 'search.clearQuery': 'Limpar pesquisa' },
  el: { 'search.clearQuery': 'Διαγραφή αναζήτησης' },
  da: { 'search.clearQuery': 'Ryd søgning' },
  fi: { 'search.clearQuery': 'Tyhjennä haku' },
  sv: { 'search.clearQuery': 'Rensa sökningen' },
  hr: { 'search.clearQuery': 'Obriši pretragu' },
  et: { 'search.clearQuery': 'Tühjenda otsing' },
  hu: { 'search.clearQuery': 'Keresés törlése' },
  lv: { 'search.clearQuery': 'Notīrīt meklēšanu' },
  lt: { 'search.clearQuery': 'Išvalyti paiešką' },
  mt: { 'search.clearQuery': 'Neħħi l-ftixa' },
  pl: { 'search.clearQuery': 'Wyczyść wyszukiwanie' },
  sk: { 'search.clearQuery': 'Vymazať vyhľadávanie' },
  sl: { 'search.clearQuery': 'Počisti iskanje' },
  cs: { 'search.clearQuery': 'Vymazat hledání' },
  bg: { 'search.clearQuery': 'Изчистване на търсенето' },
  ga: { 'search.clearQuery': 'Glanch an cuardach' },
  ro: { 'search.clearQuery': 'Șterge căutarea' },
  uk: { 'search.clearQuery': 'Очистити пошук' },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

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
console.log(`✓ ${known.length} locales · ${KEYS.length} key · ${replaced} lines rewritten, ${inserted} lines added`)
