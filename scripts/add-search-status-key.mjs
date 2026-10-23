#!/usr/bin/env node
/**
 * Injecte « Recherche dans l'historique… » — état affiché pendant la
 * recherche profonde Hyperbee, au lieu d'un « aucun résultat » prématuré.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['search.searching']

const DATA = {
  fr: { 'search.searching': 'Recherche dans l’historique…' },
  nl: { 'search.searching': 'Geschiedenis doorzoeken…' },
  de: { 'search.searching': 'Verlauf wird durchsucht…' },
  it: { 'search.searching': 'Ricerca nella cronologia…' },
  es: { 'search.searching': 'Buscando en el historial…' },
  pt: { 'search.searching': 'A procurar no histórico…' },
  el: { 'search.searching': 'Αναζήτηση στο ιστορικό…' },
  da: { 'search.searching': 'Søger i historikken…' },
  fi: { 'search.searching': 'Haetaan historiasta…' },
  sv: { 'search.searching': 'Söker i historiken…' },
  hr: { 'search.searching': 'Pretraživanje povijesti…' },
  et: { 'search.searching': 'Ajaloo otsimine…' },
  hu: { 'search.searching': 'Előzmények keresése…' },
  lv: { 'search.searching': 'Vēstures meklēšana…' },
  lt: { 'search.searching': 'Ieškoma istorijoje…' },
  mt: { 'search.searching': 'Qed tfittex fl-istorja…' },
  pl: { 'search.searching': 'Wyszukiwanie w historii…' },
  sk: { 'search.searching': 'Prehľadávanie histórie…' },
  sl: { 'search.searching': 'Iskanje po zgodovini…' },
  cs: { 'search.searching': 'Prohledávání historie…' },
  bg: { 'search.searching': 'Търсене в историята…' },
  ga: { 'search.searching': 'Ag cuardach na staire…' },
  ro: { 'search.searching': 'Se caută în istoric…' },
  en: { 'search.searching': 'Searching history…' },
  uk: { 'search.searching': 'Пошук в історії…' },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

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
console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
