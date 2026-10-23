#!/usr/bin/env node
/**
 * Adds the six member-moderation strings (groups.muteMember, groups.unmuteMember,
 * groups.memberMuted, groups.memberUnmuted, groups.muteFailed, groups.mutedInGroup)
 * to all 25 supported languages of src/i18n/translations.ts.
 *
 * Why this wording : GroupService.muteMember/unmuteMember existaient, le roster
 * portait déjà `canPost` et `mutedBy`, mais aucune interface ne les appelait — la
 * sourdine d'un membre était invisible et posable uniquement par le code. D'où une
 * action par membre, ses deux annonces de résultat, son échec et le message au
 * composeur de l'intéressé. Le verbe de « mute » de chaque langue reprend celui
 * déjà employé pour la sourdine de conversation (chat.muteConversation), pour que
 * les deux usages ne se contredisent pas dans une même langue.
 *
 * Same in-place algorithm as add-search-more-results-key.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = [
  'groups.muteMember',
  'groups.unmuteMember',
  'groups.memberMuted',
  'groups.memberUnmuted',
  'groups.muteFailed',
  'groups.mutedInGroup',
]

const DATA = {
  fr: {
    'groups.muteMember': 'Mettre le membre en sourdine',
    'groups.unmuteMember': 'Rétablir le membre',
    'groups.memberMuted': 'Membre mis en sourdine',
    'groups.memberUnmuted': 'Membre rétabli',
    'groups.muteFailed': 'Impossible de modifier la sourdine du membre',
    'groups.mutedInGroup': 'Vous êtes en sourdine dans ce groupe',
  },
  en: {
    'groups.muteMember': 'Mute member',
    'groups.unmuteMember': 'Unmute member',
    'groups.memberMuted': 'Member muted',
    'groups.memberUnmuted': 'Member unmuted',
    'groups.muteFailed': 'Couldn’t change the member’s mute',
    'groups.mutedInGroup': 'You are muted in this group',
  },
  nl: {
    'groups.muteMember': 'Lid dempen',
    'groups.unmuteMember': 'Dempen van lid opheffen',
    'groups.memberMuted': 'Lid gedempt',
    'groups.memberUnmuted': 'Dempen van lid opgeheven',
    'groups.muteFailed': 'Dempen van lid wijzigen is mislukt',
    'groups.mutedInGroup': 'Je bent gedempt in deze groep',
  },
  de: {
    'groups.muteMember': 'Mitglied stummschalten',
    'groups.unmuteMember': 'Stummschaltung des Mitglieds aufheben',
    'groups.memberMuted': 'Mitglied stummgeschaltet',
    'groups.memberUnmuted': 'Stummschaltung des Mitglieds aufgehoben',
    'groups.muteFailed': 'Stummschaltung des Mitglieds konnte nicht geändert werden',
    'groups.mutedInGroup': 'Sie sind in dieser Gruppe stummgeschaltet',
  },
  it: {
    'groups.muteMember': 'Silenzia membro',
    'groups.unmuteMember': 'Riattiva membro',
    'groups.memberMuted': 'Membro silenziato',
    'groups.memberUnmuted': 'Membro riattivato',
    'groups.muteFailed': 'Impossibile modificare il silenzio del membro',
    'groups.mutedInGroup': 'Sei stato silenziato in questo gruppo',
  },
  es: {
    'groups.muteMember': 'Silenciar miembro',
    'groups.unmuteMember': 'Reactivar miembro',
    'groups.memberMuted': 'Miembro silenciado',
    'groups.memberUnmuted': 'Miembro reactivado',
    'groups.muteFailed': 'No se pudo cambiar el silencio del miembro',
    'groups.mutedInGroup': 'Estás silenciado en este grupo',
  },
  pt: {
    'groups.muteMember': 'Silenciar membro',
    'groups.unmuteMember': 'Reativar membro',
    'groups.memberMuted': 'Membro silenciado',
    'groups.memberUnmuted': 'Membro reativado',
    'groups.muteFailed': 'Não foi possível alterar o silêncio do membro',
    'groups.mutedInGroup': 'Está silenciado neste grupo',
  },
  el: {
    'groups.muteMember': 'Σίγαση μέλους',
    'groups.unmuteMember': 'Άρση σίγασης μέλους',
    'groups.memberMuted': 'Μέλος σε σίγαση',
    'groups.memberUnmuted': 'Η σίγαση του μέλους άρθηκε',
    'groups.muteFailed': 'Η αλλαγή σίγασης του μέλους απέτυχε',
    'groups.mutedInGroup': 'Είστε σε σίγαση σε αυτή την ομάδα',
  },
  da: {
    'groups.muteMember': 'Gør medlem stum',
    'groups.unmuteMember': 'Ophæv stumhed for medlem',
    'groups.memberMuted': 'Medlem gjort stum',
    'groups.memberUnmuted': 'Medlem kan skrive igen',
    'groups.muteFailed': 'Ændring af stumhed for medlem mislykkedes',
    'groups.mutedInGroup': 'Du er gjort stum i denne gruppe',
  },
  fi: {
    'groups.muteMember': 'Mykistä jäsen',
    'groups.unmuteMember': 'Poista jäsenen mykistys',
    'groups.memberMuted': 'Jäsen mykistetty',
    'groups.memberUnmuted': 'Jäsenen mykistys poistettu',
    'groups.muteFailed': 'Jäsenen mykistystä ei voitu muuttaa',
    'groups.mutedInGroup': 'Sinut on mykistetty tässä ryhmässä',
  },
  sv: {
    'groups.muteMember': 'Tysta medlem',
    'groups.unmuteMember': 'Aktivera medlem igen',
    'groups.memberMuted': 'Medlem tystad',
    'groups.memberUnmuted': 'Medlem aktiverad igen',
    'groups.muteFailed': 'Det gick inte att ändra tystnad för medlem',
    'groups.mutedInGroup': 'Du är tystad i den här gruppen',
  },
  hr: {
    'groups.muteMember': 'Utišaj člana',
    'groups.unmuteMember': 'Ukini utišavanje člana',
    'groups.memberMuted': 'Član utišan',
    'groups.memberUnmuted': 'Utišavanje člana poništeno',
    'groups.muteFailed': 'Utišavanje člana nije bilo moguće promijeniti',
    'groups.mutedInGroup': 'Utišani ste u ovoj grupi',
  },
  et: {
    'groups.muteMember': 'Summuta liige',
    'groups.unmuteMember': 'Lõpeta liikme summutamine',
    'groups.memberMuted': 'Liige on summutatud',
    'groups.memberUnmuted': 'Liikme summutamine lõpetatud',
    'groups.muteFailed': 'Liikme summutamist ei õnnestunud muuta',
    'groups.mutedInGroup': 'Sind on selles rühmas summutatud',
  },
  hu: {
    'groups.muteMember': 'Tag némítása',
    'groups.unmuteMember': 'Tag némításának feloldása',
    'groups.memberMuted': 'Tag lenémítva',
    'groups.memberUnmuted': 'Tag némítása feloldva',
    'groups.muteFailed': 'A tag némítását nem sikerült módosítani',
    'groups.mutedInGroup': 'Ebben a csoportban le vagy némítva',
  },
  lv: {
    'groups.muteMember': 'Apklusināt dalībnieku',
    'groups.unmuteMember': 'Atcelt dalībnieka apklusināšanu',
    'groups.memberMuted': 'Dalībnieks apklusināts',
    'groups.memberUnmuted': 'Dalībnieka apklusināšana atcelta',
    'groups.muteFailed': 'Dalībnieka apklusinājumu nevarēja mainīt',
    'groups.mutedInGroup': 'Jūs esat apklusināts šajā grupā',
  },
  lt: {
    'groups.muteMember': 'Nutildyti narą',
    'groups.unmuteMember': 'Atšaukti nario nutildymą',
    'groups.memberMuted': 'Narys nutildytas',
    'groups.memberUnmuted': 'Nario nutildymas atšauktas',
    'groups.muteFailed': 'Nario nutildymo pakeisti nepavyko',
    'groups.mutedInGroup': 'Šioje grupėje esate nutildytas',
  },
  mt: {
    'groups.muteMember': 'Ġibed il-membru',
    'groups.unmuteMember': 'Neħħi l-ġibed mill-membru',
    'groups.memberMuted': 'Il-membru inġibed',
    'groups.memberUnmuted': 'In-neħħiet il-ġibed mill-membru',
    'groups.muteFailed': "Ma setg'etx tinbidel il-ġibed tal-membru",
    'groups.mutedInGroup': 'Int ġibed f’din il-gruppa',
  },
  pl: {
    'groups.muteMember': 'Wycisz członka',
    'groups.unmuteMember': 'Wyłącz wyciszenie członka',
    'groups.memberMuted': 'Członek wyciszony',
    'groups.memberUnmuted': 'Wyciszenie członka wyłączone',
    'groups.muteFailed': 'Nie udało się zmienić wyciszenia członka',
    'groups.mutedInGroup': 'Jesteś wyciszony w tej grupie',
  },
  sk: {
    'groups.muteMember': 'Stlmiť člena',
    'groups.unmuteMember': 'Zrušiť stlmenie člena',
    'groups.memberMuted': 'Člen stlmený',
    'groups.memberUnmuted': 'Stlmenie člena zrušené',
    'groups.muteFailed': 'Zmenu stlmenia člena sa nepodarilo',
    'groups.mutedInGroup': 'V tejto skupine ste stlmený',
  },
  sl: {
    'groups.muteMember': 'Utišaj člana',
    'groups.unmuteMember': 'Odstrani utišanje člana',
    'groups.memberMuted': 'Član utišan',
    'groups.memberUnmuted': 'Utišanje člana odstranjeno',
    'groups.muteFailed': 'Spremembe utišanja člana ni bilo mogoče izvesti',
    'groups.mutedInGroup': 'V tej skupini ste utišani',
  },
  cs: {
    'groups.muteMember': 'Ztlumit člena',
    'groups.unmuteMember': 'Zrušit ztlumení člena',
    'groups.memberMuted': 'Člen ztlumen',
    'groups.memberUnmuted': 'Ztlumení člena zrušeno',
    'groups.muteFailed': 'Změnu ztlumení člena se nepodařilo provést',
    'groups.mutedInGroup': 'V této skupině jste ztlumeni',
  },
  bg: {
    'groups.muteMember': 'Заглуши член',
    'groups.unmuteMember': 'Махни заглушаването на член',
    'groups.memberMuted': 'Членът е заглушен',
    'groups.memberUnmuted': 'Заглушаването на члена е премахнато',
    'groups.muteFailed': 'Промяната на заглушаването на члена не успя',
    'groups.mutedInGroup': 'Вие сте заглушени в тази група',
  },
  ga: {
    'groups.muteMember': 'Balbhaigh ball',
    'groups.unmuteMember': 'Bain balbhacht den bhall',
    'groups.memberMuted': 'Tá an ball balbhaithe',
    'groups.memberUnmuted': 'Baineadh balbhacht den bhall',
    'groups.muteFailed': 'Theip ar athrú balbhachta an bhalla',
    'groups.mutedInGroup': 'Tá tú balbhaithe sa ngrúpa seo',
  },
  ro: {
    'groups.muteMember': 'Pune membrul în tăcere',
    'groups.unmuteMember': 'Scoate membrul din tăcere',
    'groups.memberMuted': 'Membrul este în tăcere',
    'groups.memberUnmuted': 'Membrul a ieșit din tăcere',
    'groups.muteFailed': 'Nu s-a putut modifica starea de tăcere a membrului',
    'groups.mutedInGroup': 'Sunteți în tăcere în acest grup',
  },
  uk: {
    'groups.muteMember': 'Заглушити учасника',
    'groups.unmuteMember': 'Зняти заглушення з учасника',
    'groups.memberMuted': 'Учасника заглушено',
    'groups.memberUnmuted': 'З учасника знято заглушення',
    'groups.muteFailed': 'Не вдалося змінити заглушення учасника',
    'groups.mutedInGroup': 'Ви заглушені в цій групі',
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
    // Insert before the closing brace of the `translation` object (four-space
    // indent), not before the locale's own brace.
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
