#!/usr/bin/env node
/**
 * Adds the two gradient keys (settings.useGradient / settings.useGradientDesc)
 * to all 25 supported languages of src/i18n/translations.ts.
 *
 * Why this wording : customTheme.useGradient existed since the theme presets
 * were introduced and nothing read it — the switch could be flipped and every
 * bubble and primary button kept its gradient. It now decides, for every theme
 * and not only the custom one, whether accent surfaces are filled with a
 * gradient or with one flat colour, so the wording names what changes on
 * screen (« vos bulles et les boutons principaux ») rather than a vague
 * « style ».
 *
 * Same in-place algorithm as add-quiet-hours-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['settings.useGradient', 'settings.useGradientDesc']

const DATA = {
  fr: {
    'settings.useGradient': 'Dégradé des accents',
    'settings.useGradientDesc': 'Remplit vos bulles et les boutons principaux d’un dégradé. Désactivé, ils prennent une couleur plate.',
  },
  nl: {
    'settings.useGradient': 'Verloop van accenten',
    'settings.useGradientDesc': 'Vult je eigen berichten en de primaire knoppen met een verloop. Uitgeschakeld wordt het één effen kleur.',
  },
  de: {
    'settings.useGradient': 'Farbverlauf der Akzente',
    'settings.useGradientDesc': 'Füllt eigene Sprechblasen und Hauptbuttons mit einem Verlauf. Ausgeschaltet erscheint eine einfarbige Fläche.',
  },
  it: {
    'settings.useGradient': 'Gradiente degli accenti',
    'settings.useGradientDesc': 'Riempie i tuoi fumetti e i pulsanti principali con un gradiente. Disattivato, usa un colore piatto.',
  },
  es: {
    'settings.useGradient': 'Degradado de los acentos',
    'settings.useGradientDesc': 'Rellena tus burbujas y los botones principales con un degradado. Desactivado, usa un color plano.',
  },
  pt: {
    'settings.useGradient': 'Gradiente dos acentos',
    'settings.useGradientDesc': 'Preenche as suas bolhas e os botões principais com um gradiente. Desativado, usa uma cor lisa.',
  },
  el: {
    'settings.useGradient': 'Διαβάθμιση τονισμών',
    'settings.useGradientDesc': 'Γεμίζει τις φυσαλίδες σας και τα κύρια κουμπιά με διαβάθμιση. Απενεργοποιημένο, χρησιμοποιεί ένα επίπεδο χρώμα.',
  },
  da: {
    'settings.useGradient': 'Forløb for markeringerne',
    'settings.useGradientDesc': 'Fylder dine bobler og de primære knapper med et forløb. Slået fra bruger de én flad farve.',
  },
  fi: {
    'settings.useGradient': 'Korostusten liukuväri',
    'settings.useGradientDesc': 'Täyttää omat kuplat ja pääpainikkeet liukuvärillä. Pois kytkettynä niissä on tasainen väri.',
  },
  sv: {
    'settings.useGradient': 'Gradient för markeringarna',
    'settings.useGradientDesc': 'Fyller dina babbler och huvudknapparna med en gradient. Avstängd ger en enfärgad yta.',
  },
  hr: {
    'settings.useGradient': 'Gradijent naglasaka',
    'settings.useGradientDesc': 'Ispunjava vaše mjehuriće i glavne gumbe gradijentom. Isključeno koristi jednu plošnu boju.',
  },
  et: {
    'settings.useGradient': 'Aktsentide üleminek',
    'settings.useGradientDesc': 'Täidab sinu mullid ja põhitoimingnood üleminekuga. Välja lülitatuna on need ühevärvilised.',
  },
  hu: {
    'settings.useGradient': 'Kiemelések színátmenete',
    'settings.useGradientDesc': 'Színátmenettel tölti a saját buborékjait és az elsődleges gombokat. Kikapcsolva egyszínűek.',
  },
  lv: {
    'settings.useGradient': 'Akcentu gradients',
    'settings.useGradientDesc': 'Aizpilda tavus burbuļus un galvenās pogas ar gradientu. Izslēgts tiek izmantota viena plakana krāsa.',
  },
  lt: {
    'settings.useGradient': 'Akcentų perėjimas',
    'settings.useGradientDesc': 'Užpildo jūsų burbulus ir pagrindinius mygtukus perėjimu. Išjungus naudojama viena plokščia spalva.',
  },
  mt: {
    'settings.useGradient': 'Gradjent tal-aċċenti',
    'settings.useGradientDesc': 'Jimlew il-bowow tiegħek u l-buttuni primarji b’gradjent. Meta mitfi, juża kulur ċatt.',
  },
  pl: {
    'settings.useGradient': 'Gradient akcentów',
    'settings.useGradientDesc': 'Wypełnia Twoje dymki i główne przyciski gradientem. Wyłączony używa płaskiego koloru.',
  },
  sk: {
    'settings.useGradient': 'Gradient akcentov',
    'settings.useGradientDesc': 'Vyplní tvoje bubliny a hlavné tlačidlá gradientom. Vypnutý použije plochú farbu.',
  },
  sl: {
    'settings.useGradient': 'Prehod poudarkov',
    'settings.useGradientDesc': 'Zapolni vaše mehurčke in glavne gumbe s prehodom. Ko je izklopljen, uporabi eno samo barvo.',
  },
  cs: {
    'settings.useGradient': 'Přechod akcentů',
    'settings.useGradientDesc': 'Vyplní vaše bubliny a hlavní tlačítka přechodem. Vypnuto použije plochou barvu.',
  },
  bg: {
    'settings.useGradient': 'Градиент на акцентите',
    'settings.useGradientDesc': 'Запълва вашите мехурчета и главните бутони с градиент. Изключено, използва плосък цвят.',
  },
  ga: {
    'settings.useGradient': 'Grádán na mbéimeanna',
    'settings.useGradientDesc': 'Líonann do bholgáin agus na cnaipí príomha le grádán. Nuair atá sé as, úsáidtear dath réidh.',
  },
  ro: {
    'settings.useGradient': 'Gradient al accentelor',
    'settings.useGradientDesc': 'Umple bulele tale și butoanele principale cu un gradient. Dezactivat, folosește o culoare plată.',
  },
  en: {
    'settings.useGradient': 'Gradient accents',
    'settings.useGradientDesc': 'Fills your own bubbles and the primary buttons with a gradient. Turned off, they take one flat colour.',
  },
  uk: {
    'settings.useGradient': 'Градієнт акцентів',
    'settings.useGradientDesc': 'Заповнює ваші бульби та основні кнопки градієнтом. Якщо вимкнено, колір буде однотонний.',
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
    // Land right after the custom-colours description: the gradient switch sits
    // under that heading in ThemeSelector, in every language.
    let anchor = -1
    for (let i = 0; i < block.length; i++) {
      if (/^ {6}"settings\.customColorsDescription":/.test(block[i])) { anchor = i; break }
    }
    if (anchor < 0) {
      console.error(`✗ no "settings.customColorsDescription" anchor in the ${code} block`)
      process.exit(1)
    }
    block.splice(anchor + 1, 0, ...pending)
    inserted += pending.length
  }

  lines.splice(start, end - start, ...block)
}

writeFileSync(file, lines.join(eol), 'utf8')

const after = readFileSync(file, 'utf8')
for (const key of KEYS) {
  const at = after.split(`"${key}":`).length - 1
  if (at !== known.length) {
    console.error(`✗ "${key}" appears ${at} times, expected ${known.length}`)
    process.exit(1)
  }
}

console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
