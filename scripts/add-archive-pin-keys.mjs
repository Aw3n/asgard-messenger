#!/usr/bin/env node
/**
 * Clés d'épinglage et d'archivage de conversation : le store savait trier les
 * épinglées et masquer les archivées, et `chat.pinConversation` /
 * `chat.archiveConversation` existaient, mais aucune action ne les exposait.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.unpinConversation', 'chat.unarchiveConversation', 'chat.archived']

const DATA = {
  fr: {
    'chat.unpinConversation': 'Désépingler la conversation',
    'chat.unarchiveConversation': 'Désarchiver la conversation',
    'chat.archived': 'Archivées',
  },
  nl: {
    'chat.unpinConversation': 'Gesprek losmaken',
    'chat.unarchiveConversation': 'Gesprek uit archief halen',
    'chat.archived': 'Gearchiveerd',
  },
  de: {
    'chat.unpinConversation': 'Unterhaltung nicht mehr anheften',
    'chat.unarchiveConversation': 'Unterhaltung aus dem Archiv holen',
    'chat.archived': 'Archiviert',
  },
  it: {
    'chat.unpinConversation': 'Rimuovi conversazione fissata',
    'chat.unarchiveConversation': 'Ripristina conversazione',
    'chat.archived': 'Archiviate',
  },
  es: {
    'chat.unpinConversation': 'Desfijar conversación',
    'chat.unarchiveConversation': 'Desarchivar conversación',
    'chat.archived': 'Archivadas',
  },
  pt: {
    'chat.unpinConversation': 'Desafixar conversa',
    'chat.unarchiveConversation': 'Desarquivar conversa',
    'chat.archived': 'Arquivadas',
  },
  el: {
    'chat.unpinConversation': 'Αποκαρφίτσωση συνομιλίας',
    'chat.unarchiveConversation': 'Επαναφορά συνομιλίας από αρχείο',
    'chat.archived': 'Αρχειοθετημένες',
  },
  da: {
    'chat.unpinConversation': 'Fjern fastgørelse af samtale',
    'chat.unarchiveConversation': 'Gendan samtale fra arkiv',
    'chat.archived': 'Arkiverede',
  },
  fi: {
    'chat.unpinConversation': 'Poista keskustelu kiinnityksestä',
    'chat.unarchiveConversation': 'Palauta keskustelu arkistosta',
    'chat.archived': 'Arkistoidut',
  },
  sv: {
    'chat.unpinConversation': 'Ta bort fästning av konversation',
    'chat.unarchiveConversation': 'Återställ konversation från arkiv',
    'chat.archived': 'Arkiverade',
  },
  hr: {
    'chat.unpinConversation': 'Odkvači razgovor',
    'chat.unarchiveConversation': 'Vrati razgovor iz arhive',
    'chat.archived': 'Arhivirano',
  },
  et: {
    'chat.unpinConversation': 'Eemalda vestluse kinnitus',
    'chat.unarchiveConversation': 'Taasta vestlus arhiivist',
    'chat.archived': 'Arhiveeritud',
  },
  hu: {
    'chat.unpinConversation': 'Beszélgetés rögzítésének feloldása',
    'chat.unarchiveConversation': 'Beszélgetés visszaállítása az archívumból',
    'chat.archived': 'Archivált',
  },
  lv: {
    'chat.unpinConversation': 'Atspraust sarunu',
    'chat.unarchiveConversation': 'Atjaunot sarunu no arhīva',
    'chat.archived': 'Arhivētās',
  },
  lt: {
    'chat.unpinConversation': 'Atsegti pokalbį',
    'chat.unarchiveConversation': 'Grąžinti pokalbį iš archyvo',
    'chat.archived': 'Archyvuoti',
  },
  mt: {
    'chat.unpinConversation': 'Neħħi l-konverżazzjoni mill-pin',
    'chat.unarchiveConversation': "Erġa' ġib il-konverżazzjoni mill-arkivju",
    'chat.archived': 'Arkivjati',
  },
  pl: {
    'chat.unpinConversation': 'Odepnij rozmowę',
    'chat.unarchiveConversation': 'Przywróć rozmowę z archiwum',
    'chat.archived': 'Zarchiwizowane',
  },
  sk: {
    'chat.unpinConversation': 'Odopnúť konverzáciu',
    'chat.unarchiveConversation': 'Obnoviť konverzáciu z archívu',
    'chat.archived': 'Archivované',
  },
  sl: {
    'chat.unpinConversation': 'Odpni pogovor',
    'chat.unarchiveConversation': 'Obnovi pogovor iz arhiva',
    'chat.archived': 'Arhivirano',
  },
  cs: {
    'chat.unpinConversation': 'Odepnout konverzaci',
    'chat.unarchiveConversation': 'Obnovit konverzaci z archivu',
    'chat.archived': 'Archivované',
  },
  bg: {
    'chat.unpinConversation': 'Откачи разговор',
    'chat.unarchiveConversation': 'Възстанови разговор от архива',
    'chat.archived': 'Архивирани',
  },
  ga: {
    'chat.unpinConversation': 'Díphionnáil comhrá',
    'chat.unarchiveConversation': 'Aisghnóthaigh comhrá ón gcartlann',
    'chat.archived': 'Cartlannaithe',
  },
  ro: {
    'chat.unpinConversation': 'Anulează fixarea conversației',
    'chat.unarchiveConversation': 'Restaurează conversația din arhivă',
    'chat.archived': 'Arhivate',
  },
  en: {
    'chat.unpinConversation': 'Unpin conversation',
    'chat.unarchiveConversation': 'Unarchive conversation',
    'chat.archived': 'Archived',
  },
  uk: {
    'chat.unpinConversation': 'Відкріпити розмову',
    'chat.unarchiveConversation': 'Відновити розмову з архіву',
    'chat.archived': 'Архівовані',
  },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

const marks = []
lines.forEach((line, i) => {
  const m = /^ {2}([a-z]{2}): \{\s*$/.exec(line)
  if (m) marks.push({ code: m[1], i })
})

const known = Object.keys(DATA)
const missing = known.filter((c) => !marks.some((m) => m.code === c))
if (missing.length) {
  console.error(`✗ locale blocks not found in translations.ts: ${missing.join(', ')}`)
  process.exit(1)
}
const unknownBlocks = marks.filter((m) => !known.includes(m.code)).map((m) => m.code)
if (unknownBlocks.length) {
  console.error(`✗ translations.ts has locales without data: ${unknownBlocks.join(', ')}`)
  process.exit(1)
}

let replaced = 0
let inserted = 0

for (let b = marks.length - 1; b >= 0; b--) {
  const code = marks[b].code
  const start = marks[b].i + 1
  const end = b + 1 < marks.length ? marks[b + 1].i : lines.length
  const block = lines.slice(start, end)
  const table = DATA[code]
  const pending = []

  for (const key of KEYS) {
    const line = `      "${key}": "${escapeValue(table[key])}",`
    const re = new RegExp('^[ \\t]*"' + key.replace(/\./g, '\\.') + '":\\s*"(?:[^"\\\\]|\\\\.)*",?[ \\t]*$')
    const at = block.findIndex((l) => re.test(l))
    if (at >= 0) {
      if (block[at] !== line) { block[at] = line; replaced++ }
    } else {
      pending.push(line)
    }
  }

  if (pending.length) {
    let close = -1
    for (let i = block.length - 1; i >= 0; i--) {
      if (/^ {4}\}\s*,?\s*$/.test(block[i])) { close = i; break }
    }
    if (close < 0) {
      console.error(`✗ could not find the closing brace of the translation object in the ${code} block`)
      process.exit(1)
    }
    block.splice(close, 0, ...pending)
    inserted += pending.length
  }

  lines.splice(start, end - start, ...block)
}

writeFileSync(file, lines.join(eol), 'utf8')
console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
