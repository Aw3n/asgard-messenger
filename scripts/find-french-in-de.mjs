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
const deKeys = extractKeys('de')

const frenchInDE = []
for (const [key, deData] of Object.entries(deKeys)) {
  const frValue = frKeys[key]?.value
  if (frValue && frValue === deData.value && frValue.length > 3) {
    const v = frValue.toLowerCase()
    if (v === 'asgard' || v === 'group' || v === 'micro' || v === 'camera' || v === 'screen') continue
    frenchInDE.push({ key, value: frValue, line: deData.line })
  }
}

console.log(`DE keys still in French: ${frenchInDE.length}`)
console.log(`DE total keys: ${Object.keys(deKeys).length}`)

const grouped = {}
for (const item of frenchInDE) {
  const prefix = item.key.split('.')[0]
  if (!grouped[prefix]) grouped[prefix] = []
  grouped[prefix].push(item)
}

for (const [prefix, items] of Object.entries(grouped).sort()) {
  console.log(`\n── ${prefix} (${items.length} clés) ──`)
  for (const item of items) {
    console.log(`  L${item.line + 1}: ${item.key} = "${item.value}"`)
  }
}
