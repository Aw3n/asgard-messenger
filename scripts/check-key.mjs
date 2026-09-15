import fs from 'fs'
const t = fs.readFileSync('src/i18n/translations.ts', 'utf8')
const matches = t.match(/"settings\.appName"/g)
console.log('settings.appName occurrences:', matches ? matches.length : 0)

// Check each language section for this key
const lines = t.split('\n')
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
let currentLang = null
let foundInLangs = []
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) currentLang = m[1]
  if (lines[i].includes('"settings.appName"') && currentLang) {
    foundInLangs.push(currentLang)
  }
}
console.log(`Found in ${foundInLangs.length} languages:`, foundInLangs.join(', '))
