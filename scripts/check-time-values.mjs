import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
const content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const languages = ['fr', 'nl', 'de', 'it', 'es', 'pt', 'el', 'da', 'fi', 'sv', 'hr', 'et', 'hu', 'lv', 'lt', 'mt', 'pl', 'sk', 'sl', 'cs', 'bg', 'ga', 'ro', 'uk', 'en']
const timeKeys = ['time.daysAgo', 'time.directProfileUnavailable', 'time.hoursAgo', 'time.justNow', 'time.minutesAgo', 'time.remainingDaysHours', 'time.remainingHours', 'time.searchingDHT', 'time.today', 'time.updated', 'time.yesterday']

const langHeaderRe = /^\s{2}(\w+):\s*\{$/
const langTimeValues = {}
let currentLang = null

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; langTimeValues[currentLang] = {}; continue }
  if (!currentLang) continue
  const keyMatch = lines[i].match(/^(\s{6})"(time\.[^"]+)":\s*"(.*)"(,?)\s*$/)
  if (keyMatch) {
    langTimeValues[currentLang][keyMatch[2]] = keyMatch[3]
  }
}

// Afficher les valeurs pour chaque langue
console.log('Time keys values per language:\n')
for (const lang of languages) {
  console.log(`\n=== ${lang.toUpperCase()} ===`)
  for (const key of timeKeys) {
    const val = langTimeValues[lang]?.[key] || 'MISSING'
    console.log(`  ${key}: "${val}"`)
  }
}

// Vérifier aussi chat.today et chat.yesterday
console.log('\n\n=== CHAT TODAY/YESTERDAY ===\n')
for (const lang of languages) {
  let inLang = false
  let today = null
  let yesterday = null
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(langHeaderRe)
    if (m) {
      if (m[1] === lang) inLang = true
      else if (inLang) break
      continue
    }
    if (!inLang) continue
    const tm = lines[i].match(/"chat\.today":\s*"([^"]*)"/)
    if (tm) today = tm[1]
    const ym = lines[i].match(/"chat\.yesterday":\s*"([^"]*)"/)
    if (ym) yesterday = ym[1]
  }
  console.log(`${lang}: today="${today || 'MISSING'}", yesterday="${yesterday || 'MISSING'}"`)
}

// Vérifier les valeurs qui sont encore en français
console.log('\n\n=== FRENCH VALUES DETECTED ===\n')
const frenchPatterns = ['Aujourd', 'Hier', 'Il y a', 'jours', 'heures', 'minutes', 'instant', 'Mis à jour', 'Recherche', 'restant']
for (const lang of languages.filter(l => l !== 'fr')) {
  const frenchKeys = []
  for (const key of timeKeys) {
    const val = langTimeValues[lang]?.[key] || ''
    for (const pattern of frenchPatterns) {
      if (val.includes(pattern)) {
        frenchKeys.push(`${key}="${val}"`)
        break
      }
    }
  }
  if (frenchKeys.length > 0) {
    console.log(`${lang}: ${frenchKeys.join(', ')}`)
  }
}
