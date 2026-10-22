#!/usr/bin/env node
/**
 * Injecte dans src/i18n/translations.ts (25 langues) les clés de l'invitation
 * d'un contact depuis les paramètres du groupe :
 *   groups.inviteAction       — bouton d'envoi
 *   groups.inviting           — envoi en cours
 *   groups.inviteSent         — confirmation avec le nom du destinataire
 *   groups.invitationSent     — bouton désactivé après envoi
 *   groups.inviteFailed       — échec de l'envoi
 *   groups.noContactsToInvite — liste vide
 *
 * fallbackLng 'fr' masque toute clé manquante : sans ces lignes, les autres
 * locales afficheraient du français.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = [
  'groups.inviteAction',
  'groups.inviting',
  'groups.inviteSent',
  'groups.invitationSent',
  'groups.inviteFailed',
  'groups.noContactsToInvite',
]

const DATA = {
  fr: {
    'groups.inviteAction': 'Inviter',
    'groups.inviting': 'Envoi…',
    'groups.inviteSent': 'Invitation envoyée à {{name}}',
    'groups.invitationSent': 'Invité',
    'groups.inviteFailed': "Échec de l'envoi de l'invitation",
    'groups.noContactsToInvite': 'Aucun contact à inviter',
  },
  nl: {
    'groups.inviteAction': 'Uitnodigen',
    'groups.inviting': 'Versturen…',
    'groups.inviteSent': 'Uitnodiging verzonden naar {{name}}',
    'groups.invitationSent': 'Uitgenodigd',
    'groups.inviteFailed': 'Verzenden van de uitnodiging mislukt',
    'groups.noContactsToInvite': 'Geen contacten om uit te nodigen',
  },
  de: {
    'groups.inviteAction': 'Einladen',
    'groups.inviting': 'Wird gesendet…',
    'groups.inviteSent': 'Einladung an {{name}} gesendet',
    'groups.invitationSent': 'Eingeladen',
    'groups.inviteFailed': 'Einladung konnte nicht gesendet werden',
    'groups.noContactsToInvite': 'Keine Kontakte zum Einladen',
  },
  it: {
    'groups.inviteAction': 'Invita',
    'groups.inviting': 'Invio…',
    'groups.inviteSent': 'Invito inviato a {{name}}',
    'groups.invitationSent': 'Invitato',
    'groups.inviteFailed': "Invio dell'invito non riuscito",
    'groups.noContactsToInvite': 'Nessun contatto da invitare',
  },
  es: {
    'groups.inviteAction': 'Invitar',
    'groups.inviting': 'Enviando…',
    'groups.inviteSent': 'Invitación enviada a {{name}}',
    'groups.invitationSent': 'Invitado',
    'groups.inviteFailed': 'No se pudo enviar la invitación',
    'groups.noContactsToInvite': 'No hay contactos para invitar',
  },
  pt: {
    'groups.inviteAction': 'Convidar',
    'groups.inviting': 'A enviar…',
    'groups.inviteSent': 'Convite enviado a {{name}}',
    'groups.invitationSent': 'Convidado',
    'groups.inviteFailed': 'Falha ao enviar o convite',
    'groups.noContactsToInvite': 'Nenhum contacto para convidar',
  },
  el: {
    'groups.inviteAction': 'Πρόσκληση',
    'groups.inviting': 'Αποστολή…',
    'groups.inviteSent': 'Η πρόσκληση στάλθηκε σε {{name}}',
    'groups.invitationSent': 'Προσκλήθηκε',
    'groups.inviteFailed': 'Αποτυχία αποστολής της πρόσκλησης',
    'groups.noContactsToInvite': 'Δεν υπάρχουν επαφές για πρόσκληση',
  },
  da: {
    'groups.inviteAction': 'Inviter',
    'groups.inviting': 'Sender…',
    'groups.inviteSent': 'Invitation sendt til {{name}}',
    'groups.invitationSent': 'Inviteret',
    'groups.inviteFailed': 'Kunne ikke sende invitationen',
    'groups.noContactsToInvite': 'Ingen kontakter at invitere',
  },
  fi: {
    'groups.inviteAction': 'Kutsu',
    'groups.inviting': 'Lähetetään…',
    'groups.inviteSent': 'Kutsu lähetetty: {{name}}',
    'groups.invitationSent': 'Kutsuttu',
    'groups.inviteFailed': 'Kutsun lähetys epäonnistui',
    'groups.noContactsToInvite': 'Ei kutsuttavia yhteystietoja',
  },
  sv: {
    'groups.inviteAction': 'Bjud in',
    'groups.inviting': 'Skickar…',
    'groups.inviteSent': 'Inbjudan skickad till {{name}}',
    'groups.invitationSent': 'Inbjuden',
    'groups.inviteFailed': 'Det gick inte att skicka inbjudan',
    'groups.noContactsToInvite': 'Inga kontakter att bjuda in',
  },
  hr: {
    'groups.inviteAction': 'Pozovi',
    'groups.inviting': 'Slanje…',
    'groups.inviteSent': 'Pozivnica poslana korisniku {{name}}',
    'groups.invitationSent': 'Pozvan',
    'groups.inviteFailed': 'Slanje pozivnice nije uspjelo',
    'groups.noContactsToInvite': 'Nema kontakata za pozivanje',
  },
  et: {
    'groups.inviteAction': 'Kutsu',
    'groups.inviting': 'Saatmine…',
    'groups.inviteSent': 'Kutse saadetud: {{name}}',
    'groups.invitationSent': 'Kutsutud',
    'groups.inviteFailed': 'Kutse saatmine ebaõnnestus',
    'groups.noContactsToInvite': 'Pole kontakte, keda kutsuda',
  },
  hu: {
    'groups.inviteAction': 'Meghívás',
    'groups.inviting': 'Küldés…',
    'groups.inviteSent': 'Meghívó elküldve: {{name}}',
    'groups.invitationSent': 'Meghívva',
    'groups.inviteFailed': 'Nem sikerült elküldeni a meghívót',
    'groups.noContactsToInvite': 'Nincs meghívható névjegy',
  },
  lv: {
    'groups.inviteAction': 'Uzaicināt',
    'groups.inviting': 'Sūta…',
    'groups.inviteSent': 'Uzaicinājums nosūtīts: {{name}}',
    'groups.invitationSent': 'Uzaicināts',
    'groups.inviteFailed': 'Neizdevās nosūtīt uzaicinājumu',
    'groups.noContactsToInvite': 'Nav kontaktu, ko uzaicināt',
  },
  lt: {
    'groups.inviteAction': 'Pakviesti',
    'groups.inviting': 'Siunčiama…',
    'groups.inviteSent': 'Kvietimas išsiųstas: {{name}}',
    'groups.invitationSent': 'Pakviestas',
    'groups.inviteFailed': 'Nepavyko išsiųsti kvietimo',
    'groups.noContactsToInvite': 'Nėra kontaktų, kuriuos pakviesti',
  },
  mt: {
    'groups.inviteAction': 'Stieden',
    'groups.inviting': 'Qed jintbagħat…',
    'groups.inviteSent': 'Stedina mibgħuta lil {{name}}',
    'groups.invitationSent': 'Mistieden',
    'groups.inviteFailed': 'Ma rnexxielniex nibagħtu l-istedina',
    'groups.noContactsToInvite': 'L-ebda kuntatt biex tistieden',
  },
  pl: {
    'groups.inviteAction': 'Zaproś',
    'groups.inviting': 'Wysyłanie…',
    'groups.inviteSent': 'Zaproszenie wysłane do {{name}}',
    'groups.invitationSent': 'Zaproszono',
    'groups.inviteFailed': 'Nie udało się wysłać zaproszenia',
    'groups.noContactsToInvite': 'Brak kontaktów do zaproszenia',
  },
  sk: {
    'groups.inviteAction': 'Pozvať',
    'groups.inviting': 'Odosiela sa…',
    'groups.inviteSent': 'Pozvánka odoslaná používateľovi {{name}}',
    'groups.invitationSent': 'Pozvaný',
    'groups.inviteFailed': 'Pozvánku sa nepodarilo odoslať',
    'groups.noContactsToInvite': 'Žiadne kontakty na pozvanie',
  },
  sl: {
    'groups.inviteAction': 'Povabi',
    'groups.inviting': 'Pošiljanje…',
    'groups.inviteSent': 'Povabilo poslano: {{name}}',
    'groups.invitationSent': 'Povabljen',
    'groups.inviteFailed': 'Povabila ni bilo mogoče poslati',
    'groups.noContactsToInvite': 'Ni stikov za povabilo',
  },
  cs: {
    'groups.inviteAction': 'Pozvat',
    'groups.inviting': 'Odesílání…',
    'groups.inviteSent': 'Pozvánka odeslána uživateli {{name}}',
    'groups.invitationSent': 'Pozván',
    'groups.inviteFailed': 'Pozvánku se nepodařilo odeslat',
    'groups.noContactsToInvite': 'Žádné kontakty k pozvání',
  },
  bg: {
    'groups.inviteAction': 'Покани',
    'groups.inviting': 'Изпращане…',
    'groups.inviteSent': 'Поканата е изпратена на {{name}}',
    'groups.invitationSent': 'Поканен',
    'groups.inviteFailed': 'Поканата не можа да бъде изпратена',
    'groups.noContactsToInvite': 'Няма контакти за поканване',
  },
  ga: {
    'groups.inviteAction': 'Tabhair cuireadh',
    'groups.inviting': 'Á sheoladh…',
    'groups.inviteSent': 'Cuireadh seolta chuig {{name}}',
    'groups.invitationSent': 'Cuireadh seolta',
    'groups.inviteFailed': 'Theip ar sheoladh an chuireadh',
    'groups.noContactsToInvite': 'Níl aon teagmhálaithe le tabhairt cuireadh dóibh',
  },
  ro: {
    'groups.inviteAction': 'Invită',
    'groups.inviting': 'Se trimite…',
    'groups.inviteSent': 'Invitație trimisă către {{name}}',
    'groups.invitationSent': 'Invitat',
    'groups.inviteFailed': 'Trimiterea invitației a eșuat',
    'groups.noContactsToInvite': 'Niciun contact de invitat',
  },
  en: {
    'groups.inviteAction': 'Invite',
    'groups.inviting': 'Sending…',
    'groups.inviteSent': 'Invitation sent to {{name}}',
    'groups.invitationSent': 'Invited',
    'groups.inviteFailed': 'Failed to send the invitation',
    'groups.noContactsToInvite': 'No contacts to invite',
  },
  uk: {
    'groups.inviteAction': 'Запросити',
    'groups.inviting': 'Надсилання…',
    'groups.inviteSent': 'Запрошення надіслано: {{name}}',
    'groups.invitationSent': 'Запрошено',
    'groups.inviteFailed': 'Не вдалося надіслати запрошення',
    'groups.noContactsToInvite': 'Немає контактів для запрошення',
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
