#!/usr/bin/env node
/**
 * compare-ipc-args.mjs — vérifie la cohérence des signatures IPC.
 *
 * Pour chaque canal `ipcRenderer.invoke(canal, args…)` du preload, compare le
 * nombre d'arguments réellement passés au nombre de paramètres attendus par le
 * `ipcMain.handle(canal, (event, params…) => …)` correspondant. Un écart est
 * une incohérence invisible à tsc (les deux côtés sont typés séparément) qui
 * se traduit au runtime par un paramètre `undefined` silencieux.
 */
import { readFileSync } from 'node:fs'

const preload = readFileSync('electron/preload.ts', 'utf8')
const handlers = readFileSync('electron/ipc/handlers.ts', 'utf8')

/** Extrait le contenu de la parenthèse ouvrante à l'index donné (profondeur 0). */
function readBalanced(text, openIdx) {
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return text.slice(openIdx + 1, i)
    }
  }
  return null
}

/** Découpe une liste d'arguments/paramètres par virgules de niveau 0. */
function splitTopLevel(list) {
  const parts = []
  let depth = 0
  let current = ''
  let inString = null
  for (const ch of list) {
    if (inString) {
      current += ch
      if (ch === inString) inString = null
      continue
    }
    if (ch === "'" || ch === '"') {
      inString = ch
      current += ch
      continue
    }
    if (ch === '(' || ch === '<' || ch === '[' || ch === '{') depth++
    if (ch === ')' || ch === '>' || ch === ']' || ch === '}') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

// ─── Côté renderer : ipcRenderer.invoke('canal', args…) ──────────────────────
const invokes = new Map() // canal -> nb d'arguments
const invokeRegex = /ipcRenderer\.invoke\(/g
let m
while ((m = invokeRegex.exec(preload)) !== null) {
  const inner = readBalanced(preload, m.index + m[0].length - 1)
  if (!inner) continue
  const args = splitTopLevel(inner)
  const channel = args[0]?.replace(/^['"]|['"]$/g, '')
  if (!channel) continue
  const count = args.length - 1
  invokes.set(channel, invokes.has(channel) ? Math.max(invokes.get(channel), count) : count)
}

// ─── Côté main : ipcMain.handle('canal', (event, params…) => …) ──────────────
const handles = new Map() // canal -> nb de paramètres (hors event)
const handleRegex = /ipcMain\.handle\(/g
while ((m = handleRegex.exec(handlers)) !== null) {
  const inner = readBalanced(handlers, m.index + m[0].length - 1)
  if (!inner) continue
  const args = splitTopLevel(inner)
  const channel = args[0]?.replace(/^['"]|['"]$/g, '')
  if (!channel) continue
  // 2e argument : soit une arrow function inline, soit une référence de fonction
  const fnPart = args.slice(1).join(',').trim()
  const arrowMatch = fnPart.match(/^(?:async\s*)?\(\s*([\s\S]*?)\)\s*=>/)
  if (arrowMatch) {
    const params = splitTopLevel(arrowMatch[1]).filter((p) => p.length > 0)
    // Le premier paramètre est l'objet event (_event/event)
    const expected = params.length > 0 ? params.length - 1 : 0
    handles.set(channel, expected)
  } else {
    // Référence de fonction (ex: setupNetworkHandlers) — à inspecter manuellement
    handles.set(channel, `REF:${fnPart.slice(0, 60)}`)
  }
}

// ─── Comparaison ─────────────────────────────────────────────────────────────
let mismatches = 0
let refs = 0
const lines = []
for (const [channel, sentCount] of [...invokes].sort()) {
  if (!handles.has(channel)) {
    lines.push(`✗ ${channel} : invoke sans handle`)
    mismatches++
    continue
  }
  const expected = handles.get(channel)
  if (typeof expected === 'string') {
    lines.push(`⚠ ${channel} : handle par référence (${expected}) — vérification manuelle requise`)
    refs++
    continue
  }
  // Les paramètres optionnels envoyés comme undefined comptent côté renderer
  if (sentCount !== expected && !(sentCount === 0 && expected === 0)) {
    lines.push(`✗ ${channel} : invoke envoie ${sentCount} argument(s), handle attend ${expected}`)
    mismatches++
  }
}
for (const [channel] of handles) {
  if (!invokes.has(channel)) {
    lines.push(`✗ ${channel} : handle sans invoke`)
    mismatches++
  }
}

console.log(`canaux invoke : ${invokes.size}, canaux handle : ${handles.size}`)
if (lines.length === 0) {
  console.log('RESULT: OK — toutes les signatures invoke↔handle concordent')
} else {
  console.log(lines.join('\n'))
  console.log(`RESULT: ${mismatches} écart(s) de signature, ${refs} référence(s) à vérifier`)
  process.exitCode = 1
}
