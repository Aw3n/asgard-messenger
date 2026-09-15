/**
 * show-keys.mjs — lit des clés du catalogue i18n et affiche leurs valeurs pour
 * toutes les langues livrées, avec le nombre de langues qui les portent.
 *
 * Sert à décider, avant d'ajouter une chaîne à l'interface, si une clé existe
 * déjà dans les 25 langues (donc réutilisable) ou si elle devrait être créée.
 * Le catalogue est un fichier unique (`src/i18n/translations.ts`) ; sans cet
 * outil, compter à la main 25 occurrences par clé est le genre d'opération où
 * un oubli passe inaperçu derrière `fallbackLng: 'fr'`.
 *
 * Utilisation : node scripts/show-keys.mjs key1 key2 ...
 *              node scripts/show-keys.mjs --langs          (liste les langues)
 *              node scripts/show-keys.mjs k1 k2 --all      (les 25 langues)
 *              node scripts/show-keys.mjs k1 k2 --out=f    (rapport UTF-8)
 */
import fs from 'node:fs'

const src = fs.readFileSync('src/i18n/translations.ts', 'utf8')

/** Catalogues découpés comme dans le fichier : `  xx: {` puis des lignes `      "cle": "valeur",` */
const langs = {}
let cur = null
for (const line of src.split('\n')) {
  const begin = line.match(/^  ([a-z]{2}): \{/)
  if (begin) { cur = begin[1]; langs[cur] = {}; continue }
  if (cur && line.startsWith('      "')) {
    const kv = line.match(/^      "((?:[^"\\]|\\.)+)": "((?:[^"\\]|\\.)*)",?$/)
    if (kv) langs[cur][kv[1]] = kv[2]
  }
}

const codes = Object.keys(langs)
if (process.argv.includes('--langs')) {
  console.log(`${codes.length} langues : ${codes.join(', ')}`)
  process.exit(0)
}

const argv0 = process.argv.slice(2)
const keys = argv0.filter((a) => !a.startsWith('--'))
if (!keys.length) {
  console.error('aucune clé demandée — usage : node scripts/show-keys.mjs key1 key2 ... [--all] [--out=<fichier>]')
  process.exit(1)
}

const buf = []

for (const key of keys) {
  const present = codes.filter((l) => langs[l][key] !== undefined)
  const missing = codes.filter((l) => langs[l][key] === undefined)
  const head = present.length === codes.length ? 'COMPLET' : `INCOMPLET ${present.length}/${codes.length}`
  buf.push(`\n${key}  [${head}]`)
  if (missing.length) buf.push(`  absentes : ${missing.join(', ')}`)
  // `--all` montre les 25 langues (débordement assumé), sinon 8 suffisent pour juger
  const limit = process.argv.includes('--all') ? codes.length : 8
  const show = (present.length ? present : codes).slice(0, limit)
  buf.push('  ' + show.map((l) => `${l}=${langs[l][key] ?? '<none>'}`).join(' | '))
}

const text = buf.join('\n')
const outArg = argv0.find((a) => a.startsWith('--out='))
if (outArg) {
  // écriture directe en UTF-8 : par le pipeline du shell, les accents arrivent
  // transcodés deux fois et le tri se fait sur du texte illisible
  fs.writeFileSync(outArg.slice('--out='.length), text + '\n')
  console.log(`${keys.length} clé(s) → ${outArg.slice('--out='.length)}`)
} else {
  console.log(text)
}
