// Verrou : un sélecteur de store ne doit pas reconstruire une référence à chaque rendu.
//
// Le défaut corrigé : `useMessageStore((s) => s.messages[id] ?? [])` sur un canal
// sans message. Le littéral `[]` est un TABLEAU NEUF à chaque appel, donc la valeur
// que React relit du store change sans arrêt de référence. Seul, ce sélecteur ne
// coûte qu'un rendu de plus ; combiné à un effet qui liste cette valeur dans ses
// dépendances et appelle un `setState`, le composant n'a plus de lanes libres,
// l'eager bailout de `useState` est sauté, et la vue se relance sans fin — mesuré à
// 6 500 000 rendus sur un canal vide dans un test qui ne rendait pas la main.
//
// La règle : le sélecteur ne rend que la référence du store, déjà stable
// (`s.contacts`, `s.messages[id]`), et la mise en forme (trier, filtrer, aplatir)
// se fait hors du sélecteur, dans un `useMemo` branché sur cette référence ; une
// liste vide se partage par une constante (`NO_MESSAGES`), jamais par un littéral.
//
// Périmètre : le contrôle est syntaxique. Il voit les collections fabriquées dans
// l'expression du sélecteur (Object.values/keys/entries, filter, map, slice, sort,
// concat, flat,flatMap, toSorted, spreads, `new Set`, `?? []`). Il ne voit pas un
// appel de méthode de store qui fabriquerait sa liste (`s.getMembers(id)`) : le
// résultat y est invisible, et ces accesseurs ont été audités à la main — celles et
// ceux qui trient ou filtrent ne doivent être appelés que hors d'un sélecteur.
// Un dernier maillon qui rend un primitif (`reduce`, `some`, `findIndex`, `join`…)
// n'est pas signalé non plus : React compare la sortie par valeur, la boucle est
// impossible. Coûteux, oui ; dangereux, non.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const GUARDED_DIRS = ['src']
const SKIP_DIR = new Set(['node_modules', 'dist', 'release', 'coverage', 'tests'])
const EXTENSIONS = new Set(['.ts', '.tsx'])

// Collection fabriquée dès la tête de l'expression.
const LEADING = [
  /^Object\.(?:values|keys|entries)\s*\(/,
  /^\[\s*\.\.\./,
  /^\{\s*\.\.\./,
  /^new\s+(?:Set|Map|Array|WeakMap|WeakSet)\s*\(/,
  /^Array\.from\s*\(/,
]
// Collection fabriquée par le dernier maillon de la chaîne.
const COLLECTION_METHODS = new Set([
  'filter', 'map', 'slice', 'sort', 'concat', 'flat', 'flatMap',
  'toSorted', 'toReversed', 'toSpliced',
])
// Maillon final qui rend un primitif : la valeur de sortie est comparée par valeur,
// le sélecteur ne peut donc pas relancer la vue — même s'il trie au passage.
const AGGREGATE_METHODS = new Set([
  'reduce', 'reduceRight', 'some', 'every', 'find', 'findIndex', 'findLast',
  'findLastIndex', 'includes', 'indexOf', 'lastIndexOf', 'join', 'forEach',
])
// Rien à lire dans le store : le littéral est neuf à chaque appel.
const EMPTY_FALLBACK = /(?:\?\?|\|\|)\s*(?:\[\]|\{\})\s*$/
const BARE_LITERAL = /^(?:\[\]|\{\})$/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIR.has(name)) walk(full, out)
    } else if (EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) {
      out.push(full)
    }
  }
  return out
}

// Parenthèse fermée correspondant à l'openingIndex, en sautant cordes et commentaires.
function matchParen(text, openingIndex) {
  let depth = 0
  for (let i = openingIndex; i < text.length; i++) {
    const char = text[i]
    if (char === '"' || char === "'" || char === '`') {
      i = skipString(text, i)
      continue
    }
    if (char === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i)
      if (i < 0) return text.length
      continue
    }
    if (char === '/') {
      i = skipString(text, i)
      continue
    }
    if (char === '(') depth++
    else if (char === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function skipString(text, start) {
  const quote = text[start]
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue }
    if (quote === '/' && (text[i] === '\n' || (text[i] === '/' && text[i - 1] !== '\\'))) return i - 1
    if (text[i] === quote) return i
  }
  return text.length
}

// Le corps du sélecteur. `args` est l'intérieur de l'appel de `use…Store(`, parenthèses
// comprises : un second argument (une fonction de comparaison) est écarté, la flèche
// cherchée est le premier `=>` hors de tout niveau imbriqué.
function selectorBody(args) {
  const firstArg = cutAtTopLevelComma(args)
  const arrow = firstArg.indexOf('=>')
  if (arrow < 0) return null
  let body = firstArg.slice(arrow + 2).trim()
  while (body.startsWith('(') && matchParen(body, 0) === body.length - 1) {
    body = body.slice(1, -1).trim()
  }
  return body
}

// Coupe après la première virgule de premier niveau : le reste est un argument de plus.
function cutAtTopLevelComma(args) {
  let depth = 0
  for (let i = 0; i < args.length; i++) {
    const char = args[i]
    if (char === '"' || char === "'" || char === '`' || char === '/') {
      i = skipString(args, i)
      continue
    }
    if (char === '(' || char === '[' || char === '{') depth++
    else if (char === ')' || char === ']' || char === '}') depth--
    else if (char === ',' && depth === 0) return args.slice(0, i)
  }
  return args
}

// Nom de la méthode dont l'appel ferme l'expression, si appel il y a.
function outermostMethod(body) {
  const pattern = /\.([A-Za-z_$][\w$]*)\s*\(/g
  let match
  let last = null
  while ((match = pattern.exec(body)) !== null) {
    const opening = body.indexOf('(', match.index + match[0].length - 1)
    const closing = matchParen(body, opening)
    if (closing === body.length - 1) last = match[1]
  }
  return last
}

function inspect(body) {
  if (!body) return null
  if (BARE_LITERAL.test(body)) return 'une liste vide littérale'
  if (EMPTY_FALLBACK.test(body)) return 'un repli sur un littéral vide'
  const method = outermostMethod(body)
  if (method && AGGREGATE_METHODS.has(method)) return null
  for (const pattern of LEADING) {
    if (pattern.test(body)) return body.match(pattern)[0].trim()
  }
  if (method && COLLECTION_METHODS.has(method)) return `.${method}()`
  return null
}

const faults = []
let checked = 0
for (const dir of GUARDED_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const text = readFileSync(file, 'utf8')
    const relativePath = file.slice(ROOT.length + 1).replace(/\\/g, '/')
    const callPattern = /use[A-Z][A-Za-z]*Store\(/g
    let match
    while ((match = callPattern.exec(text)) !== null) {
      const opening = match.index + match[0].length - 1
      const closing = matchParen(text, opening)
      if (closing < 0) continue
      const callText = text.slice(match.index, closing + 1)
      const body = selectorBody(text.slice(opening + 1, closing))
      if (body === null) continue
      checked++
      const reason = inspect(body)
      if (reason) {
        const line = text.slice(0, match.index).split('\n').length
        faults.push({
          file: relativePath,
          line,
          reason,
          code: callText.replace(/\s+/g, ' ').slice(0, 110),
        })
      }
    }
  }
}

if (faults.length > 0) {
  console.error(`FAIL: ${faults.length} sélecteur(s) reconstruisent une référence (${checked} contrôlés)`)
  for (const fault of faults) {
    console.error(`  ${fault.file}:${fault.line} — ${fault.reason}`)
    console.error(`    ${fault.code}`)
  }
  console.error('Le sélecteur ne rend que la référence du store ; trier/filtrer se fait dans un useMemo.')
  process.exit(1)
}

console.log(`OK: ${checked} sélecteurs de store contrôlés, aucun ne reconstruit de référence`)
