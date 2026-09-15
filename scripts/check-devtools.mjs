/**
 * check-devtools.mjs — la console de développement reste fermée à la livraison.
 *
 * Les DevTools ont été désactivés une première fois en septembre 2026 : trois
 * portes les rouvraient dans le paquet livré (`devTools: true` dans les
 * webPreferences, `openDevTools()` appelé après le chargement du renderer, et
 * le raccourci F12/Ctrl+Shift+I géré à la main), plus une quatrième propre à
 * macOS — sans menu applicatif explicite, Electron installe son menu par
 * défaut, qui affiche « View → Toggle Developer Tools » et « Force Reload ».
 * Chacune de ces portes a été ajoutée pour diagnostiquer un problème précis.
 * Le risque n'est pas qu'une d'elles revienne, c'est qu'une seule revienne :
 * cette vérification porte donc sur les quatre.
 *
 * R1  `devTools` dans les webPreferences n'est jamais le littéral `true`
 * R2  tout `openDevTools(` / `toggleDevTools` du process principal est lexicalement
 *     contenu dans un bloc conditionné à `devToolsAllowed`
 * R3  le menu macOS est construit (rôles appMenu/editMenu/windowMenu) et ne
 *     référence ni `viewMenu` ni le littéral `setApplicationMenu(null)` hors de
 *     la branche non-darwin
 *
 * Utilisation : node scripts/check-devtools.mjs [--root <dir>]
 * Sortie : 0 si conforme, 1 sinon.
 */
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const ri = argv.indexOf('--root')
const ROOT = ri !== -1 && argv[ri + 1] ? path.resolve(argv[ri + 1]) : process.cwd()
const MAIN = path.join(ROOT, 'electron', 'main.ts')

/**
 * Masque commentaires ET littéraux de chaîne (offsets préservés) pour compter
 * les accolades, mais ne masque QUE les commentaires pour chercher les
 * occurrences : `{ role: 'toggleDevTools' }` est une chaîne, et c'est justement
 * une porte à contrôler.
 */
function mask(src) {
  const out = src.split('')
  const hide = new Array(src.length).fill(false)
  const comment = new Array(src.length).fill(false)
  let i = 0
  const blank = (from, to, isComment = false) => {
    for (let j = from; j < to && j < out.length; j++) {
      hide[j] = true
      if (isComment) comment[j] = true
      if (out[j] !== '\n') out[j] = ' '
    }
  }
  while (i < src.length) {
    const two = src.slice(i, i + 2)
    if (two === '//') { const e = src.indexOf('\n', i); const s = e === -1 ? src.length : e; blank(i, s, true); i = s; continue }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); const s = e === -1 ? src.length : e + 2; blank(i, s, true); i = s; continue }
    const c = src[i]
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === c) { j++; break }
        if (c !== '`' && src[j] === '\n') break
        j++
      }
      blank(i, j); i = j; continue
    }
    i++
  }
  return { code: out.join(''), hide, comment }
}

/**
 * Blocs qui encadrent `pos`, du plus proche au plus externe (max `max`).
 * Le balayage d'accolades se fait sur `masked` — ni un commentaire ni un texte
 * entre guillemets ne doit compter — mais l'en-tête est relu dans `src` : une
 * règle qui teste `process.platform !== 'darwin'` a besoin de voir `darwin`,
 * que le masque efface.
 */
function enclosingBlocks(masked, src, pos, max = 4) {
  const blocks = []
  let balance = 0
  for (let i = pos - 1; i >= 0 && blocks.length < max; i--) {
    const c = masked[i]
    if (c === '}') balance++
    else if (c === '{') {
      if (balance > 0) { balance--; continue }
      let e = i
      while (e + 1 < masked.length && masked[e + 1] !== '\n') e++
      let s = i
      while (s > 0 && masked[s - 1] !== '\n') s--
      let headerStart = s
      const line = masked.slice(s, e + 1).trim()
      if (!line) {
        // accolade seule sur sa ligne : la condition est la ligne précédente
        let p = s - 1
        while (p > 0 && masked[p - 1] !== '\n') p--
        headerStart = p
      }
      blocks.push({ start: headerStart, header: src.slice(headerStart, e + 1).trim() })
      // la prochaine accolade non appariée est celle de ce bloc : on reprend
      // le balayage avant son ouverture
      pos = headerStart
      i = headerStart
    }
  }
  return blocks
}

/**
 * La porte est-elle sous garde développement ? Trois écritures licites, testées
 * niveau par niveau de l'imbrication (jusqu'à quatre) :
 *
 * 1. l'en-tête du bloc dit `if (devToolsAllowed) { … }` ;
 * 2. une clause `if (!devToolsAllowed) return` plus tôt DANS LE MÊME bloc que
 *    l'appel — la forme naturelle dans un gestionnaire d'événement ;
 * 3. l'appel est la branche d'un `if (devToolsAllowed)` écrit en ligne.
 *
 * Test niveau par niveau et non « le mot apparaît quelque part au-dessus » :
 * sinon, un `openDevTools()` ajouté cinq lignes sous le bloc légitime passerait
 * comme une lettre à la poste, et c'est précisément le scénario de régression.
 */
function underDevGuard(masked, pos) {
  const blocks = enclosingBlocks(masked, masked, pos, 4)
  for (let i = 0; i < blocks.length; i++) {
    if (/devToolsAllowed|isDev\b/.test(blocks[i].header)) return true
    const to = i === 0 ? pos : blocks[i - 1].start
    const seg = masked.slice(blocks[i].start, to)
    if (/if\s*\(\s*!\s*devToolsAllowed\s*\)\s*return/.test(seg)) return true
  }
  return false
}

const failures = []
if (!fs.existsSync(MAIN)) {
  console.error(`electron/main.ts introuvable : ${MAIN}`)
  process.exit(1)
}

const raw = fs.readFileSync(MAIN, 'utf8')
const { code: masked, comment } = mask(raw)
const lineOf = (pos) => raw.slice(0, pos).split('\n').length
const lineText = (n) => raw.split('\n')[n - 1].trim()

// ——— R1 : devTools littéral ———
for (const m of raw.matchAll(/\bdevTools\s*:\s*(true|false|[A-Za-z_$][\w$]*)/g)) {
  if (comment[m.index]) continue // exemple documenté dans un commentaire
  if (m[1] === 'true') {
    failures.push(`R1 main.ts:${lineOf(m.index)} — « devTools: true » ouvre la console pour tout le monde, livré comme en dev`)
  }
}
const devToolsPref = /\bdevTools\s*:\s*([A-Za-z_$][\w$]*)/.exec(raw)
if (!devToolsPref) {
  failures.push('R1 — aucune clé `devTools` dans les webPreferences : la valeur par défaut d\'Electron est true')
}

// ——— R2 : tout appel à la console est conditionné ———
let callSites = 0
for (const re of [/\bopenDevTools\s*\(/g, /['"]toggleDevTools['"]/g, /\btoggleDevTools\s*\(/g]) {
  for (const m of raw.matchAll(re)) {
    if (comment[m.index]) continue // exemple documenté dans un commentaire
    callSites++
    if (underDevGuard(masked, m.index)) continue
    const blocks = enclosingBlocks(masked, raw, m.index, 2)
    const near = blocks.length ? blocks[0].header.slice(0, 60) : 'aucun'
    failures.push(`R2 main.ts:${lineOf(m.index)} — « ${lineText(lineOf(m.index)).slice(0, 70)} » accessible hors développement (bloc le plus proche : ${near})`)
  }
}

// ——— R3 : menu macOS ———
if (/setApplicationMenu\s*\(\s*null\s*\)/.test(raw)) {
  // toléré uniquement s'il est gardé par une condition non-darwin
  for (const m of raw.matchAll(/setApplicationMenu\s*\(\s*null\s*\)/g)) {
    if (comment[m.index]) continue // exemple documenté dans un commentaire
    const blocks = enclosingBlocks(masked, raw, m.index, 1)
    const header = blocks.length ? blocks[0].header : null
    if (!header || !/darwin/.test(header)) {
      failures.push(`R3 main.ts:${lineOf(m.index)} — menu supprimé sans garde darwin : sur macOS on récupère le menu par défaut d'Electron, qui offre la console`)
    }
  }
}
if (!/['"]editMenu['"]/.test(raw) || !/['"]appMenu['"]/.test(raw)) {
  failures.push('R3 — le menu macOS ne déclare pas les rôles appMenu/editMenu : sans eux, Cmd+C/Cmd+V et Cmd+Q cessent de fonctionner dans la zone de message')
}
if (/['"]viewMenu['"]/.test(raw)) {
  failures.push('R3 — le rôle viewMenu est référencé : il contient Toggle Developer Tools et Force Reload')
}

console.log(`check-devtools — ${callSites} porte(s) vers la console analysée(s) dans electron/main.ts`)
if (failures.length) {
  console.error(`${failures.length} violation(s) :`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log('OK — console de développement fermée hors développement, sur les trois plateformes')
