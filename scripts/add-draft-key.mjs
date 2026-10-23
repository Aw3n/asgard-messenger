#!/usr/bin/env node
/**
 * Aperçu du brouillon dans la liste des conversations : le composeur enregistre
 * désormais un brouillon par fil, la liste doit pouvoir le signaler.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.draft']

const DATA = {
  fr: { 'chat.draft': 'Brouillon : {{text}}' },
  nl: { 'chat.draft': 'Concept: {{text}}' },
  de: { 'chat.draft': 'Entwurf: {{text}}' },
  it: { 'chat.draft': 'Bozza: {{text}}' },
  es: { 'chat.draft': 'Borrador: {{text}}' },
  pt: { 'chat.draft': 'Rascunho: {{text}}' },
  el: { 'chat.draft': 'Πρόχειρο: {{text}}' },
  da: { 'chat.draft': 'Kladde: {{text}}' },
  fi: { 'chat.draft': 'Luonnos: {{text}}' },
  sv: { 'chat.draft': 'Utkast: {{text}}' },
  hr: { 'chat.draft': 'Skica: {{text}}' },
  et: { 'chat.draft': 'Mustand: {{text}}' },
  hu: { 'chat.draft': 'Piszkozat: {{text}}' },
  lv: { 'chat.draft': 'Melnraksts: {{text}}' },
  lt: { 'chat.draft': 'Juodraštis: {{text}}' },
  mt: { 'chat.draft': 'Abbozz: {{text}}' },
  pl: { 'chat.draft': 'Szkic: {{text}}' },
  sk: { 'chat.draft': 'Koncept: {{text}}' },
  sl: { 'chat.draft': 'Osnutek: {{text}}' },
  cs: { 'chat.draft': 'Koncept: {{text}}' },
  bg: { 'chat.draft': 'Чернова: {{text}}' },
  ga: { 'chat.draft': 'Dréacht: {{text}}' },
  ro: { 'chat.draft': 'Ciornă: {{text}}' },
  en: { 'chat.draft': 'Draft: {{text}}' },
  uk: { 'chat.draft': 'Чернетка: {{text}}' },
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
