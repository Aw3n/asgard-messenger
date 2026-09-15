/**
 * audit-languages.mjs — Audits translations.ts for per-language completeness.
 *
 * Checks, for each of the 25 supported languages:
 *   1. Missing keys vs the reference language (fr — also the i18next fallbackLng)
 *   2. Extra keys not present in the reference
 *   3. Untranslated values: identical to the English value in a non-English
 *      language, except the (lang → key) SAME allowlist from
 *      scripts/i18n-fix/misc-data.mjs where the English word is also the
 *      local word (Camera, Chat, Info, Status, Online, Asgard, E2E, KB/s…)
 *   4. English leftovers inside the French reference block itself, except
 *      the ALLOW_SAME list from scripts/i18n-fix/fr-en-data.mjs (same word
 *      in French and English)
 *   5. Keys used in src/ code but absent from the reference
 *   6. Foreign-script / mojibake markers: Cyrillic, Greek or
 *      language-specific diacritics appearing in blocks where they are not
 *      legitimate (the rotation bugs of the old injection scripts)
 *
 * Writes a machine-readable report to scripts/audit-languages-report.json
 * so that fix-languages.mjs can consume the exact offending key sets.
 *
 * Usage: node scripts/audit-languages.mjs [--full]
 */
import fs from 'fs'
import path from 'path'
import { ALLOW_SAME } from './i18n-fix/fr-en-data.mjs'
import { SAME } from './i18n-fix/misc-data.mjs'

const transPath = 'src/i18n/translations.ts'
const content = fs.readFileSync(transPath, 'utf8')
const lines = content.split('\n')

// ── Parse: split file into language blocks ──────────────────────────────────
const blockStart = /^  ([a-z]{2}): \{/
const keyLine = /^      "((?:[^"\\]|\\.)+)": "(.*)",?$/

const languages = {}
let currentLang = null
for (const line of lines) {
  const b = line.match(blockStart)
  if (b) {
    currentLang = b[1]
    languages[currentLang] = {}
    continue
  }
  if (currentLang && line.startsWith('      "')) {
    const k = line.match(keyLine)
    if (k) languages[currentLang][k[1]] = k[2]
  }
}

const langs = Object.keys(languages)
const REF = 'fr'
const refKeys = Object.keys(languages[REF])
console.log(`Languages found: ${langs.length} -> ${langs.join(', ')}`)
console.log(`Reference (${REF}) key count: ${refKeys.length}\n`)

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

const isSameAsEn = (lang, key) =>
  SAME.global.includes(key) || (SAME[lang] || []).includes(key)

const full = process.argv.includes('--full')
let problems = 0
const report = {
  ref: REF,
  refKeyCount: refKeys.length,
  languages: {},
  frEnglishLeftovers: [],
  usedMissing: [],
  foreignMarkers: [],
}

for (const lang of langs) {
  if (lang === REF) continue
  const keys = Object.keys(languages[lang])
  const keySet = new Set(keys)
  const missing = refKeys.filter((k) => !keySet.has(k))
  const extra = keys.filter((k) => !(k in languages[REF]))

  // Untranslated: same value as English (unless allowlisted as local word)
  const untranslated = []
  if (lang !== 'en') {
    for (const k of keys) {
      if (k in languages.en && languages[lang][k] === languages.en[k]
        && languages.en[k].length > 2 && !isSameAsEn(lang, k)) {
        untranslated.push({ key: k, en: languages.en[k] })
      }
    }
  }

  report.languages[lang] = {
    missing,
    extra,
    untranslated,
  }

  const issues = []
  if (missing.length) issues.push(`${missing.length} missing`)
  if (extra.length) issues.push(`${extra.length} extra`)
  if (untranslated.length) issues.push(`${untranslated.length} untranslated(=EN)`)

  if (issues.length) {
    problems++
    console.log(`[${lang}] ${issues.join(' | ')}`)
    if (full || missing.length <= 30) {
      for (const k of missing) console.log(`    MISSING: ${k}`)
    } else {
      console.log(`    (first 30 of ${missing.length} missing:)`)
      for (const k of missing.slice(0, 30)) console.log(`    MISSING: ${k}`)
    }
    if (full || untranslated.length <= 15) {
      for (const u of untranslated) console.log(`    EN-DUP:  ${u.key}  "${u.en.slice(0, 40)}"`)
    } else {
      console.log(`    (first 15 of ${untranslated.length} EN-DUP:)`)
      for (const u of untranslated.slice(0, 15)) console.log(`    EN-DUP:  ${u.key}  "${u.en.slice(0, 40)}"`)
    }
  } else {
    console.log(`[${lang}] OK — complete, no EN duplicates`)
  }
}

// ── English leftovers inside the French reference ────────────────────────────
console.log(`\n=== English leftovers in the "${REF}" reference block ===`)
for (const k of refKeys) {
  if (k in languages.en && languages[REF][k] === languages.en[k]
    && languages.en[k].length > 2 && !ALLOW_SAME.includes(k)) {
    report.frEnglishLeftovers.push({ key: k, en: languages.en[k] })
  }
}
if (report.frEnglishLeftovers.length === 0) {
  console.log('OK: no English values in the French block (allowlist applied)')
} else {
  problems++
  console.log(`${report.frEnglishLeftovers.length} French keys hold the raw English value`)
  for (const u of report.frEnglishLeftovers) console.log(`    ${u.key}  "${u.en.slice(0, 50)}"`)
}

// ── Keys used in code but absent from the reference ──────────────────────────
console.log('\n=== Keys used in src/ code but missing from reference (fr) ===')
const usedKeys = new Map()
function scanDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) scanDir(p)
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !p.includes('i18n' + path.sep)) {
      const c = fs.readFileSync(p, 'utf8')
      const tRegex = /\bt\(\s*['"`]([^'"`\n]+)['"`]/g
      let mm
      while ((mm = tRegex.exec(c)) !== null) {
        const key = mm[1]
        if (!key.includes('${') && !key.includes('\\')) {
          if (!usedKeys.has(key)) usedKeys.set(key, p)
        }
      }
    }
  }
}
scanDir('src')
report.usedMissing = [...usedKeys.entries()]
  .filter(([k]) => !(k in languages[REF]))
  .map(([k, p]) => ({ key: k, file: p }))
if (report.usedMissing.length === 0) {
  console.log(`OK: all ${usedKeys.size} t() keys used in code exist in the reference`)
} else {
  problems++
  console.log(`${report.usedMissing.length} of ${usedKeys.size} used keys are missing from translations`)
  for (const u of report.usedMissing) console.log(`    ${u.key}  (used in ${u.file})`)
}

// ── Foreign-script / mojibake markers in wrong blocks ────────────────────────
console.log('\n=== Foreign-script / mojibake markers ===')
for (const lang of langs) {
  for (const [key, value] of Object.entries(langs.includes(lang) ? languages[lang] : {})) {
    for (const [re, label, allowed] of MARKERS) {
      if (re.test(value) && !allowed.includes(lang)) {
        report.foreignMarkers.push({ lang, key, value: value.slice(0, 60), marker: label })
      }
    }
  }
}
if (report.foreignMarkers.length === 0) {
  console.log('OK: no foreign-script or mojibake markers in any block')
} else {
  problems++
  console.log(`${report.foreignMarkers.length} foreign-marker hits:`)
  for (const m of report.foreignMarkers.slice(0, 40)) {
    console.log(`    [${m.lang}] ${m.key} = "${m.value}"  → ${m.marker}`)
  }
  if (report.foreignMarkers.length > 40) console.log(`    (…${report.foreignMarkers.length - 40} more)`)
}

fs.writeFileSync('scripts/audit-languages-report.json', JSON.stringify(report, null, 2))
console.log('\nReport saved to scripts/audit-languages-report.json')

// ── Verdict ──────────────────────────────────────────────────────────────────
console.log('\n=== Verdict ===')
if (problems === 0) {
  console.log('ALL CLEAR — every language is complete and translated')
} else {
  console.log(`${problems} language(s)/section(s) with issues — see above`)
  process.exit(1)
}
