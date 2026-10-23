#!/usr/bin/env node
/**
 * Adds the truncated-search notice (search.moreResults) to all 25 supported
 * languages of src/i18n/translations.ts.
 *
 * Why this wording : chaque type de résultat a un plafond (8 contacts, 8 groupes,
 * 24 messages) et la liste affichée peut donc être coupée sans que l'utilisateur
 * le sache. La phrase n'annonce aucun nombre — un décompte aurait exigé les
 * classes de pluriel de huit langues pour dire une seule chose : « il y en a
 * d'autres ». Same in-place algorithm as add-pinned-messages-key.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['search.moreResults']

const DATA = {
  fr: { 'search.moreResults': 'D’autres résultats ne sont pas affichés — affinez la recherche.' },
  en: { 'search.moreResults': 'Other results are not shown — refine your search.' },
  nl: { 'search.moreResults': 'Andere resultaten worden niet weergegeven — verfijn de zoekopdracht.' },
  de: { 'search.moreResults': 'Weitere Ergebnisse werden nicht angezeigt — verfeinern Sie die Suche.' },
  it: { 'search.moreResults': 'Altri risultati non sono visualizzati — affina la ricerca.' },
  es: { 'search.moreResults': 'Hay más resultados sin mostrar — refina la búsqueda.' },
  pt: { 'search.moreResults': 'Há mais resultados não exibidos — refine a pesquisa.' },
  el: { 'search.moreResults': 'Δεν εμφανίζονται άλλα αποτελέσματα — βελτιώστε την αναζήτηση.' },
  da: { 'search.moreResults': 'Flere resultater vises ikke — præciser søgningen.' },
  fi: { 'search.moreResults': 'Lisää tuloksia ei näytetä — tarkenna hakua.' },
  sv: { 'search.moreResults': 'Fler resultat visas inte — förfina sökningen.' },
  hr: { 'search.moreResults': 'Još rezultata nije prikazano — pojasnite pretragu.' },
  et: { 'search.moreResults': 'Rohkem tulemusi ei kuvata — täpsusta otsingut.' },
  hu: { 'search.moreResults': 'További eredmények nem jelennek meg — pontosítsa a keresést.' },
  lv: { 'search.moreResults': 'Vairāk rezultātu netiek rādīti — precizējiet meklēšanu.' },
  lt: { 'search.moreResults': 'Daugiau rezultatų nerodoma — patikslinkite paiešką.' },
  mt: { 'search.moreResults': 'Aktar riżultati ma jurux — irfina t-tiftix.' },
  pl: { 'search.moreResults': 'Inne wyniki nie są wyświetlane — zawęź wyszukiwanie.' },
  sk: { 'search.moreResults': 'Ďalšie výsledky sa nezobrazujú — spresnite vyhľadávanie.' },
  sl: { 'search.moreResults': 'Več rezultatov ni prikazanih — zožite iskanje.' },
  cs: { 'search.moreResults': 'Další výsledky nejsou zobrazeny — upřesněte hledání.' },
  bg: { 'search.moreResults': 'Други резултати не се показват — стеснете търсенето.' },
  ga: { 'search.moreResults': 'Níl torthaí eile á dtaispeáint — déan cuardach níos cruinne.' },
  ro: { 'search.moreResults': 'Alte rezultate nu sunt afișate — rafinați căutarea.' },
  uk: { 'search.moreResults': 'Інші результати не показані — уточніть пошук.' },
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
