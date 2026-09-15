#!/usr/bin/env node
/**
 * Vérifie que les 25 locales de src/i18n/translations.ts portent bien les clés
 * du lecteur audio de pièce jointe, sans doublon ni valeur vide.
 *
 * Comme pour la visionneuse (scripts/verify-lightbox-keys.mjs), la liste attendue
 * est aussi dérivée du composant : un `t('chat.xAudio')` ajouté dans
 * FileAttachment.tsx sans entrée dans les 25 langues doit faire rougir ce
 * contrôle, pas afficher du français chez un utilisateur polonais —
 * `fallbackLng: 'fr'` masque silencieusement l'oubli.
 */
import { readFileSync } from 'node:fs'

const KEYS = ['chat.playAudio', 'chat.pauseAudio', 'chat.audioPosition']

const component = readFileSync(new URL('../src/features/chat/components/FileAttachment.tsx', import.meta.url), 'utf8')
const used = [...component.matchAll(/t\(\s*'(chat\.(?:play|pause)Audio|chat\.audioPosition)'\s*/g)].map((m) => m[1])
const EXPECTED = [...new Set([...KEYS, ...used])].sort()
const undeclared = used.filter((k) => !KEYS.includes(k))
if (undeclared.length) {
  console.error(`✗ clés employées par FileAttachment.tsx absentes de la table attendue : ${[...new Set(undeclared)].join(', ')}`)
}

const file = new URL('../src/i18n/translations.ts', import.meta.url)
const path = file.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const lines = readFileSync(path, 'utf8').split(/\r?\n/)

const marks = []
lines.forEach((line, i) => {
  const m = /^  ([a-z]{2}): \{\s*$/.exec(line)
  if (m) marks.push({ code: m[1], i })
})

const keyPattern = /^\s*"((?:chat\.(?:play|pause)Audio|chat\.audioPosition))":\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/

let bad = 0
for (let b = 0; b < marks.length; b++) {
  const start = marks[b].i
  const end = b + 1 < marks.length ? marks[b + 1].i : lines.length
  const found = new Map()
  const empties = new Set()
  for (const line of lines.slice(start, end)) {
    const m = keyPattern.exec(line)
    if (!m) continue
    found.set(m[1], (found.get(m[1]) || 0) + 1)
    if (m[2].trim() === '') empties.add(m[1])
  }
  const missing = EXPECTED.filter((k) => !found.has(k))
  const dupes = [...found.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`)
  const empty = EXPECTED.filter((k) => empties.has(k))
  const broken = missing.length || dupes.length || empty.length
  if (broken) bad++
  console.log(`${broken ? '✗' : '✓'} ${marks[b].code.padEnd(2)}` +
    ` keys=${found.size}/${EXPECTED.length}` +
    (missing.length ? ` manquantes: ${missing.join(',')}` : '') +
    (dupes.length ? ` doublons: ${dupes.join(',')}` : '') +
    (empty.length ? ` VIDES: ${empty.join(',')}` : ''))
}

const ok = bad === 0 && undeclared.length === 0 && marks.length === 25
console.log(ok
  ? `\nOK — ${marks.length} locales complètes (${EXPECTED.length} clés chacune)`
  : `\n${bad} locale(s) incomplète(s) sur ${marks.length} détectée(s)`)
process.exit(ok ? 0 : 1)
