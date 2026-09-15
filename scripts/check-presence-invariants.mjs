#!/usr/bin/env node
/**
 * check-presence-invariants.mjs — invariants de la chaîne de présence.
 *
 * Le produit expose quatre statuts (en ligne, absent, occupé, invisible), le
 * réseau en transporte quatre d'un autre vocabulaire (`online`, `away`, `dnd`,
 * `offline`), et le store de contacts en stocke six. Cette traduction avait
 * fini en neuf copies locales du même ternaire, accordées entre elles par
 * hasard. D'où des symptômes tous identiques côté utilisateur et tous nés d'un
 * maillon qui réécrivait ce que le maillon précédent venait de décider :
 *   · le ping de présence, suivi d'un `markPeerActive()` déclenché par
 *     l'événement `message` générique, écrasait « absent »/« occupé»/« invisible »
 *     toutes les 5 secondes chez le pair ;
 *   · l'expiration ne visait que `'online'`, si bien qu'un pair parti avec le
 *     statut « absent » y restait pour toujours ;
 *   · trois des cinq écritures de l'enregistrement DHT ignoraient le réglage de
 *     confidentialité et publiaient le vrai statut d'un utilisateur caché ;
 *   · une liste de contacts ne testant que `=== 'online'` affichait un absent
 *     comme un déconnecté ;
 *   · les membres d'un groupe gardaient le token réseau (`dnd`) pendant que le
 *     contact 1:1, lui, recevait `busy` — la même personne portait deux noms.
 *
 * Ces règles ne sont vérifiables ni par le compilateur ni par les tests
 * unitaires : elles portent sur la RÉPARTITION du code entre les fichiers.
 *   R1  le mapping interne ↔ réseau n'existe qu'une fois, dans utils/presence.ts
 *   R2  toute écriture du record DHT passe par la règle de mapping et par la
 *       même composition du message
 *   R3  le réglage de confidentialité est lu à chaque site d'émission
 *   R4  une activité ne promeut « en ligne » qu'à travers shouldPromoteToOnline()
 *   R5  l'expiration couvre tout statut non hors-ligne et purge la déclaration
 *   R6  pas de vocabulaire ni de palette parallèle dans l'interface, et pas de
 *       test de vivacité réduit à « online » dans les stores
 *   R7  un seul jeu de choix de statut, traduit, partagé par les deux menus
 *   R8  un membre de groupe et son contact 1:1 portent la même valeur normalisée
 *   R9  la fraîcheur d'une déclaration est horodatée à la réception
 *
 * Utilisation : node scripts/check-presence-invariants.mjs [--root <dir>]
 * `--root` pointe une autre racine de projet, le temps de vérifier sur une
 * copie volontairement cassée que ce contrôle n'est pas vacant.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const rootIdx = process.argv.indexOf('--root')
const ROOT = rootIdx >= 0 && process.argv[rootIdx + 1]
  ? path.resolve(process.argv[rootIdx + 1])
  : process.cwd()

const failures = []
const notes = []

const PRESENCE = 'src/utils/presence.ts'
const CHAT = 'src/services/ChatService.ts'
const GROUP = 'src/services/GroupService.ts'
const APP = 'src/App.tsx'
const IDENTITY = 'src/stores/identityStore.ts'
const CONTACTS = 'src/features/contacts/ContactsPage.tsx'
const SETTINGS = 'src/features/settings/SettingsPage.tsx'

function read(rel) {
  try {
    return readFileSync(path.join(ROOT, rel), 'utf8')
  } catch {
    failures.push(`${rel} : introuvable depuis ${ROOT}`)
    return null
  }
}

/** Tous les .ts/.tsx du renderer, hors tests et hors catalogue de traductions. */
function rendererFiles(dir = 'src') {
  const out = []
  const abs = path.join(ROOT, dir)
  let entries = []
  try {
    entries = readdirSync(abs)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(abs, entry)
    const rel = path.relative(ROOT, full).split(path.sep).join('/')
    if (entry === 'tests' || entry === 'node_modules') continue
    if (rel === 'src/i18n/translations.ts') continue
    const st = statSync(full)
    if (st.isDirectory()) out.push(...rendererFiles(rel))
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(rel)
  }
  return out
}

/**
 * Remplace commentaires et littéraux d'expression régulière par des espaces,
 * SANS déplacer les offsets : les numéros de ligne restent ceux du fichier tel
 * qu'on l'ouvre dans l'éditeur, et un motif écrit dans un commentaire ne peut
 * plus faire croire à une violation (presence.ts documente le ternaire interdit).
 */
function scrub(src) {
  const chars = src.split('')
  const n = chars.length
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (chars[k] !== '\n') chars[k] = ' '
  }
  let i = 0
  let prev = '\n'
  while (i < n) {
    const c = chars[i]
    if (c === '/' && chars[i + 1] === '/') {
      let j = i
      while (j < n && chars[j] !== '\n') j++
      blank(i, j)
      i = j
      continue
    }
    if (c === '/' && chars[i + 1] === '*') {
      let j = i + 2
      while (j < n && !(chars[j] === '*' && chars[j + 1] === '/')) j++
      blank(i, Math.min(n, j + 2))
      i = Math.min(n, j + 2)
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < n) {
        if (chars[j] === '\\') { j += 2; continue }
        if (chars[j] === c) { j++; break }
        j++
      }
      i = j
      prev = c
      continue
    }
    // Ligne de code qui DIVISE par une constante ne peut pas ouvrir un commentaire :
    // on ne traite `/` comme début de regex que si le caractère collé après n'est
    // ni un espace ni un `=`, et si le contexte précèdent autorise un littéral.
    if (c === '/' && !/\s|=/.test(chars[i + 1] || '') && /[=(:,.[!&|?{};\n+*%<>^~-]/.test(prev)) {
      let j = i + 1
      let inClass = false
      while (j < n) {
        const d = chars[j]
        if (d === '\\') { j += 2; continue }
        if (d === '\n') break
        if (d === '[') inClass = true
        else if (d === ']') inClass = false
        else if (d === '/' && !inClass) { j++; break }
        j++
      }
      blank(i, j)
      i = j
      continue
    }
    if (!/\s/.test(c)) prev = c
    i++
  }
  return chars.join('')
}

/** « fichier:ligne » pour une position absolue dans une source scrubbée. */
const at = (file, src, pos) => `${file}:${src.slice(0, pos).split('\n').length}`

/** Arguments de l'appel dont l'identifiant commence à `idx`, découpés au 1er niveau. */
function callArgs(src, idx) {
  const open = src.indexOf('(', idx)
  if (open < 0) return null
  let depth = 0
  let end = -1
  for (let k = open; k < src.length; k++) {
    const c = src[k]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) { end = k; break }
    }
  }
  if (end < 0) return null
  const text = src.slice(open + 1, end)
  const args = []
  let d = 0
  let cur = ''
  for (const c of text) {
    if (c === '(' || c === '[' || c === '{') d++
    else if (c === ')' || c === ']' || c === '}') d--
    if (c === ',' && d === 0) { args.push(cur); cur = '' } else cur += c
  }
  args.push(cur)
  return args.map((a) => a.trim())
}

/** Tous les appels de `name(` dans la source, avec leurs arguments. */
function calls(src, name) {
  const re = new RegExp(`\\b${name}\\s*\\(`, 'g')
  const found = []
  let m
  while ((m = re.exec(src))) {
    const args = callArgs(src, m.index)
    if (args) found.push({ index: m.index, args })
  }
  return found
}

/** RHS de l'affectation `const <name> = ...` la plus proche dans le fichier. */
function assignedFrom(src, name) {
  const re = new RegExp(`\\b(?:const|let)\\s+${name}\\s*(?::[^=]+)?=\\s*([^\\n;]*)`, 'g')
  const hits = []
  let m
  while ((m = re.exec(src))) hits.push(m[1])
  return hits.join(' || ')
}

/** Corps de la méthode dont la signature correspond à `sigRe`, délimité par les accolades. */
function methodBody(src, sigRe) {
  const m = sigRe.exec(src)
  if (!m) return null
  const open = src.indexOf('{', m.index)
  if (open < 0) return null
  let depth = 0
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}') {
      depth--
      if (depth === 0) return { start: m.index, body: src.slice(open + 1, k) }
    }
  }
  return null
}

const PRESENCE_LITERALS = ['online', 'away', 'busy', 'invisible', 'offline', 'dnd']

// ── Sources ──────────────────────────────────────────────────────────────────
const files = rendererFiles()
if (!files.includes(PRESENCE)) failures.push(`${PRESENCE} : la règle unique de mapping est introuvable`)

const clean = new Map()
for (const rel of files) {
  const raw = read(rel)
  if (raw === null) continue
  clean.set(rel, scrub(raw))
}
const src = (rel) => clean.get(rel)

const presenceSrc = src(PRESENCE)

// ── R1 — le mapping n'existe qu'une fois ────────────────────────────────────
const FORBIDDEN_MAPPING = [
  [/\?\s*['"]dnd['"]\s*:/, "un ternaire qui produit 'dnd'"],
  [/\?\s*['"]busy['"]\s*:/, "un ternaire qui produit 'busy'"],
  [/\bcase\s+['"]dnd['"]\s*:\s*(return\s+)?['"]busy['"]/, "un case dnd → busy recopié"],
  [/\bcase\s+['"]invisible['"]\s*:/, "un case invisible recopié"],
]
if (presenceSrc) {
  let copies = 0
  for (const rel of files) {
    if (rel === PRESENCE) continue
    const text = clean.get(rel)
    for (const [re, label] of FORBIDDEN_MAPPING) {
      const m = re.exec(text)
      if (m) {
        copies++
        failures.push(`${at(rel, text, m.index)} : ${label} — le mapping appartient à ${PRESENCE} (toNetworkStatus/fromNetworkStatus)`)
      }
    }
  }
  // La règle doit aussi être COMPLÈTE : les six valeurs internes et les quatre
  // réseau sont écrites quelque part, sinon un statut disparaît silencieusement.
  for (const value of PRESENCE_LITERALS) {
    if (!new RegExp(`['"]${value}['"]`).test(presenceSrc)) {
      failures.push(`${PRESENCE} : la valeur « ${value} » n'apparaît plus dans la règle unique`)
    }
  }
  if (!copies) notes.push('R1 mapping interne ↔ réseau concentré dans utils/presence.ts')
}

// ── R2 — le record DHT s'écrit par la règle, jamais à la main ───────────────
let dhtWrites = 0
for (const rel of files) {
  const text = clean.get(rel)
  for (const call of calls(text, 'publishStatus')) {
    // `publishStatus` est aussi le nom côté main process : seul le renderer publie.
    dhtWrites++
    const statusArg = call.args[0] || ''
    const messageArg = call.args[1] || ''
    const okStatus = (expr) =>
      /toNetworkStatus\s*\(|outgoingPresence\s*\(/.test(expr) ||
      (/^[A-Za-z_$][\w$]*$/.test(expr) &&
        /toNetworkStatus\s*\(|outgoingPresence\s*\(/.test(assignedFrom(text, expr)))
    if (/^['"]/.test(statusArg) || !okStatus(statusArg)) {
      failures.push(
        `${at(rel, text, call.index)} : publishStatus reçoit ${statusArg || '(rien)'}`,
      )
    }
    const okMessage = (expr) =>
      /presenceMessage\s*\(/.test(expr) ||
      (/^[A-Za-z_$][\w$]*$/.test(expr) && /presenceMessage\s*\(/.test(assignedFrom(text, expr)))
    if (!messageArg || !okMessage(messageArg)) {
      failures.push(
        `${at(rel, text, call.index)} : le message accompagnant le statut vient de « ${messageArg || 'aucun'} » — les cinq écritures du record doivent composer ce champ identiquement (presenceMessage)`,
      )
    }
  }
}
if (dhtWrites) notes.push(`R2 ${dhtWrites} écritures du record DHT, toutes via la règle unique`)
else failures.push('Aucun appel à publishStatus() trouvé dans le renderer — la chaîne de publication a disparu')

// ── R3 — le réglage de confidentialité est lu partout où l'on émet ──────────
for (const rel of [CHAT, GROUP]) {
  const text = src(rel)
  if (!text) continue
  const found = methodBody(text, /\boutgoingPresence\s*\([^)]*\)\s*[:{]/)
  if (!found) {
    failures.push(`${rel} : plus de outgoingPresence() — chaque émetteur recalculait le statut sortant dans son coin`)
  } else if (!/privacy\.onlineStatus/.test(found.body)) {
    failures.push(`${rel} : outgoingPresence() ne lit pas settings.privacy.onlineStatus — un utilisateur qui cache sa présence continuerait à l'annoncer`)
  }
}
{
  const text = src(APP)
  if (text) {
    const sites = calls(text, 'toNetworkStatus')
    /** Le garde de confidentialité est-il présent, en dur ou derrière une constante ? */
    const gated = (arg) => {
      const a = (arg || '').trim()
      if (!a) return false
      if (a.includes('privacy.onlineStatus')) return true
      if (/^[A-Za-z_$][\w$]*$/.test(a)) return /privacy\.onlineStatus/.test(assignedFrom(text, a))
      return false
    }
    const ungated = sites.filter((c) => !gated(c.args[1]))
    if (!sites.length) {
      failures.push(`${APP} : les publications DHT du démarrage et du cycle de 30 s ne passent plus par toNetworkStatus()`)
    } else if (ungated.length) {
      failures.push(`${at(APP, text, ungated[0].index)} : toNetworkStatus() appelé sans le garde privacy.onlineStatus — la boucle de republication écraserait l'annonce muette 30 s plus tard`)
    } else {
      notes.push(`R3 ${sites.length} publication(s) DHT de ${APP} sous garde de confidentialité`)
    }
  }
}
{
  const text = src(IDENTITY)
  if (text && !/privacy\.onlineStatus/.test(text)) {
    failures.push(`${IDENTITY} : updateProfile() publie le statut sans lire settings.privacy.onlineStatus`)
  }
}

// ── R4 — une activité ne remplace pas une déclaration ────────────────────────
{
  const text = src(CHAT)
  if (text) {
    const found = methodBody(text, /\bmarkPeerActive\s*\([^)]*\)\s*[:{]/)
    if (!found) {
      failures.push(`${CHAT} : markPeerActive() introuvable`)
    } else if (!/shouldPromoteToOnline\s*\(/.test(found.body)) {
      failures.push(`${CHAT} : markPeerActive() promeut « en ligne » sans consulter shouldPromoteToOnline() — c'est le ping de 5 s qui effaçait « absent », « occupé » et « invisible » chez le pair`)
    } else if (!/presenceDeclaredAt/.test(found.body)) {
      failures.push(`${CHAT} : markPeerActive() n'exploite pas l'horodatage de déclaration`)
    } else {
      notes.push('R4 markPeerActive() subordonné à la déclaration reçue')
    }
    // Toute promotion « en ligne » d'un CONTACT doit venir de là : les routes de
    // simple vivacité (pair connecté, identifié, demande d'ami) n'ont pas le droit
    // d'écrire un statut à la main. Seule exception : la création d'un contact
    // jamais atteint, qui n'a donc aucune déclaration à respecter — et notre PROPRE
    // statut, que seule l'activité de l'utilisateur local fait bouger.
    const bodyEnd = found.start + found.body.length + 1
    const onlineWrites = [...text.matchAll(/status:\s*['"]online['"]/g)].filter((m) => {
      const before = text.slice(Math.max(0, m.index - 220), m.index)
      if (!/updateContact\s*\([^)]*\{/.test(before)) return false // pas une écriture du store de contacts
      return m.index < found.start || m.index > bodyEnd
    })
    for (const m of onlineWrites) {
      failures.push(`${at(CHAT, text, m.index)} : un statut « online » est écrit hors de markPeerActive() — cette route ignore la déclaration fraîche du pair`)
    }
  }
}

// ── R5 — l'expiration couvre tous les statuts déclarés ───────────────────────
{
  const text = src(CHAT)
  if (text) {
    const found = methodBody(text, /\bheartbeatTick\s*\([^)]*\)\s*[:{]/)
    if (!found) {
      failures.push(`${CHAT} : heartbeatTick() introuvable`)
    } else {
      if (/status\s*===\s*['"]online['"]/.test(found.body)) {
        failures.push(`${at(CHAT, text, found.start)} : heartbeatTick() n'expire que « online » — un pair parti en disant « absent » y resterait pour toujours`)
      }
      if (!/status\s*!==\s*['"]offline['"]/.test(found.body)) {
        failures.push(`${CHAT} : heartbeatTick() n'expire plus les statuts autres que « hors ligne »`)
      }
      if (!/presenceDeclaredAt\.delete/.test(found.body)) {
        failures.push(`${CHAT} : heartbeatTick() expire la présence sans purger l'horodatage de déclaration — la déclaration périmée bloquerait toute promotion ultérieure`)
      }
      notes.push('R5 expiration sur tout statut déclaré, horodatage purgé')
    }
  }
}

// ── R6 — pas de vocabulaire ni de palette parallèle dans l'interface ─────────
const UI_FORBIDDEN = [
  [/\bconst\s+statusColors\b/, 'une palette de statuts locale'],
  [/\bSTATUS_CONFIG\b/, 'une table de libellés de statuts locale'],
  [/\bSTATUS_OPTIONS\b/, 'une liste de statuts locale'],
  [/t\(\s*['"]common\.dnd['"]\s*\)/, "un libellé « common.dnd » (terme réseau, jamais produit)"],
  [/\blabel:\s*['"](Online|Away|Busy|Invisible|Offline|Available|Do Not Disturb)['"]/i, 'un libellé de statut en anglais et non traduit'],
  [/\bonline:\s*t\(\s*['"]/, 'une table de libellés de statut indexée par la valeur brute'],
  [/\bstatus\w*\s*===\s*['"](?:online|away|busy|invisible|offline|dnd)['"][^?\n]{0,24}\?\s*['"]bg-[a-z]+-\d{3}['"]/, 'une couleur de pastille codée en dur pour un statut de présence'],
  [/\b(?:contact|peer|member|c)\??\.status\s*===\s*['"]online['"]/, "un test de vivacité réduit à `=== 'online'` (il faut isLivePresence)"],
]
{
  let hits = 0
  for (const rel of files) {
    if (rel === PRESENCE) continue
    const text = clean.get(rel)
    for (const [re, label] of UI_FORBIDDEN) {
      const m = re.exec(text)
      if (m) {
        hits++
        failures.push(`${at(rel, text, m.index)} : ${label} — un statut doit se nommer et se colorer de la même façon partout`)
      }
    }
  }
  if (!hits) notes.push(`R6 aucun vocabulaire ni palette de statut parallèle dans ${files.length} fichiers du renderer`)
}
// R6b — dans les STORES, la vivacité se décide avec isLivePresence : le filtre des
// membres de groupe comparait à 'online' et comptait un membre « absent » comme
// déconnecté, alors que sa fiche de contact l'affichait absent.
for (const rel of files.filter((f) => f.startsWith('src/stores/'))) {
  const text = clean.get(rel)
  if (text && /\bstatus\s*[!=]==\s*['"]online['"]/.test(text)) {
    failures.push(`${rel} : un filtre de présence compare encore une valeur à « online » — la règle est isLivePresence() (${PRESENCE})`)
  }
}

// ── R7 — un seul jeu de choix, traduit ──────────────────────────────────────
for (const rel of [CONTACTS, SETTINGS]) {
  const text = src(rel)
  if (!text) continue
  if (!/PRESENCE_CHOICES/.test(text)) {
    failures.push(`${rel} : le menu de statut ne vient plus de PRESENCE_CHOICES — les deux menus avaient des listes différentes, dont un « offline » que personne ne choisit`)
  }
  if (/statusOptions\s*=\s*\[/.test(text)) {
    failures.push(`${rel} : une liste d'options de statut est redéfinie localement`)
  }
}
if (presenceSrc) {
  const choices = presenceSrc.match(/PRESENCE_CHOICES[^=]*=\s*\[([\s\S]*?)\]/)
  if (!choices) {
    failures.push(`${PRESENCE} : PRESENCE_CHOICES introuvable`)
  } else {
    const wanted = ['online', 'away', 'busy', 'invisible']
    const missing = wanted.filter((v) => !new RegExp(`['"]${v}['"]`).test(choices[1]))
    if (missing.length) failures.push(`${PRESENCE} : PRESENCE_CHOICES ne propose plus ${missing.join(', ')}`)
    const banned = ['dnd', 'offline'].filter((v) => new RegExp(`value:\\s*['"]${v}['"]`).test(choices[1]))
    if (banned.length) failures.push(`${PRESENCE} : PRESENCE_CHOICES propose « ${banned.join(', ')} », un statut qui ne se choisit pas`)
    notes.push(`R7 quatre choix partagés par les deux menus (${wanted.join(', ')})`)
  }
}

// ── R8 — un membre de groupe et son contact portent la même valeur ──────────
{
  const text = src(GROUP)
  if (text) {
    const found = methodBody(text, /\bhandleGroupPresence\s*\([^)]*\)\s*[:{]/)
    if (!found) {
      failures.push(`${GROUP} : handleGroupPresence() introuvable`)
    } else {
      const norm = [...found.body.matchAll(/fromNetworkStatus\s*\(([^)]*)\)/g)]
      if (!norm.length) {
        failures.push(`${GROUP} : la présence reçue d'un groupe n'est pas normalisée — le store gardait le token réseau (« dnd ») là où le contact 1:1 recevait « busy »`)
      } else {
        const decl = /\bconst\s+(\w+)\s*=\s*fromNetworkStatus\s*\(/.exec(found.body)
        const name = decl ? decl[1] : null
        if (!decl) {
          failures.push(`${at(GROUP, text, found.start)} : le résultat de fromNetworkStatus() n'est pas mis dans une variable partagée`)
        } else {
          const memberCall = /updateMemberPresence\s*\([^)]*\)/.exec(found.body)
          const contactWrite = /status:\s*(\w+)/.exec(found.body)
          if (!memberCall || !memberCall[0].includes(name)) {
            failures.push(`${GROUP} : updateMemberPresence() ne reçoit pas la valeur normalisée ${name}`)
          }
          if (!contactWrite || contactWrite[1] !== name) {
            failures.push(`${GROUP} : le contact 1:1 reçoit « ${contactWrite ? contactWrite[1] : 'rien'} » là où le membre reçoit « ${name} » — la même personne porterait deux statuts`)
          }
          if (norm.length > 1) {
            failures.push(`${GROUP} : ${norm.length} normalisations dans handleGroupPresence(), il n'en faut qu'une`)
          } else {
            notes.push(`R8 handleGroupPresence() normalise une fois (${name}) pour le membre et le contact`)
          }
        }
      }
    }
    // Le rythme de re-annonce doit tenir dans la durée de vie de l'annonce : le
    // test vitest le vérifie à l'exécution, cette règle vérifie qu'il reste DERIVE
    // et non recopié à la main.
    if (!/GROUP_PRESENCE_TIMEOUT/.test(text)) {
      failures.push(`${GROUP} : le rythme de diffusion ne dérive plus de GROUP_PRESENCE_TIMEOUT — un membre stable disparaissait de « en ligne » à chaque cycle`)
    }
  }
}

// ── R9 — la déclaration est horodatée à la réception ─────────────────────────
{
  const text = src(CHAT)
  if (text) {
    const found = methodBody(text, /\bapplyPresenceUpdate\s*\([^)]*\)\s*[:{]/)
    if (!found) {
      failures.push(`${CHAT} : applyPresenceUpdate() introuvable`)
    } else if (!/presenceDeclaredAt\.set\s*\(/.test(found.body)) {
      failures.push(`${CHAT} : applyPresenceUpdate() n'horodate plus la déclaration reçue — markPeerActive() ne saurait plus ce qu'il doit respecter`)
    } else if (!/fromNetworkStatus\s*\(/.test(found.body)) {
      failures.push(`${CHAT} : applyPresenceUpdate() range la valeur du réseau telle quelle dans le store de contacts`)
    } else {
      notes.push('R9 déclaration horodatée et normalisée à la réception')
    }
  }
}

for (const n of notes) console.log('✓', n)
if (failures.length) {
  console.error(`\n✗ ${failures.length} invariant(s) de présence violé(s) :`)
  for (const f of failures) console.error('  -', f)
  process.exit(1)
}
console.log(`\nOK — présence verrouillée (${files.length} fichiers du renderer, ${PRESENCE_LITERALS.length} statuts connus)`)
