import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
const content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const langHeaderRe = /^\s{2}(\w+):\s*\{$/
const sections = {}
let currentLang = null

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) {
    if (currentLang) sections[currentLang].end = i
    currentLang = m[1]
    sections[currentLang] = { start: i }
  }
}
if (currentLang) sections[currentLang].end = lines.length

function extractKeys(lang) {
  const s = sections[lang]
  if (!s) return {}
  const keys = {}
  const keyRe = /^\s{6}"([^"]+)":\s*"(.*)"(,?)\s*$/
  for (let i = s.start; i < s.end; i++) {
    const m = lines[i].match(keyRe)
    if (m) keys[m[1]] = { value: m[2], line: i }
  }
  return keys
}

const frKeys = extractKeys('fr')
const itKeys = extractKeys('it')

const frenchInIT = []
for (const [key, itData] of Object.entries(itKeys)) {
  const frValue = frKeys[key]?.value
  if (frValue && frValue === itData.value && frValue.length > 3) {
    frenchInIT.push({ key, value: frValue, line: itData.line })
  }
}

console.log(`IT keys still in French: ${frenchInIT.length}`)
const grouped = {}
for (const item of frenchInIT) {
  const prefix = item.key.split('.')[0]
  if (!grouped[prefix]) grouped[prefix] = []
  grouped[prefix].push(item)
}
for (const [prefix, items] of Object.entries(grouped).sort()) {
  console.log(`\n── ${prefix} (${items.length}) ──`)
  for (const item of items) console.log(`  L${item.line + 1}: ${item.key} = "${item.value}"`)
}
