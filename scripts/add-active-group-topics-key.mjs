/**
 * Ajoute la clé « calls.activeGroupTopics » dans les 25 langues.
 * Run: node scripts/add-active-group-topics-key.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const translationsPath = path.join(__dirname, '..', 'src', 'i18n', 'translations.ts')

const newTranslations = {
  fr: 'Groupes actifs : {{total}}',
  nl: 'Actieve groepen: {{total}}',
  de: 'Aktive Gruppen: {{total}}',
  it: 'Gruppi attivi: {{total}}',
  es: 'Grupos activos: {{total}}',
  pt: 'Grupos ativos: {{total}}',
  el: 'Ενεργές ομάδες: {{total}}',
  da: 'Aktive grupper: {{total}}',
  fi: 'Aktiiviset ryhmät: {{total}}',
  sv: 'Aktiva grupper: {{total}}',
  hr: 'Aktivne grupe: {{total}}',
  et: 'Aktiivsed grupid: {{total}}',
  hu: 'Aktív csoportok: {{total}}',
  lv: 'Aktīvās grupas: {{total}}',
  lt: 'Aktyvios grupės: {{total}}',
  mt: 'Gruppi attivi: {{total}}',
  pl: 'Aktywne grupy: {{total}}',
  sk: 'Aktívne skupiny: {{total}}',
  sl: 'Aktivne skupine: {{total}}',
  cs: 'Aktivní skupiny: {{total}}',
  bg: 'Активни групи: {{total}}',
  ga: 'Grúpaí gníomhacha: {{total}}',
  ro: 'Grupuri active: {{total}}',
  en: 'Active groups: {{total}}',
  uk: 'Активні групи: {{total}}',
}

const langOrder = Object.keys(newTranslations)
let content = fs.readFileSync(translationsPath, 'utf-8')
const lines = content.split('\n')

let langIndex = 0
for (let i = 0; i < lines.length && langIndex < langOrder.length; i++) {
  if (lines[i].includes('"calls.groupCall"')) {
    const lang = langOrder[langIndex]
    lines.splice(i + 1, 0, `      "calls.activeGroupTopics": "${newTranslations[lang]}",`)
    console.log(`added calls.activeGroupTopics for ${lang}`)
    i++
    langIndex++
  }
}

if (langIndex !== langOrder.length) {
  throw new Error(`expected ${langOrder.length} blocks, found ${langIndex}`)
}

fs.writeFileSync(translationsPath, lines.join('\n'), 'utf-8')
