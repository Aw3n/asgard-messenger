#!/usr/bin/env node
/**
 * Adds contacts.dhtProfileFailed to all 25 supported languages.
 *
 * Why: dans ContactDetailView, une lecture DHT qui rejette ne posait aucun état
 * — `profileFetched` restait faux, et la fiche affichait « Recherche dans le
 * DHT… » avec un point clignotant indéfiniment, comme si l'interrogation était
 * encore en cours. Une panne doit se voir et le bouton d'actualisation rester
 * la voie de reprise.
 *
 * Same in-place algorithm as add-member-mute-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['contacts.dhtProfileFailed']

const DATA = {
  fr: { 'contacts.dhtProfileFailed': 'Profil DHT inaccessible — réessayez' },
  en: { 'contacts.dhtProfileFailed': 'DHT profile unreachable — try again' },
  nl: { 'contacts.dhtProfileFailed': 'DHT-profiel onbereikbaar — probeer opnieuw' },
  de: { 'contacts.dhtProfileFailed': 'DHT-Profil nicht erreichbar – erneut versuchen' },
  it: { 'contacts.dhtProfileFailed': 'Profilo DHT irraggiungibile — riprova' },
  es: { 'contacts.dhtProfileFailed': 'Perfil DHT inaccesible — inténtalo de nuevo' },
  pt: { 'contacts.dhtProfileFailed': 'Perfil DHT inacessível — tente novamente' },
  el: { 'contacts.dhtProfileFailed': 'Το προφίλ DHT δεν είναι προσβάσιμο — δοκιμάστε ξανά' },
  da: { 'contacts.dhtProfileFailed': 'DHT-profilen er ikke tilgængelig — prøv igen' },
  fi: { 'contacts.dhtProfileFailed': 'DHT-profiilia ei tavoiteta — yritä uudelleen' },
  sv: { 'contacts.dhtProfileFailed': 'DHT-profilen går inte att nå – försök igen' },
  hr: { 'contacts.dhtProfileFailed': 'DHT profil nije dostupan — pokušajte ponovno' },
  et: { 'contacts.dhtProfileFailed': 'DHT-profiil pole kättesaadav — proovi uuesti' },
  hu: { 'contacts.dhtProfileFailed': 'A DHT-profil nem érhető el – próbálja újra' },
  lv: { 'contacts.dhtProfileFailed': 'DHT profils nav pieejams — mēģiniet vēlreiz' },
  lt: { 'contacts.dhtProfileFailed': 'DHT profilis nepasiekiamas — bandykite dar kartą' },
  mt: { 'contacts.dhtProfileFailed': 'Il-profil DHT mhux aċċessibbli — erġa’ pprova' },
  pl: { 'contacts.dhtProfileFailed': 'Profil DHT niedostępny — spróbuj ponownie' },
  sk: { 'contacts.dhtProfileFailed': 'Profil DHT je nedostupný — skúste znova' },
  sl: { 'contacts.dhtProfileFailed': 'Profil DHT ni dosegljiv — poskusite znova' },
  cs: { 'contacts.dhtProfileFailed': 'Profil DHT není dostupný — zkuste to znovu' },
  bg: { 'contacts.dhtProfileFailed': 'DHT профилът е недостъпен — опитайте отново' },
  ga: { 'contacts.dhtProfileFailed': 'Níl próifíl DHT inrochtana — bain triail eile as' },
  ro: { 'contacts.dhtProfileFailed': 'Profilul DHT este inaccesibil — încercați din nou' },
  uk: { 'contacts.dhtProfileFailed': 'Профіль DHT недоступний — спробуйте ще раз' },
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
console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
