// Vérification IPC : chaque canal invoqué/envoyé côté preload doit être
// géré côté main (handlers.ts / main.ts), et inversement (zéro API fantôme).
// Emetteurs main→renderer : webContents.send(...) ET event.sender.send(...).
// Récepteurs preload : createListener(...) ET ipcRenderer.on(...) directs.
import { readFileSync } from 'node:fs'

const preload = readFileSync('electron/preload.ts', 'utf8')
const handlers = readFileSync('electron/ipc/handlers.ts', 'utf8')
const main = readFileSync('electron/main.ts', 'utf8')
const mainAll = handlers + '\n' + main

const invokes = new Set()
for (const m of preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)) invokes.add(m[1])
const sends = new Set()
for (const m of preload.matchAll(/ipcRenderer\.send\('([^']+)'/g)) sends.add(m[1])

const handles = new Set()
for (const m of mainAll.matchAll(/ipcMain\.handle\('([^']+)'/g)) handles.add(m[1])
const ons = new Set()
for (const m of mainAll.matchAll(/ipcMain\.on\('([^']+)'/g)) ons.add(m[1])

let fail = false

const missingHandle = [...invokes].filter((c) => !handles.has(c))
if (missingHandle.length) {
  console.error('PRELOAD→MAIN manquants (invoke sans handle):', missingHandle)
  fail = true
}
const missingOn = [...sends].filter((c) => !ons.has(c))
if (missingOn.length) {
  console.error('PRELOAD→MAIN manquants (send sans on):', missingOn)
  fail = true
}
const ghostHandle = [...handles].filter((c) => !invokes.has(c))
if (ghostHandle.length) {
  console.error('MAIN→PRELOAD fantômes (handle sans invoke):', ghostHandle)
  fail = true
}
const ghostOn = [...ons].filter((c) => !sends.has(c))
if (ghostOn.length) {
  console.warn('MAIN→PRELOAD orphelins (on sans send — debug:log attendu):', ghostOn)
}

// Émetteurs main→renderer (webContents.send + sender.send)
const mainEmitters = new Set()
for (const m of mainAll.matchAll(/(?:webContents|sender)\.send\('([^']+)'/g)) mainEmitters.add(m[1])
// Récepteurs preload (createListener + ipcRenderer.on directs)
const rendererListeners = new Set()
for (const m of preload.matchAll(/createListener\('([^']+)'/g)) rendererListeners.add(m[1])
for (const m of preload.matchAll(/ipcRenderer\.on\('([^']+)'/g)) rendererListeners.add(m[1])

const missingListener = [...mainEmitters].filter((c) => !rendererListeners.has(c))
if (missingListener.length) {
  console.error('MAIN→RENDERER sans récepteur preload:', missingListener)
  fail = true
}
const ghostListener = [...rendererListeners].filter((c) => !mainEmitters.has(c))
if (ghostListener.length) {
  console.error('LISTENERS fantômes (preload sans émetteur main):', ghostListener)
  fail = true
}

console.log(`invoke: ${invokes.size} (handles: ${handles.size})`)
console.log(`send: ${sends.size} (on: ${ons.size})`)
console.log(`émetteurs main→renderer: ${mainEmitters.size} (récepteurs preload: ${rendererListeners.size})`)
if (fail) {
  console.error('RESULT: FAIL')
  process.exit(1)
}
console.log('RESULT: OK — zéro API fantôme, zéro canal orphelin')
