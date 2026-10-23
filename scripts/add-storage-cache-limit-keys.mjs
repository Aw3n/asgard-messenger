#!/usr/bin/env node
/**
 * Adds the storage-ceiling labels (settings.cacheLimitLabel / cacheLimitDesc /
 * cacheLimitReached / autoDownloadDocumentsDesc) to all 25 supported languages
 * of src/i18n/translations.ts.
 *
 * Why this wording : la barre « utilisé sur 500 MB » du panneau Stockage affichait
 * un plafond que rien n'appliquait, et aucune commande ne le réglait ; la bascule
 * « images » n'était pas lue par FileService. Les trois libellés du plafond
 * décrivent donc ce qui se passe vraiment — on refuse, on ne purge rien — et le
 * quatrième achève le groupe des bascules par type, dont les documents étaient
 * le seul lecteur sans interrupteur.
 *
 * Same in-place algorithm as add-voice-pause-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = [
  'settings.cacheLimitLabel',
  'settings.cacheLimitDesc',
  'settings.cacheLimitReached',
  'settings.autoDownloadDocumentsDesc',
]

const DATA = {
  fr: {
    'settings.cacheLimitLabel': 'Plafond du cache',
    'settings.cacheLimitDesc': 'Au-delà de ce plafond, les nouvelles pièces jointes ne se téléchargent plus automatiquement. Rien n’est supprimé : elles restent accessibles au clic.',
    'settings.cacheLimitReached': 'Cache plein ({{limit}} Mo) : les nouvelles pièces jointes attendront un clic.',
    'settings.autoDownloadDocumentsDesc': 'Télécharger automatiquement les documents',
  },
  en: {
    'settings.cacheLimitLabel': 'Cache limit',
    'settings.cacheLimitDesc': 'Above this limit, new attachments no longer download automatically. Nothing is deleted — they stay available with a click.',
    'settings.cacheLimitReached': 'Cache full ({{limit}} MB): new attachments will wait for a click.',
    'settings.autoDownloadDocumentsDesc': 'Automatically download documents',
  },
  nl: {
    'settings.cacheLimitLabel': 'Cachelimiet',
    'settings.cacheLimitDesc': 'Boven deze limiet worden nieuwe bijlagen niet meer automatisch gedownload. Er wordt niets verwijderd — ze blijven met een klik beschikbaar.',
    'settings.cacheLimitReached': 'Cache vol ({{limit}} MB): nieuwe bijlagen wachten op een klik.',
    'settings.autoDownloadDocumentsDesc': 'Documenten automatisch downloaden',
  },
  de: {
    'settings.cacheLimitLabel': 'Grenze für den Cache',
    'settings.cacheLimitDesc': 'Oberhalb dieser Grenze werden neue Anhänge nicht mehr automatisch heruntergeladen. Es wird nichts gelöscht — sie bleiben per Klick verfügbar.',
    'settings.cacheLimitReached': 'Cache voll ({{limit}} MB): neue Anhänge warten auf einen Klick.',
    'settings.autoDownloadDocumentsDesc': 'Dokumente automatisch herunterladen',
  },
  it: {
    'settings.cacheLimitLabel': 'Limite della cache',
    'settings.cacheLimitDesc': 'Oltre questo limite i nuovi allegati non si scaricano più automaticamente. Nulla viene eliminato: restano disponibili con un clic.',
    'settings.cacheLimitReached': 'Cache piena ({{limit}} MB): i nuovi allegati aspetteranno un clic.',
    'settings.autoDownloadDocumentsDesc': 'Scarica automaticamente i documenti',
  },
  es: {
    'settings.cacheLimitLabel': 'Límite de la caché',
    'settings.cacheLimitDesc': 'Por encima de este límite, los archivos nuevos ya no se descargan automáticamente. No se borra nada: siguen disponibles con un clic.',
    'settings.cacheLimitReached': 'Caché llena ({{limit}} MB): los archivos nuevos esperarán un clic.',
    'settings.autoDownloadDocumentsDesc': 'Descargar automáticamente los documentos',
  },
  pt: {
    'settings.cacheLimitLabel': 'Limite da cache',
    'settings.cacheLimitDesc': 'Acima deste limite, os novos anexos deixam de ser transferidos automaticamente. Nada é apagado: continuam disponíveis com um clique.',
    'settings.cacheLimitReached': 'Cache cheia ({{limit}} MB): os novos anexos aguardarão um clique.',
    'settings.autoDownloadDocumentsDesc': 'Transferir automaticamente os documentos',
  },
  el: {
    'settings.cacheLimitLabel': 'Όριο προσωρινής μνήμης',
    'settings.cacheLimitDesc': 'Πάνω από αυτό το όριο, τα νέα συνημμένα δεν κατεβαίνουν αυτόματα. Τίποτα δεν διαγράφεται: παραμένουν διαθέσιμα με ένα κλικ.',
    'settings.cacheLimitReached': 'Η προσωρινή μνήμη είναι γεμάτη ({{limit}} MB): τα νέα συνημμένα περιμένουν κλικ.',
    'settings.autoDownloadDocumentsDesc': 'Αυτόματη λήψη εγγράφων',
  },
  da: {
    'settings.cacheLimitLabel': 'Cache-grænse',
    'settings.cacheLimitDesc': 'Over denne grænse bliver nye vedhæftede filer ikke downloadet automatisk længere. Intet slettes — de er stadig tilgængelige med et klik.',
    'settings.cacheLimitReached': 'Cachen er fuld ({{limit}} MB): nye vedhæftede filer venter på et klik.',
    'settings.autoDownloadDocumentsDesc': 'Download dokumenter automatisk',
  },
  fi: {
    'settings.cacheLimitLabel': 'Välimuistin raja',
    'settings.cacheLimitDesc': 'Tämän rajan ylittäviä uusia liitteitä ei enää ladata automaattisesti. Mitään ei poisteta — ne ovat yhä ladattavissa napautuksella.',
    'settings.cacheLimitReached': 'Välimuisti on täynnä ({{limit}} MB): uudet liitteet odottavat napautusta.',
    'settings.autoDownloadDocumentsDesc': 'Lataa asiakirjat automaattisesti',
  },
  sv: {
    'settings.cacheLimitLabel': 'Cachegräns',
    'settings.cacheLimitDesc': 'Över denna gräns hämtas nya bilagor inte automatiskt längre. Inget raderas — de finns kvar att öppna med ett klick.',
    'settings.cacheLimitReached': 'Cachen är full ({{limit}} MB): nya bilagor väntar på ett klick.',
    'settings.autoDownloadDocumentsDesc': 'Ladda ner dokument automatiskt',
  },
  hr: {
    'settings.cacheLimitLabel': 'Granica predmemorije',
    'settings.cacheLimitDesc': 'Iznad tog ograničenja se nove privitke više ne preuzimaju automatski. Ništa se ne briše — i dalje su dostupne jednim klikom.',
    'settings.cacheLimitReached': 'Predmemorija je puna ({{limit}} MB): nove privitke čekaju klik.',
    'settings.autoDownloadDocumentsDesc': 'Automatski preuzmi dokumente',
  },
  et: {
    'settings.cacheLimitLabel': 'Puhvri piirmäär',
    'settings.cacheLimitDesc': 'Sellest piirist üle uute manuste automaatne allalaadimine peatub. Midagi ei kustutata — need on endiselt klõpsuga kättesaadavad.',
    'settings.cacheLimitReached': 'Puhver on täis ({{limit}} MB): uued manused ootavad klõpsu.',
    'settings.autoDownloadDocumentsDesc': 'Laadi dokumendid automaatselt alla',
  },
  hu: {
    'settings.cacheLimitLabel': 'Gyorsítótár korlátja',
    'settings.cacheLimitDesc': 'Ezen a korláton túl az új csatolmányok nem töltődnek le automatikusan. Semmi sem törlődik — egy kattintással továbbra is elérhetők.',
    'settings.cacheLimitReached': 'A gyorsítótár tele van ({{limit}} MB): az új csatolmányok kattintásra várnak.',
    'settings.autoDownloadDocumentsDesc': 'Dokumentumok automatikus letöltése',
  },
  lv: {
    'settings.cacheLimitLabel': 'Kešatmiņas limits',
    'settings.cacheLimitDesc': 'Pārsniedzot šo limitu, jaunās pievienotnes vairs netiek lejupielādētas automātiski. Nekas netiek dzēsts — tās joprojām ir pieejamas ar klikšķi.',
    'settings.cacheLimitReached': 'Kešatmiņa ir pilna ({{limit}} MB): jaunās pievienotnes gaida klikšķi.',
    'settings.autoDownloadDocumentsDesc': 'Automātiski lejupielādēt dokumentus',
  },
  lt: {
    'settings.cacheLimitLabel': 'Podėlio apribojimas',
    'settings.cacheLimitDesc': 'Viršijus šį apribojimą nauji priedai nebeparsisiunami automatiškai. Niekas nepašalinama — jie vis tiek pasiekiami vienu spustelėjimu.',
    'settings.cacheLimitReached': 'Podėlis pilnas ({{limit}} MB): nauji priedai laukia spustelėjimo.',
    'settings.autoDownloadDocumentsDesc': 'Automatiškai parsisiųsti dokumentus',
  },
  mt: {
    'settings.cacheLimitLabel': 'Limitu tal-cache',
    'settings.cacheLimitDesc': 'Overs dan il-limitu, l-anness ġodda ma jitniżżlu awtomatikament aktar. Xejn ma jitħassar — jibqgħu disponibbli b’klikk.',
    'settings.cacheLimitReached': 'Il-cache mimlija ({{limit}} MB): l-anness ġodda jistennew klikk.',
    'settings.autoDownloadDocumentsDesc': 'Niżżel id-dokumenti awtomatikament',
  },
  pl: {
    'settings.cacheLimitLabel': 'Limit pamięci podręcznej',
    'settings.cacheLimitDesc': 'Powyżej tego limitu nowe załączniki nie pobierają się automatycznie. Nic nie jest usuwane — nadal są dostępne po kliknięciu.',
    'settings.cacheLimitReached': 'Pamięć podręczna pełna ({{limit}} MB): nowe załączniki wymagają kliknięcia.',
    'settings.autoDownloadDocumentsDesc': 'Automatycznie pobieraj dokumenty',
  },
  sk: {
    'settings.cacheLimitLabel': 'Limit cache',
    'settings.cacheLimitDesc': 'Nad tento limit sa nové prílohy už nesťahujú automaticky. Nič sa neodstraňuje — stále sú dostupné kliknutím.',
    'settings.cacheLimitReached': 'Cache je plná ({{limit}} MB): nové prílohy čakajú na kliknutie.',
    'settings.autoDownloadDocumentsDesc': 'Automaticky sťahovať dokumenty',
  },
  sl: {
    'settings.cacheLimitLabel': 'Meja predpomnilnika',
    'settings.cacheLimitDesc': 'Nad to mejo se nove priponke ne prenašajo samodejno. Nič se ne izbriše — še vedno so na voljo z enim klikom.',
    'settings.cacheLimitReached': 'Predpomnilnik je poln ({{limit}} MB): nove priponke čakajo na klik.',
    'settings.autoDownloadDocumentsDesc': 'Samodejno prenese dokumente',
  },
  cs: {
    'settings.cacheLimitLabel': 'Limit cache',
    'settings.cacheLimitDesc': 'Nad tento limit se nové přílohy již nestahují automaticky. Nic se nemaže — stále jsou dostupné jedním kliknutím.',
    'settings.cacheLimitReached': 'Cache je plná ({{limit}} MB): nové přílohy čekají na kliknutí.',
    'settings.autoDownloadDocumentsDesc': 'Automaticky stahovat dokumenty',
  },
  bg: {
    'settings.cacheLimitLabel': 'Лимит на кеша',
    'settings.cacheLimitDesc': 'Над този лимит новите прикачени файлове вече не се изтеглят автоматично. Нищо не се изтрива — те си остават достъпни с кликване.',
    'settings.cacheLimitReached': 'Кешът е пълен ({{limit}} MB): новите файлове чакат кликване.',
    'settings.autoDownloadDocumentsDesc': 'Автоматично изтегляне на документи',
  },
  ga: {
    'settings.cacheLimitLabel': 'Teorainn an taoide',
    'settings.cacheLimitDesc': 'Thar an teorainn seo ní íoslódáilte greamáin nua go huathoibríoch a thuilleadh. Ní scriostar aon rud — tá siad ar fáil fós le cliceáil.',
    'settings.cacheLimitReached': 'Tá an taoide lán ({{limit}} MB): cliceáil chun greamáin nua a íoslódáil.',
    'settings.autoDownloadDocumentsDesc': 'Íoslódáil doiciméid go huathoibríoch',
  },
  ro: {
    'settings.cacheLimitLabel': 'Limita cache-ului',
    'settings.cacheLimitDesc': 'Peste această limită, atașamentele noi nu se mai descarcă automat. Nimic nu se șterge — rămân la un clic distanță.',
    'settings.cacheLimitReached': 'Cache plin ({{limit}} MB): atașamentele noi așteaptă un clic.',
    'settings.autoDownloadDocumentsDesc': 'Descarcă automat documentele',
  },
  uk: {
    'settings.cacheLimitLabel': 'Обмеження кешу',
    'settings.cacheLimitDesc': 'Після цього обмеження нові вкладення вже не завантажуються автоматично. Ніщо не видаляється — вони залишаються доступними одним клацанням.',
    'settings.cacheLimitReached': 'Кеш заповнено ({{limit}} MB): нові вкладення чекатимуть на клацання.',
    'settings.autoDownloadDocumentsDesc': 'Автоматично завантажувати документи',
  },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

const marks = []
lines.forEach((line, i) => {
  const m = /^  ([a-z]{2}): \{\s*$/.exec(line)
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

// A block-level loop can silently drop a locale: count the keys again on the
// file as written, not on the counters.
const after = readFileSync(file, 'utf8')
for (const key of KEYS) {
  const at = after.split(`"${key}":`).length - 1
  if (at !== known.length) {
    console.error(`✗ "${key}" appears ${at} times, expected ${known.length}`)
    process.exit(1)
  }
}

// L'interpolation {{limit}} est la seule façon de dire le plafond sans genre ni
// nombre : une locale qui l'aurait perdue afficherait un texte sans valeur.
for (const code of known) {
  const value = DATA[code]['settings.cacheLimitReached']
  if (!value.includes('{{limit}}')) {
    console.error(`✗ ${code}: settings.cacheLimitReached lost its {{limit}} placeholder`)
    process.exit(1)
  }
}

console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
