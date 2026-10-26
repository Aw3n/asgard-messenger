#!/usr/bin/env node
/**
 * Adds the six quiet-hours keys (settings.scheduledDnd / …Desc / …From / …To /
 * …Active / …Inactive) to all 25 supported languages of src/i18n/translations.ts.
 *
 * Why this wording : notifications.dndFrom and notifications.dndTo existed in
 * the type and in the exported settings since the first commit and nothing read
 * them — the only silence a user could set was the manual « Ne pas déranger »
 * switch, which has to be remembered every evening. The wording therefore names
 * a window (« plage », « tidsrum », « período ») rather than a switch, and says
 * what survives the silence: the message still lands, only the alert is gone.
 *
 * Same in-place algorithm as add-download-folder-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = [
  'settings.scheduledDnd',
  'settings.scheduledDndDesc',
  'settings.scheduledDndFrom',
  'settings.scheduledDndTo',
  'settings.scheduledDndActive',
  'settings.scheduledDndInactive',
]

const DATA = {
  fr: {
    'settings.scheduledDnd': 'Heures silencieuses',
    'settings.scheduledDndDesc': 'Coupe les alertes pendant la plage choisie, minuit compris. Les messages arrivent quand même, sans son ni bannière.',
    'settings.scheduledDndFrom': 'À partir de',
    'settings.scheduledDndTo': 'Jusqu’à',
    'settings.scheduledDndActive': 'Silence en cours',
    'settings.scheduledDndInactive': 'Hors de la plage',
  },
  nl: {
    'settings.scheduledDnd': 'Stille uren',
    'settings.scheduledDndDesc': 'Demp meldingen binnen het gekozen venster, middernacht inbegrepen. Berichten komen nog steeds binnen, zonder geluid of banner.',
    'settings.scheduledDndFrom': 'Vanaf',
    'settings.scheduledDndTo': 'Tot',
    'settings.scheduledDndActive': 'Nu stil',
    'settings.scheduledDndInactive': 'Buiten het venster',
  },
  de: {
    'settings.scheduledDnd': 'Stille Zeiten',
    'settings.scheduledDndDesc': 'Unterdrückt Mitteilungen im gewählten Fenster, Mitternacht eingeschlossen. Nachrichten kommen weiterhin an, ohne Ton oder Banner.',
    'settings.scheduledDndFrom': 'Ab',
    'settings.scheduledDndTo': 'Bis',
    'settings.scheduledDndActive': 'Ruhephase aktiv',
    'settings.scheduledDndInactive': 'Außerhalb des Fensters',
  },
  it: {
    'settings.scheduledDnd': 'Ore di silenzio',
    'settings.scheduledDndDesc': 'Sospende gli avvisi nella fascia scelta, mezzanotte compresa. I messaggi continuano ad arrivare, senza suono né banner.',
    'settings.scheduledDndFrom': 'A partire dalle',
    'settings.scheduledDndTo': 'Fino alle',
    'settings.scheduledDndActive': 'Silenzio in corso',
    'settings.scheduledDndInactive': 'Fuori dalla fascia',
  },
  es: {
    'settings.scheduledDnd': 'Horas de silencio',
    'settings.scheduledDndDesc': 'Silencia los avisos durante el intervalo elegido, incluida la medianoche. Los mensajes siguen llegando, sin sonido ni banner.',
    'settings.scheduledDndFrom': 'A partir de las',
    'settings.scheduledDndTo': 'Hasta las',
    'settings.scheduledDndActive': 'Silencio en curso',
    'settings.scheduledDndInactive': 'Fuera del intervalo',
  },
  pt: {
    'settings.scheduledDnd': 'Horas de silêncio',
    'settings.scheduledDndDesc': 'Silencia os avisos durante o intervalo escolhido, incluindo a meia-noite. As mensagens continuam a chegar, sem som nem banner.',
    'settings.scheduledDndFrom': 'A partir das',
    'settings.scheduledDndTo': 'Até às',
    'settings.scheduledDndActive': 'Silêncio em curso',
    'settings.scheduledDndInactive': 'Fora do intervalo',
  },
  el: {
    'settings.scheduledDnd': 'Ώρες ησυχίας',
    'settings.scheduledDndDesc': 'Σιγάζει τις ειδοποιήσεις μέσα στο επιλεγμένο παράθυρο, μέχρι και τα μεσάνυχτα. Τα μηνύματα συνεχίζουν να φτάνουν, χωρίς ήχο ή προβολή στην οθόνη.',
    'settings.scheduledDndFrom': 'Από τις',
    'settings.scheduledDndTo': 'Έως τις',
    'settings.scheduledDndActive': 'Ησυχία σε εξέλιξη',
    'settings.scheduledDndInactive': 'Εκτός παραθύρου',
  },
  da: {
    'settings.scheduledDnd': 'Stille timer',
    'settings.scheduledDndDesc': 'Dæmper påmindelser i det valgte tidsrum, også over midnat. Beskeder kommer stadig ind, uden lyd eller banner.',
    'settings.scheduledDndFrom': 'Fra',
    'settings.scheduledDndTo': 'Indtil',
    'settings.scheduledDndActive': 'Stilhed nu',
    'settings.scheduledDndInactive': 'Uden for tidsrummet',
  },
  fi: {
    'settings.scheduledDnd': 'Hiljainen aika',
    'settings.scheduledDndDesc': 'Vaimentaa ilmoitukset valitulla aikavälillä, keskiyön yli. Viestit tulevat silti perille, ilman ääntä tai banneria.',
    'settings.scheduledDndFrom': 'Alkaen',
    'settings.scheduledDndTo': 'Asti',
    'settings.scheduledDndActive': 'Hiljaista nyt',
    'settings.scheduledDndInactive': 'Aikavälin ulkopuolella',
  },
  sv: {
    'settings.scheduledDnd': 'Tysta timmar',
    'settings.scheduledDndDesc': 'Tystar aviseringar under vald period, över midnatt. Meddelanden kommer fortfarande in, utan ljud eller banner.',
    'settings.scheduledDndFrom': 'Från',
    'settings.scheduledDndTo': 'Till',
    'settings.scheduledDndActive': 'Tyst nu',
    'settings.scheduledDndInactive': 'Utanför perioden',
  },
  hr: {
    'settings.scheduledDnd': 'Tihi sati',
    'settings.scheduledDndDesc': 'Utišava obavijesti tijekom odabranog razdoblja, preko ponoći. Poruke i dalje stižu, bez zvuka i bannera.',
    'settings.scheduledDndFrom': 'Od',
    'settings.scheduledDndTo': 'Do',
    'settings.scheduledDndActive': 'Tišina sada',
    'settings.scheduledDndInactive': 'Izvan razdoblja',
  },
  et: {
    'settings.scheduledDnd': 'Vaiksed tunnid',
    'settings.scheduledDndDesc': 'Vaigistab teavitused valitud ajavahemikus, üle kesköö. Sõnumid jõuavad ikka kohale, ilma helita või teavituseta.',
    'settings.scheduledDndFrom': 'Alates',
    'settings.scheduledDndTo': 'Kuni',
    'settings.scheduledDndActive': 'Vaikus praegu',
    'settings.scheduledDndInactive': 'Väljaspool ajavahemikku',
  },
  hu: {
    'settings.scheduledDnd': 'Csendes órák',
    'settings.scheduledDndDesc': 'Némítja az értesítéseket a kiválasztott időszakban, éjfél felett is. Az üzenetek továbbra is megérkeznek, hang és sáv nélkül.',
    'settings.scheduledDndFrom': 'Kezdettől',
    'settings.scheduledDndTo': 'Végéig',
    'settings.scheduledDndActive': 'Csend most',
    'settings.scheduledDndInactive': 'Az időszakon kívül',
  },
  lv: {
    'settings.scheduledDnd': 'Klusās stundas',
    'settings.scheduledDndDesc': 'Aptur paziņojumus izvēlētajā laika logā, arī pēc pusnakts. Ziņas turpina ienākt, bez skaņas un joslas.',
    'settings.scheduledDndFrom': 'No',
    'settings.scheduledDndTo': 'Līdz',
    'settings.scheduledDndActive': 'Klusa tagad',
    'settings.scheduledDndInactive': 'Ārpus laika loga',
  },
  lt: {
    'settings.scheduledDnd': 'Tylūs laikotarpiai',
    'settings.scheduledDndDesc': 'Nutildina pranešimus pasirinktu laikotarpiu, įskaitant vidurnaktį. Žinutės vis tiek gaunamos, be garso ar juostelės.',
    'settings.scheduledDndFrom': 'Nuo',
    'settings.scheduledDndTo': 'Iki',
    'settings.scheduledDndActive': 'Tyla dabar',
    'settings.scheduledDndInactive': 'Už laikotarpio ribų',
  },
  mt: {
    'settings.scheduledDnd': 'Siegħat ta’ kalm',
    'settings.scheduledDndDesc': 'Iżomm l-avviżi mitfija matul il-ħin magħżul, anke wara nofsillejl. Il-messaġġi baqgħu jaslu, bla ħoss jew banner.',
    'settings.scheduledDndFrom': 'Minn',
    'settings.scheduledDndTo': 'Sa',
    'settings.scheduledDndActive': 'Kalm issa',
    'settings.scheduledDndInactive': 'Barra mill-ħin magħżul',
  },
  pl: {
    'settings.scheduledDnd': 'Ciche godziny',
    'settings.scheduledDndDesc': 'Wycisza powiadomienia w wybranym przedziale, także przez północ. Wiadomości nadal docierają, bez dźwięku i banera.',
    'settings.scheduledDndFrom': 'Od',
    'settings.scheduledDndTo': 'Do',
    'settings.scheduledDndActive': 'Cisza teraz',
    'settings.scheduledDndInactive': 'Poza przedziałem',
  },
  sk: {
    'settings.scheduledDnd': 'Tiché hodiny',
    'settings.scheduledDndDesc': 'Ztlmí upozornenia vo zvolenom okne, aj cez polnoc. Správy naďalej prichádzajú, bez zvuku a banneru.',
    'settings.scheduledDndFrom': 'Od',
    'settings.scheduledDndTo': 'Do',
    'settings.scheduledDndActive': 'Ticho teraz',
    'settings.scheduledDndInactive': 'Mimo okna',
  },
  sl: {
    'settings.scheduledDnd': 'Tihe ure',
    'settings.scheduledDndDesc': 'Utiša obvestila v izbranem obdobju, tudi čez polnoč. Sporočila še vedno pridejo, brez zvoka in pasice.',
    'settings.scheduledDndFrom': 'Od',
    'settings.scheduledDndTo': 'Do',
    'settings.scheduledDndActive': 'Tišina zdaj',
    'settings.scheduledDndInactive': 'Zunaj obdobja',
  },
  cs: {
    'settings.scheduledDnd': 'Tiché hodiny',
    'settings.scheduledDndDesc': 'Ztlumí upozornění ve zvoleném okně, i přes půlnoc. Zprávy dál docházejí, bez zvuku a banneru.',
    'settings.scheduledDndFrom': 'Od',
    'settings.scheduledDndTo': 'Do',
    'settings.scheduledDndActive': 'Ticho teď',
    'settings.scheduledDndInactive': 'Mimo okno',
  },
  bg: {
    'settings.scheduledDnd': 'Тихи часове',
    'settings.scheduledDndDesc': 'Заглушава известията в избрания прозорец, включително след полунощ. Съобщенията продължават да идват, без звук и банер.',
    'settings.scheduledDndFrom': 'От',
    'settings.scheduledDndTo': 'До',
    'settings.scheduledDndActive': 'Тиша сега',
    'settings.scheduledDndInactive': 'Извън прозореца',
  },
  ga: {
    'settings.scheduledDnd': 'Huaireacht ciúin',
    'settings.scheduledDndDesc': 'Ciúnaíonn sé fógraí le linn na tréimhse roghnaithe, fiú thar meán oíche. Tagann teachtaireachtaí fós, gan fuaime agus gan bratach.',
    'settings.scheduledDndFrom': 'Ó',
    'settings.scheduledDndTo': 'Go',
    'settings.scheduledDndActive': 'Ciúnas anois',
    'settings.scheduledDndInactive': 'Lasmuigh den tréimhse',
  },
  ro: {
    'settings.scheduledDnd': 'Ore liniștite',
    'settings.scheduledDndDesc': 'Oprește notificările în fereastra aleasă, inclusiv peste miez de noapte. Mesajele continuă să sosească, fără sunet sau banner.',
    'settings.scheduledDndFrom': 'De la',
    'settings.scheduledDndTo': 'Până la',
    'settings.scheduledDndActive': 'Liniște acum',
    'settings.scheduledDndInactive': 'În afara ferestrei',
  },
  en: {
    'settings.scheduledDnd': 'Quiet hours',
    'settings.scheduledDndDesc': 'Mutes alerts during the window you picked, midnight included. Messages still arrive, without sound or banner.',
    'settings.scheduledDndFrom': 'From',
    'settings.scheduledDndTo': 'To',
    'settings.scheduledDndActive': 'Quiet now',
    'settings.scheduledDndInactive': 'Outside the window',
  },
  uk: {
    'settings.scheduledDnd': 'Тихі години',
    'settings.scheduledDndDesc': 'Вимикає сповіщення в обраний період, навіть після опівночі. Повідомлення продовжують надходити, без звуку та банера.',
    'settings.scheduledDndFrom': 'Від',
    'settings.scheduledDndTo': 'До',
    'settings.scheduledDndActive': 'Тиша зараз',
    'settings.scheduledDndInactive': 'Поза періодом',
  },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

// Each locale block starts with `  <code>: {` at two-space indent and holds one
// nested `translation` object made of flat "a.b" keys.
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

// Walk backwards: splicing a block must not shift the indexes of the previous ones.
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
    // Land right after the manual do-not-disturb description, so the schedule
    // reads as its continuation in every language.
    let anchor = -1
    for (let i = 0; i < block.length; i++) {
      if (/^ {6}"settings\.doNotDisturbDesc":/.test(block[i])) { anchor = i; break }
    }
    if (anchor < 0) {
      console.error(`✗ no "settings.doNotDisturbDesc" anchor in the ${code} block`)
      process.exit(1)
    }
    block.splice(anchor + 1, 0, ...pending)
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

console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
