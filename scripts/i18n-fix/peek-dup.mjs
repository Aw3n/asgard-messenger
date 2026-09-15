/**
 * peek-dup.mjs — Lists every key where the fr value is byte-identical to the
 * en value, sorted, with full values. Used to build fr-en-data.mjs:
 *   - value looks French  → the EN block must be rewritten in English
 *   - value looks English → the FR block must be translated
 */
import fs from 'fs'

const c = fs.readFileSync('src/i18n/translations.ts', 'utf8')
const langs = {}
let cur = null
for (const line of c.split('\n')) {
  const b = line.match(/^  ([a-z]{2}): \{/)
  if (b) { cur = b[1]; langs[cur] = {}; continue }
  if (cur && line.startsWith('      "')) {
    const k = line.match(/^      "((?:[^"\\]|\\.)+)": "(.*)",?$/)
    if (k) langs[cur][k[1]] = k[2].replace(/\\'/g, "'").replace(/\\"/g, '"')
  }
}

const fr = langs.fr
const en = langs.en
const out = []
const frAccent = /[éèêëàâçùûîôïœÉÈÊËÀÂÇÙÛÎÔÏŒ]/

for (const key of Object.keys(fr)) {
  if (en[key] !== undefined && en[key] === fr[key]) {
    const looksFrench = frAccent.test(fr[key])
    out.push(`${looksFrench ? 'EN-FIX' : 'FR-FIX'} ${key} = ${JSON.stringify(fr[key])}`)
  }
}
out.sort()
fs.writeFileSync('scripts/fr-en-dups.txt', out.join('\n') + '\n')
console.log(`fr===en keys: ${out.length} (EN-FIX: ${out.filter(l => l.startsWith('EN-FIX')).length}, FR-FIX: ${out.filter(l => l.startsWith('FR-FIX')).length})`)
console.log('details → scripts/fr-en-dups.txt')
