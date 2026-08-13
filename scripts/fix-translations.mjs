import fs from 'fs'
import { newKeys, langs } from './add-translations.mjs'

const filePath = 'src/i18n/translations.ts'
const content = fs.readFileSync(filePath, 'utf8')

const newKeyOrder = Object.keys(newKeys)

function escapeValue(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

function unescapeValue(str) {
  return str
    .replace(/\\\\/g, '\u0000BS\u0000')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\u0000BS\u0000/g, '\\')
}

// Match each language block: section comment, lang code, and translation body
const blockRegex = new RegExp('\\/\\/ ([^\\n]+)\\n  ([a-z]{2}): \\{\\n    translation: \\{([\\s\\S]*?)\\n  \\},\\n', 'g')

const headerMatch = content.match(/(export const translations = \{\n)/)
if (!headerMatch) throw new Error('Could not find translations header')

let newContent = headerMatch[0]

const seenLangs = new Set()
let match
while ((match = blockRegex.exec(content)) !== null) {
  const [, sectionName, lang, body] = match
  if (seenLangs.has(lang)) continue
  if (!langs.includes(lang)) continue
  seenLangs.add(lang)

  const lines = body.split('\n')
  const keptLines = []
  const seenKeys = new Set()

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed === '') {
      keptLines.push(line)
      continue
    }
    const kvMatch = line.match(/^      "([^"]+)": "((?:[^"\\\\]|\\\\.)*)",$/)
    if (kvMatch) {
      const key = kvMatch[1]
      const value = unescapeValue(kvMatch[2])
      if (newKeyOrder.includes(key)) continue
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      keptLines.push(`      "${key}": "${escapeValue(value)}",`)
    }
  }

  for (const key of newKeyOrder) {
    const translations = newKeys[key]
    if (translations[lang] === undefined) {
      throw new Error(`Missing translation for ${key} in ${lang}`)
    }
    keptLines.push(`      "${key}": "${escapeValue(translations[lang])}",`)
  }

  newContent += `  // ${sectionName}\n  ${lang}: {\n    translation: {\n${keptLines.join('\n')}\n    },\n  },\n`
}

if (seenLangs.size !== langs.length) {
  throw new Error(`Expected ${langs.length} languages, found ${seenLangs.size}`)
}

newContent += '}\n'
fs.writeFileSync(filePath, newContent)
console.log(`Rebuilt translations for ${seenLangs.size} languages with ${newKeyOrder.length} keys each`)
