#!/usr/bin/env node
/**
 * Bouton « revenir aux messages les plus récents » dans le fil.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.scrollToLatest']

const DATA = {
  fr: { 'chat.scrollToLatest': 'Revenir aux messages les plus récents' },
  nl: { 'chat.scrollToLatest': 'Terug naar de nieuwste berichten' },
  de: { 'chat.scrollToLatest': 'Zu den neuesten Nachrichten springen' },
  it: { 'chat.scrollToLatest': 'Vai ai messaggi più recenti' },
  es: { 'chat.scrollToLatest': 'Ir a los mensajes más recientes' },
  pt: { 'chat.scrollToLatest': 'Ir para as mensagens mais recentes' },
  el: { 'chat.scrollToLatest': 'Μετάβαση στα πιο πρόσφατα μηνύματα' },
  da: { 'chat.scrollToLatest': 'Gå til de nyeste beskeder' },
  fi: { 'chat.scrollToLatest': 'Siirry uusimpiin viesteihin' },
  sv: { 'chat.scrollToLatest': 'Gå till de senaste meddelandena' },
  hr: { 'chat.scrollToLatest': 'Idi na najnovije poruke' },
  et: { 'chat.scrollToLatest': 'Mine uusimate sõnumite juurde' },
  hu: { 'chat.scrollToLatest': 'Ugrás a legújabb üzenetekhez' },
  lv: { 'chat.scrollToLatest': 'Pāriet uz jaunākajām ziņām' },
  lt: { 'chat.scrollToLatest': 'Pereiti prie naujausių žinučių' },
  mt: { 'chat.scrollToLatest': 'Mur għall-aktar messaġġi reċenti' },
  pl: { 'chat.scrollToLatest': 'Przejdź do najnowszych wiadomości' },
  sk: { 'chat.scrollToLatest': 'Prejsť na najnovšie správy' },
  sl: { 'chat.scrollToLatest': 'Pojdi na najnovejša sporočila' },
  cs: { 'chat.scrollToLatest': 'Přejít na nejnovější zprávy' },
  bg: { 'chat.scrollToLatest': 'Към най-новите съобщения' },
  ga: { 'chat.scrollToLatest': 'Téigh go dtí na teachtaireachtaí is déanaí' },
  ro: { 'chat.scrollToLatest': 'Mergi la cele mai recente mesaje' },
  en: { 'chat.scrollToLatest': 'Jump to latest messages' },
  uk: { 'chat.scrollToLatest': 'Перейти до найновіших повідомлень' },
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
