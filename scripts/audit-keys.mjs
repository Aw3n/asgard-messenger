import fs from 'fs'
import path from 'path'

function walk(dir) {
  let files = []
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory() && !f.startsWith('.') && f !== 'node_modules' && f !== 'dist' && f !== 'release' && f !== 'build') {
      files = files.concat(walk(p))
    } else if (/\.(tsx?|ts)$/.test(f) && !f.includes('.backup')) {
      files.push(p)
    }
  }
  return files
}

// 1. Extract all keys used in code (exclude test files)
const files = walk('src').filter(f => !f.includes('.test.') && !f.includes('/tests/'))
const usedKeys = new Set()
const re = /t\(\s*['"]([^'"]+)['"]\s*[),]/g
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8')
  let m
  while ((m = re.exec(content)) !== null) {
    const key = m[1]
    // Only keep keys that look like translation keys (contain a dot)
    if (key.includes('.')) usedKeys.add(key)
  }
}

// 2. Extract all keys defined in translations.ts
const transContent = fs.readFileSync('src/i18n/translations.ts', 'utf8')
const definedKeys = new Set()
const reDef = /^\s{6}"([^"]+)":\s*"/gm
let m2
while ((m2 = reDef.exec(transContent)) !== null) definedKeys.add(m2[1])

// 3. Compare
const usedArr = [...usedKeys].sort()
const missingInTranslations = usedArr.filter(k => !definedKeys.has(k))

console.log('=== AUDIT TRADUCTIONS (hors tests) ===')
console.log(`Clés utilisées dans le code (hors tests): ${usedArr.length}`)
console.log(`Clés définies dans translations.ts: ${definedKeys.size}`)

if (missingInTranslations.length > 0) {
  console.log(`\n--- CLÉS UTILISÉES mais MANQUANTES dans translations.ts (${missingInTranslations.length}) ---`)
  missingInTranslations.forEach(k => console.log(`  ❌ ${k}`))
}

// 4. List languages and their key counts
const langPattern = /^\s{2}(\w+):\s*\{/gm
const langs = []
let lm
while ((lm = langPattern.exec(transContent)) !== null) langs.push(lm[1])
console.log(`\n--- LANGUES (${langs.length}) ---`)

// 5. For each language, count keys and find missing ones
for (const lang of langs) {
  // Find the section for this language
  const startRe = new RegExp(`^\\s{2}${lang}:\\s*\\{`, 'm')
  const startMatch = startRe.exec(transContent)
  if (!startMatch) continue
  const startIdx = startMatch.index

  // Find the end: next language section at same indent or end of export
  const nextLangRe = /^\s{2}\w+:\s*\{/gm
  nextLangRe.lastIndex = startIdx + 10
  let endIdx = transContent.length
  let nm
  while ((nm = nextLangRe.exec(transContent)) !== null) {
    endIdx = nm.index
    break
  }

  const section = transContent.substring(startIdx, endIdx)
  const langKeys = new Set()
  const reLang = /^\s{6}"([^"]+)":\s*"/gm
  let lkm
  while ((lkm = reLang.exec(section)) !== null) langKeys.add(lkm[1])

  const missing = usedArr.filter(k => !langKeys.has(k))
  const extra = [...langKeys].filter(k => !usedKeys.has(k))

  if (missing.length > 0) {
    console.log(`\n--- ${lang.toUpperCase()}: ${langKeys.size} clés, ${missing.length} manquantes ---`)
    missing.forEach(k => console.log(`  ❌ ${k}`))
  } else {
    console.log(`  ✅ ${lang.toUpperCase()}: ${langKeys.size} clés — complet`)
  }
}

// 6. Keys defined but never used in code (potential dead keys)
const deadKeys = [...definedKeys].filter(k => !usedKeys.has(k)).sort()
if (deadKeys.length > 0) {
  console.log(`\n--- CLÉS DÉFINIES mais non utilisées dans le code (${deadKeys.length}) ---`)
  deadKeys.slice(0, 30).forEach(k => console.log(`  ⚠️  ${k}`))
  if (deadKeys.length > 30) console.log(`  ... et ${deadKeys.length - 30} autres`)
}
