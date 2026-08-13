import fs from 'fs'

const filePath = 'src/i18n/translations.ts'
let content = fs.readFileSync(filePath, 'utf8')
const before = content.length

// Replace literal backslash-n sequences with real newlines
content = content.replace(/\\n/g, '\n')

// Fix double indentation (12 spaces -> 6 spaces) at line starts
content = content.replace(/\n            "/g, '\n      "')

const after = content.length
fs.writeFileSync(filePath, content)
console.log(`Replaced literal backslash-n chars. Bytes: ${before} -> ${after}`)
