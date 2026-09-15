/**
 * normalize-indent.mjs — One-shot structural fix for translations.ts.
 *
 * Earlier injection scripts (add-lightbox-translations.mjs, add-restore-translations.mjs)
 * inserted key lines with 4-space indentation while the whole file uses 6-space
 * indentation inside `xx: { translation: { ... } }`. The lines are syntactically
 * valid but invisible to regex-based audits, which caused those keys to be
 * dropped from completeness reports.
 *
 * This script re-indents every `    "key": "value",` line to 6 spaces.
 */
import fs from 'fs'

const p = 'src/i18n/translations.ts'
const content = fs.readFileSync(p, 'utf8')
const lines = content.split('\n')

let fixed = 0
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^    ("(?:[^"\\]|\\.)*": .*)$/)
  if (m) {
    lines[i] = '      ' + m[1]
    fixed++
  }
}

fs.writeFileSync(p, lines.join('\n'))
console.log(`Normalized ${fixed} key lines from 4-space to 6-space indentation`)
if (fixed === 0) console.log('Nothing to fix — already normalized')
