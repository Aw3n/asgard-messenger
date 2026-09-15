#!/usr/bin/env node
/**
 * Checks that every locale of src/i18n/translations.ts carries the full set of
 * lightbox keys, with no duplicate and no empty value. Run after editing the
 * viewer or the translation tables.
 */
import { readFileSync } from 'node:fs'

const KEYS = [
  'lightbox.open', 'lightbox.zoomIn', 'lightbox.zoomOut', 'lightbox.resetZoom',
  'lightbox.fit', 'lightbox.actualSize', 'lightbox.fullscreen', 'lightbox.exitFullscreen',
  'lightbox.previous', 'lightbox.next', 'lightbox.download', 'lightbox.close',
  'lightbox.loadingOriginal', 'lightbox.previewOnly', 'lightbox.loadFailed',
  'lightbox.scrollZoom', 'lightbox.dragToPan',
  'lightbox.imageUnavailable', 'lightbox.retry',
]

// Dérive aussi la liste des clés réellement employées par la visionneuse : une
// `t('lightbox.x')` ajoutée dans le composant sans entrée dans les 25 langues
// doit faire rougir ce contrôle, pas afficher du français chez un utilisateur
// polonais (fallbackLng: 'fr' masque silencieusement l'oubli).
const viewer = readFileSync(new URL('../src/features/chat/components/ImageLightbox.tsx', import.meta.url), 'utf8')
const used = [...viewer.matchAll(/t\('\s*(lightbox\.[A-Za-z]+)\s*'/g)].map((m) => m[1])
const EXPECTED = [...new Set([...KEYS, ...used])].sort()
const undeclared = used.filter((k) => !KEYS.includes(k))
if (undeclared.length) {
  console.error(`✗ clés employées par ImageLightbox.tsx absentes de la table attendue : ${[...new Set(undeclared)].join(', ')}`)
}

const file = new URL('../src/i18n/translations.ts', import.meta.url)
const lines = readFileSync(file, 'utf8').split(/\r?\n/)

// Locale boundaries (two-space indent, `xx: {`).
const marks = []
lines.forEach((line, i) => {
  const m = /^  ([a-z]{2}): \{\s*$/.exec(line)
  if (m) marks.push({ code: m[1], i })
})

let bad = 0
for (let b = 0; b < marks.length; b++) {
  const start = marks[b].i
  const end = b + 1 < marks.length ? marks[b + 1].i : lines.length
  const found = new Map()
  const empties = new Set()
  for (const line of lines.slice(start, end)) {
    const m = /^\s*"(lightbox\.[A-Za-z]+)":\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/.exec(line)
    if (!m) continue
    found.set(m[1], (found.get(m[1]) || 0) + 1)
    if (m[2].trim() === '') empties.add(m[1])
  }
  const missing = EXPECTED.filter((k) => !found.has(k))
  const dupes = [...found.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`)
  const empty = EXPECTED.filter((k) => empties.has(k))
  const status = missing.length || dupes.length || empty.length ? '✗' : '✓'
  if (missing.length || dupes.length || empty.length) bad++
  console.log(`${status} ${marks[b].code.padEnd(2)} keys=${found.size}/${EXPECTED.length}` +
    (missing.length ? ` missing: ${missing.join(',')}` : '') +
    (dupes.length ? ` duplicates: ${dupes.join(',')}` : '') +
    (empty.length ? ` EMPTY: ${empty.join(',')}` : ''))
}

console.log(bad === 0 && undeclared.length === 0
  ? `\nOK — ${marks.length} locales complètes (${EXPECTED.length} clés chacune)`
  : `\n${bad} locale(s) incomplète(s)`)
process.exit(bad === 0 && undeclared.length === 0 ? 0 : 1)
