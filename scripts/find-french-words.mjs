import fs from 'fs'

const transPath = 'src/i18n/translations.ts'
const content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

const languages = ['nl', 'de', 'it', 'es', 'pt', 'el', 'da', 'fi', 'sv', 'hr', 'et', 'hu', 'lv', 'lt', 'mt', 'pl', 'sk', 'sl', 'cs', 'bg', 'ga', 'ro', 'uk']

// Mots français courants à détecter
const frenchWords = [
  'Aujourd', 'Hier', 'Il y a', 'jours', 'heures', 'minutes', 'instant',
  'Mis à jour', 'Recherche', 'restant', 'restantes', 'Votre', 'Leur',
  'Envoyer', 'Recevoir', 'Ajouter', 'Supprimer', 'Annuler', 'Valider',
  'Paramètres', 'Profil', 'Sécurité', 'Réseau', 'Fichiers', 'Messages',
  'Contacts', 'Groupes', 'Appels', 'Bienvenue', 'Merci', 'Bonjour',
  'Bonsoir', 'Nuit', 'Jour', 'Semaine', 'Mois', 'Année', 'Heure',
  'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche',
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet',
  'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

const langHeaderRe = /^\s{2}(\w+):\s*\{$/
const langValues = {}
let currentLang = null

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(langHeaderRe)
  if (m) { currentLang = m[1]; langValues[currentLang] = []; continue }
  if (!currentLang) continue
  const keyMatch = lines[i].match(/^(\s{6})"([^"]+)":\s*"(.*)"(,?)\s*$/)
  if (keyMatch) {
    langValues[currentLang].push({ key: keyMatch[2], value: keyMatch[3], line: i + 1 })
  }
}

// Pour chaque langue, trouver les valeurs qui contiennent des mots français
console.log('=== FRENCH WORDS DETECTED IN NON-FR LANGUAGES ===\n')
for (const lang of languages) {
  const frenchFound = []
  for (const entry of langValues[lang] || []) {
    for (const word of frenchWords) {
      if (entry.value.includes(word)) {
        frenchFound.push({ key: entry.key, value: entry.value, word, line: entry.line })
        break
      }
    }
  }
  if (frenchFound.length > 0) {
    console.log(`\n${lang.toUpperCase()} (${frenchFound.length} entries with French words):`)
    for (const f of frenchFound.slice(0, 20)) {
      console.log(`  L${f.line}: ${f.key} = "${f.value}" [contains: ${f.word}]`)
    }
    if (frenchFound.length > 20) {
      console.log(`  ... and ${frenchFound.length - 20} more`)
    }
  }
}
