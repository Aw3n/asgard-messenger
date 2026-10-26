/**
 * sync-i18n-modules.mjs — génère un module par langue depuis translations.ts.
 *
 * translations.ts reste la source unique, auditée par les scripts i18n. Le
 * renderer importe le français en statique et charge les autres langues à la
 * demande : importer le catalogue entier au démarrage faisait peser 58 % du
 * chunk principal pour 24 langues que la session n'affiche pas.
 *
 * Usage :
 *   node scripts/sync-i18n-modules.mjs           régénère src/i18n/locales
 *   node scripts/sync-i18n-modules.mjs --check   échoue si un module a dérivé
 */
import fs from 'node:fs'
import path from 'node:path'

const SOURCE = 'src/i18n/translations.ts'
const OUT = 'src/i18n/locales'

// Un checkout Windows (autocrlf) matérialise le catalogue en CRLF : sans ce
// retrait, chaque ligne garde un \r final et l'ancre «   fr: { » ne matche plus.
const lines = fs.readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n').split('\n')
const blocks = {}
let lang = null
let body = []
for (const line of lines) {
  if (lang === null) {
    const start = line.match(/^  ([a-z]{2}): \{$/)
    if (start) {
      lang = start[1]
      body = []
    }
    continue
  }
  if (/^  \},?$/.test(line)) {
    blocks[lang] = body
    lang = null
    continue
  }
  body.push(line)
}

if (!blocks.fr) {
  console.error(`Bloc « fr » introuvable dans ${SOURCE}`)
  process.exit(1)
}

const header = (code) =>
  `// Généré par scripts/sync-i18n-modules.mjs depuis src/i18n/translations.ts.\n` +
  `// Ne pas éditer : modifier le bloc « ${code} » de translations.ts puis relancer le script.\n`

const modules = Object.entries(blocks).map(([code, content]) => ({
  code,
  content: `${header(code)}\nexport default {\n${content.join('\n')}\n}\n`,
}))

if (process.argv.includes('--check')) {
  const stale = []
  for (const mod of modules) {
    const file = path.join(OUT, `${mod.code}.ts`)
    const current = fs.existsSync(file)
      ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
      : null
    if (current !== mod.content) stale.push(mod.code)
  }
  const expected = new Set(modules.map((mod) => `${mod.code}.ts`))
  const extras = fs.existsSync(OUT)
    ? fs.readdirSync(OUT).filter((name) => name.endsWith('.ts') && !expected.has(name))
    : []
  if (stale.length || extras.length) {
    console.error(`Modules de langue périmés : ${stale.join(', ') || 'aucun'}`)
    if (extras.length) console.error(`Modules sans bloc source : ${extras.join(', ')}`)
    console.error('Relancer: node scripts/sync-i18n-modules.mjs')
    process.exit(1)
  }
  console.log(`OK — ${modules.length} modules de langue à jour`)
} else {
  fs.mkdirSync(OUT, { recursive: true })
  for (const mod of modules) {
    fs.writeFileSync(path.join(OUT, `${mod.code}.ts`), mod.content)
  }
  console.log(`${modules.length} modules générés dans ${OUT}`)
}
