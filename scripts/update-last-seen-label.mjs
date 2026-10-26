#!/usr/bin/env node
/**
 * Libellé « dernière présence » neutre.
 *
 * L'en-tête du fil affiche désormais une durée relative ; la fiche
 * d'information, elle, garde une date absolue. Un libellé « vu récemment »
 * au-dessus d'une date contredisait sa valeur.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const DATA = {
  fr: 'Dernière présence',
  nl: 'Laatst gezien',
  de: 'Zuletzt gesehen',
  it: 'Ultimo accesso',
  es: 'Última conexión',
  pt: 'Última conexão',
  el: 'Τελευταία εμφάνιση',
  da: 'Sidst set',
  fi: 'Viimeksi nähty',
  sv: 'Senast sedd',
  hr: 'Posljednje viđen',
  et: 'Viimati nähtud',
  hu: 'Utolsó jelenlét',
  lv: 'Pēdējā atrašanās',
  lt: 'Paskutinis prisijungimas',
  mt: 'L-aħħar dehra',
  pl: 'Ostatnio widziany',
  sk: 'Naposledy videný',
  sl: 'Nazadnje viden',
  cs: 'Naposledy viděn',
  bg: 'Последно видян',
  ga: 'Feicthe go deireanach',
  ro: 'Ultima prezență',
  en: 'Last seen',
  uk: 'Остання поява',
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

let replaced = 0
for (const mark of marks) {
  const next = marks.find((m) => m.i > mark.i)
  const end = next ? next.i : lines.length
  const line = `      "chat.lastSeen": "${escapeValue(DATA[mark.code])}",`
  const re = /^[ \t]*"chat\.lastSeen":\s*"(?:[^"\\]|\\.)*",?[ \t]*$/
  for (let i = mark.i + 1; i < end; i++) {
    if (!re.test(lines[i])) continue
    if (lines[i] !== line) { lines[i] = line; replaced++ }
    break
  }
}

writeFileSync(file, lines.join(eol), 'utf8')
console.log(`✓ ${marks.length} locales · ${replaced} libellés réécrits`)
