import path from 'path'

/**
 * Libellés des boîtes de dialogue natives.
 *
 * Le process principal n'a pas accès à i18next (module du renderer) : comme le
 * tray, il porte donc sa propre table dans les 25 langues supportées. Sans
 * elle, « Enregistrer le fichier » et « Fichiers » restaient français pour tout
 * le monde, y compris quand la langue affichée était l'estonien.
 */
export interface DialogLabels {
  saveTitle: string
  filterName: string
  pickFolderTitle: string
}

export const SUPPORTED_LANGUAGES = [
  'fr', 'nl', 'de', 'it', 'es', 'pt', 'el', 'da', 'fi', 'sv', 'hr', 'et', 'hu',
  'lv', 'lt', 'mt', 'pl', 'sk', 'sl', 'cs', 'bg', 'ga', 'ro', 'en', 'uk',
]

const DIALOG_LABELS: Record<string, DialogLabels> = {
  fr: { saveTitle: 'Enregistrer le fichier', filterName: 'Fichiers', pickFolderTitle: 'Choisir un dossier' },
  nl: { saveTitle: 'Bestand opslaan', filterName: 'Bestanden', pickFolderTitle: 'Map kiezen' },
  de: { saveTitle: 'Datei speichern', filterName: 'Dateien', pickFolderTitle: 'Ordner auswählen' },
  it: { saveTitle: 'Salva file', filterName: 'File', pickFolderTitle: 'Scegli una cartella' },
  es: { saveTitle: 'Guardar archivo', filterName: 'Archivos', pickFolderTitle: 'Elegir carpeta' },
  pt: { saveTitle: 'Salvar arquivo', filterName: 'Arquivos', pickFolderTitle: 'Escolher pasta' },
  el: { saveTitle: 'Αποθήκευση αρχείου', filterName: 'Αρχεία', pickFolderTitle: 'Επιλογή φακέλου' },
  da: { saveTitle: 'Gem fil', filterName: 'Filer', pickFolderTitle: 'Vælg mappe' },
  fi: { saveTitle: 'Tallenna tiedosto', filterName: 'Tiedostot', pickFolderTitle: 'Valitse kansio' },
  sv: { saveTitle: 'Spara fil', filterName: 'Filer', pickFolderTitle: 'Välj mapp' },
  hr: { saveTitle: 'Spremi datoteku', filterName: 'Datoteke', pickFolderTitle: 'Odaberi mapu' },
  et: { saveTitle: 'Salvesta fail', filterName: 'Failid', pickFolderTitle: 'Vali kaust' },
  hu: { saveTitle: 'Fájl mentése', filterName: 'Fájlok', pickFolderTitle: 'Mappa kiválasztása' },
  lv: { saveTitle: 'Saglabāt failu', filterName: 'Faili', pickFolderTitle: 'Izvēlēties mapi' },
  lt: { saveTitle: 'Išsaugoti failą', filterName: 'Failai', pickFolderTitle: 'Pasirinkti aplanką' },
  mt: { saveTitle: 'Issevja fajl', filterName: 'Fajls', pickFolderTitle: 'Agħżel folder' },
  pl: { saveTitle: 'Zapisz plik', filterName: 'Pliki', pickFolderTitle: 'Wybierz folder' },
  sk: { saveTitle: 'Uložiť súbor', filterName: 'Súbory', pickFolderTitle: 'Vybrať priečinok' },
  sl: { saveTitle: 'Shrani datoteko', filterName: 'Datoteke', pickFolderTitle: 'Izberi mapo' },
  cs: { saveTitle: 'Uložit soubor', filterName: 'Soubory', pickFolderTitle: 'Vybrat složku' },
  bg: { saveTitle: 'Запазване на файл', filterName: 'Файлове', pickFolderTitle: 'Изберете папка' },
  ga: { saveTitle: 'Sábháil comhad', filterName: 'Comhaid', pickFolderTitle: 'Roghnaigh fillteán' },
  ro: { saveTitle: 'Salvează fișierul', filterName: 'Fișiere', pickFolderTitle: 'Alege un folder' },
  en: { saveTitle: 'Save file', filterName: 'Files', pickFolderTitle: 'Choose a folder' },
  uk: { saveTitle: 'Зберегти файл', filterName: 'Файли', pickFolderTitle: 'Вибрати папку' },
}

/** Une langue inconnue garde l'anglais : un libellé traduit fautif est pire que l'original. */
export function dialogLabels(lang: unknown): DialogLabels {
  return DIALOG_LABELS[typeof lang === 'string' ? lang : ''] ?? DIALOG_LABELS.en
}

/**
 * Le dossier enregistré dans les réglages n'est qu'une intention : vide, relatif
 * ou sorti du dépôt de l'utilisateur, il ne doit pas détourner la boîte de
 * dialogue de son comportement natif.
 */
export function normalizeDownloadDir(downloadDir: unknown): string | undefined {
  const dir = typeof downloadDir === 'string' ? downloadDir.trim() : ''
  if (!dir || !path.isAbsolute(dir)) return undefined
  return dir
}

/**
 * Un nom de pièce jointe vient du réseau : il ne peut pas, par un `../` ou un
 * séparateur, faire écrire le fichier ailleurs que dans le dossier choisi.
 */
export function saveDefaultPath(dir: string | undefined, suggestedName: unknown): string {
  const name = path.basename(String(suggestedName ?? ''))
  if (!name || name === '.' || name === '..') return dir ?? ''
  return dir ? path.join(dir, name) : name
}
