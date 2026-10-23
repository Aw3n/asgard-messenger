/**
 * Lecture des combinaisons réglées dans `settings.keyboardShortcuts`.
 *
 * Quinze combinaisons étaient déclarées, persistées, jamais lues : le seul
 * geste vivant était un `e.key === 'k'` recopié en dur dans `App.tsx`. Ce
 * module est le seul endroit qui décide si une frappe correspond à un réglage,
 * donc il doit être strict — une combinaison mal écrite désactive l'action
 * au lieu d'inventer un geste proche.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  COMPOSER_SHORTCUTS,
  MESSAGE_ACTION_SHORTCUTS,
  WIRED_SHORTCUTS,
  comboMatches,
  isPlainEnterCombo,
  isTextEntry,
  parseCombo,
} from '@/utils/shortcuts'

const press = (key: string, modifiers: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...modifiers,
})

describe('combinaison décomposée', () => {
  it('décompose modificateurs et touche', () => {
    expect(parseCombo('Ctrl+K')).toEqual({ key: 'k', ctrl: true, shift: false, alt: false, meta: false })
    expect(parseCombo('Shift+Enter')).toEqual({ key: 'enter', ctrl: false, shift: true, alt: false, meta: false })
    expect(parseCombo('Escape')).toEqual({ key: 'escape', ctrl: false, shift: false, alt: false, meta: false })
    expect(parseCombo('Ctrl+ArrowDown')).toEqual({ key: 'arrowdown', ctrl: true, shift: false, alt: false, meta: false })
  })

  it('tolère la casse et les espaces', () => {
    expect(parseCombo(' ctrl + K ')).toEqual(parseCombo('Ctrl+K'))
  })

  it('accepte une virgule et un plus comme touches', () => {
    expect(parseCombo('Ctrl+,')?.key).toBe(',')
    expect(parseCombo('Ctrl+Plus')?.key).toBe('+')
    // Le séparateur ne peut pas être aussi la touche : « Ctrl++ » et « + »
    // restent des combinaisons illisibles, donc désactivées.
    expect(parseCombo('Ctrl++')).toBeNull()
    expect(parseCombo('+')).toBeNull()
  })

  it('rend la barre d’espacement sous un nom unique', () => {
    expect(parseCombo('Ctrl+Space')?.key).toBe('space')
  })

  it('jette une combinaison vide ou sans touche', () => {
    for (const raw of ['', '   ', undefined, null, 42, {}, 'Ctrl', 'Ctrl+', 'Ctrl+ ', '++']) {
      expect(parseCombo(raw)).toBeNull()
    }
  })

  it('jette un modificateur inconnu en tête', () => {
    expect(parseCombo('Hyper+K')).toBeNull()
    expect(parseCombo('Ctrl+Foo+K')).toBeNull()
  })

  it('jette une touche nommée qui n’existe pas sur un clavier', () => {
    expect(parseCombo('Ctrl+Foo')).toBeNull()
    expect(parseCombo('Ctrl+Escape2')).toBeNull()
  })

  it('jette un modificateur tenu pour seule touche', () => {
    expect(parseCombo('Shift')).toBeNull()
    expect(parseCombo('Ctrl+Alt')).toBeNull()
  })

  it('accepte les touches de fonction', () => {
    expect(parseCombo('Ctrl+F12')?.key).toBe('f12')
  })
})

describe('frappe confrontée à la combinaison', () => {
  it('reconnaît Ctrl+K', () => {
    expect(comboMatches('Ctrl+K', press('k', { ctrlKey: true }))).toBe(true)
  })

  it('laisse Cmd tenir lieu de Ctrl', () => {
    expect(comboMatches('Ctrl+K', press('k', { metaKey: true }))).toBe(true)
  })

  it('refuse Cmd quand la combinaison le demande nommément', () => {
    expect(comboMatches('Cmd+K', press('k', { ctrlKey: true }))).toBe(false)
    expect(comboMatches('Cmd+K', press('k', { metaKey: true }))).toBe(true)
  })

  it('refuse Cmd sur une combinaison qui ne la nomme pas', () => {
    expect(comboMatches('Escape', press('Escape', { metaKey: true }))).toBe(false)
  })

  it('refuse un modificateur en trop', () => {
    expect(comboMatches('Ctrl+K', press('k', { ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(comboMatches('Ctrl+K', press('k', { ctrlKey: true, altKey: true }))).toBe(false)
    expect(comboMatches('Shift+Enter', press('Enter', { shiftKey: true, ctrlKey: true }))).toBe(false)
  })

  it('exige le modificateur déclaré', () => {
    expect(comboMatches('Ctrl+K', press('k'))).toBe(false)
    expect(comboMatches('Shift+Enter', press('Enter'))).toBe(false)
  })

  it('compare la touche sans regarder la casse', () => {
    expect(comboMatches('Ctrl+K', press('K', { ctrlKey: true }))).toBe(true)
    expect(comboMatches('Ctrl+ArrowDown', press('ArrowDown', { ctrlKey: true }))).toBe(true)
  })

  it('rend la barre d’espacement', () => {
    expect(comboMatches('Ctrl+Space', press(' ', { ctrlKey: true }))).toBe(true)
  })

  it('rend le plus écrit en toutes lettres', () => {
    expect(comboMatches('Ctrl+Plus', press('+', { ctrlKey: true }))).toBe(true)
  })

  it('désactive une combinaison vide ou illisible au lieu de deviner', () => {
    expect(comboMatches('', press('k', { ctrlKey: true }))).toBe(false)
    expect(comboMatches(undefined, press('k', { ctrlKey: true }))).toBe(false)
    expect(comboMatches('Ctrl+Foo', press('k', { ctrlKey: true }))).toBe(false)
    expect(comboMatches('Ctrl+K', press('Escape'))).toBe(false)
  })
})

describe('partage de la touche Entrée', () => {
  it('reconnaît « Entrée » seule, sans modificateur', () => {
    expect(isPlainEnterCombo('Enter')).toBe(true)
    expect(isPlainEnterCombo(' enter ')).toBe(true)
  })

  it('ne confond pas une combinaison qui nomme un modificateur', () => {
    expect(isPlainEnterCombo('Ctrl+Enter')).toBe(false)
    expect(isPlainEnterCombo('Shift+Enter')).toBe(false)
    expect(isPlainEnterCombo('Cmd+Enter')).toBe(false)
  })

  it('ne reconnaît ni une autre touche ni une combinaison illisible', () => {
    expect(isPlainEnterCombo('Escape')).toBe(false)
    expect(isPlainEnterCombo('Ctrl+K')).toBe(false)
    expect(isPlainEnterCombo('')).toBe(false)
    expect(isPlainEnterCombo(undefined)).toBe(false)
    expect(isPlainEnterCombo('Ctrl+Foo')).toBe(false)
  })
})

describe('cible de la frappe', () => {
  const element = (html: string) => {
    document.body.innerHTML = html
    return document.body.firstElementChild as HTMLElement
  }

  it('reconnaît les trois champs qui tiennent la frappe', () => {
    expect(isTextEntry(element('<input />'))).toBe(true)
    expect(isTextEntry(element('<textarea />'))).toBe(true)
    expect(isTextEntry(element('<select><option>a</option></select>'))).toBe(true)
  })

  it('laisse une rangée de message ou le corps de page hors du champ', () => {
    expect(isTextEntry(element('<div tabindex="0">message</div>'))).toBe(false)
    expect(isTextEntry(element('<button />'))).toBe(false)
    expect(isTextEntry(null)).toBe(false)
    expect(isTextEntry(document.body)).toBe(false)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })
})

describe('actions branchées', () => {
  it('sont toutes des combinaisons du réglage', () => {
    const known = [
      'sendMessage', 'newLine', 'openSearch', 'closeModal', 'toggleSidebar',
      'nextConversation', 'prevConversation', 'openSettings', 'openProfile',
      'focusInput', 'deleteMessage', 'editLastMessage', 'replyToMessage',
      'forwardMessage', 'copyMessage',
    ]
    for (const name of WIRED_SHORTCUTS) expect(known).toContain(name)
  })

  it('ne demandent pas la fermeture d’un dialogue : chaque panneau la lit lui-même', () => {
    expect(WIRED_SHORTCUTS).not.toContain('closeModal')
  })

  it('couvrent la recherche, le rail, le réglage de la section et du composeur', () => {
    expect([...WIRED_SHORTCUTS].sort()).toEqual([
      'focusInput', 'nextConversation', 'openProfile', 'openSearch',
      'openSettings', 'prevConversation', 'toggleSidebar',
    ].sort())
  })

  it('prennent le composeur et les messages séparément des gestes globaux', () => {
    expect([...COMPOSER_SHORTCUTS].sort()).toEqual(['newLine', 'sendMessage'])
    expect([...MESSAGE_ACTION_SHORTCUTS].sort()).toEqual([
      'copyMessage', 'editLastMessage', 'forwardMessage', 'replyToMessage',
    ])
    // Rien de ce qui se joue dans un fil ou un composeur ne passe par
    // l'écouteur global : les deux listes ne doivent pas se chevaucher.
    for (const name of [...COMPOSER_SHORTCUTS, ...MESSAGE_ACTION_SHORTCUTS]) {
      expect(WIRED_SHORTCUTS).not.toContain(name)
    }
  })

  it('laissent la suppression hors du clavier réglé', () => {
    // Action destructive sans confirmation : elle reste au menu contextuel.
    expect(WIRED_SHORTCUTS).not.toContain('deleteMessage')
    expect(MESSAGE_ACTION_SHORTCUTS).not.toContain('deleteMessage')
  })
})
