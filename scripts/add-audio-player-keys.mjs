#!/usr/bin/env node
/**
 * Injecte / réécrit dans src/i18n/translations.ts les trois chaînes du lecteur
 * audio de pièce jointe, pour les 25 langues supportées.
 *
 * Pourquoi un script : `fallbackLng: 'fr'` (src/i18n/config.ts) fait tomber
 * silencieusement en français toute clé absente d'une locale — un bouton
 * « Écouter » jamais traduit se découvre donc à l'usage, jamais au build. Le
 * même mécanisme d'injection a déjà servi aux clés de la visionneuse (cf.
 * scripts/add-lightbox-zoom-keys.mjs) ; la vérification est reprise dans
 * scripts/verify-audio-keys.mjs.
 *
 * Les lignes existantes sont remplacées en place, quelle que soit leur
 * indentation ; les manquantes sont insérées avant l'accolade fermante de
 * l'objet `translation` de chaque locale.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = ['chat.playAudio', 'chat.pauseAudio', 'chat.audioPosition']

const DATA = {
  fr: { 'chat.playAudio': 'Écouter', 'chat.pauseAudio': 'Pause', 'chat.audioPosition': 'Position de lecture' },
  en: { 'chat.playAudio': 'Play', 'chat.pauseAudio': 'Pause', 'chat.audioPosition': 'Playback position' },
  nl: { 'chat.playAudio': 'Afspelen', 'chat.pauseAudio': 'Pauze', 'chat.audioPosition': 'Afspeelpositie' },
  de: { 'chat.playAudio': 'Abspielen', 'chat.pauseAudio': 'Pause', 'chat.audioPosition': 'Wiedergabeposition' },
  it: { 'chat.playAudio': 'Riproduci', 'chat.pauseAudio': 'Pausa', 'chat.audioPosition': 'Posizione di riproduzione' },
  es: { 'chat.playAudio': 'Reproducir', 'chat.pauseAudio': 'Pausa', 'chat.audioPosition': 'Posición de reproducción' },
  pt: { 'chat.playAudio': 'Reproduzir', 'chat.pauseAudio': 'Pausa', 'chat.audioPosition': 'Posição de reprodução' },
  el: { 'chat.playAudio': 'Αναπαραγωγή', 'chat.pauseAudio': 'Παύση', 'chat.audioPosition': 'Θέση αναπαραγωγής' },
  da: { 'chat.playAudio': 'Afspil', 'chat.pauseAudio': 'Pause', 'chat.audioPosition': 'Afspilningsposition' },
  fi: { 'chat.playAudio': 'Toista', 'chat.pauseAudio': 'Tauko', 'chat.audioPosition': 'Toistokohta' },
  sv: { 'chat.playAudio': 'Spela upp', 'chat.pauseAudio': 'Paus', 'chat.audioPosition': 'Uppspelningsposition' },
  hr: { 'chat.playAudio': 'Reproduciraj', 'chat.pauseAudio': 'Pauza', 'chat.audioPosition': 'Pozicija reprodukcije' },
  et: { 'chat.playAudio': 'Esita', 'chat.pauseAudio': 'Paus', 'chat.audioPosition': 'Esitamise koht' },
  hu: { 'chat.playAudio': 'Lejátszás', 'chat.pauseAudio': 'Szünet', 'chat.audioPosition': 'Lejátszási pozíció' },
  lv: { 'chat.playAudio': 'Atskaņot', 'chat.pauseAudio': 'Pauze', 'chat.audioPosition': 'Atskaņošanas pozīcija' },
  lt: { 'chat.playAudio': 'Atkurti', 'chat.pauseAudio': 'Pauzė', 'chat.audioPosition': 'Atkūrimo pozicija' },
  mt: { 'chat.playAudio': 'Ħaddem', 'chat.pauseAudio': 'Pawża', 'chat.audioPosition': 'Pożizzjoni tar-riproduzzjoni' },
  pl: { 'chat.playAudio': 'Odtwórz', 'chat.pauseAudio': 'Wstrzymaj', 'chat.audioPosition': 'Pozycja odtwarzania' },
  sk: { 'chat.playAudio': 'Prehrať', 'chat.pauseAudio': 'Pauza', 'chat.audioPosition': 'Pozícia prehrávania' },
  sl: { 'chat.playAudio': 'Predvajaj', 'chat.pauseAudio': 'Pavza', 'chat.audioPosition': 'Položaj predvajanja' },
  cs: { 'chat.playAudio': 'Přehrát', 'chat.pauseAudio': 'Pozastavit', 'chat.audioPosition': 'Pozice přehrávání' },
  bg: { 'chat.playAudio': 'Възпроизвеждане', 'chat.pauseAudio': 'Пауза', 'chat.audioPosition': 'Позиция на възпроизвеждане' },
  ga: { 'chat.playAudio': 'Seinn', 'chat.pauseAudio': 'Sos', 'chat.audioPosition': 'Suíomh seinn' },
  ro: { 'chat.playAudio': 'Redă', 'chat.pauseAudio': 'Pauză', 'chat.audioPosition': 'Poziția redării' },
  uk: { 'chat.playAudio': 'Відтворити', 'chat.pauseAudio': 'Пауза', 'chat.audioPosition': 'Позиція відтворення' },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

// Chaque bloc de locale commence à deux espaces (`  fr: {`) et contient un seul
// objet imbriqué `translation` fait de clés plates "a.b".
const marks = []
lines.forEach((line, i) => {
  const m = /^  ([a-z]{2}): \{\s*$/.exec(line)
  if (m) marks.push({ code: m[1], i })
})

const known = Object.keys(DATA)
const missing = known.filter((c) => !marks.some((m) => m.code === c))
if (missing.length) {
  console.error(`✗ blocs de locale introuvables dans translations.ts : ${missing.join(', ')}`)
  process.exit(1)
}
const unknownBlocks = marks.filter((m) => !known.includes(m.code)).map((m) => m.code)
if (unknownBlocks.length) {
  console.error(`✗ des locales de translations.ts n'ont pas de données : ${unknownBlocks.join(', ')}`)
  process.exit(1)
}

let replaced = 0
let inserted = 0

// Parcours à rebours : insérer dans un bloc ne doit pas décaler les suivants.
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
    let close = -1
    for (let i = block.length - 1; i >= 0; i--) {
      if (/^ {4}\}\s*,?\s*$/.test(block[i])) { close = i; break }
    }
    if (close < 0) {
      console.error(`✗ accolade fermante de l'objet translation introuvable dans le bloc ${code}`)
      process.exit(1)
    }
    block.splice(close, 0, ...pending)
    inserted += pending.length
  }

  lines.splice(start, end - start, ...block)
}

writeFileSync(file, lines.join(eol), 'utf8')
console.log(`✓ ${known.length} locales · ${KEYS.length} clés · ${replaced} lignes réécrites, ${inserted} lignes ajoutées`)
