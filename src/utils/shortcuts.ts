/**
 * Raccourcis clavier réglés — le seul endroit qui sait si une frappe
 * correspond à une combinaison enregistrée dans `settings.keyboardShortcuts`.
 *
 * `src/types/ui.ts` déclarait quinze combinaisons et `uiStore` les persistait :
 * aucune ne les lisait, sauf « Ctrl+K » recopié en dur dans `App.tsx`. Changer
 * un réglage ne changeait donc rien à l'écran. Ce module rend la lecture
 * égale pour tous les gestes : une combinaison nulle part ailleurs ne peut
 * plus être codée en dur.
 */

import type { KeyboardShortcuts } from '@/types/ui'

/** Identifiant du champ de saisie du message, visé par `focusInput`. */
export const COMPOSER_INPUT_ID = 'asgard-composer-input'

export type ShortcutName = keyof KeyboardShortcuts

/**
 * Les gestes posés au premier lancement.
 *
 * Le magasin portait sa propre copie de ces chaînes : l'éditeur de
 * réglages, qui doit dire si une valeur est encore celle du lancement, aurait
 * dû en tenir une seconde. Une seule table, lue par `uiStore` et par l'écran.
 */
export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
  sendMessage: 'Enter',
  newLine: 'Shift+Enter',
  openSearch: 'Ctrl+K',
  closeModal: 'Escape',
  toggleSidebar: 'Ctrl+B',
  nextConversation: 'Ctrl+ArrowDown',
  prevConversation: 'Ctrl+ArrowUp',
  openSettings: 'Ctrl+,',
  openProfile: 'Ctrl+P',
  focusInput: 'Ctrl+I',
  deleteMessage: 'Delete',
  editLastMessage: 'Ctrl+E',
  replyToMessage: 'Ctrl+R',
  forwardMessage: 'Ctrl+F',
  copyMessage: 'Ctrl+C',
  acceptCall: 'Ctrl+Shift+A',
  declineCall: 'Ctrl+Shift+D',
}

/**
 * Les noms de chaque geste tel que l'éditeur de réglages l'écrit.
 *
 * Plusieurs reprennent un libellé déjà prononcé ailleurs — le menu de la bulle,
 * le rail, le composeur, la fenêtre d'appel entrant : le même mot dans deux
 * endroits ne peut pas dériver. Les autres n'existent que sur cet écran.
 */
export const SHORTCUT_LABEL_KEYS: Record<ShortcutName, string> = {
  sendMessage: 'contacts.sendMessage',
  newLine: 'settings.shortcutNewLine',
  openSearch: 'common.search',
  closeModal: 'common.close',
  toggleSidebar: 'settings.shortcutToggleSidebar',
  nextConversation: 'settings.shortcutNextConversation',
  prevConversation: 'settings.shortcutPrevConversation',
  openSettings: 'settings.shortcutOpenSettings',
  openProfile: 'settings.shortcutOpenProfile',
  focusInput: 'settings.shortcutFocusInput',
  deleteMessage: 'chat.deleteMessage',
  editLastMessage: 'chat.editMessageTitle',
  replyToMessage: 'chat.reply',
  forwardMessage: 'chat.forwardMessage',
  copyMessage: 'chat.copyText',
  acceptCall: 'calls.answer',
  declineCall: 'calls.decline',
}

export interface ParsedCombo {
  /** Touche normalisée : minuscule, « space » pour la barre d'espacement. */
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
}

const MODIFIERS: Record<string, 'ctrl' | 'shift' | 'alt' | 'meta'> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  super: 'meta',
  win: 'meta',
  mod: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
}

/** Touches nommées acceptées en fin de combinaison (le clavier les rend telles quelles). */
const NAMED_KEYS = new Set([
  'escape', 'enter', 'tab', 'space', 'backspace', 'delete', 'insert',
  'home', 'end', 'pageup', 'pagedown',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  'contextmenu', 'capslock',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
])

function normalizeKey(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower === ' ' || lower === 'spacebar' || lower === 'space') return 'space'
  // Le séparateur de la combinaison est aussi une touche : « Plus » s'écrit en
  // toutes lettres, « Ctrl++ » serait indécidable.
  if (lower === 'plus') return '+'
  return lower
}

/**
 * « Ctrl+Shift+K », « Escape », « Ctrl+, » → la forme décomposée.
 * `null` pour une combinaison vide ou illisible : le raccourci est alors
 * désactivé, jamais remplacé par un geste deviné.
 */
export function parseCombo(raw: unknown): ParsedCombo | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null

  const parts = text.split('+').map((part) => part.trim()).filter((part) => part !== '')
  if (parts.length === 0) return null

  const combo: ParsedCombo = { key: '', ctrl: false, shift: false, alt: false, meta: false }
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIERS[part.toLowerCase()]
    if (!modifier) return null
    combo[modifier] = true
  }

  const key = normalizeKey(parts[parts.length - 1])
  // Une touche plus longue qu'un caractère doit être connue : « Ctrl+Foo »
  // n'existe pas sur un clavier, et un modificateur seul — « Shift »,
  // « Ctrl+Alt » — tombe sous la même règle : il ne peut pas tenir un geste.
  if (key.length > 1 && !NAMED_KEYS.has(key)) return null

  combo.key = key
  return combo
}

const cache = new Map<string, ParsedCombo | null>()

function compiled(raw: string): ParsedCombo | null {
  if (cache.has(raw)) return cache.get(raw) ?? null
  const parsed = parseCombo(raw)
  cache.set(raw, parsed)
  return parsed
}

/** Une frappe seule, sans événement : pour brancher un contrôle hors clavier physique. */
/** Le geste décomposé confronté à une frappe, modificateurs déjà connus. */
function comboMatchesParsed(
  combo: ParsedCombo,
  event: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }
): boolean {
  if (combo.key !== normalizeKey(event.key)) return false

  // « Ctrl » accepte la touche Cmd : sous macOS comme sous Electron, Cmd est la
  // touche de modificateur primaire et un réglage « Ctrl+K » doit y fonctionner.
  // Une combinaison qui écrit « Cmd » nommément garde son sens propre : Ctrl ne
  // la satisfait pas.
  const ctrl = combo.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey
  const meta = combo.meta ? event.metaKey : combo.ctrl ? true : !event.metaKey
  const shift = combo.shift ? event.shiftKey : !event.shiftKey
  const alt = combo.alt ? event.altKey : !event.altKey

  return ctrl && meta && shift && alt
}

export function comboMatches(
  raw: unknown,
  event: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }
): boolean {
  if (typeof raw !== 'string') return false
  const combo = compiled(raw)
  return !!combo && comboMatchesParsed(combo, event)
}

/**
 * Une combinaison réduite à « Entrée » sans modificateur. Le composeur doit la
 * reconnaître à part : « Entrée » seule est aussi le geste d'insertion de ligne
 * du navigateur, et `chat.sendOnEnter` décide lequel des deux tient la touche.
 * Une combinaison écrite « Ctrl+Entrée » n'est jamais en conflit avec cette
 * bascule, donc elle envoie toujours.
 */
export function isPlainEnterCombo(raw: unknown): boolean {
  const combo = typeof raw === 'string' ? compiled(raw) : null
  return !!combo && combo.key === 'enter' && !combo.ctrl && !combo.shift && !combo.alt && !combo.meta
}

/**
 * La cible tient-elle la frappe ? Un geste réglé ne doit pas voler « Ctrl+C » à
 * une copie en cours dans un champ, ni « Ctrl+E » à la saisie d'un texte. Les
 * trois éléments natifs de saisie suffisent : l'app n'a aucune zone éditable.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

/**
 * Les actions branchées par `useAppShortcuts`, dans l'ordre où une frappe est
 * testée : deux actions réglées sur la même combinaison ne se marchent pas
 * dessus, la première de cette liste gagne. `closeModal` est à part : c'est
 * chaque dialogue qui le lit, pour qu'Échap ferme le panneau au sommet de la
 * pile et rien d'autre.
 */
export const WIRED_SHORTCUTS = [
  'openSearch',
  'toggleSidebar',
  'nextConversation',
  'prevConversation',
  'openSettings',
  'openProfile',
  'focusInput',
] as const satisfies readonly ShortcutName[]

export type WiredShortcut = (typeof WIRED_SHORTCUTS)[number]

/** Les deux combinaisons que le composeur lit lui-même (`MessageInput`). */
export const COMPOSER_SHORTCUTS = ['sendMessage', 'newLine'] as const satisfies readonly ShortcutName[]

/**
 * Les combinaisons que `useMessageActionShortcuts` applique aux messages du fil
 * ouvert.
 *
 * `deleteMessage` (« Delete ») ne porte sur la rangée sous le focus — ou celle
 * qu'une recherche vient de faire briller — et ouvre une confirmation : la touche
 * seule ne fait disparaître aucun message.
 */
export const MESSAGE_ACTION_SHORTCUTS = [
  'editLastMessage',
  'replyToMessage',
  'forwardMessage',
  'copyMessage',
  'deleteMessage',
] as const satisfies readonly ShortcutName[]

/**
 * Les deux gestes de la fenêtre d'appel entrant, lus par `IncomingCallOverlay`
 * pendant que le téléphone sonne : répondre et refuser, aux deux combinaisons.
 */
export const CALL_SHORTCUTS = ['acceptCall', 'declineCall'] as const satisfies readonly ShortcutName[]

/** Où se joue chaque geste : les colonnes de l'éditeur de réglages. */
export type ShortcutGroupId = 'composer' | 'global' | 'messages' | 'call'

export interface ShortcutGroup {
  id: ShortcutGroupId
  titleKey: string
  names: readonly ShortcutName[]
}

/**
 * Les groupes de l'éditeur, dans l'ordre de l'écran. Chaque geste n'y figure
 * qu'une fois et tous y figurent : `closeModal` est lu par les dialogues
 * eux-mêmes, non par l'écouteur global, et se règle au même titre que les
 * autres.
 */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  { id: 'composer', titleKey: 'settings.shortcutsComposer', names: COMPOSER_SHORTCUTS },
  { id: 'global', titleKey: 'settings.shortcutsGlobal', names: [...WIRED_SHORTCUTS, 'closeModal'] },
  { id: 'messages', titleKey: 'settings.shortcutsOnMessage', names: MESSAGE_ACTION_SHORTCUTS },
  { id: 'call', titleKey: 'nav.calls', names: CALL_SHORTCUTS },
]

/** Tous les gestes dans l'ordre de l'écran : l'ordre que prend la recherche d'un conflit. */
export const SHORTCUT_NAMES: readonly ShortcutName[] = SHORTCUT_GROUPS.flatMap((group) => [...group.names])

/** Les touches qui ne terminent jamais une combinaison : tenues seules, elles n'ont aucun geste à dire. */
const BARE_MODIFIERS = new Set(['control', 'shift', 'alt', 'meta', 'os', 'win', 'window'])

/** Le nom écrit dans le magasin, tel que `parseCombo` le relit. */
const STORED_KEY_NAMES: Record<string, string> = {
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  contextmenu: 'ContextMenu',
  capslock: 'CapsLock',
  escape: 'Escape',
  enter: 'Enter',
  tab: 'Tab',
  space: 'Space',
  home: 'Home',
  end: 'End',
}

/** Les quatre flèches se lisent mieux dessinées que nommées ; ces glyphes sont du bloc « flèches typographiques », rendu par toutes les polices de base. */
const KEY_GLYPHS: Record<string, string> = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * La combinaison écrite telle que le magasin la garde, fabriquée depuis une
 * frappe : c'est tout ce que sait faire l'éditeur de réglages.
 *
 * `null` pour un modificateur tenu seul — l'attente continue, la touche n'a
 * rien réglé — et pour une touche sans signe écrit (une touche multimédia, un
 * accent mort) : la régler serait promettre un geste que `comboMatches` ne
 * reconnaîtra jamais.
 */
export function comboFromKeypress(
  event: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }
): string | null {
  if (BARE_MODIFIERS.has(event.key.toLowerCase())) return null

  const key = normalizeKey(event.key)
  if (key.length > 1 && !NAMED_KEYS.has(key)) return null

  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Cmd')

  // Le signe « + » s'écrit en toutes lettres : seul, il serait pris pour le
  // séparateur de la combinaison.
  const token = key === '+' ? 'plus' : STORED_KEY_NAMES[key] ?? key
  parts.push(token.length === 1 ? token.toUpperCase() : upperFirst(token))
  return parts.join('+')
}

/** Les quatre états des deux touches de contrôle qu'une frappe peut présenter. */
const CONTROL_STATES: ReadonlyArray<[ctrlKey: boolean, metaKey: boolean]> = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
]

/**
 * Une même frappe suffit-elle à déclencher les deux gestes ? La comparaison porte
 * sur les frappes que `comboMatches` reconnaît, pas sur les chaînes écrites :
 * « Ctrl+K » accepte aussi la touche Cmd, donc réglé en face d'un « Cmd+K », les
 * deux gestes partent sur la même frappe et le second — celui que la liste
 * parcourt après — ne se déclenche jamais. L'écran le refuse au lieu de laisser
 * un réglage qui ment.
 */
function combosCollide(a: ParsedCombo, b: ParsedCombo): boolean {
  if (a.key !== b.key || a.shift !== b.shift || a.alt !== b.alt) return false
  return CONTROL_STATES.some(([ctrlKey, metaKey]) => {
    const event = { key: a.key, ctrlKey, metaKey, shiftKey: a.shift, altKey: a.alt }
    return comboMatchesParsed(a, event) && comboMatchesParsed(b, event)
  })
}

/**
 * Un geste réglé sur « Tab » est refusé : Tab mène le focus dans toute
 * l'interface. Le piégeage d'un dialogue (`useDialogBehavior`) comme l'arrêt
 * sur une rangée de message (`useMessageActionShortcuts`) s'appuient sur elle ;
 * la détourner rendrait l'application sourde au clavier, et c'est le réglage
 * qu'il faudrait alors retrouver à la souris.
 */
export function isReservedCombo(raw: unknown): boolean {
  const combo = typeof raw === 'string' ? parseCombo(raw) : null
  return !!combo && combo.key === 'tab'
}

/**
 * Le premier autre geste posé sur une frappe que la candidate déclenche aussi,
 * `null` si personne ne la tient. « ctrl+k » et « Ctrl+K » sont le même geste
 * réglé deux fois, et « Cmd+K » en tient un troisième qui part avec eux.
 */
export function findShortcutConflict(
  shortcuts: KeyboardShortcuts,
  name: ShortcutName,
  candidate: string
): ShortcutName | null {
  const wanted = parseCombo(candidate)
  if (!wanted) return null
  for (const other of SHORTCUT_NAMES) {
    if (other === name) continue
    const held = parseCombo(shortcuts[other])
    if (held && combosCollide(held, wanted)) return other
  }
  return null
}

/**
 * La combinaison telle qu'on la lit à l'écran : « Ctrl+ArrowDown » devient
 * « Ctrl+↓ ». Les modificateurs gardent le nom gravé sur les touches et une
 * touche nommée s'écrit avec son nom — « Escape », « Delete » — donc rien ici
 * n'a besoin d'être traduit. `null` quand le magasin porte une chaîne qu'aucune
 * frappe ne produirait : l'écran dit alors le geste désactivé, comme le code.
 */
export function formatCombo(raw: unknown): string | null {
  const combo = typeof raw === 'string' ? parseCombo(raw) : null
  if (!combo) return null

  const parts: string[] = []
  if (combo.ctrl) parts.push('Ctrl')
  if (combo.alt) parts.push('Alt')
  if (combo.shift) parts.push('Shift')
  if (combo.meta) parts.push('Cmd')

  const key = combo.key === '+' ? 'plus' : KEY_GLYPHS[combo.key] ?? combo.key
  parts.push(key.length === 1 ? key.toUpperCase() : upperFirst(key))
  return parts.join(' + ')
}

/**
 * `aria-keyshortcuts` attend le mot « Control », pas l'abréviation « Ctrl », et
 * rien pour une combinaison que le code ne saurait pas reconnaître.
 */
export function toAriaKeyShortcuts(raw: unknown): string | undefined {
  const combo = typeof raw === 'string' ? parseCombo(raw) : null
  if (!combo) return undefined

  const tokens: string[] = []
  if (combo.ctrl) tokens.push('Control')
  if (combo.alt) tokens.push('Alt')
  if (combo.shift) tokens.push('Shift')
  if (combo.meta) tokens.push('Meta')
  tokens.push(combo.key === '+' ? 'plus' : upperFirst(combo.key))
  return tokens.join('+')
}
