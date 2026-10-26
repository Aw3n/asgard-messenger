#!/usr/bin/env node
/**
 * Adds the four message-deletion confirmation keys (chat.deleteMessageConfirm,
 * …ForEveryoneWarning, …PermanentlyWarning, …ForMeWarning) to all 25 supported
 * languages of src/i18n/translations.ts.
 *
 * Why this wording : the bubble menu deleted a message on one click, in three
 * different real senses — a tombstone for everyone, no trace for everyone, or a
 * local copy only (a group « supprimer pour moi »). The warning therefore names
 * who loses the message and what stays behind, and quotes the exact word the
 * tombstone itself uses in that language (chat.messageDeleted), so the dialog
 * and the bubble say the same thing.
 *
 * Same in-place algorithm as add-quiet-hours-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = [
  'chat.deleteMessageConfirm',
  'chat.deleteForEveryoneWarning',
  'chat.deletePermanentlyWarning',
  'chat.deleteForMeWarning',
]

const DATA = {
  fr: {
    'chat.deleteMessageConfirm': 'Supprimer le message ?',
    'chat.deleteForEveryoneWarning': 'Le message disparaîtra pour vous et pour les autres, remplacé par “Message supprimé”. Cette action est définitive.',
    'chat.deletePermanentlyWarning': 'Le message disparaîtra pour vous et pour les autres, sans laisser de mention. Cette action est définitive.',
    'chat.deleteForMeWarning': 'Le message disparaîtra de cet appareil uniquement ; les autres le conserveront. Cette action est définitive.',
  },
  nl: {
    'chat.deleteMessageConfirm': 'Bericht verwijderen?',
    'chat.deleteForEveryoneWarning': 'Het bericht verdwijnt voor jou en voor de anderen, vervangen door “Bericht verwijderd”. Dit is niet ongedaan te maken.',
    'chat.deletePermanentlyWarning': 'Het bericht verdwijnt voor jou en voor de anderen, zonder spoor. Dit is niet ongedaan te maken.',
    'chat.deleteForMeWarning': 'Het bericht verdwijnt alleen van dit apparaat; de anderen houden het. Dit is niet ongedaan te maken.',
  },
  de: {
    'chat.deleteMessageConfirm': 'Nachricht löschen?',
    'chat.deleteForEveryoneWarning': 'Die Nachricht verschwindet für dich und für alle anderen, ersetzt durch „Nachricht gelöscht“. Das lässt sich nicht rückgängig machen.',
    'chat.deletePermanentlyWarning': 'Die Nachricht verschwindet für dich und für alle anderen, ohne Spur. Das lässt sich nicht rückgängig machen.',
    'chat.deleteForMeWarning': 'Die Nachricht verschwindet nur von diesem Gerät; alle anderen behalten sie. Das lässt sich nicht rückgängig machen.',
  },
  it: {
    'chat.deleteMessageConfirm': 'Eliminare il messaggio?',
    'chat.deleteForEveryoneWarning': 'Il messaggio sparirà per te e per gli altri, sostituito da “Messaggio eliminato”. Non potrà essere annullato.',
    'chat.deletePermanentlyWarning': 'Il messaggio sparirà per te e per gli altri, senza lasciare traccia. Non potrà essere annullato.',
    'chat.deleteForMeWarning': 'Il messaggio sparirà solo da questo dispositivo; gli altri lo manterranno. Non potrà essere annullato.',
  },
  es: {
    'chat.deleteMessageConfirm': '¿Eliminar el mensaje?',
    'chat.deleteForEveryoneWarning': 'El mensaje desaparecerá para ti y para los demás, sustituido por «Mensaje eliminado». No se puede deshacer.',
    'chat.deletePermanentlyWarning': 'El mensaje desaparecerá para ti y para los demás, sin dejar rastro. No se puede deshacer.',
    'chat.deleteForMeWarning': 'El mensaje desaparecerá solo de este dispositivo; los demás lo conservarán. No se puede deshacer.',
  },
  pt: {
    'chat.deleteMessageConfirm': 'Eliminar a mensagem?',
    'chat.deleteForEveryoneWarning': 'A mensagem desaparecerá para si e para os outros, substituída por «Mensagem eliminada». Não é possível desfazer.',
    'chat.deletePermanentlyWarning': 'A mensagem desaparecerá para si e para os outros, sem deixar rasto. Não é possível desfazer.',
    'chat.deleteForMeWarning': 'A mensagem desaparecerá apenas deste dispositivo; os outros continuam a vê-la. Não é possível desfazer.',
  },
  el: {
    'chat.deleteMessageConfirm': 'Διαγραφή μηνύματος;',
    'chat.deleteForEveryoneWarning': 'Το μήνυμα θα εξαφανιστεί για εσάς και για τους άλλους, με την ένδειξη «Το μήνυμα διαγράφηκε». Η ενέργεια είναι μη αναστρέψιμη.',
    'chat.deletePermanentlyWarning': 'Το μήνυμα θα εξαφανιστεί για εσάς και για τους άλλους, χωρίς καμία ένδειξη. Η ενέργεια είναι μη αναστρέψιμη.',
    'chat.deleteForMeWarning': 'Το μήνυμα θα εξαφανιστεί μόνο από αυτή τη συσκευή· οι άλλοι θα το διατηρήσουν. Η ενέργεια είναι μη αναστρέψιμη.',
  },
  da: {
    'chat.deleteMessageConfirm': 'Slet beskeden?',
    'chat.deleteForEveryoneWarning': 'Beskeden forsvinder for dig og for de andre, erstattet af “Besked slettet”. Det kan ikke fortrydes.',
    'chat.deletePermanentlyWarning': 'Beskeden forsvinder for dig og for de andre, uden spor. Det kan ikke fortrydes.',
    'chat.deleteForMeWarning': 'Beskeden forsvinder kun fra denne enhed; de andre beholder den. Det kan ikke fortrydes.',
  },
  fi: {
    'chat.deleteMessageConfirm': 'Poistetaanko viesti?',
    'chat.deleteForEveryoneWarning': 'Viesti katoaa sinulta ja muilta, korvaajana “Viesti poistettu”. Tätä ei voi perua.',
    'chat.deletePermanentlyWarning': 'Viesti katoaa sinulta ja muilta, ilman jäännöksiä. Tätä ei voi perua.',
    'chat.deleteForMeWarning': 'Viesti katoaa vain tältä laitteelta; muut säilyttävät sen. Tätä ei voi perua.',
  },
  sv: {
    'chat.deleteMessageConfirm': 'Ta bort meddelandet?',
    'chat.deleteForEveryoneWarning': 'Meddelandet försvinner för dig och för de andra, ersatt med “Meddelande borttaget”. Det går inte att ångra.',
    'chat.deletePermanentlyWarning': 'Meddelandet försvinner för dig och för de andra, utan spår. Det går inte att ångra.',
    'chat.deleteForMeWarning': 'Meddelandet försvinner bara från den här enheten; de andra behåller det. Det går inte att ångra.',
  },
  hr: {
    'chat.deleteMessageConfirm': 'Izbrisati poruku?',
    'chat.deleteForEveryoneWarning': 'Poruka nestaje za vas i za druge, zamijenjena „Poruka izbrisana“. Ovo se ne može poništiti.',
    'chat.deletePermanentlyWarning': 'Poruka nestaje za vas i za druge, bez tragova. Ovo se ne može poništiti.',
    'chat.deleteForMeWarning': 'Poruka nestaje samo s ovog uređaja; drugi je zadržavaju. Ovo se ne može poništiti.',
  },
  et: {
    'chat.deleteMessageConfirm': 'Kustuta sõnum?',
    'chat.deleteForEveryoneWarning': 'Sõnum kaob teilt ja teistelt, asemele tuleb „Sõnum kustutatud“. Seda ei saa tagasi võtta.',
    'chat.deletePermanentlyWarning': 'Sõnum kaob teilt ja teistelt, jälgideta. Seda ei saa tagasi võtta.',
    'chat.deleteForMeWarning': 'Sõnum kaob ainult sellelt seadmelt; teistel säilib. Seda ei saa tagasi võtta.',
  },
  hu: {
    'chat.deleteMessageConfirm': 'Törli az üzenetet?',
    'chat.deleteForEveryoneWarning': 'Az üzenet eltűnik önnek és a többieknek, „Üzenet törölve” felirat helyettesíti. Ez nem vonható vissza.',
    'chat.deletePermanentlyWarning': 'Az üzenet eltűnik önnek és a többieknek, nyomtalanul. Ez nem vonható vissza.',
    'chat.deleteForMeWarning': 'Az üzenet csak erről az eszközről tűnik el; a többiek megőrzik. Ez nem vonható vissza.',
  },
  lv: {
    'chat.deleteMessageConfirm': 'Dzēst ziņojumu?',
    'chat.deleteForEveryoneWarning': 'Ziņojums pazudīs no jums un no pārējiem, vietā «Ziņojums dzēsts». To nevar atsaukt.',
    'chat.deletePermanentlyWarning': 'Ziņojums pazudīs no jums un no pārējiem bez pēdām. To nevar atsaukt.',
    'chat.deleteForMeWarning': 'Ziņojums pazudīs tikai no šīs ierīces; pārējie to saglabās. To nevar atsaukt.',
  },
  lt: {
    'chat.deleteMessageConfirm': 'Ištrinti pranešimą?',
    'chat.deleteForEveryoneWarning': 'Pranešimas dings jums ir kitiems, vietoje jo – „Pranešimas ištrintas“. Grąžinti nebegalima.',
    'chat.deletePermanentlyWarning': 'Pranešimas dings jums ir kitiems, be pėdų. Grąžinti nebegalima.',
    'chat.deleteForMeWarning': 'Pranešimas dings tik iš šio įrenginio; kiti jį matys toliau. Grąžinti nebegalima.',
  },
  mt: {
    'chat.deleteMessageConfirm': 'Ħassar il-messaġġ?',
    'chat.deleteForEveryoneWarning': 'Il-messaġġ jisparixxi għalik u għall-oħrajn, u jibqa’ “Messaġġ mħassar”. Ma tistax terġa’ lura.',
    'chat.deletePermanentlyWarning': 'Il-messaġġ jisparixxi għalik u għall-oħrajn mingħajr ebda sinjal. Ma tistax terġa’ lura.',
    'chat.deleteForMeWarning': 'Il-messaġġ jisparixxi minn din l-apparat biss; l-oħrajn iżommuh. Ma tistax terġa’ lura.',
  },
  pl: {
    'chat.deleteMessageConfirm': 'Usunąć wiadomość?',
    'chat.deleteForEveryoneWarning': 'Wiadomość zniknie u ciebie i u pozostałych, zastąpiona „Wiadomość usunięta”. To nieodwracalne.',
    'chat.deletePermanentlyWarning': 'Wiadomość zniknie u ciebie i u pozostałych, bez śladu. To nieodwracalne.',
    'chat.deleteForMeWarning': 'Wiadomość zniknie tylko z tego urządzenia; pozostali ją zachowają. To nieodwracalne.',
  },
  sk: {
    'chat.deleteMessageConfirm': 'Odstrániť správu?',
    'chat.deleteForEveryoneWarning': 'Správa zmizne vám aj ostatným, nahradí ju „Správa odstránená“. Nedá sa to vrátiť.',
    'chat.deletePermanentlyWarning': 'Správa zmizne vám aj ostatným bez stopy. Nedá sa to vrátiť.',
    'chat.deleteForMeWarning': 'Správa zmizne len z tohto zariadenia; ostatní si ju nechajú. Nedá sa to vrátiť.',
  },
  sl: {
    'chat.deleteMessageConfirm': 'Izbriši sporočilo?',
    'chat.deleteForEveryoneWarning': 'Sporočilo izgine za vas in za druge, nadomesti ga „Sporočilo izbrisano“. Tega ni mogoče razveljaviti.',
    'chat.deletePermanentlyWarning': 'Sporočilo izgine za vas in za druge brez sledu. Tega ni mogoče razveljaviti.',
    'chat.deleteForMeWarning': 'Sporočilo izgine samo iz te naprave; drugi ga obdržijo. Tega ni mogoče razveljaviti.',
  },
  cs: {
    'chat.deleteMessageConfirm': 'Smazat zprávu?',
    'chat.deleteForEveryoneWarning': 'Zpráva zmizne vám i ostatním, nahradí ji „Zpráva smazána“. Nedá se to vrátit.',
    'chat.deletePermanentlyWarning': 'Zpráva zmizne vám i ostatním bez stopy. Nedá se to vrátit.',
    'chat.deleteForMeWarning': 'Zpráva zmizne jen z tohoto zařízení; ostatní si ji nechají. Nedá se to vrátit.',
  },
  bg: {
    'chat.deleteMessageConfirm': 'Изтриване на съобщението?',
    'chat.deleteForEveryoneWarning': 'Съобщението изчезва за вас и за другите, на негово място остава „Съобщението е изтрито“. Действието е необратимо.',
    'chat.deletePermanentlyWarning': 'Съобщението изчезва за вас и за другите без следа. Действието е необратимо.',
    'chat.deleteForMeWarning': 'Съобщението изчезва само от това устройство; другите ще го запазят. Действието е необратимо.',
  },
  ga: {
    'chat.deleteMessageConfirm': 'Scrios an teachtaireacht?',
    'chat.deleteForEveryoneWarning': 'Imíonn an teachtaireacht uait agus uathu siud, agus cuirtear “Teachtaireacht scriosta” ina hionad. Ní féidir é seo a chur ar ceal.',
    'chat.deletePermanentlyWarning': 'Imíonn an teachtaireacht uait agus uathu siud gan rian. Ní féidir é seo a chur ar ceal.',
    'chat.deleteForMeWarning': 'Imíonn an teachtaireacht ón ngléas seo amháin; beidh sí ag siud eile fós. Ní féidir é seo a chur ar ceal.',
  },
  ro: {
    'chat.deleteMessageConfirm': 'Ștergeți mesajul?',
    'chat.deleteForEveryoneWarning': 'Mesajul dispare pentru dvs. și pentru ceilalți, înlocuit cu „Mesaj șters”. Acțiunea este ireversibilă.',
    'chat.deletePermanentlyWarning': 'Mesajul dispare pentru dvs. și pentru ceilalți, fără urmă. Acțiunea este ireversibilă.',
    'chat.deleteForMeWarning': 'Mesajul dispare doar de pe acest dispozitiv; ceilalți îl păstrează. Acțiunea este ireversibilă.',
  },
  en: {
    'chat.deleteMessageConfirm': 'Delete this message?',
    'chat.deleteForEveryoneWarning': 'It disappears for you and for everyone else, replaced by “Message deleted”. This can’t be undone.',
    'chat.deletePermanentlyWarning': 'It disappears for you and for everyone else, leaving no trace. This can’t be undone.',
    'chat.deleteForMeWarning': 'It disappears from this device only; everyone else keeps it. This can’t be undone.',
  },
  uk: {
    'chat.deleteMessageConfirm': 'Видалити повідомлення?',
    'chat.deleteForEveryoneWarning': 'Повідомлення зникне у вас та в інших, на його місці лишиться «Повідомлення видалено». Це не можна скасувати.',
    'chat.deletePermanentlyWarning': 'Повідомлення зникне у вас та в інших без сліду. Це не можна скасувати.',
    'chat.deleteForMeWarning': 'Повідомлення зникне лише з цього пристрою; інші його збережуть. Це не можна скасувати.',
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
    // Land right after the existing « supprimer définitivement » label, so the
    // three warnings read as the explanation of the choices they name.
    let anchor = -1
    for (let i = 0; i < block.length; i++) {
      if (/^ {6}"chat\.deletePermanently":/.test(block[i])) { anchor = i; break }
    }
    if (anchor < 0) {
      console.error(`✗ no "chat.deletePermanently" anchor in the ${code} block`)
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
