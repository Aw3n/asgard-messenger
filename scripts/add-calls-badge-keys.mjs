#!/usr/bin/env node
/**
 * Adds the two connection-badge labels (calls.connectingCount,
 * calls.connectedContactCount) to all 25 supported languages.
 *
 * Why: CallsPage affiche deux pastilles purement numériques dans l'en-tête de
 * l'historique (connexions en cours, contacts joignables). Un lecteur d'écran
 * y annonçait « 3 » puis « 1 », sans dire de quoi. Les libellés sont formulés
 * avec le nombre en fin de phrase pour éviter toute flexion du nom.
 *
 * Same in-place algorithm as add-member-mute-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['calls.connectingCount', 'calls.connectedContactCount']

const DATA = {
  fr: {
    'calls.connectingCount': 'Connexions en cours : {{count}}',
    'calls.connectedContactCount': 'Contacts connectés : {{count}}',
  },
  en: {
    'calls.connectingCount': 'Connections in progress: {{count}}',
    'calls.connectedContactCount': 'Connected contacts: {{count}}',
  },
  nl: {
    'calls.connectingCount': 'Verbindingen bezig: {{count}}',
    'calls.connectedContactCount': 'Verbonden contacten: {{count}}',
  },
  de: {
    'calls.connectingCount': 'Verbindungen im Aufbau: {{count}}',
    'calls.connectedContactCount': 'Verbundene Kontakte: {{count}}',
  },
  it: {
    'calls.connectingCount': 'Connessioni in corso: {{count}}',
    'calls.connectedContactCount': 'Contatti connessi: {{count}}',
  },
  es: {
    'calls.connectingCount': 'Conexiones en curso: {{count}}',
    'calls.connectedContactCount': 'Contactos conectados: {{count}}',
  },
  pt: {
    'calls.connectingCount': 'Ligações em curso: {{count}}',
    'calls.connectedContactCount': 'Contactos ligados: {{count}}',
  },
  el: {
    'calls.connectingCount': 'Συνδέσεις σε εξέλιξη: {{count}}',
    'calls.connectedContactCount': 'Συνδεδεμένες επαφές: {{count}}',
  },
  da: {
    'calls.connectingCount': 'Forbindelser i gang: {{count}}',
    'calls.connectedContactCount': 'Forbundne kontakter: {{count}}',
  },
  fi: {
    'calls.connectingCount': 'Yhteydet käynnissä: {{count}}',
    'calls.connectedContactCount': 'Yhdistetyt yhteystiedot: {{count}}',
  },
  sv: {
    'calls.connectingCount': 'Anslutningar pågår: {{count}}',
    'calls.connectedContactCount': 'Anslutna kontakter: {{count}}',
  },
  hr: {
    'calls.connectingCount': 'Povezivanja u tijeku: {{count}}',
    'calls.connectedContactCount': 'Povezani kontakti: {{count}}',
  },
  et: {
    'calls.connectingCount': 'Ühendused käimas: {{count}}',
    'calls.connectedContactCount': 'Ühendatud kontaktid: {{count}}',
  },
  hu: {
    'calls.connectingCount': 'Kapcsolódások folyamatban: {{count}}',
    'calls.connectedContactCount': 'Csatlakozott névjegyek: {{count}}',
  },
  lv: {
    'calls.connectingCount': 'Savienojumi notiek: {{count}}',
    'calls.connectedContactCount': 'Savienotie kontakti: {{count}}',
  },
  lt: {
    'calls.connectingCount': 'Jungiamasi: {{count}}',
    'calls.connectedContactCount': 'Prijungti kontaktai: {{count}}',
  },
  mt: {
    'calls.connectingCount': 'Konnessjonijiet għaddejjin: {{count}}',
    'calls.connectedContactCount': 'Kuntatti konnessi: {{count}}',
  },
  pl: {
    'calls.connectingCount': 'Połączenia w toku: {{count}}',
    'calls.connectedContactCount': 'Połączeni kontakty: {{count}}',
  },
  sk: {
    'calls.connectingCount': 'Prebiehajúce pripojenia: {{count}}',
    'calls.connectedContactCount': 'Pripojené kontakty: {{count}}',
  },
  sl: {
    'calls.connectingCount': 'Povezave v teku: {{count}}',
    'calls.connectedContactCount': 'Povezani stiki: {{count}}',
  },
  cs: {
    'calls.connectingCount': 'Probíhající připojení: {{count}}',
    'calls.connectedContactCount': 'Připojené kontakty: {{count}}',
  },
  bg: {
    'calls.connectingCount': 'Връзки в ход: {{count}}',
    'calls.connectedContactCount': 'Свързани контакти: {{count}}',
  },
  ga: {
    'calls.connectingCount': 'Ceangail ar siúl: {{count}}',
    'calls.connectedContactCount': 'Teagmhálaithe ceangailte: {{count}}',
  },
  ro: {
    'calls.connectingCount': 'Conexiuni în curs: {{count}}',
    'calls.connectedContactCount': 'Contacte conectate: {{count}}',
  },
  uk: {
    'calls.connectingCount': 'З’єднання в процесі: {{count}}',
    'calls.connectedContactCount': 'Підключені контакти: {{count}}',
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
