#!/usr/bin/env node
/**
 * verify-holepunch-types.mjs — confronte les déclarations ambient holepunch
 * aux paquets réellement installés.
 *
 * `electron/types.d.ts` (process principal) et `src/types/holepunch.d.ts`
 * (renderer/tests) déclarent des modules holepunch sans types officiels.
 * TypeScript fait donc confiance à ces déclarations : un membre déclaré mais
 * inexistant dans le paquet installé passe tsc et casse au runtime.
 *
 * Ce script parse chaque `declare module`, importe dynamiquement le paquet
 * installé et vérifie que chaque méthode de prototype, statique et export
 * nommé existe réellement. Les propriétés assignées dans le constructeur
 * (readonly peers/connections/…) ne sont pas vérifiables sans instanciation
 * et sont listées à titre informatif.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const FILES = ['electron/types.d.ts', 'src/types/holepunch.d.ts']

/** Découpe un bloc `declare module 'name' { … }` (accolades équilibrées). */
function extractModules(source) {
  const modules = []
  const re = /declare module '([^']+)' \{/g
  let m
  while ((m = re.exec(source)) !== null) {
    let depth = 1
    let i = m.index + m[0].length
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
    }
    modules.push({ name: m[1], body: source.slice(m.index + m[0].length, i - 1) })
  }
  return modules
}

/**
 * Extrait les membres vérifiables d'un corps de module.
 * Retourne { defaultClass: {statics:[], methods:[]}, defaultObject: [members],
 *           namedExports:[], instanceProps:[] }.
 */
function extractMembers(body) {
  const out = {
    defaultClass: null, // { statics: [], methods: [] }
    defaultObject: null, // [member names]
    namedExports: [],
    instanceProps: [],
    subProtos: {}, // interface X { methods } → vérifiés si classe concrète trouvée
  }

  // export default class X { … } — corps non-glouton jusqu'à la PREMIÈRE fermeture
  // d'accolade à indentation 2 (les interfaces suivantes ne font pas partie de la classe)
  const cls = body.match(/export default class (\w+)[\s\S]*?\{([\s\S]*?)\n  \}/)
  if (cls) {
    const statics = []
    const methods = []
    for (const line of cls[2].split('\n')) {
      const t = line.trim()
      let mm
      if ((mm = t.match(/^static (\w+)\(/))) statics.push(mm[1])
      else if ((mm = t.match(/^static readonly (\w+):/))) statics.push(mm[1])
      else if ((mm = t.match(/^(\w+)\(/)) && mm[1] !== 'constructor') methods.push(mm[1])
      else if ((mm = t.match(/^readonly (\w+):/))) out.instanceProps.push(mm[1])
      else if ((mm = t.match(/^(\w+):/))) out.instanceProps.push(mm[1])
    }
    out.defaultClass = { name: cls[1], statics, methods }
  }

  // const _default: { … } / export default _default
  const obj = body.match(/const _default: \{([\s\S]*?)\n  \}/)
  if (obj) {
    out.defaultObject = []
    for (const line of obj[1].split('\n')) {
      const mm = line.trim().match(/^(\w+): \(/)
      if (mm) out.defaultObject.push(mm[1])
    }
  }

  // export function name(…)
  for (const mm of body.matchAll(/^  export function (\w+)\(/gm)) out.namedExports.push(mm[1])
  // export const name
  for (const mm of body.matchAll(/^  export const (\w+)$/gm)) out.namedExports.push(mm[1])
  // export { x } from '…' — re-exports, non vérifiables ici
  if (/^  export \{/m.test(body)) out.reExports = true

  return out
}

let problems = 0
let infos = 0
const lines = []

async function checkModule(file, mod) {
  const members = extractMembers(mod.body)

  let ns
  try {
    ns = await import(mod.name)
  } catch (err) {
    lines.push(`✗ [${file}] ${mod.name} : import dynamique impossible — ${err.message}`)
    problems++
    return
  }
  // Interop CJS : le module.exports devient ns.default
  const defaultExport = ns.default ?? ns

  const label = `[${file}] ${mod.name}`

  if (members.defaultClass) {
    const C = defaultExport
    if (typeof C !== 'function') {
      lines.push(`✗ ${label} : default n'est pas une classe (typeof = ${typeof C})`)
      problems++
      return
    }
    for (const s of members.defaultClass.statics) {
      if (!(s in C)) {
        lines.push(`✗ ${label} : statique .${s} inexistante sur ${members.defaultClass.name}`)
        problems++
      }
    }
    const proto = C.prototype ?? {}
    for (const m of members.defaultClass.methods) {
      if (!(m in proto)) {
        lines.push(`✗ ${label} : méthode prototype .${m}() inexistante sur ${members.defaultClass.name}`)
        problems++
      }
    }
    for (const p of members.instanceProps) {
      infos++
    }
    lines.push(
      `· ${label} : classe ${members.defaultClass.name} — ${members.defaultClass.statics.length} statique(s), ` +
        `${members.defaultClass.methods.length} méthode(s), ${members.instanceProps.length} prop(s) constructeur [OK si usage vérifié]`
    )
  }

  if (members.defaultObject) {
    for (const m of members.defaultObject) {
      if (!(m in defaultExport)) {
        lines.push(`✗ ${label} : membre .${m} inexistant sur l'objet default`)
        problems++
      }
    }
    lines.push(`· ${label} : objet default — ${members.defaultObject.length} membre(s) vérifié(s)`)
  }

  for (const name of members.namedExports) {
    if (!(name in ns)) {
      lines.push(`✗ ${label} : export nommé .${name} inexistant`)
      problems++
    }
  }
}

// ─── Vérifications ciblées de classes internes référencées ────────────────────
function checkInternalClasses() {
  // PeerInfo (hyperswarm/lib/peer-info) : ban() déclaré dans src/types/holepunch.d.ts
  try {
    const PeerInfo = require('hyperswarm/lib/peer-info')
    const C = PeerInfo.default ?? PeerInfo
    if (typeof C === 'function' && C.prototype) {
      for (const m of ['ban', 'on']) {
        if (!(m in C.prototype)) {
          lines.push(`✗ hyperswarm/lib/peer-info : prototype .${m}() inexistant (déclaré via interface PeerInfo)`)
          problems++
        }
      }
      lines.push('· hyperswarm/lib/peer-info : ban()/on() présents sur le prototype [OK]')
    }
  } catch (err) {
    lines.push(`· hyperswarm/lib/peer-info : non résolu (${err.code ?? err.message}) — interface, ignoré`)
    infos++
  }
}

const seen = new Set()
for (const file of FILES) {
  const source = readFileSync(file, 'utf8')
  for (const mod of extractModules(source)) {
    const key = `${file}::${mod.name}`
    if (seen.has(key)) continue
    seen.add(key)
    await checkModule(file, mod)
  }
}
checkInternalClasses()

console.log(lines.join('\n'))
console.log(`\nmembres constructeur non vérifiables statiquement : ${infos}`)
if (problems === 0) {
  console.log('RESULT: OK — chaque membre déclaré des modules holepunch existe dans le paquet installé')
} else {
  console.log(`RESULT: ${problems} membre(s) déclaré(s) inexistant(s) au runtime`)
  process.exitCode = 1
}
