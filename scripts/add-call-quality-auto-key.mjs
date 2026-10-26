#!/usr/bin/env node
/**
 * Adds the in-call video-quality chip (calls.qualityAuto) to all 25 supported
 * languages of src/i18n/translations.ts.
 *
 * Why this key : le panneau de réglages ouvert pendant un appel proposait
 * Élevée / Moyenne / Faible, alors que la préférence réglée avant l'appel et
 * l'état du store admettent un quatrième palier, « auto » (résolution adaptative
 * selon la bande passante et le nombre de pairs). Sans lui, un utilisateur qui
 * choisissait « Faible » en appel n'avait aucun bouton pour rendre la main à
 * l'adaptatif — et le panneau, enfin branché sur le store, s'ouvrait sur un
 * palier qu'aucun bouton ne pouvait marquer.
 *
 * Why the values are copied : chaque langue reprend verbatim son propre
 * `settings.videoQuality_auto`. Les deux écrans offrent le même palier ; un
 * « Automatique » d'un côté et un « Auto » de l'autre ferait douter le lecteur
 * qu'il s'agit bien du même réglage. Le copieur ne saisit donc aucune chaîne :
 * moins de risque de faute, et l'audit anti-calque-anglais (EN-DUP) reste propre
 * puisque la source l'a déjà franchi.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const SOURCE_KEY = 'settings.videoQuality_auto'
const TARGET_KEY = 'calls.qualityAuto'
// Les paliers se lisent dans l'ordre du groupe : le nouveau chip prend place
// auprès de ses frères, en tête de la famille, pas en queue du bloc de traduction.
const ANCHOR_KEY = 'calls.qualityHigh'

const valueLine = (quoted) => `      "${TARGET_KEY}": ${quoted},`
const sourceRe = new RegExp('^[ \\t]*"' + SOURCE_KEY.replace(/\./g, '\\.') + '":\\s*("(?:[^"\\\\]|\\\\.)*"),?[ \\t]*$')
const targetRe = new RegExp('^[ \\t]*"' + TARGET_KEY.replace(/\./g, '\\.') + '":\\s*("(?:[^"\\\\]|\\\\.)*"),?[ \\t]*$')
const anchorRe = new RegExp('^[ \\t]*"' + ANCHOR_KEY.replace(/\./g, '\\.') + '":.*$')

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

if (marks.length !== 25) {
  console.error(`✗ expected 25 locale blocks in translations.ts, found ${marks.length}`)
  process.exit(1)
}

let inserted = 0
let unchanged = 0

// Walk backwards: splicing a block must not shift the indexes of the previous ones.
for (let b = marks.length - 1; b >= 0; b--) {
  const code = marks[b].code
  const start = marks[b].i + 1
  const end = b + 1 < marks.length ? marks[b + 1].i : lines.length
  const block = lines.slice(start, end)

  const sourceAt = block.findIndex((l) => sourceRe.test(l))
  if (sourceAt < 0) {
    console.error(`✗ ${code}: "${SOURCE_KEY}" introuvable — rien à copier`)
    process.exit(1)
  }
  const quoted = sourceRe.exec(block[sourceAt])[1]

  const targetAt = block.findIndex((l) => targetRe.test(l))
  if (targetAt >= 0) {
    const wanted = valueLine(quoted)
    if (block[targetAt] === wanted) {
      unchanged++
      continue
    }
    block[targetAt] = wanted
    inserted++
    console.log(`• ${code}: valeur remplacée`)
    lines.splice(start, end - start, ...block)
    continue
  }

  const anchorAt = block.findIndex((l) => anchorRe.test(l))
  if (anchorAt < 0) {
    console.error(`✗ ${code}: ancre "${ANCHOR_KEY}" introuvable dans le bloc`)
    process.exit(1)
  }
  block.splice(anchorAt, 0, valueLine(quoted))
  inserted++
  lines.splice(start, end - start, ...block)
}

writeFileSync(file, lines.join(eol), 'utf8')

// Le comptage se refait SUR LE FICHIER RELU : une écriture qui n'écrivait rien
// (bloc copié sans être remisé dans `lines`) se déclarait déjà « 25 lignes
// écrites » et laissait translations.ts intact.
const found = readFileSync(file, 'utf8')
  .split(/\r\n|\n/)
  .filter((l) => targetRe.test(l)).length
if (found !== marks.length) {
  console.error(`✗ après écriture : "${TARGET_KEY}" présent ${found} fois pour ${marks.length} blocs`)
  process.exit(1)
}
console.log(`✓ ${found}/${marks.length} blocs portent "${TARGET_KEY}" · ${inserted} écrit(s), ${unchanged} déjà juste(s)`)
