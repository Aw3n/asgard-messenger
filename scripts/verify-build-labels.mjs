/**
 * verify-build-labels.mjs — les corrections sont-elles dans l'exe livré ?
 *
 * Un catalogue traduit dans les 25 langues ne sert à rien si le paquet final
 * embarque une vieille copie du bundle : c'est précisément ce qui s'est produit
 * pour les onglets de Contacts, restés anglais chez l'utilisateur alors que le
 * code source était corrigé. Ce contrôle lit l'`app.asar` du paquet (format
 * non chiffré : un index JSON suivi des fichiers concaténés) et vérifie que
 * chaque clé nouvelle y figure, ainsi que sa valeur française — la valeur prouve
 * que l'entrée n'est pas seulement référencée mais réellement embarquée.
 *
 * Le paquet est lu fichier par fichier, et non cherché à l'aveugle dans les
 * 200 Mo bruts : un `devTools: true` rencontré dans tout l'archive ne dit rien
 * de NOTRE fenêtre — il se trouve dans une dépendance, et le doute suffit à
 * rendre le contrôle inutile.
 *
 * Utilisation :
 *   node scripts/verify-build-labels.mjs [--asar <chemin>] [--verbose]
 * Sortie : 0 si tout est embarqué, 1 à la première absence.
 */
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
// les deux formes sont lues : `--asar chemin` et `--asar=chemin` — la seconde
// est celle qu'on tape par habitude, et elle passait silencieusement inaperçue
const opt = (name, def) => {
  const inline = argv.find((a) => a.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const i = argv.indexOf(name)
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def
}
const ASAR = path.resolve(opt('--asar', 'release/win-unpacked/resources/app.asar'))
const verbose = argv.includes('--verbose')

/** Clés ajoutées ou câblées, avec un fragment de leur valeur française. */
const EXPECTED = [
  { key: 'contacts.tabBlocked', value: 'Bloqués' },
  { key: 'settings.fontSize', value: 'Taille du texte' },
  { key: 'settings.fontSmall', value: 'Petite' },
  { key: 'settings.fontMedium', value: 'Moyenne' },
  { key: 'settings.fontLarge', value: 'Grande' },
  { key: 'search.navigate', value: 'Naviguer' },
  { key: 'search.open', value: 'Ouvrir' },
  { key: 'search.resultsCount', value: '{{count}}' },
  { key: 'groups.broadcastModeHint', value: 'administrateurs' },
  { key: 'common.muted', value: 'Muet' },
]

/** L'ancienne source de la boucle : quatre identifiants rendus nus. */
const FORBIDDEN_IN_JSX = [
  // ContactsPage avant la correction ; les identifiants existent toujours
  // (ce sont les clés de TABS) mais plus jamais en liste littérale bouclée
  '["all","online","favorites","blocked"].map',
]

/**
 * Réglage de sécurité contrôlé lui aussi dans le paquet : `check-devtools`
 * vérifie la source, mais entre la source et l'exécutable il y a une
 * compilation — un `main.js` embarqué qui ne contient plus la garde prouverait
 * que la correction n'est jamais arrivée jusqu'à l'utilisateur. Ces motifs sont
 * cherchés uniquement dans le code de dist/electron/main.js, hors commentaires.
 */
const DEVTOOLS_REQUIRED = ['devTools: devToolsAllowed', 'if (devToolsAllowed)']
const DEVTOOLS_FORBIDDEN = ['devTools: true', 'devTools: !0', 'devTools:!0']

/**
 * Pictogrammes, contrôlés dans le paquet livré. Sous Linux, une installation
 * ne doit aucune police émoji à Electron : `fc-list | grep -ci emoji` y renvoie
 * 0 sur une machine neuve, et chaque émoji employé comme icône s'affiche en
 * rectangle vide. La correction remplace ces glyphes par des tracés SVG
 * (src/components/ui/Icon.tsx). Le contrôle porte sur le bundle du renderer
 * uniquement — les journaux du processus principal, eux, contiennent des
 * émojis par convention et ne passent jamais à l'écran.
 */
const ICON_FORBIDDEN = [
  ['\u{1F510}', 'cadenas de la page d accueil'],
  ['\u{1F310}', 'globe de la page d accueil'],
  ['\u{1F6E1}', 'bouclier de la page d accueil'],
  ['\u{1F4DE}', 'telephone d appel'],
  ['\u{1F504}', 'rotation de connexion'],
  ['\u{23F1}', 'chronometre d appel'],
  ['\u{1F465}', 'participants de groupe'],
  ['\u{1F916}', 'pastille de bot'],
  ['\u{2750}', 'bouton restaurer de la barre de titre'],
]
/** Deux tracés parmi d autres : leur présence prouve que le jeu SVG est embarqué. */
const ICON_REQUIRED = [
  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  'M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8',
]
/** Les drapeaux de la liste des langues étaient des indicateurs régionaux. */
const FLAG_RANGE = /[\u{1F1E6}-\u{1F1FF}]/gu

/**
 * Police de repli, contrôlée dans le paquet : les icônes sont passées en SVG,
 * mais les réactions et les smileys restent des caractères réseau. Sans police embarquée,
 * un système qui n'installe aucune police émoji (Linux neuf) les affiche en
 * rectangle vide. Le paquet doit donc contenir le sous-ensemble woff2 (assets/fonts,
 * produit par scripts/build-emoji-font.py) ET la règle @font-face qui le déclare.
 */
const FONT_FAMILY = 'Asgard Emoji'
const FONT_MIN_BYTES = 4096

/**
 * Icône du plateau (barre d'état macOS, zone de notification Linux), contrôlée
 * dans le paquet : `size` y est une taille LOGIQUE, donc un `resize({width:16})`
 * seul rend une image floue sur un écran Retina. Le correctif ajoute une
 * représentation 2x via `addRepresentation`. Le contrôle a la même raison
 * d'être que celui de la garde DevTools : il rate un paquet compilé AVANT la
 * correction, et c'est le seul moyen de contrôler macOS sans machine macOS.
 */
const TRAY_REQUIRED = ['addRepresentation', 'scaleFactor: 2']

/**
 * Retire les appels de trace du code minifié. Le bundle du renderer embarque
 * aussi les `console.log` des services (`[CallService] 📞 …`) : ces émojis-là
 * vont dans la console, jamais à l'écran, et les interdire ferait échouer le
 * contrôle sur du bruit. Les parenthèses sont appariées en tenant compte des
 * littéraux, car le minifieur met tout sur une seule ligne — filtrer ligne par
 * ligne effacerait le fichier entier.
 */
function stripConsoleCalls(code) {
  let out = ''
  let i = 0
  for (;;) {
    const rest = code.slice(i)
    const m = /console\.(?:log|warn|error|info|debug)\(/.exec(rest)
    if (!m) return out + rest
    out += rest.slice(0, m.index)
    let j = i + m.index + m[0].length
    let depth = 1
    let quote = null
    while (j < code.length && depth > 0) {
      const c = code[j]
      if (quote) {
        if (c === '\\') j++
        else if (code[j] === quote) quote = null
      } else if (c === '"' || c === "'" || c === '`') {
        quote = c
      } else if (c === '(') {
        depth++
      } else if (c === ')') {
        depth--
      }
      j++
    }
    i = j
  }
}

/**
 * Lecture du format asar : pickle de 8 octets, index JSON, fichiers concaténés.
 * Une vingtaine de lignes sans dépendance, qui évitent surtout le faux
 * négatif silencieux — chercher un motif dans l'archive entière, c'est le
 * chercher aussi dans 9 500 fichiers de node_modules.
 */
function asarIndex(asarPath) {
  const buf = fs.readFileSync(asarPath)
  const pickleSize = buf.readUInt32LE(4)
  const jsonLen = buf.readUInt32LE(12)
  const tree = JSON.parse(buf.slice(16, 16 + jsonLen).toString('utf8'))
  return { buf, base: 8 + pickleSize, tree }
}

function asarNode(index, parts) {
  // `index.tree` est déjà `{ files: … }` : on part de lui, sinon la première
  // lookup échoue et tout le paquet semble vide
  let node = index.tree
  for (const name of parts) {
    node = node.files && node.files[name]
    if (!node) return null
  }
  return node
}

/** Contenu texte d'un fichier de l'archive, ou null s'il est absent/extrait hors archive. */
function asarRead(index, parts) {
  const entry = asarNode(index, parts)
  if (!entry || entry.unpacked || typeof entry.size !== 'number') return null
  const off = Number(entry.offset)
  if (!Number.isFinite(off)) return null
  return index.buf.slice(index.base + off, index.base + off + entry.size).toString('utf8')
}

/**
 * Retire les commentaires du JavaScript compilé. `tsc` ne les supprime pas, et
 * le paquet livré contient donc la phrase qui explique pourquoi `devTools: true`
 * a été retiré — écrit noir sur blanc dans le main.js. Sans cette étape, le
 * contrôle interdirait… la documentation de la correction.
 */
function stripComments(code) {
  let out = ''
  let i = 0
  while (i < code.length) {
    const two = code.slice(i, i + 2)
    if (two === '//') {
      const e = code.indexOf('\n', i)
      i = e === -1 ? code.length : e
      continue
    }
    if (two === '/*') {
      const e = code.indexOf('*/', i + 2)
      i = e === -1 ? code.length : e + 2
      continue
    }
    const c = code[i]
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue }
        if (code[j] === c) { j++; break }
        if (c !== '`' && code[j] === '\n') break
        j++
      }
      out += code.slice(i, j)
      i = j
      continue
    }
    out += c
    i++
  }
  return out
}

/** Chemins (tableaux de noms) de tous les fichiers sous `parts`. */
function asarWalk(index, parts) {
  const out = []
  const rec = (node, prefix) => {
    if (node.files) {
      for (const [k, v] of Object.entries(node.files)) rec(v, [...prefix, k])
    } else if (typeof node.size === 'number') {
      out.push(prefix)
    }
  }
  const root = asarNode(index, parts)
  if (root) rec(root, [...parts])
  return out
}

if (!fs.existsSync(ASAR)) {
  console.error(`asar introuvable : ${ASAR}`)
  console.error('lancer d’abord : npm run package:win')
  process.exit(1)
}

const index = asarIndex(ASAR)
const distFiles = asarWalk(index, ['dist'])
// Seuls les fichiers texte entrent dans les chaînes contrôlées : depuis l'ajout
// de la police de repli, dist/ contient aussi des binaires (woff2, png), et les
// lire comme du texte ne ferait qu'ajouter du bruit aux recherches de motifs.
const TEXT_EXT = /\.(?:js|mjs|c?ss|html|json|txt)$/
const isText = (p) => TEXT_EXT.test(p[p.length - 1])
const bundle = distFiles.filter(isText).map((p) => asarRead(index, p) || '').join('\n')
// Le bundle du renderer (vite) seul : le code du processus principal y a ses
// propres émojis de journal, et `tsc` y laisse en plus les commentaires source.
// Les fichiers sont sous dist/renderer/assets/, d où la recherche du segment
// « assets » et non une position fixe dans le chemin.
const renderer = stripConsoleCalls(
  distFiles
    .filter((p) => p.includes('assets') && isText(p))
    .map((p) => asarRead(index, p) || '')
    .join('\n')
)
// Fichiers de police embarqués, par leur entrée dans l'index (taille connue).
const fontEntries = distFiles.filter((p) => /\.(?:woff2|woff|ttf|otf)$/.test(p[p.length - 1]))
const mainJs = asarRead(index, ['dist', 'electron', 'main.js'])
const trayJs = asarRead(index, ['dist', 'electron', 'tray.js'])
if (!bundle) {
  console.error(`✗ aucun fichier sous dist/ dans ${ASAR} : paquet vide ou index asar illisible`)
  process.exit(1)
}
if (mainJs == null) {
  console.error('✗ dist/electron/main.js introuvable dans le paquet : impossible de contrôler la garde DevTools')
  process.exit(1)
}
console.log(`asar dépaqueté : ${distFiles.length} fichiers sous dist/, bundle ${(bundle.length / 1e6).toFixed(1)} Mo, renderer ${(renderer.length / 1e6).toFixed(1)} Mo, main.js ${(mainJs.length / 1024).toFixed(0)} Ko`)

const missing = []
for (const { key, value } of EXPECTED) {
  const hasKey = bundle.includes(key)
  const hasValue = bundle.includes(value)
  const ok = hasKey && hasValue
  console.log(`${ok ? '✓' : '✗'} ${key}${verbose ? ` (valeur « ${value} » : ${hasValue ? 'oui' : 'non'}, clé : ${hasKey ? 'oui' : 'non'})` : ''}`)
  if (!ok) missing.push(key)
}

const leftovers = FORBIDDEN_IN_JSX.filter((s) => bundle.includes(s))
if (leftovers.length) {
  console.error(`✗ l'ancienne énumération rendue nue est toujours embarquée : ${leftovers.join(' | ')}`)
}

// ——— console de développement, dans le CODE du main.js embarqué ———
const mainCode = stripComments(mainJs)
const devToolsGone = DEVTOOLS_REQUIRED.filter((s) => !mainCode.includes(s))
const devToolsOpen = DEVTOOLS_FORBIDDEN.filter((s) => mainCode.includes(s))
for (const s of DEVTOOLS_REQUIRED) {
  console.log(`${mainCode.includes(s) ? '✓' : '✗'} garde DevTools embarquée : ${s}`)
}
if (devToolsGone.length) {
  console.error('✗ la garde DevTools est absente du main.js embarqué : il a été compilé sans elle (build antérieur à la correction) — relancer npm run package:win')
}
if (devToolsOpen.length) {
  console.error(`✗ console de développement ouverte dans le paquet livré : ${devToolsOpen.join(' | ')}`)
}

// ——— icône du plateau, dans le tray.js embarqué ———
const trayProblems = []
if (trayJs == null) {
  console.error('✗ dist/electron/tray.js introuvable dans le paquet : impossible de contrôler l icône du plateau')
  trayProblems.push('tray-absent')
} else {
  const trayCode = stripComments(trayJs)
  for (const s of TRAY_REQUIRED) {
    console.log(`${trayCode.includes(s) ? '✓' : '✗'} représentation 2x de l'icône du plateau : ${s}`)
  }
  const trayGone = TRAY_REQUIRED.filter((s) => !trayCode.includes(s))
  if (trayGone.length) {
    console.error(`✗ l'icône du plateau embarquée n'a pas de représentation haute densité (${trayGone.join(' | ')} absent) : ce paquet a été compilé avant le correctif Retina — relancer le build`)
    trayProblems.push('tray-2x')
  }
}

// ——— pictogrammes, dans le bundle du renderer embarqué ———
const iconProblems = []
if (!renderer) {
  console.error('✗ aucun fichier sous dist/assets : impossible de contrôler les pictogrammes')
  iconProblems.push('renderer-absent')
} else {
  for (const [glyph, what] of ICON_FORBIDDEN) {
    if (renderer.includes(glyph)) {
      console.error(`✗ émoji encore utilisé comme icône dans le paquet livré : ${what}`)
      iconProblems.push(what)
    }
  }
  const flags = renderer.match(FLAG_RANGE)
  if (flags) {
    console.error(`✗ ${flags.length} indicateur(s) régional(aux) de drapeau encore embarqué(s) : liste des langues`) 
    iconProblems.push('drapeaux')
  }
  for (const d of ICON_REQUIRED) {
    if (!renderer.includes(d)) {
      console.error(`✗ tracé SVG manquant dans le paquet (jeu d icônes non embarqué) : ${d.slice(0, 28)}…`)
      iconProblems.push('tracé')
    }
  }
  // ——— police de repli émoji, dans le paquet ———
  const tooSmall = fontEntries.filter((p) => (asarNode(index, p)?.size ?? 0) < FONT_MIN_BYTES)
  if (!fontEntries.length) {
    console.error('✗ aucune police dans le paquet : les émojis de contenu (réactions, smileys)')
    console.error('  resteront des rectangles vides sur un système sans police émoji installée')
    iconProblems.push('police-absente')
  } else if (tooSmall.length) {
    console.error(`✗ police embarquée suspectement petite : ${tooSmall.map((p) => p[p.length - 1]).join(', ')}`)
    iconProblems.push('police-petite')
  }
  const css = distFiles.filter((p) => /\.c?ss$/.test(p[p.length - 1])).map((p) => asarRead(index, p) || '').join('\n')
  if (!css.includes(FONT_FAMILY)) {
    console.error(`✗ aucune règle @font-face « ${FONT_FAMILY} » dans le CSS embarqué : la police`) 
    console.error('  est dans le paquet mais aucun élément ne peut l utiliser')
    iconProblems.push('font-face')
  }
  if (!iconProblems.length) {
    console.log(`✓ ${ICON_FORBIDDEN.length} émojis d icône éliminés, ${ICON_REQUIRED.length} tracés SVG embarqués, 0 drapeau, ` +
      `${fontEntries.length} police(s) de repli (${fontEntries.map((p) => (asarNode(index, p).size / 1024).toFixed(0)).join(' Ko, ')} Ko) déclarée dans le CSS`)
  }
}

const problems = missing.length + leftovers.length + devToolsGone.length + devToolsOpen.length + iconProblems.length + trayProblems.length
if (problems) {
  console.error(`${problems} anomalie(s) dans ${path.relative(process.cwd(), ASAR)}`)
  process.exit(1)
}
console.log(`${problems ? '✗' : '✓'} ${EXPECTED.length} libellés traduits embarqués, garde DevTools active, pictogrammes en SVG, icône du plateau en haute densité dans ${path.relative(process.cwd(), ASAR)}`)
