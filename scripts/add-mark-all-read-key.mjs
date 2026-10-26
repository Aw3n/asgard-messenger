#!/usr/bin/env node
/**
 * Action « Tout marquer comme lu » dans l'en-tête de la liste Messages.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.markAllAsRead']

const DATA = {
  fr: { 'chat.markAllAsRead': 'Tout marquer comme lu' },
  nl: { 'chat.markAllAsRead': 'Alles als gelezen markeren' },
  de: { 'chat.markAllAsRead': 'Alle als gelesen markieren' },
  it: { 'chat.markAllAsRead': 'Segna tutto come letto' },
  es: { 'chat.markAllAsRead': 'Marcar todo como leído' },
  pt: { 'chat.markAllAsRead': 'Marcar tudo como lido' },
  el: { 'chat.markAllAsRead': 'Σήμανση όλων ως αναγνωσμένων' },
  da: { 'chat.markAllAsRead': 'Markér alle som læst' },
  fi: { 'chat.markAllAsRead': 'Merkitse kaikki luetuiksi' },
  sv: { 'chat.markAllAsRead': 'Markera alla som lästa' },
  hr: { 'chat.markAllAsRead': 'Označi sve kao pročitano' },
  et: { 'chat.markAllAsRead': 'Märgi kõik loetuks' },
  hu: { 'chat.markAllAsRead': 'Összes megjelölése olvasottként' },
  lv: { 'chat.markAllAsRead': 'Atzīmēt visu kā lasītu' },
  lt: { 'chat.markAllAsRead': 'Pažymėti viską kaip skaitytą' },
  mt: { 'chat.markAllAsRead': 'Immarka kollha bħala moqrija' },
  pl: { 'chat.markAllAsRead': 'Oznacz wszystko jako przeczytane' },
  sk: { 'chat.markAllAsRead': 'Označiť všetko ako prečítané' },
  sl: { 'chat.markAllAsRead': 'Označi vse kot prebrano' },
  cs: { 'chat.markAllAsRead': 'Označit vše jako přečtené' },
  bg: { 'chat.markAllAsRead': 'Маркирай всичко като прочетено' },
  ga: { 'chat.markAllAsRead': 'Marcáil gach rud mar léite' },
  ro: { 'chat.markAllAsRead': 'Marchează totul ca citit' },
  en: { 'chat.markAllAsRead': 'Mark all as read' },
  uk: { 'chat.markAllAsRead': 'Позначити все як прочитане' },
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
