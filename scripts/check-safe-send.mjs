#!/usr/bin/env node
/**
 * check-safe-send.mjs — invariante « envoi IPC après destruction de la fenêtre ».
 *
 * Un `webContents.send()` appelé sur une BrowserWindow déjà détruite lève
 * `TypeError: Object has been destroyed`. Dans le process principal, une
 * exception non rattrapée ne tue pas seulement la tâche en cours : Electron
 * affiche la boîte « A JavaScript error occurred in the main process » et
 * l'application semble planter à chaque fermeture. C'est exactement le plantage
 * remonté par un utilisateur : le timer `scoreUpdateInterval` de NetworkService
 * émet `status:update` pendant le shutdown, alors que la fenêtre est fermée depuis
 * un moment (`quitCleanups` attend encore le DHT).
 *
 * Règle : tout envoi vers le renderer doit passer par `safeSend()`
 * (electron/ipc/handlers.ts), qui vérifie `isDestroyed()` avant d'envoyer. Un
 * appel brut n'est toléré qu'à condition qu'un garde `isDestroyed()` apparaisse
 * dans les lignes précédentes du même bloc.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = 'electron'
const LOOKBEHIND = 12 // lignes vérifiées au-dessus de l'appel
const SEND_RE = /\.webContents\s*[!?]?\s*\.send\(/

/** Liste récursivement les .ts du process principal. */
function collect(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collect(full))
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

const violations = []
let total = 0

for (const file of collect(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!SEND_RE.test(line)) return
    total++
    // Commentaire de documentation → pas un appel réel
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
    const context = lines.slice(Math.max(0, i - LOOKBEHIND), i).join('\n')
    if (!context.includes('isDestroyed')) {
      violations.push(`${file}:${i + 1}  ${line.trim()}`)
    }
  })
}

if (violations.length) {
  console.error(`✗ ${violations.length} envoi(s) IPC non gardé(s) (sur ${total} appel(s) de webContents.send) :`)
  for (const v of violations) console.error(`    ${v}`)
  console.error('  → utiliser safeSend(win, canal, charge) de electron/ipc/handlers.ts')
  process.exit(1)
}

console.log(`OK — ${total} appel(s) webContents.send, tous gardés par isDestroyed()`)
