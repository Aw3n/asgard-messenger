import fs from 'fs'

const content = fs.readFileSync('src/i18n/translations.ts', 'utf8')
const lines = content.split('\n')
console.log('Total lines:', lines.length)
console.log('Line 279:', JSON.stringify(lines[278]))
console.log('Line 280:', JSON.stringify(lines[279]))
console.log('Line 281:', JSON.stringify(lines[280]))

const problems = []
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  if (line.length > 0 && !/^\s*"/.test(line) && !/^\s*\/\//.test(line) && !/^\s*$/.test(line) && !/^\s*[}\],]/.test(line)) {
    problems.push({ line: i + 1, text: line })
  }
}
console.log('Potential multiline value lines:', problems.length)
problems.slice(0, 100).forEach(p => console.log(p.line + ': ' + JSON.stringify(p.text)))
