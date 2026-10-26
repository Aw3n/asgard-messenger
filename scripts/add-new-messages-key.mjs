#!/usr/bin/env node
/**
 * Séparateur « Nouveaux messages » dans le fil et les canaux.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.newMessages']

const DATA = {
  fr: { 'chat.newMessages': 'Nouveaux messages' },
  nl: { 'chat.newMessages': 'Nieuwe berichten' },
  de: { 'chat.newMessages': 'Neue Nachrichten' },
  it: { 'chat.newMessages': 'Nuovi messaggi' },
  es: { 'chat.newMessages': 'Mensajes nuevos' },
  pt: { 'chat.newMessages': 'Mensagens novas' },
  el: { 'chat.newMessages': 'Νέα μηνύματα' },
  da: { 'chat.newMessages': 'Nye beskeder' },
  fi: { 'chat.newMessages': 'Uudet viestit' },
  sv: { 'chat.newMessages': 'Nya meddelanden' },
  hr: { 'chat.newMessages': 'Nove poruke' },
  et: { 'chat.newMessages': 'Uued sõnumid' },
  hu: { 'chat.newMessages': 'Új üzenetek' },
  lv: { 'chat.newMessages': 'Jauni ziņojumi' },
  lt: { 'chat.newMessages': 'Nauji pranešimai' },
  mt: { 'chat.newMessages': 'Messaġġi ġodda' },
  pl: { 'chat.newMessages': 'Nowe wiadomości' },
  sk: { 'chat.newMessages': 'Nové správy' },
  sl: { 'chat.newMessages': 'Nova sporočila' },
  cs: { 'chat.newMessages': 'Nové zprávy' },
  bg: { 'chat.newMessages': 'Нови съобщения' },
  ga: { 'chat.newMessages': 'Teachtaireachtaí nua' },
  ro: { 'chat.newMessages': 'Mesaje noi' },
  en: { 'chat.newMessages': 'New messages' },
  uk: { 'chat.newMessages': 'Нові повідомлення' },
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
