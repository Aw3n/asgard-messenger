#!/usr/bin/env node
/**
 * Injecte dans src/i18n/translations.ts (25 langues) les clés du flux de
 * demande de contact :
 *   contacts.replyToConfirm — bandeau d'une demande entrante non confirmée
 *   contacts.requestSent    — bandeau d'une demande sortante en attente
 *   contacts.pendingBadge   — pastille « en attente » (contacts, conversations)
 *
 * fallbackLng 'fr' masque toute clé manquante : sans ces lignes, les autres
 * locales afficheraient du français.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['contacts.replyToConfirm', 'contacts.requestSent', 'contacts.pendingBadge']

const DATA = {
  fr: {
    'contacts.replyToConfirm': "Répondez dans la conversation pour confirmer l'ajout.",
    'contacts.requestSent': "Demande envoyée — l'ajout sera confirmé à sa première réponse.",
    'contacts.pendingBadge': 'En attente',
  },
  nl: {
    'contacts.replyToConfirm': 'Antwoord in het gesprek om het contact te bevestigen.',
    'contacts.requestSent': 'Verzoek verzonden — het contact wordt bevestigd bij het eerste antwoord.',
    'contacts.pendingBadge': 'In afwachting',
  },
  de: {
    'contacts.replyToConfirm': 'Antworten Sie im Gespräch, um den Kontakt zu bestätigen.',
    'contacts.requestSent': 'Anfrage gesendet — der Kontakt wird mit der ersten Antwort bestätigt.',
    'contacts.pendingBadge': 'Ausstehend',
  },
  it: {
    'contacts.replyToConfirm': 'Rispondi nella conversazione per confermare il contatto.',
    'contacts.requestSent': 'Richiesta inviata — il contatto sarà confermato alla prima risposta.',
    'contacts.pendingBadge': 'In attesa',
  },
  es: {
    'contacts.replyToConfirm': 'Responde en la conversación para confirmar el contacto.',
    'contacts.requestSent': 'Solicitud enviada: el contacto se confirmará con su primera respuesta.',
    'contacts.pendingBadge': 'Pendiente',
  },
  pt: {
    'contacts.replyToConfirm': 'Responda na conversa para confirmar o contacto.',
    'contacts.requestSent': 'Pedido enviado — o contacto será confirmado na primeira resposta.',
    'contacts.pendingBadge': 'Pendente',
  },
  el: {
    'contacts.replyToConfirm': 'Απαντήστε στη συνομιλία για να επιβεβαιώσετε την επαφή.',
    'contacts.requestSent': 'Το αίτημα στάλθηκε — η επαφή θα επιβεβαιωθεί με την πρώτη απάντηση.',
    'contacts.pendingBadge': 'Σε αναμονή',
  },
  da: {
    'contacts.replyToConfirm': 'Svar i samtalen for at bekræfte kontakten.',
    'contacts.requestSent': 'Anmodning sendt — kontakten bekræftes ved det første svar.',
    'contacts.pendingBadge': 'Afventer',
  },
  fi: {
    'contacts.replyToConfirm': 'Vastaa keskustelussa vahvistaaksesi yhteystiedon.',
    'contacts.requestSent': 'Pyyntö lähetetty — yhteystieto vahvistetaan ensimmäisellä vastauksella.',
    'contacts.pendingBadge': 'Odottaa',
  },
  sv: {
    'contacts.replyToConfirm': 'Svara i konversationen för att bekräfta kontakten.',
    'contacts.requestSent': 'Förfrågan skickad — kontakten bekräftas vid första svaret.',
    'contacts.pendingBadge': 'Väntar',
  },
  hr: {
    'contacts.replyToConfirm': 'Odgovorite u razgovoru kako biste potvrdili kontakt.',
    'contacts.requestSent': 'Zahtjev poslan — kontakt će biti potvrđen prvim odgovorom.',
    'contacts.pendingBadge': 'Na čekanju',
  },
  et: {
    'contacts.replyToConfirm': 'Kinnitage kontakt, vastates vestluses.',
    'contacts.requestSent': 'Taotlus saadetud — kontakt kinnitatakse esimese vastusega.',
    'contacts.pendingBadge': 'Ootel',
  },
  hu: {
    'contacts.replyToConfirm': 'Válaszoljon a beszélgetésben a névjegy megerősítéséhez.',
    'contacts.requestSent': 'Kérés elküldve — a névjegy az első válasszal erősödik meg.',
    'contacts.pendingBadge': 'Függőben',
  },
  lv: {
    'contacts.replyToConfirm': 'Atbildiet sarunā, lai apstiprinātu kontaktu.',
    'contacts.requestSent': 'Pieprasījums nosūtīts — kontakts tiks apstiprināts ar pirmo atbildi.',
    'contacts.pendingBadge': 'Gaida',
  },
  lt: {
    'contacts.replyToConfirm': 'Atsakykite pokalbyje, kad patvirtintumėte kontaktą.',
    'contacts.requestSent': 'Užklausa išsiųsta — kontaktas bus patvirtintas pirmuoju atsakymu.',
    'contacts.pendingBadge': 'Laukiama',
  },
  mt: {
    'contacts.replyToConfirm': 'Wieġeb fil-konversazzjoni biex tikkonferma l-kuntatt.',
    'contacts.requestSent': 'Talba mibgħuta — il-kuntatt jiġi kkonfermat fl-ewwel tweġiba.',
    'contacts.pendingBadge': 'Pendenti',
  },
  pl: {
    'contacts.replyToConfirm': 'Odpowiedz w rozmowie, aby potwierdzić kontakt.',
    'contacts.requestSent': 'Zaproszenie wysłane — kontakt zostanie potwierdzony przy pierwszej odpowiedzi.',
    'contacts.pendingBadge': 'Oczekuje',
  },
  sk: {
    'contacts.replyToConfirm': 'Odpovedzte v konverzácii, aby potvrdiť kontakt.',
    'contacts.requestSent': 'Žiadosť odoslaná — kontakt sa potvrdí pri prvej odpovedi.',
    'contacts.pendingBadge': 'Čaká sa',
  },
  sl: {
    'contacts.replyToConfirm': 'Odgovorite v pogovoru, da potrdite stik.',
    'contacts.requestSent': 'Zahteva poslana — stik bo potrjen ob prvem odgovoru.',
    'contacts.pendingBadge': 'V čakanju',
  },
  cs: {
    'contacts.replyToConfirm': 'Odpovězte v konverzaci, abyste potvrdili kontakt.',
    'contacts.requestSent': 'Žádost odeslána — kontakt bude potvrzen první odpovědí.',
    'contacts.pendingBadge': 'Čeká na potvrzení',
  },
  bg: {
    'contacts.replyToConfirm': 'Отговорете в разговора, за да потвърдите контакта.',
    'contacts.requestSent': 'Заявката е изпратена — контактът ще бъде потвърден при първия отговор.',
    'contacts.pendingBadge': 'Чака',
  },
  ga: {
    'contacts.replyToConfirm': 'Freagair sa chomhrá chun an teagmhálaí a dheimhniú.',
    'contacts.requestSent': 'Iarratas seolta — deimhneofar an teagmhálaí ar an gcéad fhreagra.',
    'contacts.pendingBadge': 'Ag feitheamh',
  },
  ro: {
    'contacts.replyToConfirm': 'Răspundeți în conversație pentru a confirma contactul.',
    'contacts.requestSent': 'Cerere trimisă — contactul va fi confirmat la primul răspuns.',
    'contacts.pendingBadge': 'În așteptare',
  },
  en: {
    'contacts.replyToConfirm': 'Reply in the conversation to confirm the contact.',
    'contacts.requestSent': 'Request sent — the contact will be confirmed on their first reply.',
    'contacts.pendingBadge': 'Pending',
  },
  uk: {
    'contacts.replyToConfirm': 'Дайте відповідь у розмові, щоб підтвердити контакт.',
    'contacts.requestSent': 'Запит надіслано — контакт буде підтверджено першою відповіддю.',
    'contacts.pendingBadge': 'Очікує',
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
