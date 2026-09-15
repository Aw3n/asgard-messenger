/**
 * fix-languages.mjs — Applies the i18n-fix data tables to
 * src/i18n/translations.ts.
 *
 * For every language block (  xx: { translation: { ... } } ):
 *   - keys present in the data table get their value replaced in place;
 *   - keys of the table missing from the block are inserted just before the
 *     closing "}" of the translation sub-block (after the
 *     "Added for UI localization" marker), using the file's own escaping
 *     convention (apostrophes as \' and double quotes as \").
 *
 * Idempotent: running it twice yields the same file. EN is fixed before the
 * audit runs so that untranslated-value comparisons use a clean reference.
 */
import fs from 'fs'
import { DATA as CALLS_CHAT } from './i18n-fix/calls-chat-data.mjs'
import { DATA as LIGHTBOX_FIREWALL } from './i18n-fix/lightbox-restore-firewall-data.mjs'
import { DATA as ONBOARDING_HC } from './i18n-fix/onboarding-hardcoded-data.mjs'
import { DATA as ERRORBOUNDARY } from './i18n-fix/errorboundary-data.mjs'
import { FR, EN } from './i18n-fix/fr-en-data.mjs'

let MISC = {}
if (fs.existsSync(new URL('./i18n-fix/misc-data.mjs', import.meta.url))) {
  MISC = (await import('./i18n-fix/misc-data.mjs')).DATA
}

const FILE = 'src/i18n/translations.ts'
const c = fs.readFileSync(FILE, 'utf8')
const NL = c.includes('\r\n') ? '\r\n' : '\n'
const lines = c.split(NL)

const esc = (v) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')

// Merge the tables: per-language override map.
const DATA = {}
for (const lang of Object.keys(CALLS_CHAT)) DATA[lang] = { ...CALLS_CHAT[lang] }
for (const lang of Object.keys(LIGHTBOX_FIREWALL)) {
  DATA[lang] = { ...(DATA[lang] || {}), ...LIGHTBOX_FIREWALL[lang] }
}
for (const lang of Object.keys(ONBOARDING_HC)) {
  DATA[lang] = { ...(DATA[lang] || {}), ...ONBOARDING_HC[lang] }
}
for (const lang of Object.keys(ERRORBOUNDARY)) {
  DATA[lang] = { ...(DATA[lang] || {}), ...ERRORBOUNDARY[lang] }
}
for (const lang of Object.keys(MISC)) {
  DATA[lang] = { ...(DATA[lang] || {}), ...MISC[lang] }
}
for (const [k, v] of Object.entries(FR)) (DATA.fr = DATA.fr || {})[k] = v
for (const [k, v] of Object.entries(EN)) (DATA.en = DATA.en || {})[k] = v

const KEY_RE = /^      "((?:[^"\\]|\\.)+)": "(.*)",?$/
const BLOCK_RE = /^  ([a-z]{2}): \{/

const stats = {}
let cur = null          // current language code
let inTranslation = false
let seenKeys = null     // keys of DATA[cur] already handled in the block

const out = []
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]

  const b = line.match(BLOCK_RE)
  if (b) {
    // Flush any pending insertion for the previous block (should not happen:
    // insertion happens at the sub-block closing "}" below).
    cur = b[1]
    inTranslation = false
    seenKeys = null
    stats[cur] = stats[cur] || { replaced: 0, inserted: 0 }
    out.push(line)
    continue
  }

  if (cur === null) { out.push(line); continue }

  if (/^    translation: \{/.test(line)) { inTranslation = true; out.push(line); continue }

  if (inTranslation && /^    \}$/.test(line)) {
    // Closing of the translation sub-block: insert the missing keys.
    const pending = DATA[cur]
      ? Object.keys(DATA[cur]).filter(k => !seenKeys || !seenKeys.has(k))
      : []
    if (pending.length > 0) {
      out.push('      // ─── fix-languages.mjs additions ───')
      for (const k of pending) {
        out.push(`      "${k}": "${esc(DATA[cur][k])}",`)
        stats[cur].inserted++
      }
    }
    inTranslation = false
    out.push(line)
    continue
  }

  if (inTranslation && line.startsWith('      "')) {
    const m = line.match(KEY_RE)
    if (m && DATA[cur] && Object.prototype.hasOwnProperty.call(DATA[cur], m[1])) {
      seenKeys = seenKeys || new Set()
      seenKeys.add(m[1])
      out.push(`      "${m[1]}": "${esc(DATA[cur][m[1]])}",`)
      stats[cur].replaced++
      continue
    }
  }

  out.push(line)
}

// Sanity check: every table language must have been seen as a block.
const tableLangs = new Set(Object.keys(DATA))
const blockLangs = new Set(Object.keys(stats))
for (const lang of tableLangs) {
  if (!blockLangs.has(lang)) {
    console.error(`FATAL: table language "${lang}" has no block in ${FILE}`)
    process.exit(1)
  }
}

fs.writeFileSync(FILE, out.join(NL))

let rep = 0, ins = 0
for (const [lang, s] of Object.entries(stats)) { rep += s.replaced; ins += s.inserted }
console.log(`fix-languages: ${rep} values replaced, ${ins} keys inserted across ${blockLangs.size} language blocks`)
for (const [lang, s] of Object.entries(stats)) {
  if (s.replaced || s.inserted) console.log(`  ${lang}: ${s.replaced} replaced, ${s.inserted} inserted`)
}
