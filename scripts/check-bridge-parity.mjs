#!/usr/bin/env node
/**
 * check-bridge-parity.mjs — parité de l'API contextBridge.
 *
 * Compare l'interface `AsgardElectronAPI` (src/types/electron.ts, utilisée par
 * le renderer) avec l'interface `AsgardAPI` (electron/preload.ts, réellement
 * exposée via contextBridge). Une méthode déclarée côté renderer mais absente
 * du preload provoque un `undefined is not a function` au runtime, invisible à
 * tsc car les deux projets sont compilés séparément.
 */
import { readFileSync } from 'node:fs'

const rendererTypes = readFileSync('src/types/electron.ts', 'utf8')
const preloadTypes = readFileSync('electron/preload.ts', 'utf8')

/** Extrait { namespace -> Set<méthodes> } des blocs de niveau 2 d'une interface. */
function extractNamespaces(source, interfaceName) {
  const lines = source.split('\n')
  const startIdx = lines.findIndex((l) => l.includes(`interface ${interfaceName}`))
  if (startIdx === -1) return null
  const result = {}
  let currentNs = null
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    // Fin de l'interface (fermeture au niveau 0)
    if (/^\}/.test(line)) break
    // Début de namespace au niveau 2 : "  name: {"
    if (!currentNs) {
      const nsMatch = line.match(/^  ([a-zA-Z]+): \{/)
      if (nsMatch) {
        currentNs = nsMatch[1]
        result[currentNs] = new Set()
      }
      continue
    }
    // Fin de namespace au niveau 2 : "  }," ou "  }"
    if (/^  \},?$/.test(line)) {
      currentNs = null
      continue
    }
    // Méthode au niveau 4 dans le namespace courant
    const mMatch = line.match(/^    ([a-zA-Z]+):/)
    if (mMatch) result[currentNs].add(mMatch[1])
  }
  return result
}

const renderer = extractNamespaces(rendererTypes, 'AsgardElectronAPI')
const preload = extractNamespaces(preloadTypes, 'AsgardAPI')

if (!renderer) {
  console.error('interface AsgardElectronAPI introuvable dans src/types/electron.ts')
  process.exit(1)
}
if (!preload) {
  console.error('interface AsgardAPI introuvable dans electron/preload.ts')
  process.exit(1)
}

let problems = 0
const nsRenderer = new Set(Object.keys(renderer))
const nsPreload = new Set(Object.keys(preload))

for (const ns of nsRenderer) {
  if (!nsPreload.has(ns)) {
    console.log(`✗ namespace "${ns}" déclaré côté renderer mais absent du preload`)
    problems++
    continue
  }
  const missingInPreload = [...renderer[ns]].filter((m) => !preload[ns].has(m))
  const missingInRenderer = [...preload[ns]].filter((m) => !renderer[ns].has(m))
  for (const m of missingInPreload) {
    console.log(`✗ ${ns}.${m} : déclaré dans types/electron.ts mais NON exposé par le preload`)
    problems++
  }
  for (const m of missingInRenderer) {
    console.log(`✗ ${ns}.${m} : exposé par le preload mais absent de types/electron.ts`)
    problems++
  }
}
for (const ns of nsPreload) {
  if (!nsRenderer.has(ns)) {
    console.log(`✗ namespace "${ns}" exposé par le preload mais absent de types/electron.ts`)
    problems++
  }
}

if (problems === 0) {
  console.log('RESULT: OK — parité parfaite renderer↔preload (namespaces + méthodes)')
} else {
  console.log(`RESULT: ${problems} écart(s) de parité`)
  process.exitCode = 1
}
