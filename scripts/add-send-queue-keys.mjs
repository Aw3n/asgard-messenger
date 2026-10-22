#!/usr/bin/env node
/**
 * Injecte dans src/i18n/translations.ts (25 langues) les clés de la file
 * d'envoi hors ligne :
 *   chat.messageQueued       — toast quand le message attend la reconnexion
 *   chat.messageNotDelivered — libellé accessible de l'icône d'échec
 *
 * fallbackLng 'fr' masque toute clé manquante : sans ces lignes, les autres
 * locales afficheraient du français.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.messageQueued', 'chat.messageNotDelivered', 'chat.fileTypeBlocked']

const DATA = {
  fr: {
    'chat.messageQueued': "En attente d'envoi — le contact est hors ligne, le message partira à sa reconnexion.",
    'chat.messageNotDelivered': 'Message non délivré',
    'chat.fileTypeBlocked': "Par sécurité, ce type de fichier ne peut pas être ouvert directement. Utilisez « Enregistrer sous ».",
  },
  en: {
    'chat.messageQueued': 'Queued — will send when the contact is back online.',
    'chat.messageNotDelivered': 'Message not delivered',
    'chat.fileTypeBlocked': 'For safety, this file type cannot be opened directly. Use “Save as” instead.',
  },
  nl: {
    'chat.messageQueued': 'In wachtrij — wordt verzonden zodra het contact weer online is.',
    'chat.messageNotDelivered': 'Bericht niet bezorgd',
    'chat.fileTypeBlocked': 'Uit veiligheid kan dit bestandstype niet rechtstreeks worden geopend. Gebruik ‘Opslaan als’.',
  },
  de: {
    'chat.messageQueued': 'In Warteschlange – wird gesendet, sobald der Kontakt wieder online ist.',
    'chat.messageNotDelivered': 'Nachricht nicht zugestellt',
    'chat.fileTypeBlocked': 'Aus Sicherheitsgründen kann dieser Dateityp nicht direkt geöffnet werden. Verwenden Sie „Speichern unter“.',
  },
  it: {
    'chat.messageQueued': 'In coda — verrà inviato quando il contatto sarà di nuovo online.',
    'chat.messageNotDelivered': 'Messaggio non consegnato',
    'chat.fileTypeBlocked': 'Per sicurezza, questo tipo di file non può essere aperto direttamente. Usa «Salva con nome».',
  },
  es: {
    'chat.messageQueued': 'En cola: se enviará cuando el contacto vuelva a estar en línea.',
    'chat.messageNotDelivered': 'Mensaje no entregado',
    'chat.fileTypeBlocked': 'Por seguridad, este tipo de archivo no se puede abrir directamente. Usa «Guardar como».',
  },
  pt: {
    'chat.messageQueued': 'Em fila — será enviado quando o contacto voltar a estar online.',
    'chat.messageNotDelivered': 'Mensagem não entregue',
    'chat.fileTypeBlocked': 'Por segurança, este tipo de ficheiro não pode ser aberto diretamente. Use «Guardar como».',
  },
  el: {
    'chat.messageQueued': 'Σε αναμονή — θα σταλεί όταν η επαφή επανέλθει σε σύνδεση.',
    'chat.messageNotDelivered': 'Το μήνυμα δεν παραδόθηκε',
    'chat.fileTypeBlocked': 'Για ασφάλεια, αυτός ο τύπος αρχείου δεν μπορεί να ανοίξει απευθείας. Χρησιμοποιήστε «Αποθήκευση ως».',
  },
  da: {
    'chat.messageQueued': 'I kø — sendes, når kontakten er online igen.',
    'chat.messageNotDelivered': 'Beskeden blev ikke leveret',
    'chat.fileTypeBlocked': 'Af sikkerhedshensyn kan denne filtype ikke åbnes direkte. Brug »Gem som«.',
  },
  fi: {
    'chat.messageQueued': 'Jonossa — lähetetään, kun yhteyshenkilö on taas paikalla.',
    'chat.messageNotDelivered': 'Viestiä ei toimitettu',
    'chat.fileTypeBlocked': 'Turvallisuussyistä tätä tiedostotyyppiä ei voi avata suoraan. Käytä Tallenna nimellä.',
  },
  sv: {
    'chat.messageQueued': 'I kö — skickas när kontakten är online igen.',
    'chat.messageNotDelivered': 'Meddelandet levererades inte',
    'chat.fileTypeBlocked': 'Av säkerhetsskäl kan den här filtypen inte öppnas direkt. Använd »Spara som».',
  },
  hr: {
    'chat.messageQueued': 'U redu čekanja — poslat će se kad kontakt ponovno bude na mreži.',
    'chat.messageNotDelivered': 'Poruka nije dostavljena',
    'chat.fileTypeBlocked': 'Iz sigurnosnih razloga ova vrsta datoteke ne može se izravno otvoriti. Upotrijebite „Spremi kao”.',
  },
  et: {
    'chat.messageQueued': 'Järjekorras — saadetakse, kui kontakt on jälle võrgus.',
    'chat.messageNotDelivered': 'Sõnumit ei toimetatud',
    'chat.fileTypeBlocked': 'Turvalisuse huvides ei saa seda failitüüpi otse avada. Kasutage „Salvesta kui”.',
  },
  hu: {
    'chat.messageQueued': 'Várólistán — elküldésre kerül, amikor a kapcsolat újra online lesz.',
    'chat.messageNotDelivered': 'Az üzenet nem kézbesíthető',
    'chat.fileTypeBlocked': 'Biztonsági okokból ez a fájltípus nem nyitható meg közvetlenül. Használja a „Mentés másként” lehetőséget.',
  },
  lv: {
    'chat.messageQueued': 'Rindā — tiks nosūtīts, kad kontakts būs atkal tiešsaistē.',
    'chat.messageNotDelivered': 'Ziņa nav piegādāta',
    'chat.fileTypeBlocked': 'Drošības dēļ šo faila tipu nevar atvērt tieši. Izmantojiet “Saglabāt kā”.',
  },
  lt: {
    'chat.messageQueued': 'Eilėje — bus išsiųsta, kai kontaktas vėl bus prisijungęs.',
    'chat.messageNotDelivered': 'Žinutė nepristatyta',
    'chat.fileTypeBlocked': 'Saugumo sumetimais šio tipo failo negalima atidaryti tiesiogiai. Naudokite „Išsaugoti kaip“.',
  },
  mt: {
    'chat.messageQueued': "Fil-kju — tintbagħat meta l-kuntatt jerġa' jkun online.",
    'chat.messageNotDelivered': 'Il-messaġġ ma nwassalx',
    'chat.fileTypeBlocked': "Għas-sigurtà, dan it-tip ta' fajl ma jistax jinfetaħ direttament. Uża “Issejvja bħala”.",
  },
  pl: {
    'chat.messageQueued': 'W kolejce — zostanie wysłana, gdy kontakt znów będzie online.',
    'chat.messageNotDelivered': 'Wiadomość nie została dostarczona',
    'chat.fileTypeBlocked': 'Ze względów bezpieczeństwa tego typu pliku nie można otworzyć bezpośrednio. Użyj „Zapisz jako”.',
  },
  sk: {
    'chat.messageQueued': 'V poradí — odošle sa, keď bude kontakt opäť online.',
    'chat.messageNotDelivered': 'Správa nebola doručená',
    'chat.fileTypeBlocked': 'Z bezpečnostných dôvodov tento typ súboru nemožno otvoriť priamo. Použite „Uložiť ako“.',
  },
  sl: {
    'chat.messageQueued': 'V čakalni vrsti — poslano bo, ko bo stik spet na spletu.',
    'chat.messageNotDelivered': 'Sporočilo ni bilo dostavljeno',
    'chat.fileTypeBlocked': 'Zaradi varnosti te vrste datoteke ni mogoče odpreti neposredno. Uporabite »Shrani kot«.',
  },
  cs: {
    'chat.messageQueued': 'Ve frontě — odešle se, až bude kontakt znovu online.',
    'chat.messageNotDelivered': 'Zpráva nebyla doručena',
    'chat.fileTypeBlocked': 'Z bezpečnostních důvodů nelze tento typ souboru otevřít přímo. Použijte „Uložit jako“.',
  },
  bg: {
    'chat.messageQueued': 'В опашка — ще се изпрати, когато контактът отново е онлайн.',
    'chat.messageNotDelivered': 'Съобщението не е доставено',
    'chat.fileTypeBlocked': 'От съображения за сигурност този тип файл не може да се отвори директно. Използвайте „Запази като“.',
  },
  ga: {
    'chat.messageQueued': 'Sa scuaine — seolfar nuair a bheidh an teagmhálaí ar líne arís.',
    'chat.messageNotDelivered': 'Níor seachadadh an teachtaireacht',
    'chat.fileTypeBlocked': 'Ar mhaithe le sábháilteacht, ní féidir an cineál comhaid seo a oscailt go díreach. Úsáid “Sábháil mar”.',
  },
  ro: {
    'chat.messageQueued': 'În coadă — se va trimite când contactul va fi din nou online.',
    'chat.messageNotDelivered': 'Mesajul nu a fost livrat',
    'chat.fileTypeBlocked': 'Din motive de siguranță, acest tip de fișier nu poate fi deschis direct. Folosiți „Salvează ca”.',
  },
  uk: {
    'chat.messageQueued': 'У черзі — надішлеться, коли контакт знову буде онлайн.',
    'chat.messageNotDelivered': 'Повідомлення не доставлено',
    'chat.fileTypeBlocked': 'З міркувань безпеки цей тип файлу не можна відкрити напряму. Скористайтеся «Зберегти як».',
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
console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
