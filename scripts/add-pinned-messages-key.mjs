#!/usr/bin/env node
/**
 * Adds the pinned-messages bar heading (chat.pinnedMessages) to all 25 supported
 * languages of src/i18n/translations.ts.
 *
 * Why a heading and not "{{count}} message(s) épinglé(s)" : la barre affichait du
 * français codé en dur avec un `s` de pluriel bricolé en JSX. Une forme binaire
 * « un / plusieurs » serait tombée faux en tchèque, polonais, lituanien, gaélique
 * ou maltais, où le nom s'accorde différemment selon la classe de nombre. Un
 * en-tête défini (« Messages épinglés ») ne dépend d'aucun compte : le nombre est
 * rendu à part, en pastille. Same in-place algorithm as add-history-error-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.pinnedMessages']

const DATA = {
  fr: { 'chat.pinnedMessages': 'Messages épinglés' },
  en: { 'chat.pinnedMessages': 'Pinned messages' },
  nl: { 'chat.pinnedMessages': 'Vastgezette berichten' },
  de: { 'chat.pinnedMessages': 'Angeheftete Nachrichten' },
  it: { 'chat.pinnedMessages': 'Messaggi fissati' },
  es: { 'chat.pinnedMessages': 'Mensajes fijados' },
  pt: { 'chat.pinnedMessages': 'Mensagens fixadas' },
  el: { 'chat.pinnedMessages': 'Καρφιτσωμένα μηνύματα' },
  da: { 'chat.pinnedMessages': 'Fastgjorte beskeder' },
  fi: { 'chat.pinnedMessages': 'Kiinnitetyt viestit' },
  sv: { 'chat.pinnedMessages': 'Nålade meddelanden' },
  hr: { 'chat.pinnedMessages': 'Zakačene poruke' },
  et: { 'chat.pinnedMessages': 'Kinnitatud sõnumid' },
  hu: { 'chat.pinnedMessages': 'Kitűzött üzenetek' },
  lv: { 'chat.pinnedMessages': 'Piesprausti ziņojumi' },
  lt: { 'chat.pinnedMessages': 'Prisegtos žinutės' },
  mt: { 'chat.pinnedMessages': "Messaġġi mwaqqa'" },
  pl: { 'chat.pinnedMessages': 'Przypięte wiadomości' },
  sk: { 'chat.pinnedMessages': 'Pripnuté správy' },
  sl: { 'chat.pinnedMessages': 'Pripeta sporočila' },
  cs: { 'chat.pinnedMessages': 'Připnuté zprávy' },
  bg: { 'chat.pinnedMessages': 'Закачени съобщения' },
  ga: { 'chat.pinnedMessages': 'Teachtaireachtaí pionnáilte' },
  ro: { 'chat.pinnedMessages': 'Mesaje fixate' },
  uk: { 'chat.pinnedMessages': 'Закріплені повідомлення' },
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
console.log(`✓ ${known.length} locales · ${KEYS.length} key · ${replaced} lines rewritten, ${inserted} lines added`)
