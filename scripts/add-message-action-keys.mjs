#!/usr/bin/env node
/**
 * Injecte dans src/i18n/translations.ts (25 langues) les clés des actions de
 * message et du renvoi après échec :
 *   chat.retrySend      — bouton/élément de menu qui relance un envoi échoué
 *   chat.editFailed     — toast quand la modification n'a pas pu être envoyée
 *   chat.messageActions — libellé accessible de la rangée focalisable
 *
 * fallbackLng 'fr' masque toute clé manquante : sans ces lignes, les autres
 * locales afficheraient du français.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.retrySend', 'chat.editFailed', 'chat.messageActions']

const DATA = {
  fr: {
    'chat.retrySend': 'Renvoyer',
    'chat.editFailed': 'Impossible de modifier le message',
    'chat.messageActions': 'Actions du message',
  },
  nl: {
    'chat.retrySend': 'Opnieuw versturen',
    'chat.editFailed': 'Kan bericht niet bewerken',
    'chat.messageActions': 'Berichtacties',
  },
  de: {
    'chat.retrySend': 'Erneut senden',
    'chat.editFailed': 'Nachricht konnte nicht bearbeitet werden',
    'chat.messageActions': 'Nachrichtenaktionen',
  },
  it: {
    'chat.retrySend': 'Invia di nuovo',
    'chat.editFailed': 'Impossibile modificare il messaggio',
    'chat.messageActions': 'Azioni del messaggio',
  },
  es: {
    'chat.retrySend': 'Reenviar',
    'chat.editFailed': 'No se pudo editar el mensaje',
    'chat.messageActions': 'Acciones del mensaje',
  },
  pt: {
    'chat.retrySend': 'Reenviar',
    'chat.editFailed': 'Não foi possível editar a mensagem',
    'chat.messageActions': 'Ações da mensagem',
  },
  el: {
    'chat.retrySend': 'Επαναποστολή',
    'chat.editFailed': 'Δεν ήταν δυνατή η επεξεργασία του μηνύματος',
    'chat.messageActions': 'Ενέργειες μηνύματος',
  },
  da: {
    'chat.retrySend': 'Send igen',
    'chat.editFailed': 'Beskeden kunne ikke redigeres',
    'chat.messageActions': 'Beskedhandlinger',
  },
  fi: {
    'chat.retrySend': 'Lähetä uudelleen',
    'chat.editFailed': 'Viestin muokkaaminen epäonnistui',
    'chat.messageActions': 'Viestin toiminnot',
  },
  sv: {
    'chat.retrySend': 'Skicka igen',
    'chat.editFailed': 'Det gick inte att redigera meddelandet',
    'chat.messageActions': 'Meddelandeåtgärder',
  },
  hr: {
    'chat.retrySend': 'Pošalji ponovno',
    'chat.editFailed': 'Nije moguće urediti poruku',
    'chat.messageActions': 'Radnje poruke',
  },
  et: {
    'chat.retrySend': 'Saada uuesti',
    'chat.editFailed': 'Sõnumi muutmine ebaõnnestus',
    'chat.messageActions': 'Sõnumi toimingud',
  },
  hu: {
    'chat.retrySend': 'Újraküldés',
    'chat.editFailed': 'Az üzenetet nem sikerült szerkeszteni',
    'chat.messageActions': 'Üzenetműveletek',
  },
  lv: {
    'chat.retrySend': 'Sūtīt vēlreiz',
    'chat.editFailed': 'Ziņu neizdevās rediģēt',
    'chat.messageActions': 'Ziņas darbības',
  },
  lt: {
    'chat.retrySend': 'Siųsti dar kartą',
    'chat.editFailed': 'Nepavyko redaguoti žinutės',
    'chat.messageActions': 'Žinutės veiksmai',
  },
  mt: {
    'chat.retrySend': 'Ibgħat mill-ġdid',
    'chat.editFailed': 'Il-messaġġ ma setax jiġi editjat',
    'chat.messageActions': 'Azzjonijiet tal-messaġġ',
  },
  pl: {
    'chat.retrySend': 'Wyślij ponownie',
    'chat.editFailed': 'Nie udało się edytować wiadomości',
    'chat.messageActions': 'Akcje wiadomości',
  },
  sk: {
    'chat.retrySend': 'Odoslať znova',
    'chat.editFailed': 'Správu sa nepodarilo upraviť',
    'chat.messageActions': 'Akcie správy',
  },
  sl: {
    'chat.retrySend': 'Pošlji znova',
    'chat.editFailed': 'Sporočila ni bilo mogoče urediti',
    'chat.messageActions': 'Dejanja sporočila',
  },
  cs: {
    'chat.retrySend': 'Odeslat znovu',
    'chat.editFailed': 'Zprávu se nepodařilo upravit',
    'chat.messageActions': 'Akce zprávy',
  },
  bg: {
    'chat.retrySend': 'Изпрати отново',
    'chat.editFailed': 'Съобщението не можа да бъде редактирано',
    'chat.messageActions': 'Действия със съобщението',
  },
  ga: {
    'chat.retrySend': 'Seol arís',
    'chat.editFailed': 'Níorbh fhéidir an teachtaireacht a chur in eagar',
    'chat.messageActions': 'Gníomhartha teachtaireachta',
  },
  ro: {
    'chat.retrySend': 'Trimite din nou',
    'chat.editFailed': 'Mesajul nu a putut fi editat',
    'chat.messageActions': 'Acțiuni pentru mesaj',
  },
  en: {
    'chat.retrySend': 'Send again',
    'chat.editFailed': 'Could not edit the message',
    'chat.messageActions': 'Message actions',
  },
  uk: {
    'chat.retrySend': 'Надіслати знову',
    'chat.editFailed': 'Не вдалося змінити повідомлення',
    'chat.messageActions': 'Дії з повідомленням',
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
