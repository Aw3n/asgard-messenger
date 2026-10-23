#!/usr/bin/env node
/**
 * Adds the seven storage keys of the download lot (settings.autoDownloadMaxLabel /
 * …MaxDesc, settings.downloadFolder / …None / …Desc / …Choose / …Reset) to all 25
 * supported languages of src/i18n/translations.ts.
 *
 * Why this wording : FileService refusait déjà l'auto-téléchargement au-dessus de
 * settings.storage.autoDownload.maxSize et electron/ipc/handlers.ts ignorait
 * settings.storage.downloadPath — deux réglages écrits par le store, visibles
 * dans les exportations de paramètres, sans aucun lecteur. Le libellé de taille
 * reprend le nom « pièce jointe » et le « clic » déjà posés par
 * settings.cacheLimitDesc, pour que la carte entière parle du même geste.
 *
 * Same in-place algorithm as add-voice-pause-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = [
  'settings.autoDownloadMaxLabel',
  'settings.autoDownloadMaxDesc',
  'settings.downloadFolder',
  'settings.downloadFolderNone',
  'settings.downloadFolderDesc',
  'settings.downloadFolderChoose',
  'settings.downloadFolderReset',
]

const DATA = {
  fr: {
    'settings.autoDownloadMaxLabel': 'Taille maximale',
    'settings.autoDownloadMaxDesc': 'Au-delà de cette taille, la pièce jointe reste disponible au clic.',
    'settings.downloadFolder': 'Dossier d’enregistrement',
    'settings.downloadFolderNone': 'Dossier par défaut du système',
    'settings.downloadFolderDesc': 'Où s’ouvrent les boîtes d’enregistrement des pièces jointes. Si le dossier disparaît, le système reprend son emplacement habituel.',
    'settings.downloadFolderChoose': 'Choisir un dossier…',
    'settings.downloadFolderReset': 'Revenir au dossier par défaut',
  },
  nl: {
    'settings.autoDownloadMaxLabel': 'Maximale grootte',
    'settings.autoDownloadMaxDesc': 'Voorbij deze grootte blijft de bijlage beschikbaar met een klik.',
    'settings.downloadFolder': 'Opslagmap',
    'settings.downloadFolderNone': 'Standaardmap van het systeem',
    'settings.downloadFolderDesc': 'Waar de opslagvensters van bijlagen zich openen. Als de map verdwijnt, valt het systeem terug op zijn gebruikelijke locatie.',
    'settings.downloadFolderChoose': 'Map kiezen…',
    'settings.downloadFolderReset': 'Terug naar de standaardmap',
  },
  de: {
    'settings.autoDownloadMaxLabel': 'Maximale Größe',
    'settings.autoDownloadMaxDesc': 'Oberhalb dieser Größe bleibt der Anhang per Klick verfügbar.',
    'settings.downloadFolder': 'Zielordner',
    'settings.downloadFolderNone': 'Standardordner des Systems',
    'settings.downloadFolderDesc': 'Wo die Speicherdialoge der Anhänge geöffnet werden. Fehlt der Ordner, nutzt das System wieder seinen üblichen Speicherort.',
    'settings.downloadFolderChoose': 'Ordner auswählen…',
    'settings.downloadFolderReset': 'Zurück zum Standardordner',
  },
  it: {
    'settings.autoDownloadMaxLabel': 'Dimensione massima',
    'settings.autoDownloadMaxDesc': 'Oltre questa dimensione, l’allegato resta disponibile al clic.',
    'settings.downloadFolder': 'Cartella di salvataggio',
    'settings.downloadFolderNone': 'Cartella predefinita del sistema',
    'settings.downloadFolderDesc': 'Dove si aprono le finestre di salvataggio degli allegati. Se la cartella non c’è più, il sistema torna alla sua posizione abituale.',
    'settings.downloadFolderChoose': 'Scegli una cartella…',
    'settings.downloadFolderReset': 'Torna alla cartella predefinita',
  },
  es: {
    'settings.autoDownloadMaxLabel': 'Tamaño máximo',
    'settings.autoDownloadMaxDesc': 'Por encima de este tamaño, el archivo adjunto sigue disponible con un clic.',
    'settings.downloadFolder': 'Carpeta de guardado',
    'settings.downloadFolderNone': 'Carpeta predeterminada del sistema',
    'settings.downloadFolderDesc': 'Dónde se abren los cuadros de guardado de los archivos adjuntos. Si la carpeta desaparece, el sistema vuelve a su ubicación habitual.',
    'settings.downloadFolderChoose': 'Elegir carpeta…',
    'settings.downloadFolderReset': 'Volver a la carpeta predeterminada',
  },
  pt: {
    'settings.autoDownloadMaxLabel': 'Tamanho máximo',
    'settings.autoDownloadMaxDesc': 'Acima deste tamanho, o anexo continua disponível com um clique.',
    'settings.downloadFolder': 'Pasta de destino',
    'settings.downloadFolderNone': 'Pasta predefinida do sistema',
    'settings.downloadFolderDesc': 'Onde as janelas de gravação dos anexos se abrem. Se a pasta desaparecer, o sistema volta à sua localização habitual.',
    'settings.downloadFolderChoose': 'Escolher pasta…',
    'settings.downloadFolderReset': 'Voltar à pasta predefinida',
  },
  el: {
    'settings.autoDownloadMaxLabel': 'Μέγιστο μέγεθος',
    'settings.autoDownloadMaxDesc': 'Πάνω από αυτό το μέγεθος, το συνημμένο παραμένει διαθέσιμο με κλικ.',
    'settings.downloadFolder': 'Φάκελος αποθήκευσης',
    'settings.downloadFolderNone': 'Προεπιλεγμένος φάκελος του συστήματος',
    'settings.downloadFolderDesc': 'Όπου ανοίγουν τα παράθυρα αποθήκευσης των συνημμένων. Αν ο φάκελος εκλείψει, το σύστημα επιστρέφει στη συνήθη τοποθεσία του.',
    'settings.downloadFolderChoose': 'Επιλογή φακέλου…',
    'settings.downloadFolderReset': 'Επιστροφή στον προεπιλεγμένο φάκελο',
  },
  da: {
    'settings.autoDownloadMaxLabel': 'Maksimal størrelse',
    'settings.autoDownloadMaxDesc': 'Over denne størrelse forbliver vedhæftningen tilgængelig med et klik.',
    'settings.downloadFolder': 'Mappe til gemte filer',
    'settings.downloadFolderNone': 'Systemets standardmappe',
    'settings.downloadFolderDesc': 'Hvor dialogerne til at gemme vedhæftninger åbner. Forsvinder mappen, vender systemet tilbage til sin vanlige placering.',
    'settings.downloadFolderChoose': 'Vælg mappe…',
    'settings.downloadFolderReset': 'Tilbage til standardmappen',
  },
  fi: {
    'settings.autoDownloadMaxLabel': 'Enimmäiskoko',
    'settings.autoDownloadMaxDesc': 'Tätä suuremmat liitteet pysyvät saatavilla napsautuksella.',
    'settings.downloadFolder': 'Tallennuskansio',
    'settings.downloadFolderNone': 'Järjestelmän oletuskansio',
    'settings.downloadFolderDesc': 'Missä liitteiden tallennusvalikot avautuvat. Jos kansiota ei ole, järjestelmä palaa taviseen sijaintiinsa.',
    'settings.downloadFolderChoose': 'Valitse kansio…',
    'settings.downloadFolderReset': 'Palaa oletuskansioon',
  },
  sv: {
    'settings.autoDownloadMaxLabel': 'Maximal storlek',
    'settings.autoDownloadMaxDesc': 'Över denna storlek finns bilagan kvar med ett klick.',
    'settings.downloadFolder': 'Sparmapp',
    'settings.downloadFolderNone': 'Systemets standardmapp',
    'settings.downloadFolderDesc': 'Var dialogrutorna för att spara bilagor öppnas. Om mappen försvinner återgår systemet till sin vanliga plats.',
    'settings.downloadFolderChoose': 'Välj mapp…',
    'settings.downloadFolderReset': 'Tillbaka till standardmappen',
  },
  hr: {
    'settings.autoDownloadMaxLabel': 'Najveća veličina',
    'settings.autoDownloadMaxDesc': 'Iznad ove veličine privitak ostaje dostupan klikom.',
    'settings.downloadFolder': 'Mapa za spremanje',
    'settings.downloadFolderNone': 'Zadana mapa sustava',
    'settings.downloadFolderDesc': 'Gdje se otvaraju dijalozi za spremanje privitaka. Ako mapa nestane, sustav se vraća na uobičajeno mjesto.',
    'settings.downloadFolderChoose': 'Odaberi mapu…',
    'settings.downloadFolderReset': 'Vrati zadanu mapu',
  },
  et: {
    'settings.autoDownloadMaxLabel': 'Maksimaalsuurus',
    'settings.autoDownloadMaxDesc': 'Sellest suureman manus jääb klõpsamisega kättesaadavaks.',
    'settings.downloadFolder': 'Salvestuskaust',
    'settings.downloadFolderNone': 'Süsteemi vaikenekaust',
    'settings.downloadFolderDesc': 'Kus manuste salvestamise dialoogid avanevad. Kui kaust kaob, naaseb süsteem oma tavalise asukoha juurde.',
    'settings.downloadFolderChoose': 'Vali kaust…',
    'settings.downloadFolderReset': 'Naase vaikenekausta juurde',
  },
  hu: {
    'settings.autoDownloadMaxLabel': 'Maximális méret',
    'settings.autoDownloadMaxDesc': 'E felett a csatolmány csak kattintással érhető el.',
    'settings.downloadFolder': 'Mentési mappa',
    'settings.downloadFolderNone': 'A rendszer alapértelmezett mappája',
    'settings.downloadFolderDesc': 'Hol jelennek meg a csatolmányok mentési párbeszédpaneljei. Ha a mappa eltűnik, a rendszer a szokásos helyre tér vissza.',
    'settings.downloadFolderChoose': 'Mappa kiválasztása…',
    'settings.downloadFolderReset': 'Vissza az alapértelmezett mappára',
  },
  lv: {
    'settings.autoDownloadMaxLabel': 'Maksimālais izmērs',
    'settings.autoDownloadMaxDesc': 'Virpā šo izmēru pielikums paliek pieejams, noklikšķinot.',
    'settings.downloadFolder': 'Saglabāšanas mape',
    'settings.downloadFolderNone': 'Sistēmas noklusējuma mape',
    'settings.downloadFolderDesc': 'Kur atveras pielikumu saglabāšanas logi. Ja mape pazūd, sistēma atgriežas ierastajā vietā.',
    'settings.downloadFolderChoose': 'Izvēlēties mapi…',
    'settings.downloadFolderReset': 'Atgriezties noklusējuma mapē',
  },
  lt: {
    'settings.autoDownloadMaxLabel': 'Didžiausias dydis',
    'settings.autoDownloadMaxDesc': 'Didesni priedai lieka pasiekiami spustelėjus.',
    'settings.downloadFolder': 'Išsaugojimo aplankas',
    'settings.downloadFolderNone': 'Sistemos numatytasis aplankas',
    'settings.downloadFolderDesc': 'Kur atsidaro priedų išsaugojimo langai. Jei aplankas dingsta, sistema grįžta į įprastą vietą.',
    'settings.downloadFolderChoose': 'Pasirinkti aplanką…',
    'settings.downloadFolderReset': 'Grįžti į numatytąjį aplanką',
  },
  mt: {
    'settings.autoDownloadMaxLabel': 'Daqs massimu',
    'settings.autoDownloadMaxDesc': 'Ogħla minn daqs hekk, l-allegat jibqa’ disponibbli b’klikk.',
    'settings.downloadFolder': 'Fowlier tal-ħażna',
    'settings.downloadFolderNone': 'Il-fowlier predefinit tas-sistema',
    'settings.downloadFolderDesc': 'Fejn jinfetħu d-djalogi tal-ħażna tal-allegati. Jekk il-fowlier jisparixxi, is-sistema tirritorna fil-post abitwali tagħha.',
    'settings.downloadFolderChoose': 'Agħżel fowlier…',
    'settings.downloadFolderReset': 'Lura għall-fowlier predefinit',
  },
  pl: {
    'settings.autoDownloadMaxLabel': 'Maksymalny rozmiar',
    'settings.autoDownloadMaxDesc': 'Powyżej tego rozmiaru załącznik pozostaje dostępny po kliknięciu.',
    'settings.downloadFolder': 'Folder zapisu',
    'settings.downloadFolderNone': 'Domyślny folder systemu',
    'settings.downloadFolderDesc': 'Gdzie otwierają się okna zapisu załączników. Jeśli folder zniknie, system wraca do swojej zwykłej lokalizacji.',
    'settings.downloadFolderChoose': 'Wybierz folder…',
    'settings.downloadFolderReset': 'Wróć do domyślnego folderu',
  },
  sk: {
    'settings.autoDownloadMaxLabel': 'Maximálna veľkosť',
    'settings.autoDownloadMaxDesc': 'Nad touto veľkosťou zostáva príloha dostupná kliknutím.',
    'settings.downloadFolder': 'Priečinok na ukladanie',
    'settings.downloadFolderNone': 'Predvolený priečinok systému',
    'settings.downloadFolderDesc': 'Kde sa otvárajú dialógové okná uloženia príloh. Ak priečinok zmizne, systém sa vráti na svoje obvyklé miesto.',
    'settings.downloadFolderChoose': 'Vybrať priečinok…',
    'settings.downloadFolderReset': 'Vrátiť sa k predvolenému priečinku',
  },
  sl: {
    'settings.autoDownloadMaxLabel': 'Največja velikost',
    'settings.autoDownloadMaxDesc': 'Nad to velikostjo je priponka še vedno na voljo s klikom.',
    'settings.downloadFolder': 'Mapa za shranjevanje',
    'settings.downloadFolderNone': 'Privzeta mapa sistema',
    'settings.downloadFolderDesc': 'Kje se odprejo pogovorna okna za shranjevanje priponk. Če mapa izgine, se sistem vrne na običajno mesto.',
    'settings.downloadFolderChoose': 'Izberi mapo…',
    'settings.downloadFolderReset': 'Vrni se v privzeto mapo',
  },
  cs: {
    'settings.autoDownloadMaxLabel': 'Maximální velikost',
    'settings.autoDownloadMaxDesc': 'Nad touto velikostí zůstává příloha dostupná po kliknutí.',
    'settings.downloadFolder': 'Složka pro ukládání',
    'settings.downloadFolderNone': 'Výchozí složka systému',
    'settings.downloadFolderDesc': 'Kde se otevírají dialogy pro uložení příloh. Pokud složka zmizí, systém se vrátí na své obvyklé místo.',
    'settings.downloadFolderChoose': 'Vybrat složku…',
    'settings.downloadFolderReset': 'Vrátit se do výchozí složky',
  },
  bg: {
    'settings.autoDownloadMaxLabel': 'Максимален размер',
    'settings.autoDownloadMaxDesc': 'Над този размер прикаченият файл си остава достъпен с клик.',
    'settings.downloadFolder': 'Папка за запис',
    'settings.downloadFolderNone': 'Папката по подразбиране на системата',
    'settings.downloadFolderDesc': 'Къде се отварят прозорците за запис на прикачените файлове. Ако папката изчезне, системата се връща на обичайното си място.',
    'settings.downloadFolderChoose': 'Изберете папка…',
    'settings.downloadFolderReset': 'Връщане в папката по подразбиране',
  },
  ga: {
    'settings.autoDownloadMaxLabel': 'Méid uasta',
    'settings.autoDownloadMaxDesc': 'Thar an méid sin, fanann an ceangailín ar fáil le cliceáil.',
    'settings.downloadFolder': 'Fillteán sábhála',
    'settings.downloadFolderNone': 'Fillteán réamhshocraithe an chórais',
    'settings.downloadFolderDesc': 'Áit a osclaíonn na dialóga sábhála do na ceangailíní. Má imíonn an fillteán, filleann an córas ar a ghnáthshuíomh.',
    'settings.downloadFolderChoose': 'Roghnaigh fillteán…',
    'settings.downloadFolderReset': 'Fill ar an bhfillteán réamhshocraithe',
  },
  ro: {
    'settings.autoDownloadMaxLabel': 'Dimensiune maximă',
    'settings.autoDownloadMaxDesc': 'Peste această dimensiune, atașamentul rămâne disponibil la clic.',
    'settings.downloadFolder': 'Folder de salvare',
    'settings.downloadFolderNone': 'Folderul implicit al sistemului',
    'settings.downloadFolderDesc': 'Unde se deschid casetele de salvare ale atașamentelor. Dacă folderul dispare, sistemul revine la locația obișnuită.',
    'settings.downloadFolderChoose': 'Alege un folder…',
    'settings.downloadFolderReset': 'Înapoi la folderul implicit',
  },
  en: {
    'settings.autoDownloadMaxLabel': 'Maximum size',
    'settings.autoDownloadMaxDesc': 'Above this size, the attachment stays available with a click.',
    'settings.downloadFolder': 'Save folder',
    'settings.downloadFolderNone': 'System default folder',
    'settings.downloadFolderDesc': 'Where the attachments’ save dialogs open. If the folder disappears, the system goes back to its usual location.',
    'settings.downloadFolderChoose': 'Choose a folder…',
    'settings.downloadFolderReset': 'Back to the default folder',
  },
  uk: {
    'settings.autoDownloadMaxLabel': 'Максимальний розмір',
    'settings.autoDownloadMaxDesc': 'Понад цей розмір долучення лишається доступним за кліком.',
    'settings.downloadFolder': 'Тека для збереження',
    'settings.downloadFolderNone': 'Типова тека системи',
    'settings.downloadFolderDesc': 'Де відкриваються діалоги збереження долучень. Якщо тека зникне, система повертається до звичайного місця.',
    'settings.downloadFolderChoose': 'Вибрати теку…',
    'settings.downloadFolderReset': 'Повернутися до типової теки',
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
