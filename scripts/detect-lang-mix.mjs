/**
 * detect-lang-mix.mjs — Detects values written in the wrong language block.
 *
 * Strategies:
 *   1. Script markers: Cyrillic/Greek codepoints and language-specific
 *      diacritics appearing in blocks where they are not legitimate.
 *   2. Mojibake markers (UTF-8 read as CP1252: ð, Ð, ┐, ÔÇ…).
 *   3. Cross-language duplicates: two different languages holding the exact
 *      same long value for one key (a copy/paste or rotation artifact).
 *   4. Suspicious English in the French reference block (multi-word, no
 *      accent, no apostrophe, no ç) for manual review.
 *   5. Full dump of the injected key groups (calls/chat/firewall/lightbox/
 *      onboarding-restore) across all 25 languages.
 *
 * Writes scripts/lang-mix-report.txt
 */
import fs from 'fs'

const c = fs.readFileSync('src/i18n/translations.ts', 'utf8')
const langs = {}
let cur = null
for (const line of c.split('\n')) {
  const b = line.match(/^  ([a-z]{2}): \{/)
  if (b) { cur = b[1]; langs[cur] = {}; continue }
  if (cur && line.startsWith('      "')) {
    const k = line.match(/^      "((?:[^"\\]|\\.)+)": "(.*)",?$/)
    if (k) langs[cur][k[1]] = k[2].replace(/\\'/g, "'")
  }
}
const LANGS = Object.keys(langs)
const out = []
const log = (s) => { out.push(s); }

// ── 1. Script / diacritic markers ───────────────────────────────────────────
// [regex, human label, langs where the marker is legitimate]
const MARKERS = [
  [/[\u0400-\u04FF]/, 'Cyrillic script', ['bg', 'uk']],
  [/[\u0370-\u03FF\u1F00-\u1FFF]/, 'Greek script', ['el']],
  [/[æøÆØ]/, 'æ/ø (Danish)', ['da']],
  [/å/, 'å (Danish/Swedish)', ['da', 'sv']],
  [/đ/, 'đ (Croatian)', ['hr']],
  [/ł/, 'ł (Polish)', ['pl']],
  [/[řů]/, 'ř/ů (Czech)', ['cs']],
  [/ě/, 'ě (Czech/Slovak)', ['cs', 'sk']],
  [/[őű]/, 'ő/ű (Hungarian)', ['hu']],
  [/[āēīō]/, 'ā/ē/ī/ō macrons (Latvian)', ['lv']],
  [/ū/, 'ū (Latvian/Lithuanian)', ['lv', 'lt']],
  [/[ļķģņ]/, 'ļ/ķ/ģ/ņ (Latvian)', ['lv']],
  [/[ėįų]/, 'ė/į/ų (Lithuanian)', ['lt']],
  [/[ąę]/, 'ą/ę (Polish/Lithuanian)', ['pl', 'lt']],
  [/[ħġ]/i, 'ħ/ġ (Maltese)', ['mt']],
  [/ż/i, 'ż (Maltese/Polish)', ['mt', 'pl']],
  [/[șț]/, 'ș/ț (Romanian)', ['ro']],
  [/ă/, 'ă (Romanian)', ['ro']],
  [/î/, 'î (Romanian/French)', ['ro', 'fr']],
  [/â/, 'â (Romanian/Portuguese/French)', ['ro', 'pt', 'fr']],
  [/õ/, 'õ (Estonian/Portuguese)', ['et', 'pt']],
  [/ã/, 'ã (Portuguese)', ['pt']],
  [/ñ/, 'ñ (Spanish)', ['es']],
  [/ß/, 'ß (German)', ['de']],
  [/[ğşıİ]/, 'Turkish letters', []],
  [/þ/, 'þ (Icelandic)', []],
  // mojibake markers (UTF-8 bytes shown as CP1252)
  [/ð/, 'mojibake ð', []],
  [/Ð(?![0-9])/, 'mojibake Ð', []],
  [/[┐┬┴└┼─╬║]/, 'box-drawing mojibake', []],
  [/ÔÇ/, 'mojibake ÔÇ', []],
  [/Ã/, 'mojibake Ã', []],
]

let markerHits = 0
log('=== 1. Script/diacritic/mojibake markers in wrong blocks ===')
for (const lang of LANGS) {
  for (const [key, value] of Object.entries(langs[lang])) {
    for (const [re, label, allowed] of MARKERS) {
      if (re.test(value) && !allowed.includes(lang)) {
        markerHits++
        log(`[${lang}] ${key} = "${value.slice(0, 60)}"  → ${label}`)
      }
    }
  }
}
log(markerHits === 0 ? '  none' : `  (${markerHits} hits)`)

// ── 2. Cross-language duplicate values ──────────────────────────────────────
log('\n=== 2. Same value shared by 2+ languages (len ≥ 14) ===')
let dupHits = 0
const refKeys = Object.keys(langs.fr)
for (const key of refKeys) {
  const byValue = new Map()
  for (const lang of LANGS) {
    const v = langs[lang][key]
    if (v === undefined) continue
    if (!byValue.has(v)) byValue.set(v, [])
    byValue.get(v).push(lang)
  }
  for (const [v, ls] of byValue) {
    if (ls.length >= 2 && v.length >= 14) {
      dupHits++
      log(`${key} = "${v.slice(0, 60)}"  → langs: ${ls.join(',')}`)
    }
  }
}
log(dupHits === 0 ? '  none' : `  (${dupHits} groups)`)

// ── 3. Suspicious English in the French block ───────────────────────────────
log('\n=== 3. French-block values with no accent/apostrophe/ç (manual review) ===')
const FRENCH_OK = new Set([
  // legitimately accent-free French strings verified by hand
  'Asgard', 'E2E', 'KB/s', 'Emoji', 'Admin', 'Info', 'Contacts', 'Messages',
  'Relation', 'Note', 'Invisible', 'Total', 'Compact', 'Action', 'Version {{version}}',
])
let frSuspects = 0
for (const [key, value] of Object.entries(langs.fr)) {
  if (value.length >= 8 && value.includes(' ') && !FRENCH_OK.has(value)
    && !/[éèêëàâçùûîôïœÉÈÊËÀÂÇÙÛÎÔÏŒ']/.test(value)) {
    frSuspects++
    log(`fr ${key} = "${value}"`)
  }
}
log(frSuspects === 0 ? '  none' : `  (${frSuspects} suspects)`)

// ── 4. Full dump of the injected key groups ─────────────────────────────────
log('\n=== 4. Dump of injected key groups (all languages) ===')
const GROUPS = {
  'calls (injected)': [
    'calls.holdLabel', 'calls.holdCall', 'calls.resumeCall', 'calls.settingsLabel',
    'calls.callSettings', 'calls.stopScreenShare', 'calls.videoQuality',
    'calls.qualityHigh', 'calls.qualityMedium', 'calls.qualityLow',
    'calls.noiseSuppression', 'calls.noiseSuppressionDesc',
    'calls.echoCancellation', 'calls.echoCancellationDesc',
    'calls.excellent', 'calls.openChat', 'calls.refreshServer',
    'calls.noContactsFound', 'calls.startCallHint',
    'calls.microphoneLabel', 'calls.microphoneOffLabel',
    'calls.cameraLabel', 'calls.cameraOffLabel', 'calls.screenShareLabel',
    'calls.camera', 'calls.cameraLoading', 'calls.e2e',
  ],
  'chat (transfers)': [
    'chat.sendingFile', 'chat.receivingFile', 'chat.transfersActive',
    'chat.sending', 'chat.send', 'chat.downloadNamedFile', 'chat.links',
  ],
  'settings (firewall)': [
    'settings.firewall', 'settings.firewallChecking', 'settings.firewallConfigured',
    'settings.firewallConfiguring', 'settings.firewallFailed',
    'settings.firewallNotConfigured', 'settings.firewallConfigure',
    'settings.firewallSuccess', 'settings.notificationSound',
  ],
  'lightbox + onboarding.restore': [
    'lightbox.zoomIn', 'lightbox.zoomOut', 'lightbox.resetZoom', 'lightbox.fit',
    'lightbox.download', 'lightbox.close', 'lightbox.scrollZoom', 'lightbox.dragToPan',
    'onboarding.restoreIdentity', 'onboarding.restoreDesc',
    'onboarding.seedPhrasePlaceholder', 'onboarding.restoring',
    'onboarding.identityRestored', 'onboarding.restoreFailed',
    'onboarding.seedPhraseInvalid', 'onboarding.words', 'onboarding.back',
  ],
}
for (const [group, keys] of Object.entries(GROUPS)) {
  log(`\n--- ${group} ---`)
  for (const key of keys) {
    log(`  ${key}:`)
    for (const lang of LANGS) {
      const v = langs[lang][key]
      log(`    ${lang}: ${v === undefined ? '<MISSING>' : v}`)
    }
  }
}

fs.writeFileSync('scripts/lang-mix-report.txt', out.join('\n') + '\n')
console.log(`markers: ${markerHits}, dup-groups: ${dupHits}, fr-suspects: ${frSuspects}`)
console.log('full report → scripts/lang-mix-report.txt')
