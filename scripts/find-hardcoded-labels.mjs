/**
 * find-hardcoded-labels.mjs — cherche les libellés en dur dans le JSX.
 *
 * La famille de défaut qui a touché les onglets Contacts : un mot anglais est
 * rendu tel quel à l'écran (`{t}` d'un identifiant d'énumération,
 * `<label>Theme</label>`), et aucun audit ne le voit parce qu'il n'y a aucun
 * appel `t()` à contrôler. Ce sondeur ne vérifie que les emplacements où du
 * texte est destiné à l'utilisateur, et refuse le reste (classes Tailwind,
 * chemins d'icônes, valeurs techniques).
 *
 * Sortie : une liste de candidats à trier à la main. Elle n'est pas un verdict
 * — un libellé technique (« MP3 », « KB/s ») peut légitimement rester.
 *
 * Utilisation : node scripts/find-hardcoded-labels.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'tests') continue
      walk(full, acc)
    } else if (/\.tsx$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

/** Attributs dont la valeur est affichée telle quelle */
const TEXT_ATTRS = ['label', 'placeholder', 'title', 'aria-label', 'alt', 'tooltip', 'subtitle', 'header']

/** Termes techniques acceptables en toutes langues */
const TECHNICAL = /^(https?:|#[0-9a-f]{3,8}$|px|ms|kb|mb|gb|bps|kbps|mbps|e2e|p2p|ip|dns|id|url|api|mp3|ogg|wav|opus|vp8|h264|sha|hex|utf|zbase|zbase32|dht|udp|tcp|wss?|ssl|tls|peer|keet|pear|asgard|hypercore|hyperdrive|json|png|jpg|jpeg|gif|webp|pdf|zip|tar|gz|svg|ico|icns|exe|deb|rpm|yml|md|on|off|auto|\+|-|\/|\*|:|×|•|\d)/i

/** Mention de marque ou de copyright, identique dans toutes les langues. */
const BRAND_ONLY = /^©?\s*\d{0,4}\s*Asgard[\s.·-]*$/i

/**
 * Retire les expressions `{…}` d'une ligne pour ne garder que le texte JSX.
 * Un compteur de profondeur suffit : les accolades rencontrées dans le JSX
 * sont équilibrées sur la même ligne.
 */
export function stripExpressions(line) {
  let out = ''
  let depth = 0
  for (const char of line) {
    if (char === '{') depth += 1
    else if (char === '}') depth = Math.max(0, depth - 1)
    else if (depth === 0) out += char
  }
  return out
}

/**
 * Un libellé peut être mêlé à une expression dans le même élément :
 * `<span>{count} active group</span>`. Ni la règle « enfant texte » (le texte
 * ne commence pas la balise) ni la règle « ligne seule » ne le voient.
 * Retourne le texte restant d'un élément à texte, ou null.
 */
export function mixedTextLabel(line) {
  const stripped = stripExpressions(line)
  const m = stripped.match(
    /<(span|p|button|label|h1|h2|h3|h4|strong|em|small|li|a|legend|figcaption|option)\b[^>]*>([^<>]*)</,
  )
  if (!m) return null
  const value = m[2].trim()
  if (!/[A-Za-z]{3,}/.test(value)) return null
  if (TECHNICAL.test(value) || BRAND_ONLY.test(value)) return null
  return value
}

/** Le sondeur ne vaut que s'il retrouve une faute connue et épargne un `t()`. */
const SELF_TESTS = [
  { label: 'texte mêlé à une expression', line: '<span>{count} active group</span>', expected: 'active group' },
  { label: 'clé traduite', line: "<span>{t('calls.activeGroupTopics', { total: count })}</span>", expected: null },
  { label: 'unité technique', line: '<span>{size} MB/s</span>', expected: null },
  { label: 'phrase après une expression', line: '<p>{n} jours restants</p>', expected: 'jours restants' },
]

for (const test of SELF_TESTS) {
  const got = mixedTextLabel(test.line)
  if (got !== test.expected) {
    console.error(`find-hardcoded-labels — auto-test raté (${test.label}) : attendu ${JSON.stringify(test.expected)}, obtenu ${JSON.stringify(got)}`)
    process.exit(1)
  }
}

const findings = []

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/')
  const lines = fs.readFileSync(file, 'utf8').split('\n')

  lines.forEach((line, idx) => {
    const n = idx + 1
    // Un commentaire peut citer des balises (« un <p> côte à côte ») : il ne
    // rend rien à l'écran.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return

    // 1. attribut texte littéral : label="Theme", title="Add contact"…
    for (const attr of TEXT_ATTRS) {
      const m = line.match(new RegExp(`\\b${attr}="([^"]{2,})"`))
      if (!m) continue
      const value = m[1]
      if (!/[A-Za-z]{2}/.test(value)) continue
      if (TECHNICAL.test(value.trim())) continue
      findings.push(`${rel}:${n}  ${attr}="${value}"`)
    }

    // 2. enfant texte d'un élément : <label>Theme</label>, <h3>Settings</h3>
    const child = line.match(/>([A-Za-z][A-Za-z0-9 .'’\-?]{2,})<\/(h1|h2|h3|h4|label|span|p|button|strong|em|div|option|legend|figcaption)>/)
    if (child) {
      const value = child[1].trim()
      if (value && !TECHNICAL.test(value) && /\s|[A-Z]/.test(value)) findings.push(`${rel}:${n}  texte « ${value} »`)
    }

    // 3. rendu nu d'un paramètre de boucle : .map((x) => … {x}
    const bare = line.match(/^\s*\{([a-z][A-Za-z0-9_]*)\}\s*$/)
    if (bare && !['t', 'i'].includes(bare[1])) {
      const before = lines.slice(Math.max(0, idx - 12), idx).join('\n')
      if (/\.map\(/.test(before) && !/\bt\s*\(|labelKey|\blabel\b|format|toFixed|Math\.|\.name|\.id\b/.test(before)) {
        findings.push(`${rel}:${n}  rendu nu « {${bare[1]}} » dans un .map() — identifiant traduit ?`)
      }
    }
    // 4. texte sur sa propre ligne, entre une balise ouvrante et fermante :
    //      <label className="…">
    //        Theme
    //      </label>
    //   le motif exact des étiquettes oubliées, que la règle 2 ne voit pas
    const trimmed = line.trim()
    if (/^[A-Za-z][A-Za-z0-9 .'\-?]{2,}$/.test(trimmed) && idx > 0 && idx + 1 < lines.length) {
      const prev = lines.slice(0, idx).map((l) => l.trim()).filter(Boolean).pop() ?? ''
      const next = lines.slice(idx + 1).map((l) => l.trim()).filter(Boolean)[0] ?? ''
      const betweenTags = />$/.test(prev) && /^<\//.test(next)
      const looksProse = /\s/.test(trimmed) || /^[A-Z]/.test(trimmed)
      if (betweenTags && looksProse && !TECHNICAL.test(trimmed)) {
        findings.push(`${rel}:${n}  texte « ${trimmed} » (entre balises)`)
      }
    }

    // 5. texte mêlé à des expressions : <span>{count} active group</span>.
    //   Les règles 2 et 4 exigent un texte isolé ; la faute du bandeau d'appels
    //   (« {n} active group ») leur échappait.
    const mixed = mixedTextLabel(line)
    if (mixed) findings.push(`${rel}:${n}  texte mêlé à une expression « ${mixed} »`)
  })
}

const report = [`find-hardcoded-labels — ${findings.length} candidat(s) à trier`, ...findings.map((f) => '  ' + f)].join('\n')
// Le rapport s'écrit directement en UTF-8 : passé par le shell, l'accent se
// ferait transcoder deux fois et le tri se ferait sur du texte illisible.
fs.writeFileSync(path.join(ROOT, 'scripts', 'hardcoded-labels-report.txt'), report + '\n')
console.log(`${findings.length} candidat(s) → scripts/hardcoded-labels-report.txt`)
