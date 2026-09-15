/**
 * dump-untranslated.mjs — Flattens audit-languages-report.json into a compact
 * per-language worklist of the keys still holding the raw English value.
 * Writes scripts/untranslated-residual.txt.
 */
import fs from 'fs'

const r = JSON.parse(fs.readFileSync('scripts/audit-languages-report.json', 'utf8'))
const out = []
let total = 0
for (const [lang, s] of Object.entries(r.languages)) {
  if (!s.untranslated || s.untranslated.length === 0) continue
  total += s.untranslated.length
  out.push(`\n=== ${lang} (${s.untranslated.length}) ===`)
  for (const u of s.untranslated) out.push(`${u.key}\t${u.en}`)
}
out.push(`\n=== frEnglishLeftovers (${r.frEnglishLeftovers.length}) ===`)
for (const u of r.frEnglishLeftovers) out.push(`${u.key}\t${u.en}`)
fs.writeFileSync('scripts/untranslated-residual.txt', out.join('\n') + '\n')
console.log(`untranslated total: ${total}, fr leftovers: ${r.frEnglishLeftovers.length} → scripts/untranslated-residual.txt`)
