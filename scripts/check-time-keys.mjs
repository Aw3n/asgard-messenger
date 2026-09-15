import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
const content = fs.readFileSync(transPath, 'utf8')

// Extraire toutes les clés time.*
const timeKeys = []
const timeKeyRegex = /^\s{6}"(time\.[^"]+)":\s*"(.*)"(,?)\s*$/gm
let match
while ((match = timeKeyRegex.exec(content)) !== null) {
  timeKeys.push({ key: match[1], value: match[2] })
}

console.log(`Found ${timeKeys.length} time.* keys in French section:\n`)

// Grouper par langue
const languages = ['fr', 'nl', 'de', 'it', 'es', 'pt', 'el', 'da', 'fi', 'sv', 'hr', 'et', 'hu', 'lv', 'lt', 'mt', 'pl', 'sk', 'sl', 'cs', 'bg', 'ga', 'ro', 'uk', 'en']

// Pour chaque langue, vérifier si les clés time.* existent
const langHeaderRe = /^\s{2}(\w+):\s*\{$/
const lines = content.split('\n')
let currentLang = null
const langTimeKeys = {}

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; langTimeKeys[currentLang] = []; continue }
  if (!currentLang) continue
  const keyMatch = lines[i].match(/^(\s{6})"(time\.[^"]+)":\s*"(.*)"(,?)\s*$/)
  if (keyMatch) {
    langTimeKeys[currentLang].push({ key: keyMatch[2], value: keyMatch[3] })
  }
}

// Afficher les résultats
console.log('Time keys per language:\n')
for (const lang of languages) {
  const keys = langTimeKeys[lang] || []
  console.log(`${lang}: ${keys.length} time.* keys`)
  if (keys.length < 11) {
    const missing = timeKeys.map(t => t.key).filter(k => !keys.find(kk => kk.key === k))
    if (missing.length > 0) {
      console.log(`  Missing: ${missing.join(', ')}`)
    }
  }
}

// Vérifier aussi les clés chat.today, chat.yesterday
console.log('\n\nChecking chat.today and chat.yesterday per language:\n')
for (const lang of languages) {
  const keys = langTimeKeys[lang] || []
  // Chercher dans toute la section de la langue
  let inLang = false
  let foundToday = false
  let foundYesterday = false
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(langHeaderRe)
    if (m) {
      if (m[1] === lang) inLang = true
      else if (inLang) break
      continue
    }
    if (!inLang) continue
    if (lines[i].match(/"chat\.today":\s*"[^"]+"/)) foundToday = true
    if (lines[i].match(/"chat\.yesterday":\s*"[^"]+"/)) foundYesterday = true
  }
  console.log(`${lang}: chat.today=${foundToday}, chat.yesterday=${foundYesterday}`)
}
