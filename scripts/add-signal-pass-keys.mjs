#!/usr/bin/env node
/**
 * Injects the keys added by the « Signal-inspired » pass into src/i18n/translations.ts
 * for the 25 supported languages:
 *   lightbox.thumbnails, lightbox.swipeHint        (visionneuse : bande + indice)
 *   calls.expandCall, calls.exitVideoFullscreen    (appel : carte réduite, plein écran vidéo)
 *   calls.missedCallBody, calls.callBack           (notification OS d'appel manqué)
 *
 * Why a script: fallbackLng 'fr' masks any missing key silently — a user of any
 * other locale would have seen French strings where these ones are used.
 *
 * Existing lines are replaced in place, whatever their indentation; missing ones
 * are appended at the end of the locale's `translation` object, before its
 * closing brace.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = [
  'lightbox.thumbnails', 'lightbox.swipeHint',
  'calls.expandCall', 'calls.exitVideoFullscreen',
  'calls.missedCallBody', 'calls.callBack',
]

const DATA = {
  fr: {
    'lightbox.thumbnails': 'Vignettes', 'lightbox.swipeHint': 'Balayez pour changer de photo',
    'calls.expandCall': "Agrandir l'appel", 'calls.exitVideoFullscreen': 'Quitter le plein écran',
    'calls.missedCallBody': 'Appel manqué de {{name}}', 'calls.callBack': 'Rappeler',
  },
  en: {
    'lightbox.thumbnails': 'Thumbnails', 'lightbox.swipeHint': 'Swipe to switch photo',
    'calls.expandCall': 'Expand call', 'calls.exitVideoFullscreen': 'Exit fullscreen',
    'calls.missedCallBody': 'Missed call from {{name}}', 'calls.callBack': 'Call back',
  },
  nl: {
    'lightbox.thumbnails': 'Miniaturen', 'lightbox.swipeHint': 'Veeg om van foto te wisselen',
    'calls.expandCall': 'Oproep vergroten', 'calls.exitVideoFullscreen': 'Volledig scherm verlaten',
    'calls.missedCallBody': 'Gemiste oproep van {{name}}', 'calls.callBack': 'Terugbellen',
  },
  de: {
    'lightbox.thumbnails': 'Miniaturansichten', 'lightbox.swipeHint': 'Wischen zum Wechseln des Fotos',
    'calls.expandCall': 'Anruf vergrößern', 'calls.exitVideoFullscreen': 'Vollbild beenden',
    'calls.missedCallBody': 'Verpasster Anruf von {{name}}', 'calls.callBack': 'Zurückrufen',
  },
  it: {
    'lightbox.thumbnails': 'Miniature', 'lightbox.swipeHint': 'Scorri per cambiare foto',
    'calls.expandCall': 'Espandi chiamata', 'calls.exitVideoFullscreen': 'Esci dallo schermo intero',
    'calls.missedCallBody': 'Chiamata persa da {{name}}', 'calls.callBack': 'Richiama',
  },
  es: {
    'lightbox.thumbnails': 'Miniaturas', 'lightbox.swipeHint': 'Desliza para cambiar de foto',
    'calls.expandCall': 'Ampliar llamada', 'calls.exitVideoFullscreen': 'Salir de pantalla completa',
    'calls.missedCallBody': 'Llamada perdida de {{name}}', 'calls.callBack': 'Devolver llamada',
  },
  pt: {
    'lightbox.thumbnails': 'Miniaturas', 'lightbox.swipeHint': 'Deslize para mudar de foto',
    'calls.expandCall': 'Ampliar chamada', 'calls.exitVideoFullscreen': 'Sair do ecrã inteiro',
    'calls.missedCallBody': 'Chamada perdida de {{name}}', 'calls.callBack': 'Ligar de volta',
  },
  el: {
    'lightbox.thumbnails': 'Μικρογραφίες', 'lightbox.swipeHint': 'Σύρετε για εναλλαγή φωτογραφίας',
    'calls.expandCall': 'Μεγέθυνση κλήσης', 'calls.exitVideoFullscreen': 'Έξοδος από πλήρη οθόνη',
    'calls.missedCallBody': 'Αναπάντητη κλήση από {{name}}', 'calls.callBack': 'Επανάκληση',
  },
  da: {
    'lightbox.thumbnails': 'Miniaturebilleder', 'lightbox.swipeHint': 'Stryg for at skifte foto',
    'calls.expandCall': 'Udvid opkald', 'calls.exitVideoFullscreen': 'Afslut fuld skærm',
    'calls.missedCallBody': 'Ubesvaret opkald fra {{name}}', 'calls.callBack': 'Ring tilbage',
  },
  fi: {
    'lightbox.thumbnails': 'Pikkukuvat', 'lightbox.swipeHint': 'Pyyhkäise vaihtaaksesi kuvaa',
    'calls.expandCall': 'Laajenna puhelu', 'calls.exitVideoFullscreen': 'Poistu koko näytöstä',
    'calls.missedCallBody': 'Vastaamaton puhelu: {{name}}', 'calls.callBack': 'Soita takaisin',
  },
  sv: {
    'lightbox.thumbnails': 'Miniatyrbilder', 'lightbox.swipeHint': 'Svep för att byta foto',
    'calls.expandCall': 'Expandera samtal', 'calls.exitVideoFullscreen': 'Avsluta helskärm',
    'calls.missedCallBody': 'Missat samtal från {{name}}', 'calls.callBack': 'Ring tillbaka',
  },
  hr: {
    'lightbox.thumbnails': 'Minijature', 'lightbox.swipeHint': 'Povucite za promjenu fotografije',
    'calls.expandCall': 'Proširi poziv', 'calls.exitVideoFullscreen': 'Izađi iz punog zaslona',
    'calls.missedCallBody': 'Propušteni poziv od {{name}}', 'calls.callBack': 'Uzvrati poziv',
  },
  et: {
    'lightbox.thumbnails': 'Pisipildid', 'lightbox.swipeHint': 'Pühkimine foto vahetamiseks',
    'calls.expandCall': 'Laienda kõne', 'calls.exitVideoFullscreen': 'Välju täisekraanilt',
    'calls.missedCallBody': 'Vastamata kõne: {{name}}', 'calls.callBack': 'Helista tagasi',
  },
  hu: {
    'lightbox.thumbnails': 'Bélyegképek', 'lightbox.swipeHint': 'Húzza a fotóváltáshoz',
    'calls.expandCall': 'Hívás nagyítása', 'calls.exitVideoFullscreen': 'Kilépés a teljes képernyőből',
    'calls.missedCallBody': 'Nem fogadott hívás: {{name}}', 'calls.callBack': 'Visszahívás',
  },
  lv: {
    'lightbox.thumbnails': 'Sīktēli', 'lightbox.swipeHint': 'Velciet, lai pārslēgtu fotoattēlu',
    'calls.expandCall': 'Izvērst zvanu', 'calls.exitVideoFullscreen': 'Iziet no pilnekrāna',
    'calls.missedCallBody': 'Neatbildēts zvans no {{name}}', 'calls.callBack': 'Zvanīt atpakaļ',
  },
  lt: {
    'lightbox.thumbnails': 'Miniatiūros', 'lightbox.swipeHint': 'Perbraukite, kad pakeistumėte nuotrauką',
    'calls.expandCall': 'Išplėsti skambutį', 'calls.exitVideoFullscreen': 'Išeiti iš viso ekrano',
    'calls.missedCallBody': 'Praleistas skambutis nuo {{name}}', 'calls.callBack': 'Perskambinti',
  },
  mt: {
    'lightbox.thumbnails': 'Miniaturi', 'lightbox.swipeHint': 'Skrollja biex tbiddel ir-ritratt',
    'calls.expandCall': 'Kabbar is-sejħa', 'calls.exitVideoFullscreen': 'Oħrog mill-iskrin sħiħ',
    'calls.missedCallBody': 'Sejħa mitlufa minn {{name}}', 'calls.callBack': 'Ċempel lura',
  },
  pl: {
    'lightbox.thumbnails': 'Miniatury', 'lightbox.swipeHint': 'Przesuń, aby zmienić zdjęcie',
    'calls.expandCall': 'Powiększ połączenie', 'calls.exitVideoFullscreen': 'Opuść pełny ekran',
    'calls.missedCallBody': 'Nieodebrane połączenie od {{name}}', 'calls.callBack': 'Oddzwoń',
  },
  sk: {
    'lightbox.thumbnails': 'Miniatúry', 'lightbox.swipeHint': 'Potiahnutím zmeníte fotografiu',
    'calls.expandCall': 'Rozbaliť hovor', 'calls.exitVideoFullscreen': 'Ukončiť celú obrazovku',
    'calls.missedCallBody': 'Zmeškaný hovor od {{name}}', 'calls.callBack': 'Zavolať späť',
  },
  sl: {
    'lightbox.thumbnails': 'Sličice', 'lightbox.swipeHint': 'Povlecite za zamenjavo fotografije',
    'calls.expandCall': 'Razširi klic', 'calls.exitVideoFullscreen': 'Zapri celozaslonski način',
    'calls.missedCallBody': 'Zgrešen klic od {{name}}', 'calls.callBack': 'Pokliči nazaj',
  },
  cs: {
    'lightbox.thumbnails': 'Miniatury', 'lightbox.swipeHint': 'Přejeďte pro změnu fotografie',
    'calls.expandCall': 'Rozbalit hovor', 'calls.exitVideoFullscreen': 'Ukončit celou obrazovku',
    'calls.missedCallBody': 'Zmeškaný hovor od {{name}}', 'calls.callBack': 'Zavolat zpět',
  },
  bg: {
    'lightbox.thumbnails': 'Миниатюри', 'lightbox.swipeHint': 'Плъзнете за смяна на снимката',
    'calls.expandCall': 'Разгъване на разговора', 'calls.exitVideoFullscreen': 'Изход от цял екран',
    'calls.missedCallBody': 'Пропуснато обаждане от {{name}}', 'calls.callBack': 'Обратно обаждане',
  },
  ga: {
    'lightbox.thumbnails': 'Mionsamhlacha', 'lightbox.swipeHint': 'Sveip chun grianghraf a athrú',
    'calls.expandCall': 'Leathnaigh an glao', 'calls.exitVideoFullscreen': 'Fág an scáileán iomlán',
    'calls.missedCallBody': 'Glao caillte ó {{name}}', 'calls.callBack': 'Cuir glao ar ais',
  },
  ro: {
    'lightbox.thumbnails': 'Miniaturi', 'lightbox.swipeHint': 'Glisează pentru a schimba fotografia',
    'calls.expandCall': 'Extinde apelul', 'calls.exitVideoFullscreen': 'Ieși din ecranul complet',
    'calls.missedCallBody': 'Apel pierdut de la {{name}}', 'calls.callBack': 'Sună înapoi',
  },
  uk: {
    'lightbox.thumbnails': 'Мініатюри', 'lightbox.swipeHint': 'Проведіть, щоб змінити фото',
    'calls.expandCall': 'Розгорнути виклик', 'calls.exitVideoFullscreen': 'Вийти з повноекранного режиму',
    'calls.missedCallBody': 'Пропущений виклик від {{name}}', 'calls.callBack': 'Передзвонити',
  },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

// Locale blocks: `  <code>: {` at two-space indent, each holding a single nested
// `translation` object of flat "a.b" keys.
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
    // Previous injectors wrote keys at column 0 — match any indentation.
    const re = new RegExp('^[ \\t]*"' + key.replace(/\./g, '\\.') + '":\\s*"(?:[^"\\\\]|\\\\.)*",?[ \\t]*$')
    const at = block.findIndex((l) => re.test(l))
    if (at >= 0) {
      if (block[at] !== line) { block[at] = line; replaced++ }
    } else {
      pending.push(line)
    }
  }

  if (pending.length) {
    // The nested shape is `  <locale>: { translation: { …keys… } },` — new keys
    // belong to the `translation` object, so insert before ITS closing brace
    // (four-space indent), not before the locale's own brace.
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
