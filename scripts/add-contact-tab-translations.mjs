/**
 * add-contact-tab-translations.mjs — ajoute `contacts.tabBlocked` aux 25 langues.
 *
 * Contexte : les quatre onglets de la page Contacts étaient rendus bruts
 * (`'all' | 'online' | 'favorites' | 'blocked'`), donc affichés en anglais.
 * Trois libellés existent déjà ailleurs dans le catalogue et sont réutilisés
 * tels quels par le composant (`settings.all`, `common.online`,
 * `settings.favorites`) — recopier ces valeurs aurait créé des entrées
 * redondantes qui dérivent à la première retouche. Le quatrième, « Bloqués »,
 * n'existait nulle part sous forme d'étiquette autonome (`contacts.blocked`
 * est une phrase de notification : « Contact bloqué ») ; il est donc ajouté
 * ici, au pluriel, dans les 25 langues livrées.
 *
 * Ancre : la ligne `contacts.noBlockedContacts`, présente dans chaque bloc de
 * langue. Le script est idempotent (il saute une langue qui porte déjà la clé)
 * et refuse d'écrire si une langue du catalogue manque dans les données.
 *
 * Utilisation : node scripts/add-contact-tab-translations.mjs [--dry-run]
 */
import fs from 'node:fs'

const file = 'src/i18n/translations.ts'
const KEY = 'contacts.tabBlocked'
const ANCHOR = '"contacts.noBlockedContacts"'

// Accord au pluriel, comme dans `contacts.noBlockedContacts` de chaque langue.
const VALUES = {
  fr: 'Bloqués',
  en: 'Blocked',
  nl: 'Geblokkeerd',
  de: 'Blockiert',
  it: 'Bloccati',
  es: 'Bloqueados',
  pt: 'Bloqueados',
  el: 'Αποκλεισμένοι',
  da: 'Blokerede',
  fi: 'Estetyt',
  sv: 'Blockerade',
  hr: 'Blokirani',
  et: 'Blokeeritud',
  hu: 'Blokkolt',
  lv: 'Bloķēti',
  lt: 'Užblokuoti',
  mt: 'Mblukkati',
  pl: 'Zablokowane',
  sk: 'Zablokované',
  sl: 'Blokirani',
  cs: 'Zablokované',
  bg: 'Блокирани',
  ga: 'Blocáilte',
  ro: 'Blocați',
  uk: 'Заблоковані',
}

const dryRun = process.argv.includes('--dry-run')
let src = fs.readFileSync(file, 'utf8')

// Découpe en blocs de langue comme le fichier : `  xx: {` en début de ligne
const sections = []
for (const m of src.matchAll(/^  ([a-z]{2}): \{/gm)) sections.push({ lang: m[1], start: m.index })
if (!sections.length) {
  console.error('aucun bloc de langue repéré dans', file)
  process.exit(1)
}

const missing = sections.filter((s) => !Object.prototype.hasOwnProperty.call(VALUES, s.lang))
if (missing.length) {
  console.error(`pas de traduction prévue pour : ${missing.map((s) => s.lang).join(', ')}`)
  process.exit(1)
}
const unused = Object.keys(VALUES).filter((l) => !sections.some((s) => s.lang === l))
if (unused.length) console.warn(`avertissement : ${unused.join(', ')} absent du catalogue`)

const insertions = []
for (const s of sections) {
  const next = sections.find((x) => x.start > s.start)
  const end = next ? next.start : src.length
  const block = src.slice(s.start, end)

  if (block.includes(JSON.stringify(KEY))) {
    console.log(`${s.lang}: déjà présent`)
    continue
  }
  const at = block.indexOf(ANCHOR)
  if (at === -1) {
    console.error(`ancre ${ANCHOR} introuvable dans le bloc ${s.lang}`)
    process.exit(1)
  }
  const lineEnd = block.indexOf('\n', at)
  insertions.push({
    lang: s.lang,
    pos: s.start + lineEnd + 1,
    text: `      ${JSON.stringify(KEY)}: ${JSON.stringify(VALUES[s.lang])},\n`,
  })
}

// Insertions par position décroissante : les offsets du début restent valides
insertions.sort((a, b) => b.pos - a.pos)
for (const ins of insertions) src = src.slice(0, ins.pos) + ins.text + src.slice(ins.pos)

if (dryRun) {
  console.log(`--dry-run : ${insertions.length} entrées auraient été insérées`)
  process.exit(0)
}

fs.writeFileSync(file, src)
console.log(`Inséré ${KEY} dans ${insertions.length} blocs de langue`)
