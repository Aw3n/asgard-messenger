import fs from 'fs'
const t = fs.readFileSync('src/i18n/translations.ts', 'utf8')
const lines = t.split('\n')
let lang = ''
const re = /^\s{2}(\w+):\s*\{$/
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(re)
  if (m) lang = m[1]
  if (lines[i].includes('"settings.makeDonationIn"')) {
    console.log(`${lang}: ${lines[i].trim()}`)
  }
}
