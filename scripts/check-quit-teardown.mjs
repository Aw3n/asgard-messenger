#!/usr/bin/env node
/**
 * check-quit-teardown.mjs — invariants du teardown du process principal.
 *
 * Deux boîtes d'erreur « A JavaScript error occurred in the main process » ont
 * été reçues à la fermeture, nées du même schéma : on attend le réseau pendant
 * que les objets, eux, sont déjà en train de mourir.
 *   1. `TypeError: Object has been destroyed` — un timer émettait vers la
 *      fenêtre détruite (corrigé par `safeSend` + coupure des timers ; cf.
 *      scripts/check-safe-send.mjs pour cette partie).
 *   2. `TypeError: Cannot set properties of null (setting 'queued')` —
 *      Hyperswarm draine sa file de re-connexion depuis les handlers `close` de
 *      ses streams ; il faut geler la machinerie (`swarm.suspended`) AVANT la
 *      moindre attente, sinon c'est la file qui part en incohérence. Et comme la
 *      file peut être incohérente hors de toute fermeture propre, le drain est
 *      aussi blindé à la création du swarm (R4).
 *
 * Ces règles ne sont vérifiables ni par le compilateur ni par les tests : elles
 * dépendent de l'ORDRE des instructions. Elles sont verrouillées ici.
 *   R1  NetworkService.destroy() pose quiesceSwarm() avant son premier `await`,
 *       et tout `await` de la méthode passe par bounded() — pas d'attente
 *       illimitée : le budget du force-exit est partagé avec le stockage.
 *   R2  main.ts déclare un filet TRANSPORT_SHUTDOWN_RACE conditionné à
 *       `app.isQuitting` — hors fermeture, rien n'est masqué.
 *   R3  handlers.ts enregistre le cleanup réseau avant celui du stockage et
 *       garde un force-exit.
 *   R4  le drain de la file est enveloppé à la création du swarm : le plantage
 *       ne dépend plus du chemin par lequel l'app s'arrête.
 *
 * Utilisation : node scripts/check-quit-teardown.mjs [--root <dir>]
 * `--root` pointe une autre racine de projet, le temps de vérifier sur une
 * copie volontairement cassée que ce contrôle n'est pas vacant.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const rootIdx = process.argv.indexOf('--root')
const ROOT = rootIdx >= 0 && process.argv[rootIdx + 1]
  ? path.resolve(process.argv[rootIdx + 1])
  : process.cwd()

const failures = []
const notes = []
const NETWORK = 'electron/services/NetworkService.ts'
const MAIN = 'electron/main.ts'
const HANDLERS = 'electron/ipc/handlers.ts'

/** Lit un fichier relatif à ROOT, ou null (compté comme une règle violée). */
function read(rel) {
  try {
    return readFileSync(path.join(ROOT, rel), 'utf8')
  } catch {
    failures.push(`${rel} : introuvable depuis ${ROOT}`)
    return null
  }
}

/**
 * Corps de la méthode `async destroy()` : de sa signature jusqu'à l'accolade
 * fermée à deux espaces, avec la position absolue de son début.
 */
function destroyBody(src) {
  const match = /\basync destroy\s*\(\s*\)\s*:\s*Promise<void>\s*\{/.exec(src)
  if (!match) return null
  const start = match.index
  const end = src.indexOf('\n  }', start)
  if (end < 0) return null
  return { start, body: src.slice(start, end) }
}

/** « fichier:ligne » pour une position absolue dans le fichier. */
const at = (file, src, pos) => `${file}:${src.slice(0, pos).split('\n').length}`

// ── R1 — NetworkService.destroy() : gel du swarm, attentes bornées ───────────
const netSrc = read(NETWORK)
if (netSrc) {
  const found = destroyBody(netSrc)
  if (!found) {
    failures.push(`${NETWORK} : corps de destroy() introuvable`)
  } else {
    const { start, body } = found

    const quiesce = body.indexOf('this.quiesceSwarm()')
    const firstAwait = body.search(/\bawait\b/)
    if (quiesce < 0) {
      failures.push(`${NETWORK} : destroy() ne gèle pas le swarm (this.quiesceSwarm() absent)`)
    } else if (firstAwait >= 0 && quiesce > firstAwait) {
      failures.push(
        `${at(NETWORK, netSrc, start + quiesce)} : quiesceSwarm() posé APRÈS le premier await — ` +
        'les streams qui meurent pendant cette attente relancent le drain de la file hyperswarm',
      )
    } else {
      notes.push(`R1a ${at(NETWORK, netSrc, start + quiesce)} quiesceSwarm() avant tout await`)
    }

    const unbounded = body
      .split('\n')
      .filter((line) => /\bawait\b/.test(line) && !/await\s+NetworkService\.bounded\s*\(/.test(line))
      .map((line) => line.trim())
    if (unbounded.length) {
      failures.push(`${NETWORK} : ${unbounded.length} await non borné(s) dans destroy() — ${unbounded[0]}`)
    } else {
      const calls = (body.match(/await\s+NetworkService\.bounded\s*\(/g) || []).length
      notes.push(`R1b ${calls} await dans destroy(), tous via bounded()`)
    }
  }

  // Le drapeau doit exister dans le type du swarm : sans ça, quiesceSwarm()
  // reposerait sur un `any` que le compilateur ne regarde plus.
  if (!/\bsuspended\s*:\s*boolean/.test(netSrc)) {
    failures.push(`${NETWORK} : le type du swarm ne déclare pas le champ « suspended » — quiesceSwarm() échappe au compilateur`)
  }
}

// ── R2 — main.ts : filet transport, uniquement pendant la fermeture ──────────
const mainSrc = read(MAIN)
if (mainSrc) {
  if (!/const TRANSPORT_SHUTDOWN_RACE\s*=\s*\/.*hyperswarm.*\/[a-z]*/i.test(mainSrc)) {
    failures.push(`${MAIN} : TRANSPORT_SHUTDOWN_RACE non déclaré — les courses du transport en fermeture seraient affichées à l'utilisateur`)
  }
  if (!/app\.isQuitting\s*===\s*true\s*&&\s*TRANSPORT_SHUTDOWN_RACE\.test/.test(mainSrc)) {
    failures.push(`${MAIN} : le filet transport n'est pas conditionné à app.isQuitting — il masquerait de vraies erreurs en cours de session`)
  } else {
    notes.push('R2 filet transport conditionné à la fermeture')
  }
}

// ── R3 — handlers.ts : ordre des cleanups et force-exit ──────────────────────
const hSrc = read(HANDLERS)
if (hSrc) {
  const net = hSrc.indexOf("registerQuitCleanup('network'")
  const stor = hSrc.indexOf("registerQuitCleanup('storage'")
  if (net < 0 || stor < 0) {
    failures.push(`${HANDLERS} : les cleanups « network » et « storage » doivent tous deux être enregistrés`)
  } else if (net > stor) {
    failures.push(`${HANDLERS} : le swarm doit être détruit avant le corestore — l'ordre d'enregistrement est inversé`)
  } else {
    notes.push('R3 network puis storage dans quitCleanups')
  }
  if (!/forceQuitTimer/.test(hSrc) || !/app\.exit\(0\)/.test(hSrc)) {
    failures.push(`${HANDLERS} : plus de filet de force-exit — un teardown bloqué laisserait l'app indéfiniment ouverte`)
  }
}

// ── R4 — blindage du drain, indépendant du chemin de fermeture ─────────────
if (netSrc) {
  const created = netSrc.indexOf('new Hyperswarm(')
  const harden = netSrc.indexOf('this.hardenSwarmQueueDrain(this.swarm)')
  const wired = netSrc.indexOf("this.swarm.on(")
  const listening = netSrc.indexOf('}).listen()')
  if (created < 0 || harden < 0) {
    failures.push(`${NETWORK} : le drain de la file hyperswarm n'est pas blindé à la création du swarm`)
  } else if (harden < created) {
    failures.push(`${at(NETWORK, netSrc, harden)} : blindage posé avant la création du swarm`)
  } else if ((wired >= 0 && harden > wired) || (listening >= 0 && harden > listening)) {
    failures.push(`${at(NETWORK, netSrc, harden)} : blindage posé trop tard — l'instance est déjà branchée sur le réseau`)
  } else if (!/\b_drainingQueue\s*=\s*false/.test(netSrc)) {
    failures.push(`${NETWORK} : le blindage ne remet pas _drainingQueue à false — l'essaimage se figerait après un drain raté`)
  } else {
    notes.push(`R4 ${at(NETWORK, netSrc, harden)} blindage du drain à la création, garde d'entrée rétablie`)
  }
}

for (const n of notes) console.log('✓', n)
if (failures.length) {
  console.error(`\n✗ ${failures.length} règle(s) de teardown violée(s) :`)
  for (const f of failures) console.error('  -', f)
  process.exit(1)
}
console.log(`\nOK — teardown verrouillé (${NETWORK}, ${MAIN}, ${HANDLERS})`)
