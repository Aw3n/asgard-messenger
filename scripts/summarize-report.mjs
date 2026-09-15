/**
 * summarize-report.mjs — Condenses audit-languages-report.json into a work list:
 *   - union of untranslated keys across languages (with the EN value)
 *   - missing keys per language
 *   - fr English leftovers
 *   - used-but-missing keys
 */
import fs from 'fs'

const r = JSON.parse(fs.readFileSync('scripts/audit-languages-report.json', 'utf8'))

const union = new Map()
for (const [lang, d] of Object.entries(r.languages)) {
  for (const u of d.untranslated) {
    if (!union.has(u.key)) union.set(u.key, { en: u.en, langs: [] })
    union.get(u.key).langs.push(lang)
  }
}

console.log(`=== UNION of untranslated keys: ${union.size} distinct keys ===\n`)
const sorted = [...union.entries()].sort((a, b) => b[1].langs.length - a[1].langs.length)
for (const [key, info] of sorted) {
  console.log(`${key}  [${info.langs.length} langs: ${info.langs.join(',')}]`)
  console.log(`   EN: "${info.en}"`)
}

console.log(`\n=== Missing keys per language ===`)
for (const [lang, d] of Object.entries(r.languages)) {
  if (d.missing.length) console.log(`[${lang}] ${d.missing.join(', ')}`)
}

console.log(`\n=== fr English leftovers: ${r.frEnglishLeftovers.length} ===`)
for (const f of r.frEnglishLeftovers) console.log(`${f.key} = "${f.en}"`)

console.log(`\n=== Used in code but missing from fr: ${r.usedMissing.length} ===`)
for (const u of r.usedMissing) console.log(`${u.key}  (${u.file})`)
