import fs from 'fs'

// Passe 16 : ajoute les clés de compatibilité Asgard ↔ Keet aux 25 langues.
// Groupe A (ancre "contacts.publicKeyCopied") :
//   contacts.keetId / contacts.keetIdHint / contacts.keetIdCopied / contacts.formatsHint
// Groupe B (ancre "modal.error.publicKeyTooShort") :
//   modal.error.invalidPublicKey

const f = 'src/i18n/translations.ts'
let c = fs.readFileSync(f, 'utf8')

const GROUPS = [
  {
    anchor: '"contacts.publicKeyCopied"',
    keys: ['contacts.keetId', 'contacts.keetIdHint', 'contacts.keetIdCopied', 'contacts.formatsHint'],
    T: {
      fr: ["Identifiant Keet / Pear", "Format z-base-32 de l'écosystème Holepunch — partagez-le pour être ajouté depuis Keet ou Pear.", 'Identifiant Keet copié', "Formats acceptés : clé Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) ou lien d'invitation."],
      en: ['Keet / Pear ID', 'z-base-32 format of the Holepunch ecosystem — share it to be added from Keet or Pear.', 'Keet ID copied', 'Accepted formats: Asgard key (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32), or invite link.'],
      nl: ['Keet / Pear-ID', 'z-base-32-formaat van het Holepunch-ecosysteem — deel het om te worden toegevoegd vanuit Keet of Pear.', 'Keet-ID gekopieerd', 'Geaccepteerde formaten: Asgard-sleutel (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) of uitnodigingslink.'],
      de: ['Keet-/Pear-ID', 'z-base-32-Format des Holepunch-Ökosystems — teile es, um aus Keet oder Pear hinzugefügt zu werden.', 'Keet-ID kopiert', 'Akzeptierte Formate: Asgard-Schlüssel (88 Hex), Hypercore (64 Hex), Keet/Pear (52 z-base-32) oder Einladungslink.'],
      it: ['ID Keet / Pear', "Formato z-base-32 dell'ecosistema Holepunch — condividilo per essere aggiunto da Keet o Pear.", 'ID Keet copiato', 'Formati accettati: chiave Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) o link di invito.'],
      es: ['ID de Keet / Pear', 'Formato z-base-32 del ecosistema Holepunch — compártelo para que te añadan desde Keet o Pear.', 'ID de Keet copiado', 'Formatos aceptados: clave Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) o enlace de invitación.'],
      pt: ['ID Keet / Pear', 'Formato z-base-32 do ecossistema Holepunch — partilhe-o para ser adicionado a partir do Keet ou Pear.', 'ID Keet copiado', 'Formatos aceites: chave Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) ou link de convite.'],
      el: ['Αναγνωριστικό Keet / Pear', 'Μορφή z-base-32 του οικοσυστήματος Holepunch — μοιραστείτε το για να σας προσθέσουν από το Keet ή το Pear.', 'Το αναγνωριστικό Keet αντιγράφηκε', 'Αποδεκτές μορφές: κλειδί Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) ή σύνδεσμος πρόσκλησης.'],
      da: ['Keet/Pear-ID', 'z-base-32-format fra Holepunch-økosystemet — del det for at blive tilføjet fra Keet eller Pear.', 'Keet-ID kopieret', 'Accepterede formater: Asgard-nøgle (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) eller invitationslink.'],
      fi: ['Keet/Pear-tunniste', 'Holepunch-ekosysteemin z-base-32-muoto — jaa se, jotta sinut voidaan lisätä Keetistä tai Pearistä.', 'Keet-tunniste kopioitu', 'Hyväksytyt muodot: Asgard-avain (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) tai kutsulinkki.'],
      sv: ['Keet/Pear-ID', 'z-base-32-format från Holepunch-ekosystemet — dela det för att läggas till från Keet eller Pear.', 'Keet-ID kopierat', 'Godkända format: Asgard-nyckel (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) eller invitationslänk.'],
      hr: ['Keet/Pear ID', 'z-base-32 format Holepunch ekosustava — podijelite ga da vas dodaju iz Keeta ili Peara.', 'Keet ID kopiran', 'Prihvaćeni formati: Asgard ključ (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) ili poveznica pozivnice.'],
      et: ['Keet/Peari ID', 'Holepunchi ökosüsteemi z-base-32 vorming — jagage seda, et teid saaks lisata Keetist või Pearist.', 'Keeti ID kopeeritud', 'Aktsepteeritud vormingud: Asgardi võti (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) või kutselink.'],
      hu: ['Keet / Pear azonosító', 'A Holepunch ökoszisztéma z-base-32 formátuma — ossza meg, hogy Keetből vagy Pearből felvehessék.', 'Keet azonosító másolva', 'Elfogadott formátumok: Asgard-kulcs (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) vagy meghívó link.'],
      lv: ['Keet / Pear ID', 'Holepunch ekosistēmas z-base-32 formāts — dalieties ar to, lai jūs pievienotu no Keet vai Pear.', 'Keet ID nokopēts', 'Pieņemtie formāti: Asgard atslēga (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) vai ielūguma saite.'],
      lt: ['Keet / Pear ID', 'Holepunch ekosistemos z-base-32 formatas — pasidalinkite juo, kad jus pridėtų iš Keet ar Pear.', 'Keet ID nukopijuotas', 'Priimami formatai: Asgard raktas (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) arba pakvietimo nuoroda.'],
      mt: ["ID ta' Keet / Pear", "Format z-base-32 tal-ekosistema Holepunch — aqsam biex jiżdied minn Keet jew Pear.", "ID ta' Keet ikkupjat", "Formati aċċettati: iċ-ċavetta Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) jew link ta' stedina."],
      pl: ['Identyfikator Keet / Pear', 'Format z-base-32 ekosystemu Holepunch — udostępnij go, aby dodano Cię z Keet lub Pear.', 'Skopiowano identyfikator Keet', 'Akceptowane formaty: klucz Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) lub link zaproszenia.'],
      sk: ['Keet/Pear ID', 'Formát z-base-32 ekosystému Holepunch — zdieľajte ho, aby vás pridali z Keetu alebo Pearu.', 'Keet ID skopírované', 'Prijaté formáty: kľúč Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) alebo pozývací odkaz.'],
      sl: ['ID Keet / Pear', 'Zapis z-base-32 ekosistema Holepunch — delite ga, da vas dodajo iz Keeta ali Peara.', 'ID Keet kopiran', 'Sprejeti zapisi: ključ Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) ali povezava povabila.'],
      cs: ['Keet/Pear ID', 'Formát z-base-32 ekosystému Holepunch — sdílejte jej, aby vás přidali z Keetu nebo Pearu.', 'Keet ID zkopírováno', 'Přijímané formáty: klíč Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) nebo odkaz pozvánky.'],
      bg: ['Keet / Pear идентификатор', 'Формат z-base-32 на екосистемата Holepunch — споделете го, за да ви добавят от Keet или Pear.', 'Keet идентификаторът е копиран', 'Приети формати: ключ Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) или линк за покана.'],
      ga: ['Aitheantas Keet / Pear', 'Formáid z-base-32 an chóras Holepunch — roinn é chun go gcuirfear leat ó Keet nó Pear.', 'Aitheantas Keet cóipeáilte', 'Formáidí glactha: eochair Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) nó nasc cuiridh.'],
      ro: ['ID Keet / Pear', 'Formatul z-base-32 al ecosistemului Holepunch — partajați-l pentru a fi adăugat din Keet sau Pear.', 'ID Keet copiat', 'Formate acceptate: cheie Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) sau link de invitație.'],
      uk: ['Ідентифікатор Keet / Pear', 'Формат z-base-32 екосистеми Holepunch — поділіться ним, щоб вас додали з Keet або Pear.', 'Ідентифікатор Keet скопійовано', 'Прийнятні формати: ключ Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32) або посилання-запрошення.'],
    },
  },
  {
    anchor: '"modal.error.publicKeyTooShort"',
    keys: ['modal.error.invalidPublicKey'],
    T: {
      fr: ['Clé publique invalide — formats acceptés : Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      en: ['Invalid public key — accepted formats: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      nl: ['Ongeldige openbare sleutel — geaccepteerde formaten: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      de: ['Ungültiger öffentlicher Schlüssel — akzeptierte Formate: Asgard (88 Hex), Hypercore (64 Hex), Keet/Pear (52 z-base-32).'],
      it: ['Chiave pubblica non valida — formati accettati: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      es: ['Clave pública no válida — formatos aceptados: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      pt: ['Chave pública inválida — formatos aceites: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      el: ['Μη έγκυρο δημόσιο κλειδί — αποδεκτές μορφές: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      da: ['Ugyldig offentlig nøgle — accepterede formater: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      fi: ['Virheellinen julkinen avain — hyväksytyt muodot: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      sv: ['Ogiltig publik nyckel — godkända format: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      hr: ['Neispravan javni ključ — prihvaćeni formati: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      et: ['Vigane avalik võti — aktsepteeritud vormingud: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      hu: ['Érvénytelen nyilvános kulcs — elfogadott formátumok: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      lv: ['Nederīga publiskā atslēga — pieņemtie formāti: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      lt: ['Netinkamas viešasis raktas — priimami formatai: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      mt: ['Ċavetta pubblika invalida — formati aċċettati: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      pl: ['Nieprawidłowy klucz publiczny — akceptowane formaty: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      sk: ['Neplatný verejný kľúč — prijaté formáty: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      sl: ['Neveljaven javni ključ — sprejeti zapisi: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      cs: ['Neplatný veřejný klíč — přijímané formáty: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      bg: ['Невалиден публичен ключ — приети формати: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      ga: ['Eochair phoiblí neamhbhailí — formáidí glactha: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      ro: ['Cheie publică nevalidă — formate acceptate: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
      uk: ['Недійсний публічний ключ — прийнятні формати: Asgard (88 hex), Hypercore (64 hex), Keet/Pear (52 z-base-32).'],
    },
  },
]

const sectionRegex = /^  (\w+): \{/gm
const sections = []
let m
while ((m = sectionRegex.exec(c)) !== null) sections.push({ lang: m[1], start: m.index })

const insertions = []
for (const s of sections) {
  const next = sections.find((x) => x.start > s.start)
  const end = next ? next.start : c.length
  const section = c.slice(s.start, end)

  for (const group of GROUPS) {
    const values = group.T[s.lang]
    if (!values) continue
    if (values.length !== group.keys.length) {
      console.warn(`${s.lang}: ${values.length} valeurs pour ${group.keys.length} clés — ignoré`)
      continue
    }
    if (section.includes(JSON.stringify(group.keys[0]))) {
      console.log(`${s.lang} [${group.keys[0]}]: déjà présent`)
      continue
    }
    const anchor = section.indexOf(group.anchor)
    if (anchor === -1) {
      console.warn(`ancre ${group.anchor} introuvable pour ${s.lang}`)
      continue
    }
    const lineEnd = section.indexOf('\n', anchor)
    const text = group.keys.map((k, i) => `      ${JSON.stringify(k)}: ${JSON.stringify(values[i])},\n`).join('')
    insertions.push({ pos: s.start + lineEnd + 1, lang: s.lang, text })
  }
}

insertions.sort((a, b) => b.pos - a.pos)
for (const ins of insertions) {
  c = c.slice(0, ins.pos) + ins.text + c.slice(ins.pos)
}

fs.writeFileSync(f, c)
const total = insertions.reduce((n, ins) => n + ins.text.split('\n').filter(Boolean).length, 0)
console.log(`Inséré ${total} entrées dans ${insertions.length} sections de langue`)
