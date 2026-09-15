/**
 * add-ui-labels-translations.mjs — ajoute aux 25 langues les étiquettes
 * d'interface que le sondeur `find-hardcoded-labels.mjs` a trouvées rendues en
 * anglais en dur, et pour lesquelles le catalogue ne proposait rien.
 *
 * Sept clés, deux groupes :
 *   search.navigate / search.open / search.resultsCount
 *     — pied de la recherche globale (Ctrl+K) : « ↑↓ Navigate », « ↵ Open » et
 *       le compteur « N results ». (« ESC » reste tel quel : c'est une touche,
 *       pas un mot.)
 *   settings.fontSize / fontSmall / fontMedium / fontLarge
 *     — bloc Apparence : « Font Size » et les trois boutons qui rendaient
 *       `small` / `medium` / `large`.
 *
 * Les autres libellés dénichés réutilisent des clés déjà complètes et ne
 * passent donc pas par ici : `settings.theme`, `settings.dark|light|system`
 * (créées de longue date et jamais câblées), `common.muted`,
 * `groups.broadcastModeHint`, `search.contacts|messages`.
 *
 * Deux choix de rédaction valent d'être expliqués :
 *
 * 1. Le compteur s'écrit « Résultats : 12 » (`Résultats : {{count}}`) et non
 *    « 12 résultats ». i18next en version 26 résout les pluriels avec les
 *    suffixes `_one`/`_other` (et `_few`, `_two`, `_many` selon la langue) :
 *    les 25 clés `*_plural` déjà présentes dans le catalogue —
 *    `settings.totalDownloads_plural` et consorts — ne sont donc jamais lues,
 *    et le compteur afficherait toujours le singulier. Écrire « 2 resultater »
 *    en danois ou « 3 výsledok » en tchèque serait un faux ami ; la tournure
 *    avec deux-points est grammaticelle pour n'importe quelle valeur, dans les
 *    25 langues, avec une seule clé.
 *
 * 2. Les adjectifs de taille s'accordent avec le nom de chaque langue
 *    (« taille » féminin en français, « rozmiar » masculin en polonais,
 *    « Μέγεθος » neutre en grec), comme le font déjà `calls.quality*`.
 *
 * Le style suit `add-keet-id-translations.mjs` : ancre par bloc de langue,
 * insertion idempotente, refus d'écrire si une langue du catalogue manque.
 *
 * Utilisation : node scripts/add-ui-labels-translations.mjs [--dry-run]
 *              node scripts/add-ui-labels-translations.mjs --remove
 *              (retire les lignes des clés du fichier, pour réécrire proprement)
 */
import fs from 'node:fs'

const file = 'src/i18n/translations.ts'

const GROUPS = [
  {
    anchor: '"search.noResults"',
    keys: ['search.navigate', 'search.open', 'search.resultsCount'],
    T: {
      fr: ['Naviguer', 'Ouvrir', 'Résultats : {{count}}'],
      nl: ['Navigeren', 'Openen', 'Resultaten: {{count}}'],
      de: ['Navigieren', 'Öffnen', 'Ergebnisse: {{count}}'],
      it: ['Naviga', 'Apri', 'Risultati: {{count}}'],
      es: ['Navegar', 'Abrir', 'Resultados: {{count}}'],
      pt: ['Navegar', 'Abrir', 'Resultados: {{count}}'],
      el: ['Πλοήγηση', 'Άνοιγμα', 'Αποτελέσματα: {{count}}'],
      da: ['Naviger', 'Åbn', 'Resultater: {{count}}'],
      fi: ['Siirry', 'Avaa', 'Tulokset: {{count}}'],
      sv: ['Navigera', 'Öppna', 'Resultat: {{count}}'],
      hr: ['Navigacija', 'Otvori', 'Rezultati: {{count}}'],
      et: ['Liikumine', 'Ava', 'Tulemusi: {{count}}'],
      hu: ['Navigálás', 'Megnyitás', 'Találatok: {{count}}'],
      lv: ['Navigācija', 'Atvērt', 'Rezultāti: {{count}}'],
      lt: ['Naršyti', 'Atidaryti', 'Rezultatai: {{count}}'],
      mt: ['Navigazzjoni', 'Iftaħ', 'Riżultati: {{count}}'],
      pl: ['Nawigacja', 'Otwórz', 'Wyniki: {{count}}'],
      sk: ['Navigácia', 'Otvoriť', 'Výsledky: {{count}}'],
      sl: ['Premikanje', 'Odpri', 'Zadetki: {{count}}'],
      cs: ['Navigace', 'Otevřít', 'Výsledky: {{count}}'],
      bg: ['Навигация', 'Отваряне', 'Резултати: {{count}}'],
      ga: ['Nascleanúint', 'Oscail', 'Torthaí: {{count}}'],
      ro: ['Navigare', 'Deschide', 'Rezultate: {{count}}'],
      en: ['Navigate', 'Open', 'Results: {{count}}'],
      uk: ['Навігація', 'Відкрити', 'Результати: {{count}}'],
    },
  },
  {
    anchor: '"settings.theme"',
    keys: ['settings.fontSize', 'settings.fontSmall', 'settings.fontMedium', 'settings.fontLarge'],
    T: {
      fr: ['Taille du texte', 'Petite', 'Moyenne', 'Grande'],
      nl: ['Tekengrootte', 'Klein', 'Gemiddeld', 'Groot'],
      de: ['Schriftgröße', 'Klein', 'Mittel', 'Groß'],
      it: ['Dimensione del testo', 'Piccola', 'Media', 'Grande'],
      es: ['Tamaño del texto', 'Pequeño', 'Mediano', 'Grande'],
      pt: ['Tamanho do texto', 'Pequeno', 'Médio', 'Grande'],
      el: ['Μέγεθος κειμένου', 'Μικρό', 'Μεσαίο', 'Μεγάλο'],
      da: ['Tekststørrelse', 'Lille', 'Mellem', 'Stor'],
      fi: ['Tekstin koko', 'Pieni', 'Keskisuuri', 'Suuri'],
      sv: ['Textstorlek', 'Liten', 'Medel', 'Stor'],
      hr: ['Veličina teksta', 'Mala', 'Srednja', 'Velika'],
      et: ['Teksti suurus', 'Väike', 'Keskmine', 'Suur'],
      hu: ['Szövegméret', 'Kicsi', 'Közepes', 'Nagy'],
      lv: ['Teksta izmērs', 'Mazs', 'Vidējs', 'Liels'],
      lt: ['Teksto dydis', 'Mažas', 'Vidutinis', 'Didelis'],
      mt: ['Daqs tat-test', 'Żgħir', 'Medju', 'Kbir'],
      pl: ['Rozmiar tekstu', 'Mały', 'Średni', 'Duży'],
      sk: ['Veľkosť textu', 'Malá', 'Stredná', 'Veľká'],
      sl: ['Velikost pisave', 'Majhna', 'Srednja', 'Velika'],
      cs: ['Velikost písma', 'Malá', 'Střední', 'Velká'],
      bg: ['Размер на шрифта', 'Малък', 'Среден', 'Голям'],
      ga: ['Méid cló', 'Beag', 'Meán', 'Mór'],
      ro: ['Dimensiune text', 'Mică', 'Medie', 'Mare'],
      en: ['Font Size', 'Small', 'Medium', 'Large'],
      uk: ['Розмір шрифту', 'Малий', 'Середній', 'Великий'],
    },
  },
]

// clés historiques posées par une première version de ce script, dont la forme
// « {{count}} résultats » ne peut pas s'accorder : retirées avec les autres
const OBSOLETE = ['search.resultsCount_plural']

const ALL_KEYS = [...GROUPS.flatMap((g) => g.keys), ...OBSOLETE]
const argv = process.argv.slice(2)

let src = fs.readFileSync(file, 'utf8')

/** Supprime toutes les lignes portant l'une des clés du script. */
function removeInserted() {
  const keep = []
  let removed = 0
  for (const line of src.split('\n')) {
    const key = line.match(/^      "((?:[^"\\]|\\.)+)":/)?.[1]
    if (key && ALL_KEYS.includes(key)) { removed++; continue }
    keep.push(line)
  }
  if (!removed) {
    console.log('rien à retirer')
    return false
  }
  src = keep.join('\n')
  fs.writeFileSync(file, src)
  console.log(`Retiré ${removed} lignes (${ALL_KEYS.length} clés recherchées)`)
  return true
}

if (argv.includes('--remove')) {
  if (!removeInserted()) process.exit(0)
  // on repart du fichier nettoyé pour la réécriture demandée explicitement
  if (!argv.includes('--reinject')) process.exit(0)
}

const sections = []
for (const m of src.matchAll(/^  ([a-z]{2}): \{/gm)) sections.push({ lang: m[1], start: m.index })
if (!sections.length) {
  console.error('aucun bloc de langue repéré dans', file)
  process.exit(1)
}

// aucune langue ne doit manquer : sinon elle resterait en anglais et le
// `fallbackLng: 'fr'` masquerait l'oubli à l'écran
for (const group of GROUPS) {
  const missing = sections.filter((s) => !group.T[s.lang]).map((s) => s.lang)
  if (missing.length) {
    console.error(`${group.keys[0]} : pas de valeur pour ${missing.join(', ')}`)
    process.exit(1)
  }
}

const insertions = []
for (const s of sections) {
  const next = sections.find((x) => x.start > s.start)
  const end = next ? next.start : src.length
  const block = src.slice(s.start, end)

  for (const group of GROUPS) {
    const values = group.T[s.lang]
    if (values.length !== group.keys.length) {
      console.error(`${s.lang}: ${values.length} valeurs pour ${group.keys.length} clés — abandon`)
      process.exit(1)
    }
    if (block.includes(JSON.stringify(group.keys[0]))) {
      console.log(`${s.lang} [${group.keys[0]}]: déjà présent`)
      continue
    }
    const at = block.indexOf(group.anchor)
    if (at === -1) {
      console.error(`ancre ${group.anchor} introuvable dans le bloc ${s.lang} — abandon`)
      process.exit(1)
    }
    const lineEnd = block.indexOf('\n', at)
    const text = group.keys.map((k, i) => `      ${JSON.stringify(k)}: ${JSON.stringify(values[i])},\n`).join('')
    insertions.push({ lang: s.lang, pos: s.start + lineEnd + 1, text })
  }
}

insertions.sort((a, b) => b.pos - a.pos)
for (const ins of insertions) src = src.slice(0, ins.pos) + ins.text + src.slice(ins.pos)

if (argv.includes('--dry-run')) {
  console.log(`--dry-run : ${insertions.length} groupes seraient insérés`)
  process.exit(0)
}

fs.writeFileSync(file, src)
const entries = insertions.reduce((n, i) => n + i.text.split('\n').filter(Boolean).length, 0)
console.log(`Inséré ${entries} entrées dans ${insertions.length} blocs de langue`)
