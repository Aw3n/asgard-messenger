// Verrou : aucune icône d'interface ne doit être dessinée par un émoji.
//
// Le défaut corrigé : « 🔐 🌐 🛡️ » comme icônes de la page d'accueil, « ❐ »
// comme bouton de restauration sous Linux, « 🤖 » comme pastille de bot. Un
// émoji est un CARACTÈRE, pas une icône : il faut une police pour le dessiner.
// Windows a Segoe UI Emoji, macOS a Apple Color Emoji, Linux n'a rien
// d'obligatoire — `fc-list | grep -ci emoji` y renvoie 0 sur une installation
// minimale, et le navigateur d'Electron remplace alors le glyphe par un
// rectangle « manquant ». L'interface perdait ses icônes sur une seule des
// trois plateformes, exactement celle où le test visuel est le moins fréquent.
//
// La règle : un pictogramme d'interface est un SVG (`src/components/ui/Icon.tsx`).
// Les émojis restent permis là où ils sont du CONTENU — ce que l'utilisateur
// tape, les réactions envoyées sur le réseau, les smileys convertis — puisque
// ces caractères voyagent d'un pair à l'autre et ne sont pas décoratifs.
//
// Caractères interdits dans l'interface :
//   U+1F000–U+1FAFF  émojis astraux (pictogrammes, drapeaux) — aucune police de base
//   U+2300–U+23FF    technique (⏱ ⏰ ⏳ ⌛) — rendu par les polices émoji seulement
//   U+2600–U+27BF    symboles divers + dingbats (✓ ★ ✅ ❌ ⚠ ) — non couverts par DejaVu
//   U+2B00–U+2BFF    flèches élargies et étoiles (⭐)
//   U+FE0F           sélecteur de variante « présentation émoji »
// La plage U+2300–U+23FF a été ajoutée après coup : « ⏱ » (U+23F1) de la fiche
// contact avait passé entre les mailles du verrou et n'a été démasquée que par
// le contrôle du paquet compilé (verify-build-labels). Un caractère à
// présentation émoji par défaut peut se trouver hors des blocs « émoji ».
// Expressions autorisées, présentes dans DejaVu Sans et donc rendues partout :
//   U+2190–U+21FF    flèches typographiques (↑ ↓ → ↵) des raccourcis clavier
//   U+25A0–U+25FF    formes géométriques (● □) des indicateurs d'état
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const ROOT = process.cwd()
const GUARDED_DIRS = ['src']
const SKIP_DIR = new Set(['node_modules', 'dist', 'release', 'coverage', 'tests'])

// Fichiers où l'émoji est une donnée, jamais une icône :
//  - MarkdownRenderer : remplace « :) » par un émoji dans LE MESSAGE de l'utilisateur
//  - MessageInput / MessageBubble : sélecteur et affichage des réactions, qui sont
//    des valeurs réseau partagées avec les autres clients
//  - translations.ts : les libellés des 25 langues. Seul « ↩ » (U+21A9) y
//    apparaît, dans le préfixe d'un message transféré ; c'est un caractère du
//    bloc Flèches, présent dans DejaVu Sans comme dans Segoe UI, donc rendu sur
//    les trois systèmes. Le U+FE0F qui le suit est « ignorable par défaut » et
//    ne dessine rien. Retirer ce préfixe toucherait 25 traductions pour zéro
//    gain visuel — le marqueur « Transféré » de la bulle fait déjà le travail.
const CONTENT_EMOJI = new Set([
  'src/features/chat/components/MarkdownRenderer.tsx',
  'src/features/chat/components/MessageInput.tsx',
  'src/features/chat/components/MessageBubble.tsx',
  'src/i18n/translations.ts',
])

const FORBIDDEN = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (extname(p) === '.tsx' || extname(p) === '.ts') out.push(p)
  }
  return out
}

const files = GUARDED_DIRS.flatMap((d) => walk(join(ROOT, d)))
const problems = []

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  if (CONTENT_EMOJI.has(rel)) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const found = line.match(FORBIDDEN)
    if (!found) return
    const t = line.trim()
    // Une trace ou un commentaire ne passe jamais devant l'utilisateur.
    if (/^(\/\/|\/\*|\*)/.test(t)) return
    if (/\b(console\.(log|warn|error|info|debug)|logMain|logRenderer|dlog|debugLog|logger\.|\blog\()\s*\(/.test(t)) return
    // La chaîne peut être construite sur une ligne puis passée à la trace sur la
    // suivante : « const warn = '…' » suivi de « console.warn(warn) ». Sans ce
    // regard, une trace ressemblerait à de l'interface.
    if (/^\s*(const|let)\s+\w*(warn|msg|message|log|err|detail|text)\w*\s*=/.test(line)) {
      const ahead = lines.slice(i + 1, i + 4).join(' ')
      if (/console\.|debugLog|logMain|dlog/.test(ahead)) return
    }
    problems.push({ rel, line: i + 1, glyphs: [...new Set(found)].join(' '), text: t.slice(0, 96) })
  })
}

// ——— deuxième contrôle : le contenu doit pouvoir être dessiné ——————————————
// Un émoji de contenu n'a pas d'équivalent SVG : c'est une donnée échangée entre
// pairs. S'il ne figure ni dans une police du système ni dans le sous-ensemble
// embarqué (assets/fonts/asgard-emoji.woff2), il s'affiche en rectangle vide sur
// les installations sans police émoji. La liste des glyphes embarqués vit dans
// scripts/emoji-subset.json : ajouter une réaction sans régénérer la police doit
// donc échouer ici, et non se découvrir un mois plus tard sur un poste Linux.
const FONT_FILE = join(ROOT, 'assets/fonts/asgard-emoji.woff2')
const SPEC_FILE = join(ROOT, 'scripts/emoji-subset.json')
// Caractères repérés par la même expression régulière mais dessinés par les
// polices de base : ils n'ont pas besoin de la police émoji.
const BASE_FONT_GLYPHS = new Map([
  ['21A9', '↩ (flèche de retour du préfixe « Transféré ») : dans DejaVu Sans et Segoe UI'],
  ['FE0F', "U+FE0F sélecteur de variante : « ignorable par défaut », ne dessine rien"],
])
const gaps = []
if (!existsSync(SPEC_FILE) || !existsSync(FONT_FILE)) {
  gaps.push(`police de repli absente : ${relative(ROOT, FONT_FILE)} — relancer python scripts/build-emoji-font.py`)
} else {
  // BOM tolere : Notepad et PowerShell en ajoutent a l'ecriture, et un echec de
  // `JSON.parse` sur ce fichier ressemblerait a une absence de police.
  const spec = JSON.parse(readFileSync(SPEC_FILE, 'utf8').replace(/^\uFEFF/, ''))
  const subset = new Set(spec.glyphs.map((g) => g.cp))
  const bytes = statSync(FONT_FILE).size
  if (bytes < 4096) gaps.push(`police de repli suspectement petite : ${bytes} octets`)
  for (const rel of CONTENT_EMOJI) {
    if (!existsSync(join(ROOT, rel))) continue
    readFileSync(join(ROOT, rel), 'utf8').split('\n').forEach((line, i) => {
      const found = line.match(FORBIDDEN)
      if (!found) return
      for (const glyph of new Set(found)) {
        const cp = glyph.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
        if (subset.has(cp) || BASE_FONT_GLYPHS.has(cp)) continue
        gaps.push(`${rel}:${i + 1}  ${glyph} (U+${cp}) n'est dans aucune police de repli`)
      }
    })
  }
}

if (problems.length > 0) {
  console.error(`Émojis utilisés comme icônes dans l'interface : ${problems.length}`)
  console.error('Un émoji dépend d une police que Linux n est pas tenu d installer :')
  console.error('le glyphe devient un rectangle vide. Utiliser <Icon name="…" />')
  console.error('(src/components/ui/Icon.tsx), qui est un tracé SVG.')
  for (const p of problems) console.error(`  ${p.rel}:${p.line}  [${p.glyphs}]  ${p.text}`)
  console.error('\nSi l un de ces émojis est du contenu (message, réaction) et non')
  console.error('une icône, l ajouter à CONTENT_EMOJI ci-dessus avec la raison.')
  process.exit(1)
}

if (gaps.length > 0) {
  console.error(`Émojis de contenu non couverts par la police embarquée : ${gaps.length}`)
  console.error('Un caractère qu aucune police installée ne sait dessiner devient un')
  console.error('rectangle vide sur un système sans police émoji (Linux neuf).')
  for (const g of gaps) console.error(`  ${g}`)
  console.error('\nLe remède : ajouter le codepoint à scripts/emoji-subset.json puis')
  console.error('régénérer la police (python scripts/build-emoji-font.py).')
  process.exit(1)
}

console.log(`aucun émoji comme icône — ${files.length} fichiers contrôlés, ${CONTENT_EMOJI.size} fichiers de contenu exclus, contenu couvert par la police de repli`)
