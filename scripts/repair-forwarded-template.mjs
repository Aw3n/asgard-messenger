import fs from 'fs'

const filePath = 'src/i18n/translations.ts'
const content = fs.readFileSync(filePath, 'utf8')
const lines = content.split('\n')
const out = []
let repaired = 0

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const marker = '"chat.forwardedMessageTemplate": "'
  const idx = line.indexOf(marker)
  if (idx !== -1 && !line.trim().endsWith('",')) {
    const prefix = line.slice(0, idx)
    const valueStart = line.slice(idx + marker.length)
    if (i + 2 < lines.length && lines[i + 1].trim() === '' && lines[i + 2].includes('{{content}}')) {
      const valueEnd = lines[i + 2].trim()
      const cleanEnd = valueEnd.replace(/",\s*$/, '')
      const fullValue = valueStart + '\\n\\n' + cleanEnd
      out.push(prefix + marker + fullValue + '",')
      i += 2
      repaired++
      continue
    }
  }
  out.push(line)
}

fs.writeFileSync(filePath, out.join('\n'))
console.log(`Repaired ${repaired} occurrences`)
