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
export function comboMatches(
  raw: unknown,
  event: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }
): boolean {
  if (typeof raw !== 'string') return false
  const combo = compiled(raw)
  if (!combo) return false

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

/** Les combinaisons que `useMessageActionShortcuts` applique aux messages du fil ouvert. */
export const MESSAGE_ACTION_SHORTCUTS = [
  'editLastMessage',
  'replyToMessage',
  'forwardMessage',
  'copyMessage',
] as const satisfies readonly ShortcutName[]

/**
 * `deleteMessage` (« Delete ») reste au menu contextuel : la suppression n'a
 * pas de confirmation et une touche mal placée effacerait un message.
 */
