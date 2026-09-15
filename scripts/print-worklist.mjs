/**
 * print-worklist.mjs — Prints the exact per-language work list in a dense
 * `lang|key|EN-value` format so translations can be composed offline.
 */
import fs from 'fs'

const r = JSON.parse(fs.readFileSync('scripts/audit-languages-report.json', 'utf8'))

for (const [lang, d] of Object.entries(r.languages)) {
  const items = [
    ...d.missing.map((k) => ({ key: k, en: '(missing key — not in EN either, take FR value)' })),
    ...d.untranslated,
  ]
  if (items.length === 0) continue
  console.log(`\n## ${lang} (${items.length})`)
  for (const it of items) console.log(`${lang}|${it.key}|${it.en}`)
}
