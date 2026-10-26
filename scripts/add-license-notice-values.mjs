#!/usr/bin/env node
/**
 * Rewrites the about-page license notice (settings.openSourceLicense) in all 25
 * supported languages of src/i18n/translations.ts.
 *
 * Why the whole sentence: the paragraph used to read
 *   © 2026 Asgard. {t('settings.openSourceLicense')} MIT License.
 * — a translated noun sandwiched between two hardcoded English words, so a
 * French user saw « Licence open source MIT License. ». The key now carries the
 * complete phrase, in the word order each language needs; the JSX keeps only
 * « © 2026 Asgard. », which holds no translatable word. Same in-place algorithm
 * as add-pinned-messages-key.mjs: existing lines are rewritten whatever their
 * indentation, missing ones are inserted before the closing brace of the nested
 * `translation` object.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['settings.openSourceLicense']

const DATA = {
  fr: { 'settings.openSourceLicense': 'Licence open source MIT.' },
  en: { 'settings.openSourceLicense': 'Open source under the MIT license.' },
  nl: { 'settings.openSourceLicense': 'Open source onder de MIT-licentie.' },
  de: { 'settings.openSourceLicense': 'Open Source unter der MIT-Lizenz.' },
  it: { 'settings.openSourceLicense': 'Open source con licenza MIT.' },
  es: { 'settings.openSourceLicense': 'Código abierto bajo la licencia MIT.' },
  pt: { 'settings.openSourceLicense': 'Código aberto sob a licença MIT.' },
  el: { 'settings.openSourceLicense': 'Ανοιχτός κώδικας με άδεια MIT.' },
  da: { 'settings.openSourceLicense': 'Open source under MIT-licensen.' },
  fi: { 'settings.openSourceLicense': 'Avoin lähdekoodi MIT-lisenssin alla.' },
  sv: { 'settings.openSourceLicense': 'Öppen källkod under MIT-licensen.' },
  hr: { 'settings.openSourceLicense': 'Otvoreni kod pod MIT licencom.' },
  et: { 'settings.openSourceLicense': 'Avatud lähtekood MIT litsentsi alusel.' },
  hu: { 'settings.openSourceLicense': 'Nyílt forráskód az MIT-licenc alatt.' },
  lv: { 'settings.openSourceLicense': 'Atvērtais kods ar MIT licenci.' },
  lt: { 'settings.openSourceLicense': 'Atviras kodas pagal MIT licenciją.' },
  mt: { 'settings.openSourceLicense': "Kodiċi miftuħ taħt il-liċenzja MIT." },
  pl: { 'settings.openSourceLicense': 'Otwarte oprogramowanie na licencji MIT.' },
  sk: { 'settings.openSourceLicense': 'Open source pod licenciou MIT.' },
  sl: { 'settings.openSourceLicense': 'Odprta koda pod licenco MIT.' },
  cs: { 'settings.openSourceLicense': 'Open source pod licencí MIT.' },
  bg: { 'settings.openSourceLicense': 'Отворен код под лиценза на MIT.' },
  ga: { 'settings.openSourceLicense': 'Cód oscailte faoi cheadúnas MIT.' },
  ro: { 'settings.openSourceLicense': 'Open source sub licența MIT.' },
  uk: { 'settings.openSourceLicense': 'Відкритий код за ліцензією MIT.' },
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
