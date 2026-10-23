#!/usr/bin/env node
/**
 * Injecte dans src/i18n/translations.ts (25 langues) les textes des
 * notifications système, jusqu'ici codés en anglais dans les services :
 *   notifications.newMessage   — corps sans aperçu (1:1 et groupe)
 *   notifications.mentionedYou — mention de groupe sans aperçu
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = [
  'notifications.newMessage',
  'notifications.mentionedYou',
]

const DATA = {
  fr: {
    'notifications.newMessage': 'Nouveau message',
    'notifications.mentionedYou': '{{name}} vous a mentionné',
  },
  nl: {
    'notifications.newMessage': 'Nieuw bericht',
    'notifications.mentionedYou': '{{name}} heeft je vermeld',
  },
  de: {
    'notifications.newMessage': 'Neue Nachricht',
    'notifications.mentionedYou': '{{name}} hat dich erwähnt',
  },
  it: {
    'notifications.newMessage': 'Nuovo messaggio',
    'notifications.mentionedYou': '{{name}} ti ha menzionato',
  },
  es: {
    'notifications.newMessage': 'Mensaje nuevo',
    'notifications.mentionedYou': '{{name}} te ha mencionado',
  },
  pt: {
    'notifications.newMessage': 'Nova mensagem',
    'notifications.mentionedYou': '{{name}} mencionou você',
  },
  el: {
    'notifications.newMessage': 'Νέο μήνυμα',
    'notifications.mentionedYou': '{{name}} σας ανέφερε',
  },
  da: {
    'notifications.newMessage': 'Ny besked',
    'notifications.mentionedYou': '{{name}} nævnte dig',
  },
  fi: {
    'notifications.newMessage': 'Uusi viesti',
    'notifications.mentionedYou': '{{name}} mainitsi sinut',
  },
  sv: {
    'notifications.newMessage': 'Nytt meddelande',
    'notifications.mentionedYou': '{{name}} nämnde dig',
  },
  hr: {
    'notifications.newMessage': 'Nova poruka',
    'notifications.mentionedYou': '{{name}} vas je spomenuo',
  },
  et: {
    'notifications.newMessage': 'Uus sõnum',
    'notifications.mentionedYou': '{{name}} mainis sind',
  },
  hu: {
    'notifications.newMessage': 'Új üzenet',
    'notifications.mentionedYou': '{{name}} megemlített téged',
  },
  lv: {
    'notifications.newMessage': 'Jauns ziņojums',
    'notifications.mentionedYou': '{{name}} jūs pieminēja',
  },
  lt: {
    'notifications.newMessage': 'Nauja žinutė',
    'notifications.mentionedYou': '{{name}} jus paminėjo',
  },
  mt: {
    'notifications.newMessage': 'Messaġġ ġdid',
    'notifications.mentionedYou': '{{name}} għamel referenza għalik',
  },
  pl: {
    'notifications.newMessage': 'Nowa wiadomość',
    'notifications.mentionedYou': '{{name}} wspomniał o Tobie',
  },
  sk: {
    'notifications.newMessage': 'Nová správa',
    'notifications.mentionedYou': '{{name}} vás spomenul',
  },
  sl: {
    'notifications.newMessage': 'Novo sporočilo',
    'notifications.mentionedYou': '{{name}} vas je omenil',
  },
  cs: {
    'notifications.newMessage': 'Nová zpráva',
    'notifications.mentionedYou': '{{name}} vás zmínil',
  },
  bg: {
    'notifications.newMessage': 'Ново съобщение',
    'notifications.mentionedYou': '{{name}} ви спомена',
  },
  ga: {
    'notifications.newMessage': 'Teachtaireacht nua',
    'notifications.mentionedYou': 'Luaigh {{name}} thú',
  },
  ro: {
    'notifications.newMessage': 'Mesaj nou',
    'notifications.mentionedYou': '{{name}} te-a menționat',
  },
  en: {
    'notifications.newMessage': 'New message',
    'notifications.mentionedYou': '{{name}} mentioned you',
  },
  uk: {
    'notifications.newMessage': 'Нове повідомлення',
    'notifications.mentionedYou': '{{name}} згадав вас',
  },
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
