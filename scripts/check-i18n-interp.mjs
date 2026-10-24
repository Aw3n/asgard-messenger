/**
 * check-i18n-interp.mjs — Tout paramètre passé à t() doit s'afficher.
 *
 * `audit-languages.mjs` vérifie qu'une clé existe dans les 25 blocs ; il ne lit
 * pas les valeurs passées par le code. Or i18next ignore silencieusement un
 * paramètre absent du libellé : `t('settings.trashItems', { count: 3 })` sur
 * une traduction « Éléments » affiche « Éléments », et le compte disparaît
 * (c'est arrivé pour la corbeille et pour les liens de partage).
 *
 * Le script relève chaque appel `t('clé', { … })` de src/ et exige le trou
 * `{{param}}` dans chaque forme que la langue peut sélectionner. Pour une clé
 * à pluriels, i18next prend `clé_catégorie` si elle existe, sinon `clé` : les
 * deux chemins doivent porter le trou, sinon un seul compte (1, 2, 5…) perd
 * sa valeur.
 *
 * Il lit le code comme du texte : les clés construites (`t(\`…${x}\`)`) et les
 * paramètres étalés (`{ ...options }`) sont hors de portée et ignorés.
 */
import fs from 'fs'
import path from 'path'

const TRANS_PATH = 'src/i18n/translations.ts'
const SRC_DIR = 'src'

// ── Catalogue ────────────────────────────────────────────────────────────────
const lines = fs.readFileSync(TRANS_PATH, 'utf8').split('\n')
const blockStart = /^ {2}([a-z]{2}): \{/
const keyLine = /^ {6}"((?:[^"\\]|\\.)+)": "(.*)",?$/
const languages = {}
let currentLang = null
for (const line of lines) {
  const block = line.match(blockStart)
  if (block) {
    currentLang = block[1]
    languages[currentLang] = {}
    continue
  }
  if (currentLang && line.startsWith('      "')) {
    const key = line.match(keyLine)
    if (key) languages[currentLang][key[1]] = key[2]
  }
}

const langs = Object.keys(languages)
if (langs.length === 0) {
  console.error('Aucun bloc de langue lu dans', TRANS_PATH)
  process.exit(1)
}

// ── Appels t('clé', { … }) ───────────────────────────────────────────────────
/**
 * Paramètres de premier niveau de l'objet passé en second argument.
 * Machine clé/valeur : sans état, `count: list.length` ferait passer `length`
 * pour un paramètre. `{ name }` et `{ name: x }` nomment tous deux un trou.
 */
function topLevelParams(src, openBrace) {
  const params = new Set()
  let depth = 1
  let i = openBrace + 1
  let expectingKey = true
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i++
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === quote) { i++; break }
        i++
      }
      expectingKey = false
      continue
    }
    if (ch === '{' || ch === '(' || ch === '[') { depth++; i++; expectingKey = false; continue }
    if (ch === '}' || ch === ')' || ch === ']') {
      depth--
      i++
      if (depth === 0) break
      // Retour au premier niveau depuis une valeur imbriquée.
      expectingKey = false
      continue
    }
    if (depth === 1 && ch === ',') { expectingKey = true; i++; continue }
    if (depth === 1 && expectingKey && /[A-Za-z_$]/.test(ch)) {
      const start = i
      while (i < src.length && /[\w$]/.test(src[i])) i++
      const name = src.slice(start, i)
      let j = i
      while (j < src.length && /\s/.test(src[j])) j++
      params.add(name)
      expectingKey = false
      if (src[j] === ':' && src[j + 1] !== ':') i = j + 1
      continue
    }
    i++
  }
  return [...params]
}

const usages = new Map()
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Les tests construisent leurs propres dictionnaires ; le catalogue a
      // son propre dossier, déjà lu ci-dessus.
      if (entry.name === 'tests' || entry.name === 'i18n') continue
      walk(p)
      continue
    }
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue
    const src = fs.readFileSync(p, 'utf8')
    const re = /(?:^|[^A-Za-z0-9_$])t\(\s*(['"])([^'"]+)\1\s*,\s*\{/g
    let m
    while ((m = re.exec(src)) !== null) {
      const key = m[2]
      const params = topLevelParams(src, re.lastIndex - 1)
      if (params.length === 0) continue
      if (!usages.has(key)) usages.set(key, new Map())
      const byParam = usages.get(key)
      for (const param of params) {
        if (!byParam.has(param)) byParam.set(param, new Set())
        byParam.get(param).add(path.relative(process.cwd(), p))
      }
    }
  }
}
walk(SRC_DIR)

// ── Vérification, forme sélectionnable par forme sélectionnable ──────────────
const pluralCategories = (lang) => {
  const rules = new Intl.PluralRules(lang)
  const cats = new Set()
  for (let n = 0; n <= 200; n++) cats.add(rules.select(n))
  cats.add(rules.select(1e6))
  return [...cats]
}

/** Valeur que i18next rendra pour chaque catégorie de compte de la langue. */
const selectableValues = (lang, key) => {
  const base = languages[lang][key]
  const values = []
  for (const cat of pluralCategories(lang)) {
    const suffixed = languages[lang][`${key}_${cat}`]
    if (suffixed !== undefined) values.push(suffixed)
    else if (base !== undefined) values.push(base)
  }
  if (values.length === 0 && base !== undefined) values.push(base)
  return values
}

const problems = []
for (const [key, byParam] of [...usages].sort()) {
  for (const [param, files] of byParam) {
    const missing = []
    for (const lang of langs) {
      const values = selectableValues(lang, key)
      if (values.length === 0 || values.some((v) => !v.includes(`{{${param}}}`))) {
        missing.push(lang)
      }
    }
    if (missing.length) {
      problems.push({ key, param, files, missing, sample: languages[missing[0]][key] })
    }
  }
}

const interpolationCount = [...usages.values()].reduce((n, byParam) => n + byParam.size, 0)
if (problems.length === 0) {
  console.log(
    `OK — ${interpolationCount} paramètre(s) interpolé(s) sur ${usages.size} clé(s) ` +
    `portent leur trou dans les ${langs.length} langues`
  )
  process.exit(0)
}

console.error(`${problems.length} paramètre(s) sans trou dans le libellé :`)
for (const p of problems) {
  console.error(`\n  ${p.key}  {{${p.param}}} absent de ${p.missing.length} langue(s)`)
  console.error(`    ex. [${p.missing[0]}] ${JSON.stringify(p.sample)}`)
  console.error(`    appelé depuis ${[...p.files].join(', ')}`)
}
console.error('\nAjouter {{param}} au libellé (toutes les formes plurielles) ou retirer le paramètre inutile.')
process.exit(1)
