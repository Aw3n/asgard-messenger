/**
 * check-i18n-labels.mjs — verrous sur les libellés d'interface.
 *
 * Origine : les quatre onglets de la page Contacts rendaient leur identifiant
 * brut (`all`, `online`, `favorites`, `blocked`) — du mot anglais à l'écran
 * dans les 25 langues — et le paramètre de la boucle s'appelait `t`, ce qui
 * masquait la fonction de traduction : impossible d'écrire `t('…')` dans ce
 * corps sans lever « t is not a function ». Le même double défaut existait
 * dans le sélecteur d'apparence (thème et taille de caractère).
 *
 * Les auditeurs en place ne voyaient rien : `audit-languages.mjs` contrôle que
 * les clés *utilisées* existent dans les 25 langues, `audit-i18n.mjs` que les
 * clés `t('…')` sont connues — or il n'y avait aucun appel `t()` à contrôler.
 *
 * R1 — dans un fichier où la traduction est en place (`const { t } =
 *      useTranslation()` ou un import direct d'i18next), aucun callback de
 *      méthode de liste ne peut prendre un paramètre nommé `t`, `i18n` ou `tr`.
 *      Un simple `import { useTranslation }` sans extraction de `t` ne suffit
 *      pas à rendre le fichier concerné.
 * R2 — un `.map()` dont la source est un tableau littéral de chaînes ne peut
 *      pas rendre son paramètre nu : un identifiant d'énumération affiché tel
 *      quel n'est pas un libellé traduit.
 * R3 — les quatre onglets de ContactsPage sont bien ceux du produit, et chacun
 *      porte une clé présente dans TOUTES les blocs de langue du catalogue.
 * R4 — le texte littéral rendu entre une balise ouvrante et sa fermante est un
 *      libellé : ni mot anglais collé à une interpolation, ni accord de pluriel
 *      écrit dans le JSX. Voir le bloc R4 pour le parcours et ses bornes.
 *
 * Utilisation : node scripts/check-i18n-labels.mjs [--root <dir>]
 * Sortie : 0 si conforme, 1 à la première règle en échec.
 */
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const rootIdx = argv.indexOf('--root')
const ROOT = rootIdx !== -1 && argv[rootIdx + 1]
  ? path.resolve(argv[rootIdx + 1])
  : process.cwd()

const SRC = path.join(ROOT, 'src')
const TRANSLATIONS = path.join(SRC, 'i18n', 'translations.ts')

/**
 * Blanc les commentaires et les littéraux (offsets conservés) et rend le masque
 * des zones de commentaire : R1 et R2 cherchent dans du code, pas dans du
 * texte, mais R2 a justement besoin de voir les littéraux de chaîne — il
 * travaille donc sur le texte brut et écarte les matches tombés dans un
 * commentaire.
 */
function scrub(code) {
  const out = code.split('')
  const comment = new Array(code.length).fill(false)
  let i = 0
  const blank = (from, to, isComment = false) => {
    for (let j = from; j < to && j < out.length; j++) {
      if (isComment) comment[j] = true
      if (out[j] !== '\n') out[j] = ' '
    }
  }
  while (i < code.length) {
    const c = code[i]
    const two = code.slice(i, i + 2)
    if (two === '//') {
      const end = code.indexOf('\n', i)
      const stop = end === -1 ? code.length : end
      blank(i, stop, true)
      i = stop
      continue
    }
    if (two === '/*') {
      const end = code.indexOf('*/', i + 2)
      const stop = end === -1 ? code.length : end + 2
      blank(i, stop, true)
      i = stop
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue }
        if (code[j] === c) { j++; break }
        if (c !== '`' && code[j] === '\n') break
        j++
      }
      blank(i, j)
      i = j
      continue
    }
    i++
  }
  return { code: out.join(''), comment }
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      walk(full, acc)
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

/** Nombre de blocs de langue du catalogue, et clés qu'ils portent. */
function readCatalog() {
  const src = fs.readFileSync(TRANSLATIONS, 'utf8')
  const langs = {}
  let cur = null
  for (const line of src.split('\n')) {
    const begin = line.match(/^  ([a-z]{2}): \{/)
    if (begin) { cur = begin[1]; langs[cur] = new Set(); continue }
    if (!cur) continue
    const kv = line.match(/^      "((?:[^"\\]|\\.)+)":/)
    if (kv) langs[cur].add(kv[1])
  }
  return langs
}

// ——— R4 : le texte littéral réellement rendu dans les enfants d'une balise ———
/**
 * Les règles 2 et 4 du sondeur `find-hardcoded-labels.mjs` cherchent `>texte<` :
 * elles voient `<label>Theme</label>` mais pas
 *   {pinnedMessages.length} message{pinnedMessages.length > 1 ? 's' : ''} épinglé…
 * — le texte de la barre d'épinglés, rendu en français dans les 24 autres langues.
 * Distinguer le balisage du code exige de lire le fichier d'une traite : « < »
 * suivi d'une lettre peut être une balise JSX, un générique `Array<Foo>` ou une
 * comparaison `i<count`. Le parcours avance par régions : une balise ouvrante,
 * puis ses enfants jusqu'à la fermante, en sautant les `{…}` (attributs comme
 * interpolations) et les balises imbriquées.
 *
 * Le texte est évalué mot à mot : un fragment dont chaque mot est un sigle, une
 * unité ou un nom de produit (« Ctrl+Shift+D », « KB/s », « XELIS ») n'est pas
 * une phrase à traduire.
 *
 * Ce que R4 ne voit pas : un `{…}` seul. Un modèle de chaîne rendu nu
 * (`{`${n} messages`}`) y a la même forme qu'un `className` de balise imbriquée,
 * et le discerner demanderait un vrai parseur. Les deux formes qui ont réellement
 * fui — le mot collé à une interpolation, l'accord en `{… ? 's' : ''}` — sont
 * couvertes.
 */
const TECHNICAL_WORDS =
  /^(?:https?|www|com|net|org|px|ms|kb|mb|gb|tb|kmbps|mbps|kbps|bps|e2e|p2p|ip|ipv[46]|dns|id|url|uri|api|app|dev|ui|ux|a11y|i18n|l10n|faq|mp[234]|ogg|opus|vo?rbis|wav|flac|aac|vp[0-9]|avc|h26[45]|hevc|sha\d*|md5|hex|utf-?8?|zbase32?|dht|udp|tcp|wss?|ssl|tls|peer|keet|pear|asgard|hypercore|hyperbee|hyperdrive|autobase|holepunch|electron|node|json|png|jpe?g|gif|webp|svg|ico|icns|pdf|zip|tar|gz|exe|deb|rpm|yml|md|on|off|auto|ok|ctrl|shift|alt|cmd|meta|enter|esc|escape|tab|del|sup|sub|beta|alpha|rc|gpg|pgp|btc|usd|eur|gbp|sql|ipc|pid|ram|cpu|gpu|db|logo|icon|xelis)$/i

const BARE_WORD = /[^\p{L}\d_'’-]+/u

/** Tout mot du fragment est-il technique ? (un seul à traduire → à signaler) */
function isTechnicalText(text) {
  const words = text.split(BARE_WORD).filter((w) => /[\p{L}]/u.test(w))
  if (!words.length) return true
  return words.every((w) => TECHNICAL_WORDS.test(w) || w.length < 2 || /^\d/.test(w))
}

/** index de l'accolade qui ferme celle de `open`, ou -1 */
function matchBrace(code, open) {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) return i
  }
  return -1
}

/** index du `>` qui ferme la balise ouverte à `lt` ; les `{…}` d'attributs sont sautés */
function tagEnd(code, lt) {
  for (let i = lt + 1; i < code.length; i++) {
    if (code[i] === '{') {
      const close = matchBrace(code, i)
      if (close < 0) return -1
      i = close
      continue
    }
    if (code[i] === '>') return i
  }
  return -1
}

const isSelfClosing = (code, lt, end) => code.slice(lt, end).trimEnd().endsWith('/')

/**
 * Lit la région d'enfants ouverte à `from` : les fragments de texte littéral
 * vont dans `texts`, les `{…}` rendus dans `exprs` (le pluriel s'y écrit), aux
 * offsets près. Renvoie l'index où reprend le scan — après la balise fermante.
 */
function readChildren(code, from, texts, exprs) {
  let run = -1
  const flush = (upto) => {
    if (run >= 0) {
      const slice = code.slice(run, upto)
      if (slice.trim()) texts.push({ text: slice, offset: run })
      run = -1
    }
  }
  let i = from
  while (i < code.length) {
    const c = code[i]
    if (c === '{') {
      flush(i)
      const close = matchBrace(code, i)
      if (close < 0) return code.length
      exprs.push({ text: code.slice(i, close + 1), offset: i, adjacent: touchesText(code, i, close) })
      i = close + 1
      continue
    }
    if (c === '<') {
      flush(i)
      if (code[i + 1] === '/') {
        const end = tagEnd(code, i)
        return end < 0 ? code.length : end + 1
      }
      const end = tagEnd(code, i)
      if (end < 0) return code.length
      if (!isSelfClosing(code, i, end)) {
        i = readChildren(code, end + 1, texts, exprs)
        continue
      }
      i = end + 1
      continue
    }
    if (run < 0 && !/\s/.test(c)) run = i
    i++
  }
  flush(code.length)
  return code.length
}

/**
 * L'interpolation est-elle collée à du texte ? `3 message{s ? 's' : ''}` oui,
 * `{items.map(…)}` isolé non — et c'est contre le premier cas qu'on protège.
 */
function touchesText(code, open, close) {
  let p = open - 1
  while (p >= 0 && /\s/.test(code[p])) p--
  if (p >= 0 && /[\p{L}]/u.test(code[p])) return true
  let n = close + 1
  while (n < code.length && /\s/.test(code[n])) n++
  return n < code.length && /[\p{L}]/u.test(code[n])
}

/** Un « < » est-il l'ouverture d'une balise JSX et non un chevron de code ? */
function isJsxTagStart(code, i) {
  if (!/[A-Za-z>.]/.test(code[i + 1] ?? '')) return false
  let p = i - 1
  while (p >= 0 && /\s/.test(code[p])) p--
  if (p < 0) return true
  const before = code[p]
  if (/[A-Za-z0-9_$)\]]/.test(before)) {
    // « return <div> » introduit du JSX ; « Array<Foo> », « useState<Msg[]> » et
    // « a < b » ont un identifiant, une parenthèse ou un crochet juste avant.
    const word = code.slice(0, p + 1).match(/[A-Za-z0-9_$]+$/)?.[0] ?? ''
    return word === 'return'
  }
  return true
}

/** L'accord du pluriel écrit dans une interpolation : aucune langue ne le reproduit. */
const AGREEMENT_LITERAL = /\?\s*(['"])([\p{L}]{1,4})\1\s*:\s*(['"])([\p{L}]{0,4})\3/u

const SHADOW_PARAMS = 't|i18n|tr'
const LIST_NAMES = 'map|flatMap|filter|find|findIndex|some|every|forEach|reduce|reduceRight|sort|toSorted'
const R1_PATTERNS = [
  // `.map((t) =>`, `.filter((t, i) =>`
  new RegExp(`\\.\\s*(${LIST_NAMES})\\s*\\(\\s*\\(\\s*(${SHADOW_PARAMS})\\s*[,)]`, 'g'),
  // `.map(t =>`
  new RegExp(`\\.\\s*(${LIST_NAMES})\\s*\\(\\s*(${SHADOW_PARAMS})\\s*=>`, 'g'),
]
// tableau littéral de chaînes immédiatement suivi de `.map(` : la source d'un
// jeu d'onglets ou de choix écrit en dur dans le JSX. Le cast `as const` ou
// `as Tab[]` est toléré — les crochets comptent, la sonde de non-vacuité s'en
// sert exactement.
const INLINE_STRING_LIST =
  /\[\s*(['"])([^'"\n]+)\1\s*(?:,\s*(['"])[^'"\n]+\3\s*)+\]\s*(?:as\s*[\w$<>,|{}\[\]\s]+?)?\s*\)\s*\.map\s*\(\s*\(?\s*([A-Za-z_$][\w$]*)/g
// un libellé rendu nu est un bloc `{x}` qui n'est la valeur d'aucun attribut :
// `key={x}` et `onClick={() => set(x)}` sont la forme normale d'une boucle
// saine, et `${x}` une interpolation de chaîne — ni l'un ni l'autre n'affiche
// l'identifiant brut
const BARE_PARAM = (param) => new RegExp(`(?<!=|[$\w.])\{\s*${param}\s*\}`)

const failures = []
const files = walk(SRC)
let analysed = 0

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8')
  // le piège ne se referme que là où la fonction de traduction est réellement
  // en place ; un `stream.getTracks().map((t) …)` isolé n'a rien à masquer
  if (!/\{\s*t\s*\}\s*=\s*useTranslation\s*\(/.test(raw) && !/from\s+['"]i18next['"]/.test(raw)) continue
  analysed++

  const { code, comment } = scrub(raw)
  const rel = path.relative(ROOT, file).split(path.sep).join('/')
  const at = (offset) => code.slice(0, offset).split('\n').length

  for (const re of R1_PATTERNS) {
    re.lastIndex = 0
    for (const m of code.matchAll(re)) {
      failures.push(`R1 ${rel}:${at(m.index)} — « .${m[1]}( » a un paramètre « ${m[2]} » qui masque la fonction de traduction`)
    }
  }

  for (const m of raw.matchAll(INLINE_STRING_LIST)) {
    if (comment[m.index]) continue // exemple documenté dans un commentaire
    const param = m[4]
    const bodyStart = m.index + m[0].length
    const close = raw.indexOf('))', bodyStart)
    const body = close === -1 ? '' : raw.slice(bodyStart, close)
    if (!BARE_PARAM(param).test(body)) continue
    failures.push(`R2 ${rel}:${at(m.index)} — « .map(${param} => … {${param}}) » sur une liste de chaînes en dur : un identifiant n'est pas un libellé`)
  }
}

// ——— R4 : le texte réellement rendu dans les enfants d'une balise ———
const r4 = { regions: 0, fragments: 0 }
const emit = (message) => {
  if (!failures.includes(message)) failures.push(message)
}

for (const file of files.filter((f) => f.endsWith('.tsx') && !f.split(path.sep).includes('tests'))) {
  const raw = fs.readFileSync(file, 'utf8')
  const { code, comment } = scrub(raw)
  const rel = path.relative(ROOT, file).split(path.sep).join('/')
  const at = (offset) => code.slice(0, offset).split('\n').length
  const texts = []
  const exprs = []

  let cursor = 0
  while (cursor < code.length) {
    if (code[cursor] === '<' && isJsxTagStart(code, cursor)) {
      const end = tagEnd(code, cursor)
      if (end >= 0 && !isSelfClosing(code, cursor, end)) {
        r4.regions++
        cursor = readChildren(code, end + 1, texts, exprs)
        continue
      }
    }
    cursor++
  }

  for (const { text, offset } of texts) {
    const value = text.replace(/&\w+;/g, ' ').replace(/\s+/g, ' ').trim()
    if (!/[\p{L}]/u.test(value) || isTechnicalText(value)) continue
    r4.fragments++
    emit(`R4 ${rel}:${at(offset)} — texte en dur rendu dans le JSX : « ${value} »`)
  }

  for (const { text, offset, adjacent } of exprs) {
    if (!adjacent || comment[offset]) continue
    const body = raw.slice(offset, offset + text.length)
    // L'accord ne se contrôle que collé à du texte : `{…}` isolé peut être un
    // gestionnaire dont le ternaire retourne une classe CSS, pas un mot.
    const agreement = body.match(AGREEMENT_LITERAL)
    if (agreement) {
      emit(`R4 ${rel}:${at(offset)} — accord écrit dans le JSX ({…${agreement[0]}}) : aucune langue ne peut le reproduire`)
    }
  }
}

// Sonde de non-vacuité : un parcours qui ne trouverait plus de région d'enfants
// serait un contrôle vide — et un contrôle vide pardonne tout, y compris la
// panne qu'il existe pour rattraper.
if (r4.regions < 200) {
  failures.push(`R4 — le parcours JSX ne trouve que ${r4.regions} régions d'enfants : la règle ne contrôle plus rien`)
}

// ——— R3 : les onglets de ContactsPage, et leurs clés dans chaque langue ———
const contactsPath = path.join(SRC, 'features', 'contacts', 'ContactsPage.tsx')
const catalog = readCatalog()
const langCount = Object.keys(catalog).length

if (!fs.existsSync(contactsPath)) {
  failures.push(`R3 — ContactsPage introuvable : ${contactsPath}`)
} else {
  const contacts = fs.readFileSync(contactsPath, 'utf8')
  const tabsMatch = contacts.match(/const TABS[^\n]*\n([\s\S]*?)\n\]/)
  if (!tabsMatch) {
    failures.push('R3 — le tableau TABS de ContactsPage est introuvable')
  } else {
    const entries = [...tabsMatch[1].matchAll(/\{\s*id:\s*['"]([\w-]+)['"]\s*,\s*labelKey:\s*['"]([\w.-]+)['"]\s*\}/g)]
    const ids = entries.map((e) => e[1])
    const expected = ['all', 'online', 'favorites', 'blocked']
    if (ids.join(',') !== expected.join(',')) {
      failures.push(`R3 — les onglets sont [${ids.join(', ')}], attendu [${expected.join(', ')}]`)
    }
    for (const [, id, labelKey] of entries) {
      const missing = Object.entries(catalog).filter(([, keys]) => !keys.has(labelKey)).map(([lang]) => lang)
      if (missing.length) {
        failures.push(`R3 — l'onglet « ${id} » porte la clé « ${labelKey} » absente de ${missing.length}/${langCount} langues : ${missing.join(', ')}`)
      }
    }
  }
  if (/\.map\(\(t\)/.test(contacts)) {
    failures.push('R3 — ContactsPage boucle encore sur un paramètre nommé « t »')
  }
}

console.log(`check-i18n-labels — ${analysed} fichiers à traduction sur ${files.length} analysés, catalogue de ${langCount} langues, 4 règles`)
console.log(`  R4 — ${r4.regions} régions d'enfants balayées, ${r4.fragments} fragment(s) rendu(s) en dur`)

if (langCount < 25) {
  console.error(`R3 — le catalogue ne compte que ${langCount} langues (25 attendues)`)
  failures.push('R3 — catalogue i18n incomplet')
}

if (failures.length) {
  console.error(`${failures.length} violation(s) :`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}

console.log('OK — aucun libellé en dur par un identifiant, aucune fonction de traduction masquée')
