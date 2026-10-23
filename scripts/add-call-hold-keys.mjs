#!/usr/bin/env node
/**
 * Adds the two hold-call indicators (calls.youOnHold, calls.peerOnHold) to all
 * 25 supported languages of src/i18n/translations.ts.
 *
 * Why this wording : la mise en attente existe depuis le premier jour mais ne
 * coupe rien et ne se dit nulle part. Le badge doit donc nommer qui attend —
 * « vous » d'un côté, le pair de l'autre — et, en appel de groupe, plusieurs
 * badges peuvent coexister, d'où l'interpolation {{name}} plutôt qu'un
 * « l'interlocuteur » qui désignerait une seule personne. Les langues où le
 * verbe s'accorde au genre du sujet (pl, hu, lv…) reçoivent une tournure
 * nominale : pas de « wstrzymał » masculin pour une contactante.
 *
 * Same in-place algorithm as add-cannot-post-channel-key.mjs, with the
 * post-write count the injector of lot 8 taught us to require.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['calls.youOnHold', 'calls.peerOnHold']

const DATA = {
  fr: { 'calls.youOnHold': 'Vous êtes en attente', 'calls.peerOnHold': '{{name}} est en attente' },
  en: { 'calls.youOnHold': 'You are on hold', 'calls.peerOnHold': '{{name}} is on hold' },
  nl: { 'calls.youOnHold': 'Je staat in de wacht', 'calls.peerOnHold': '{{name}} staat in de wacht' },
  de: { 'calls.youOnHold': 'Ihr Anruf ist gehalten', 'calls.peerOnHold': '{{name}} hat den Anruf gehalten' },
  it: { 'calls.youOnHold': 'Sei in attesa', 'calls.peerOnHold': '{{name}} è in attesa' },
  es: { 'calls.youOnHold': 'Estás en espera', 'calls.peerOnHold': '{{name}} está en espera' },
  pt: { 'calls.youOnHold': 'Está em espera', 'calls.peerOnHold': '{{name}} está em espera' },
  el: { 'calls.youOnHold': 'Είστε σε αναμονή', 'calls.peerOnHold': '{{name}} είναι σε αναμονή' },
  da: { 'calls.youOnHold': 'Du er på pause', 'calls.peerOnHold': '{{name}} er på pause' },
  fi: { 'calls.youOnHold': 'Puhelu on pidossa', 'calls.peerOnHold': '{{name}} on pidossa' },
  sv: { 'calls.youOnHold': 'Du är på vänt', 'calls.peerOnHold': '{{name}} är på vänt' },
  hr: { 'calls.youOnHold': 'Vi ste na čekanju', 'calls.peerOnHold': '{{name}} je na čekanju' },
  et: { 'calls.youOnHold': 'Olete ootel', 'calls.peerOnHold': '{{name}} on ootel' },
  hu: { 'calls.youOnHold': 'A hívás tartásban van', 'calls.peerOnHold': '{{name}} tartásban van' },
  lv: { 'calls.youOnHold': 'Zvans ir aizturēts', 'calls.peerOnHold': '{{name}} — aizturēts' },
  lt: { 'calls.youOnHold': 'Skambutis laikomas', 'calls.peerOnHold': '{{name}} — laikomas' },
  mt: { 'calls.youOnHold': 'Is-sejħa fil-pawża', 'calls.peerOnHold': '{{name}} fil-pawża' },
  pl: { 'calls.youOnHold': 'Połączenie wstrzymane', 'calls.peerOnHold': '{{name}} — połączenie wstrzymane' },
  sk: { 'calls.youOnHold': 'Hovor je pozastavený', 'calls.peerOnHold': '{{name}} — pozastavený' },
  sl: { 'calls.youOnHold': 'Klic je zadržen', 'calls.peerOnHold': '{{name}} — zadržen' },
  cs: { 'calls.youOnHold': 'Hovor je pozastaven', 'calls.peerOnHold': '{{name}} — pozastaven' },
  bg: { 'calls.youOnHold': 'Разговорът е на изчакване', 'calls.peerOnHold': '{{name}} е на изчакване' },
  ga: { 'calls.youOnHold': 'Tá an glao ar coinneáil', 'calls.peerOnHold': '{{name}} ar coinneáil' },
  ro: { 'calls.youOnHold': 'Apelul este în așteptare', 'calls.peerOnHold': '{{name}} este în așteptare' },
  uk: { 'calls.youOnHold': 'Дзвінок на утриманні', 'calls.peerOnHold': '{{name}} на утриманні' },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

const marks = []
lines.forEach((line, i) => {
  const m = /^  ([a-z]{2}): \{\s*$/.exec(line)
  if (m) marks.push({ code: m[1], i })
})

const known = Object.keys(DATA)
if (marks.length !== known.length) {
  console.error(`✗ expected ${known.length} locale blocks in translations.ts, found ${marks.length}`)
  process.exit(1)
}
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

// Le compte rendu d'un injecteur ne vaut que relu après écriture : un block
// muté non remisé dans `lines` n'imprime rien tout en annonçant un succès.
const after = readFileSync(file, 'utf8').split(/\r\n|\n/)
for (const key of KEYS) {
  const count = after.filter((l) => l.includes(`"${key}":`)).length
  if (count !== known.length) {
    console.error(`✗ "${key}" : ${count} lignes après écriture, ${known.length} attendues`)
    process.exit(1)
  }
}

console.log(`✓ ${known.length} locales · ${KEYS.join(', ')} · ${replaced} lignes réécrites, ${inserted} lignes ajoutées`)
