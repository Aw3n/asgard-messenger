#!/usr/bin/env node
/**
 * Injecte « Envoyez un message pour commencer à discuter avec {{name}} » —
 * texte d'accueil d'un fil vide, jusqu'ici codé en anglais dans ChatView.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.sendToStart']

const DATA = {
  fr: { 'chat.sendToStart': 'Envoyez un message pour commencer à discuter avec {{name}}.' },
  nl: { 'chat.sendToStart': 'Stuur een bericht om een gesprek te beginnen met {{name}}.' },
  de: { 'chat.sendToStart': 'Sende eine Nachricht, um mit {{name}} zu chatten.' },
  it: { 'chat.sendToStart': 'Invia un messaggio per iniziare a parlare con {{name}}.' },
  es: { 'chat.sendToStart': 'Envía un mensaje para empezar a hablar con {{name}}.' },
  pt: { 'chat.sendToStart': 'Envie uma mensagem para começar a conversar com {{name}}.' },
  el: { 'chat.sendToStart': 'Στείλτε ένα μήνυμα για να ξεκινήσετε συνομιλία με {{name}}.' },
  da: { 'chat.sendToStart': 'Send en besked for at begynde at tale med {{name}}.' },
  fi: { 'chat.sendToStart': 'Lähetä viesti aloittaaksesi keskustelun käyttäjän {{name}} kanssa.' },
  sv: { 'chat.sendToStart': 'Skicka ett meddelande för att börja prata med {{name}}.' },
  hr: { 'chat.sendToStart': 'Pošaljite poruku da započnete razgovor s {{name}}.' },
  et: { 'chat.sendToStart': 'Saatke sõnum, et alustada vestlust kasutajaga {{name}}.' },
  hu: { 'chat.sendToStart': 'Küldjön üzenetet, hogy beszélgetni kezdjen vele: {{name}}.' },
  lv: { 'chat.sendToStart': 'Nosūtiet ziņojumu, lai sāktu sarunu ar {{name}}.' },
  lt: { 'chat.sendToStart': 'Išsiųskite žinutę, kad pradėtumėte pokalbį su {{name}}.' },
  mt: { 'chat.sendToStart': "Ibgħat messaġġ biex tibda titkellem ma' {{name}}." },
  pl: { 'chat.sendToStart': 'Wyślij wiadomość, aby rozpocząć rozmowę z {{name}}.' },
  sk: { 'chat.sendToStart': 'Pošlite správu, aby začať konverzáciu s {{name}}.' },
  sl: { 'chat.sendToStart': 'Pošljite sporočilo, da začnete pogovor s {{name}}.' },
  cs: { 'chat.sendToStart': 'Pošlete zprávu a začněte konverzovat s {{name}}.' },
  bg: { 'chat.sendToStart': 'Изпратете съобщение, за да започнете разговор с {{name}}.' },
  ga: { 'chat.sendToStart': 'Seol teachtaireacht chun tús a chur ag caint le {{name}}.' },
  ro: { 'chat.sendToStart': 'Trimiteți un mesaj pentru a începe conversația cu {{name}}.' },
  en: { 'chat.sendToStart': 'Send a message to start talking with {{name}}.' },
  uk: { 'chat.sendToStart': 'Надішліть повідомлення, щоб почати розмову з {{name}}.' },
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
