import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
let content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

// ── Find exact line ranges for each language section ──
const langLineRanges = {}
const langOrder = []
const langHeaderRe = /^\s{2}(\w+):\s*\{$/

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) {
    langOrder.push(m[1])
    langLineRanges[m[1]] = { start: i }
  }
}

// Set end lines
for (let i = 0; i < langOrder.length; i++) {
  const lang = langOrder[i]
  if (i + 1 < langOrder.length) {
    const nextLang = langOrder[i + 1]
    // End is the line before the comment separator for next language
    // Look backwards from nextLang start to find the comment
    let endLine = langLineRanges[nextLang].start - 1
    while (endLine > langLineRanges[lang].start && /^\s{2}\/\/ ─/.test(lines[endLine])) {
      endLine--
    }
    langLineRanges[lang].end = endLine + 1
  } else {
    langLineRanges[lang].end = lines.length
  }
}

console.log('Language sections:')
for (const lang of langOrder) {
  const r = langLineRanges[lang]
  console.log(`  ${lang}: lines ${r.start + 1}-${r.end}`)
}

// ── Extract keys from a range of lines ──
function extractKeysFromRange(lang) {
  const r = langLineRanges[lang]
  const keys = {}
  const keyRe = /^\s{6}"([^"]+)":\s*"(.*)"(,?)\s*$/
  for (let i = r.start; i < r.end; i++) {
    const m = lines[i].match(keyRe)
    if (m) keys[m[1]] = m[2]
  }
  return keys
}

// Get FR keys (reference)
const frKeys = extractKeysFromRange('fr')
console.log(`\nFR has ${Object.keys(frKeys).length} keys`)

// ── 17 new keys ──
const newKeysFR = {
  'avatar.size': 'Taille de l\'avatar',
  'settings.aboutDescription': 'Messagerie P2P décentralisée avec chiffrement de bout en bout. Aucun serveur central, aucune collecte de données.',
  'settings.altAsgardIcon': 'Icône Asgard',
  'settings.appName': 'Asgard',
  'settings.appVersion': 'Version {{version}}',
  'settings.dataExported': 'Données exportées avec succès',
  'settings.devicesSubtitle': 'Microphone, caméra et haut-parleur',
  'settings.exportFailed': 'Exportation échouée',
  'settings.exportFailedMessage': 'Impossible d\'exporter les données. Veuillez réessayer.',
  'settings.makeDonationIn': 'Faire un don en {{currency}}',
  'settings.microphoneCameraAccess': 'Accès au microphone et à la caméra',
  'settings.noCameraDetected': 'Aucune caméra détectée',
  'settings.noMicrophoneDetected': 'Aucun microphone détecté',
  'settings.openSourceLicense': 'Licence open source',
  'settings.resume': 'Reprendre',
  'settings.stopPreview': 'Arrêter l\'aperçu',
  'settings.suspend': 'Suspendre',
}

const newKeysEN = {
  'avatar.size': 'Avatar size',
  'settings.aboutDescription': 'Decentralized P2P messaging with end-to-end encryption. No central server, no data collection.',
  'settings.altAsgardIcon': 'Asgard icon',
  'settings.appName': 'Asgard',
  'settings.appVersion': 'Version {{version}}',
  'settings.dataExported': 'Data exported successfully',
  'settings.devicesSubtitle': 'Microphone, camera and speaker',
  'settings.exportFailed': 'Export failed',
  'settings.exportFailedMessage': 'Could not export data. Please try again.',
  'settings.makeDonationIn': 'Make a donation in {{currency}}',
  'settings.microphoneCameraAccess': 'Microphone and camera access',
  'settings.noCameraDetected': 'No camera detected',
  'settings.noMicrophoneDetected': 'No microphone detected',
  'settings.openSourceLicense': 'Open source license',
  'settings.resume': 'Resume',
  'settings.stopPreview': 'Stop preview',
  'settings.suspend': 'Suspend',
}

// ── For each non-FR language, find and insert missing keys ──
// Process in reverse to avoid line number shifts
for (let li = langOrder.length - 1; li >= 0; li--) {
  const lang = langOrder[li]
  if (lang === 'fr') continue // FR already handled

  const existingKeys = extractKeysFromRange(lang)
  const existingKeySet = new Set(Object.keys(existingKeys))

  // Determine keys to add
  const keysToAdd = {}

  // Add new keys with EN values for en, FR values for others
  const newKeys = lang === 'en' ? newKeysEN : newKeysFR
  for (const [k, v] of Object.entries(newKeys)) {
    if (!existingKeySet.has(k)) keysToAdd[k] = v
  }

  // Add FR keys that are missing
  for (const [k, v] of Object.entries(frKeys)) {
    if (!existingKeySet.has(k) && !keysToAdd[k]) {
      keysToAdd[k] = v
    }
  }

  if (Object.keys(keysToAdd).length === 0) {
    console.log(`  ${lang}: already complete (${Object.keys(existingKeys).length} keys)`)
    continue
  }

  // Find insert point: line with "      // ─── Added for UI localization ───"
  // or before the closing } of translation
  const r = langLineRanges[lang]
  let insertLine = -1

  // Search for the last "// ─── Added for UI localization ───" comment
  for (let i = r.end - 1; i >= r.start; i--) {
    if (/^\s{6}\/\/ ─── Added for UI localization ───/.test(lines[i])) {
      insertLine = i
      break
    }
  }

  if (insertLine < 0) {
    // Find the closing } of translation (4-space indent)
    for (let i = r.end - 1; i >= r.start; i--) {
      if (/^\s{4}\}\s*$/.test(lines[i])) {
        insertLine = i
        break
      }
    }
  }

  if (insertLine < 0) {
    console.log(`  ${lang}: could not find insert point!`)
    continue
  }

  // Build new lines to insert
  const newLines = []
  for (const [k, v] of Object.entries(keysToAdd)) {
    const escaped = v.replace(/(?<!\\)"/g, '\\"')
    newLines.push(`      "${k}": "${escaped}",`)
  }

  // Insert at the right position
  lines.splice(insertLine, 0, ...newLines)
  console.log(`  ${lang}: added ${Object.keys(keysToAdd).length} keys at line ${insertLine + 1}`)

  // Update line ranges for all subsequent languages
  const shift = newLines.length
  for (let j = li + 1; j < langOrder.length; j++) {
    langLineRanges[langOrder[j]].start += shift
    langLineRanges[langOrder[j]].end += shift
  }
  langLineRanges[lang].end += shift
}

// Handle FR separately (add 17 new keys)
{
  const existingKeys = extractKeysFromRange('fr')
  const existingKeySet = new Set(Object.keys(existingKeys))
  const keysToAdd = {}
  for (const [k, v] of Object.entries(newKeysFR)) {
    if (!existingKeySet.has(k)) keysToAdd[k] = v
  }

  if (Object.keys(keysToAdd).length > 0) {
    const r = langLineRanges['fr']
    let insertLine = -1
    for (let i = r.end - 1; i >= r.start; i--) {
      if (/^\s{6}\/\/ ─── Added for UI localization ───/.test(lines[i])) {
        insertLine = i
        break
      }
    }
    if (insertLine < 0) {
      for (let i = r.end - 1; i >= r.start; i--) {
        if (/^\s{4}\}\s*$/.test(lines[i])) {
          insertLine = i
          break
        }
      }
    }
    if (insertLine >= 0) {
      const newLines = []
      for (const [k, v] of Object.entries(keysToAdd)) {
        const escaped = v.replace(/(?<!\\)"/g, '\\"')
        newLines.push(`      "${k}": "${escaped}",`)
      }
      lines.splice(insertLine, 0, ...newLines)
      console.log(`  fr: added ${Object.keys(keysToAdd).length} keys at line ${insertLine + 1}`)
    }
  }
}

content = lines.join('\n')
fs.writeFileSync(transPath, content)
console.log('\nDone! File updated successfully.')
