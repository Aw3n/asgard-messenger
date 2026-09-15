#!/usr/bin/env node
/**
 * Adds the two ImageLightbox failure keys (lightbox.imageUnavailable,
 * lightbox.retry) to all 25 supported languages of src/i18n/translations.ts.
 *
 * Why a script: the project rule is that no UI string ships in fewer than the 25
 * locales — `fallbackLng: 'fr'` would otherwise silently display French to a
 * Polish user. Same in-place algorithm as add-lightbox-zoom-keys.mjs: existing
 * lines are rewritten whatever their indentation, missing ones are inserted
 * before the closing brace of the nested `translation` object (four spaces).
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['lightbox.imageUnavailable', 'lightbox.retry']

const DATA = {
  fr: { 'lightbox.imageUnavailable': "Cette image n'a pas pu être chargée", 'lightbox.retry': 'Réessayer' },
  en: { 'lightbox.imageUnavailable': 'This image could not be loaded', 'lightbox.retry': 'Try again' },
  nl: { 'lightbox.imageUnavailable': 'Deze afbeelding kon niet worden geladen', 'lightbox.retry': 'Opnieuw proberen' },
  de: { 'lightbox.imageUnavailable': 'Dieses Bild konnte nicht geladen werden', 'lightbox.retry': 'Erneut versuchen' },
  it: { 'lightbox.imageUnavailable': "Impossibile caricare l'immagine", 'lightbox.retry': 'Riprova' },
  es: { 'lightbox.imageUnavailable': 'No se pudo cargar esta imagen', 'lightbox.retry': 'Reintentar' },
  pt: { 'lightbox.imageUnavailable': 'Não foi possível carregar esta imagem', 'lightbox.retry': 'Tentar novamente' },
  el: { 'lightbox.imageUnavailable': 'Αυτή η εικόνα δεν μπόρεσε να φορτωθεί', 'lightbox.retry': 'Δοκιμή ξανά' },
  da: { 'lightbox.imageUnavailable': 'Dette billede kunne ikke indlæses', 'lightbox.retry': 'Prøv igen' },
  fi: { 'lightbox.imageUnavailable': 'Tätä kuvaa ei voitu ladata', 'lightbox.retry': 'Yritä uudelleen' },
  sv: { 'lightbox.imageUnavailable': 'Den här bilden kunde inte laddas', 'lightbox.retry': 'Försök igen' },
  hr: { 'lightbox.imageUnavailable': 'Ovu sliku nije bilo moguće učitati', 'lightbox.retry': 'Pokušaj ponovno' },
  et: { 'lightbox.imageUnavailable': 'Seda pilti ei saanud laadida', 'lightbox.retry': 'Proovi uuesti' },
  hu: { 'lightbox.imageUnavailable': 'Ez a kép nem tölthető be', 'lightbox.retry': 'Újrapróbálkozás' },
  lv: { 'lightbox.imageUnavailable': 'Šo attēlu nevarēja ielādēt', 'lightbox.retry': 'Mēģināt vēlreiz' },
  lt: { 'lightbox.imageUnavailable': 'Šio paveikslėlio nepavyko įkelti', 'lightbox.retry': 'Bandyti dar kartą' },
  mt: { 'lightbox.imageUnavailable': "Din l-immaġni ma setgħetx titgħabba", 'lightbox.retry': 'Ipprova mill-ġdid' },
  pl: { 'lightbox.imageUnavailable': 'Nie udało się załadować tego obrazu', 'lightbox.retry': 'Spróbuj ponownie' },
  sk: { 'lightbox.imageUnavailable': 'Tento obrázok sa nepodarilo načítať', 'lightbox.retry': 'Skúsiť znova' },
  sl: { 'lightbox.imageUnavailable': 'Te slike ni bilo mogoče naložiti', 'lightbox.retry': 'Poskusi znova' },
  cs: { 'lightbox.imageUnavailable': 'Tento obrázek se nepodařilo načíst', 'lightbox.retry': 'Zkusit znovu' },
  bg: { 'lightbox.imageUnavailable': 'Това изображение не можа да се зареди', 'lightbox.retry': 'Опитай отново' },
  ga: { 'lightbox.imageUnavailable': 'Níorbh fhéidir an íomhá seo a lódáil', 'lightbox.retry': 'Bain triail eile as' },
  ro: { 'lightbox.imageUnavailable': 'Această imagine nu a putut fi încărcată', 'lightbox.retry': 'Încearcă din nou' },
  uk: { 'lightbox.imageUnavailable': 'Це зображення не вдалося завантажити', 'lightbox.retry': 'Спробувати ще раз' },
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
console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
