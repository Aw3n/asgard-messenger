import fs from 'fs'

// Passe 13 : ajoute "modal.sharePublicKeyHint" aux 25 langues.
// Corrige au passage une incohérence i18n : ModalContainer affichait ce texte
// en dur en anglais, jamais traduit. Ancre d'insertion : "modal.add", présent
// exactement une fois par section de langue.

const f = 'src/i18n/translations.ts'
let c = fs.readFileSync(f, 'utf8')

const HINTS = {
  fr: "Partagez votre clé publique avec votre contact pour qu'il puisse vous ajouter également. Vous la trouverez dans Paramètres → Profil.",
  en: 'Share your public key with your contact so they can add you as well. You can find it in Settings → Profile.',
  nl: 'Deel uw openbare sleutel met uw contact zodat deze u ook kan toevoegen. U vindt deze in Instellingen → Profiel.',
  de: 'Teilen Sie Ihren öffentlichen Schlüssel mit Ihrem Kontakt, damit dieser Sie ebenfalls hinzufügen kann. Sie finden ihn unter Einstellungen → Profil.',
  it: 'Condividi la tua chiave pubblica con il contatto affinché possa aggiungerti. La trovi in Impostazioni → Profilo.',
  es: 'Comparte tu clave pública con tu contacto para que también pueda añadirte. La encuentras en Ajustes → Perfil.',
  pt: 'Partilhe a sua chave pública com o seu contacto para que também o possa adicionar. Encontra-a em Definições → Perfil.',
  el: 'Μοιραστείτε το δημόσιο κλειδί σας με την επαφή σας για να μπορέσει να σας προσθέσει και εκείνη. Θα το βρείτε στις Ρυθμίσεις → Προφίλ.',
  da: 'Del din offentlige nøgle med din kontakt, så vedkommende også kan tilføje dig. Du finder den under Indstillinger → Profil.',
  fi: 'Jaa julkinen avaimesi kontaktisi kanssa, jotta hän voi myös lisätä sinut. Löydät sen kohdasta Asetukset → Profiili.',
  sv: 'Dela din publika nyckel med din kontakt så att denne också kan lägga till dig. Du hittar den under Inställningar → Profil.',
  hr: 'Podijelite svoj javni ključ s kontaktom kako bi vas mogao dodati. Možete ga pronaći u Postavke → Profil.',
  et: 'Jagage oma avalik võti kontaktiga, et ka tema saaks teid lisada. Leiate selle jaotisest Sätted → Profiil.',
  hu: 'Ossza meg nyilvános kulcsát a partnerével, hogy ő is hozzáadhassa Önt. A Beállítások → Profil menüben találja.',
  lv: 'Dalieties ar savu publisko atslēgu ar kontaktu, lai arī tas varētu jūs pievienot. To atradīsiet sadaļā Iestatījumi → Profils.',
  lt: 'Pasidalinkite savo viešuoju raktu su kontaktu, kad jis taip pat galėtų jus pridėti. Jį rasite skyriuje Nustatymai → Profilis.',
  mt: 'Iqsam iċ-ċavetta pubblika tiegħek mal-kontatt tiegħek sabiex ikun jista\' jżiduk ukoll. Tista\' ssibha f\'Impostazzjonijiet → Profil.',
  pl: 'Udostępnij swój klucz publiczny kontaktowi, aby mógł on również Cię dodać. Znajdziesz go w Ustawienia → Profil.',
  sk: 'Zdieľajte svoj verejný kľúč s kontaktom, aby vás mohol tiež pridať. Nájdete ho v Nastavenia → Profil.',
  sl: 'Delite svoj javni ključ s stikom, da vas lahko tudi on doda. Najdete ga v Nastavitve → Profil.',
  cs: 'Sdílejte svůj veřejný klíč s kontaktem, aby vás mohl také přidat. Najdete jej v Nastavení → Profil.',
  bg: 'Споделете вашия публичен ключ с контакта си, за да може и той да ви добави. Ще го намерите в Настройки → Профил.',
  ga: 'Comhroinn do eochair phoiblí le do theagmháil chun go mbeidh siad in ann tú a chur leis chomh maith. Faigh é in Suímh → Próifíl.',
  ro: 'Partajați-vă cheia publică cu contactul dumneavoastră pentru a vă putea adăuga și el. O găsiți în Setări → Profil.',
  uk: 'Поділіться своїм публічним ключем із контактом, щоб він також міг вас додати. Ви знайдете його в Налаштування → Профіль.',
}

// Repère les sections de langue (^  xx: {) et insère dans chacune
// après la ligne "modal.add": "...". Insertions appliquées de la fin
// vers le début pour ne pas invalider les offsets.
const sectionRegex = /^  (\w+): \{/gm
const sections = []
let m
while ((m = sectionRegex.exec(c)) !== null) sections.push({ lang: m[1], start: m.index })

const insertions = []
for (const s of sections) {
  const hint = HINTS[s.lang]
  if (!hint) {
    console.warn(`langue sans traduction: ${s.lang}`)
    continue
  }
  const next = sections.find((x) => x.start > s.start)
  const end = next ? next.start : c.length
  const section = c.slice(s.start, end)
  if (section.includes('"modal.sharePublicKeyHint"')) {
    console.log(`${s.lang}: déjà présent`)
    continue
  }
  const anchor = section.indexOf('"modal.add":')
  if (anchor === -1) {
    console.warn(`ancre "modal.add" introuvable pour ${s.lang}`)
    continue
  }
  const lineEnd = section.indexOf('\n', anchor)
  insertions.push({
    pos: s.start + lineEnd + 1,
    lang: s.lang,
    text: `      "modal.sharePublicKeyHint": ${JSON.stringify(hint)},\n`,
  })
}

insertions.sort((a, b) => b.pos - a.pos)
for (const ins of insertions) {
  c = c.slice(0, ins.pos) + ins.text + c.slice(ins.pos)
}

fs.writeFileSync(f, c)
console.log(`Inséré modal.sharePublicKeyHint dans ${insertions.length} langues`)
