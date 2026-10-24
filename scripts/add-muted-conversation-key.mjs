#!/usr/bin/env node
/**
 * État « conversation en sourdine » annoncé aux lecteurs d'écran, dans les
 * listes de conversations et de canaux (les icônes et pastilles ne le sont pas).
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.mutedConversation']

const DATA = {
  fr: { 'chat.mutedConversation': 'Conversation en sourdine' },
  nl: { 'chat.mutedConversation': 'Gesprek gedempt' },
  de: { 'chat.mutedConversation': 'Stummgeschaltete Unterhaltung' },
  it: { 'chat.mutedConversation': 'Conversazione silenziata' },
  es: { 'chat.mutedConversation': 'Conversación silenciada' },
  pt: { 'chat.mutedConversation': 'Conversa silenciada' },
  el: { 'chat.mutedConversation': 'Σε σίγαση συνομιλία' },
  da: { 'chat.mutedConversation': 'Lydløs samtale' },
  fi: { 'chat.mutedConversation': 'Mykistetty keskustelu' },
  sv: { 'chat.mutedConversation': 'Tystad konversation' },
  hr: { 'chat.mutedConversation': 'Utišan razgovor' },
  et: { 'chat.mutedConversation': 'Vaigistatud vestlus' },
  hu: { 'chat.mutedConversation': 'Némított beszélgetés' },
  lv: { 'chat.mutedConversation': 'Ierunāta saruna' },
  lt: { 'chat.mutedConversation': 'Nutildytas pokalbis' },
  mt: { 'chat.mutedConversation': 'Konversazzjoni msikkta' },
  pl: { 'chat.mutedConversation': 'Wyciszona rozmowa' },
  sk: { 'chat.mutedConversation': 'Stlmená konverzácia' },
  sl: { 'chat.mutedConversation': 'Utišan pogovor' },
  cs: { 'chat.mutedConversation': 'Ztišená konverzace' },
  bg: { 'chat.mutedConversation': 'Заглушен разговор' },
  ga: { 'chat.mutedConversation': 'Comhrá balbhaithe' },
  ro: { 'chat.mutedConversation': 'Conversație fără sunet' },
  en: { 'chat.mutedConversation': 'Muted conversation' },
  uk: { 'chat.mutedConversation': 'Розмова без звуку' },
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
