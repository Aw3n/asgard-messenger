#!/usr/bin/env node
/**
 * Adds the channel write-restriction notice (groups.cannotPostInChannel) to all
 * 25 supported languages of src/i18n/translations.ts.
 *
 * Why this wording : chaque canal déclare déjà les rôles autorisés à y écrire
 * (`permissions.send`), la liste voyage dans les `group:update` et survit dans le
 * store — mais rien ne la lisait. Le composeur doit donc dire pourquoi il est
 * fermé : la sourdine a sa propre phrase (groups.mutedInGroup), un canal « annonce »
 * ou « lecture seule » l'exige aussi. Les libellés existants étaient réutilisés
 * verbatim par langue : le verbe de « publier » de groups.broadcastModeAllCanPost
 * et le nom de « canal » de groups.channelIntro, pour qu'une même langue ne se
 * contredise pas d'un écran à l'autre.
 *
 * Same in-place algorithm as add-member-mute-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['groups.cannotPostInChannel']

const DATA = {
  fr: { 'groups.cannotPostInChannel': 'Vous ne pouvez pas publier dans ce canal' },
  en: { 'groups.cannotPostInChannel': 'You can’t post in this channel' },
  nl: { 'groups.cannotPostInChannel': 'Je kunt niet plaatsen in dit kanaal' },
  de: { 'groups.cannotPostInChannel': 'Sie können in diesem Kanal nicht posten' },
  it: { 'groups.cannotPostInChannel': 'Non puoi pubblicare in questo canale' },
  es: { 'groups.cannotPostInChannel': 'No puedes publicar en este canal' },
  pt: { 'groups.cannotPostInChannel': 'Não pode publicar neste canal' },
  el: { 'groups.cannotPostInChannel': 'Δεν μπορείτε να δημοσιεύσετε σε αυτό το κανάλι' },
  da: { 'groups.cannotPostInChannel': 'Du kan ikke skrive i denne kanal' },
  fi: { 'groups.cannotPostInChannel': 'Et voi julkaista tähän kanavaan' },
  sv: { 'groups.cannotPostInChannel': 'Du kan inte publicera i den här kanalen' },
  hr: { 'groups.cannotPostInChannel': 'Ne možete objavljivati u ovom kanalu' },
  et: { 'groups.cannotPostInChannel': 'Sellesse kanalisse ei saa postitada' },
  hu: { 'groups.cannotPostInChannel': 'Ebben a csatornában nem írhatsz' },
  lv: { 'groups.cannotPostInChannel': 'Šajā kanālā nevar publicēt' },
  lt: { 'groups.cannotPostInChannel': 'Šiame kanale negalite skelbti' },
  mt: { 'groups.cannotPostInChannel': 'Ma tistgħx tippubblika f’dan il-kanal' },
  pl: { 'groups.cannotPostInChannel': 'Nie możesz publikować w tym kanale' },
  sk: { 'groups.cannotPostInChannel': 'V tomto kanáli nemôžete publikovať' },
  sl: { 'groups.cannotPostInChannel': 'V tem kanalu ne morete objavljati' },
  cs: { 'groups.cannotPostInChannel': 'V tomto kanálu nemůžete publikovat' },
  bg: { 'groups.cannotPostInChannel': 'Не можете да публикувате в този канал' },
  ga: { 'groups.cannotPostInChannel': 'Ní féidir leat a fhoilsiú sa chainéal seo' },
  ro: { 'groups.cannotPostInChannel': 'Nu puteți publica în acest canal' },
  uk: { 'groups.cannotPostInChannel': 'Ви не можете писати в цьому каналі' },
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
console.log(`✓ ${known.length} locales · ${KEYS.length} key · ${replaced} lines rewritten, ${inserted} lines added`)
