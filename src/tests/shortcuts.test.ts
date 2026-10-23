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
  DEFAULT_KEYBOARD_SHORTCUTS,
  MESSAGE_ACTION_SHORTCUTS,
  SHORTCUT_GROUPS,
  SHORTCUT_LABEL_KEYS,
  SHORTCUT_NAMES,
  WIRED_SHORTCUTS,
  comboFromKeypress,
  comboMatches,
  findShortcutConflict,
  formatCombo,
  isPlainEnterCombo,
  isReservedCombo,
  isTextEntry,
  parseCombo,
  toAriaKeyShortcuts,
  type ShortcutName,
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
      'copyMessage', 'deleteMessage', 'editLastMessage', 'forwardMessage', 'replyToMessage',
    ])
    // Rien de ce qui se joue dans un fil ou un composeur ne passe par
    // l'écouteur global : les deux listes ne doivent pas se chevaucher.
    for (const name of [...COMPOSER_SHORTCUTS, ...MESSAGE_ACTION_SHORTCUTS]) {
      expect(WIRED_SHORTCUTS).not.toContain(name)
    }
  })

  it('laissent hors de l’écouteur global ce qui se joue dans un fil', () => {
    // « Delete » est lu par le geste de rangée, jamais par la page : la frappe
    // ne fait que demander une suppression, le dialogue d'acquittement joint le
    // service (voir `message-delete-confirm.ui.test.tsx`). Aucune touche isolée
    // n'efface donc un message, et le geste reste hors des raccourcis globaux.
    expect(MESSAGE_ACTION_SHORTCUTS).toContain('deleteMessage')
    expect(WIRED_SHORTCUTS).not.toContain('deleteMessage')
  })
})

// ─── Ce que l'éditeur de réglages écrit, lit et refuse ───────────────────────

describe('combinaison fabriquée depuis une frappe', () => {
  it('écrit la combinaison telle que le magasin la garde', () => {
    expect(comboFromKeypress(press('k', { ctrlKey: true }))).toBe('Ctrl+K')
    expect(comboFromKeypress(press('K', { ctrlKey: true }))).toBe('Ctrl+K')
    expect(comboFromKeypress(press('ArrowDown', { ctrlKey: true }))).toBe('Ctrl+ArrowDown')
    expect(comboFromKeypress(press('Escape'))).toBe('Escape')
  })

  it('nomme la barre d’espacement et le plus au lieu de leurs signes', () => {
    expect(comboFromKeypress(press(' ', { ctrlKey: true }))).toBe('Ctrl+Space')
    expect(comboFromKeypress(press('+', { ctrlKey: true }))).toBe('Ctrl+Plus')
  })

  it('garde Cmd pour la touche Cmd', () => {
    expect(comboFromKeypress(press('k', { metaKey: true }))).toBe('Cmd+K')
  })

  it('écrit les modificateurs dans un ordre fixe', () => {
    expect(comboFromKeypress(press('j', { shiftKey: true, altKey: true, ctrlKey: true }))).toBe('Ctrl+Alt+Shift+J')
  })

  it('attend la touche qui suit un modificateur seul', () => {
    for (const key of ['Control', 'Shift', 'Alt', 'Meta']) {
      expect(comboFromKeypress(press(key, { shiftKey: key === 'Shift' }))).toBeNull()
    }
  })

  it('ne règle pas une touche sans signe écrit', () => {
    expect(comboFromKeypress(press('MediaPlay'))).toBeNull()
    expect(comboFromKeypress(press('Dead'))).toBeNull()
    expect(comboFromKeypress(press('Unidentified'))).toBeNull()
  })

  it('rend une chaîne que le magasin relit et que la frappe retrouvée reconnaît', () => {
    const presses = [
      press('k', { ctrlKey: true }),
      press('F5'),
      press(' ', { altKey: true }),
      press('+', { ctrlKey: true, shiftKey: true }),
      press('ArrowUp', { metaKey: true }),
      press('Delete'),
      press(',', { ctrlKey: true }),
    ]
    for (const event of presses) {
      const combo = comboFromKeypress(event)
      expect(combo).toBeTypeOf('string')
      expect(parseCombo(combo)).not.toBeNull()
      expect(comboMatches(combo, event)).toBe(true)
    }
  })
})

describe('combinaison affichée', () => {
  it('dessine les flèches et laisse les noms de touche entiers', () => {
    expect(formatCombo('Ctrl+ArrowDown')).toBe('Ctrl + ↓')
    expect(formatCombo('Ctrl+ArrowUp')).toBe('Ctrl + ↑')
    expect(formatCombo('Escape')).toBe('Escape')
    expect(formatCombo('Shift+Enter')).toBe('Shift + Enter')
    expect(formatCombo('Ctrl+Space')).toBe('Ctrl + Space')
  })

  it('dit nul pour une chaîne qu’aucune frappe ne produirait', () => {
    expect(formatCombo('')).toBeNull()
    expect(formatCombo('Ctrl+Foo')).toBeNull()
    expect(formatCombo(undefined)).toBeNull()
  })

  it('n’écrit aucun glyphe qu’une police de base ne rendrait pas', () => {
    // Le verrou `check:emoji` interdit les pictogrammes d'interface ; les
    // quatre flèches sont du bloc typographique autorisé.
    const forbidden = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\u{FE0F}/u
    for (const combo of Object.values(DEFAULT_KEYBOARD_SHORTCUTS)) {
      const shown = formatCombo(combo)
      expect(shown).toBeTypeOf('string')
      expect(forbidden.test(shown as string)).toBe(false)
    }
  })

  it('traduit le vocabulaire que réclame aria-keyshortcuts', () => {
    expect(toAriaKeyShortcuts('Ctrl+K')).toBe('Control+K')
    expect(toAriaKeyShortcuts('Cmd+K')).toBe('Meta+K')
    expect(toAriaKeyShortcuts('Shift+Enter')).toBe('Shift+Enter')
    expect(toAriaKeyShortcuts('')).toBeUndefined()
  })
})

describe('gestes refusés à la saisie', () => {
  it('gardent Tab pour le focus, sous modificateur comme sans', () => {
    expect(isReservedCombo('Tab')).toBe(true)
    expect(isReservedCombo('Shift+Tab')).toBe(true)
    expect(isReservedCombo('Ctrl+Tab')).toBe(true)
    expect(isReservedCombo('Enter')).toBe(false)
    expect(isReservedCombo('')).toBe(false)
  })

  it('aucun geste du lancement ne tombe sous le refus', () => {
    for (const combo of Object.values(DEFAULT_KEYBOARD_SHORTCUTS)) {
      expect(isReservedCombo(combo)).toBe(false)
    }
  })

  it('nomment le geste qui tient déjà la combinaison', () => {
    expect(findShortcutConflict(DEFAULT_KEYBOARD_SHORTCUTS, 'openSearch', 'Ctrl+C')).toBe('copyMessage')
    // La casse et les espaces ne changent rien au geste : « ctrl + c » est
    // celui de la copie, pas une combinaison libre.
    expect(findShortcutConflict(DEFAULT_KEYBOARD_SHORTCUTS, 'openSearch', 'ctrl + c')).toBe('copyMessage')
  })

  it('laissent une combinaison que personne ne tient, et la propre', () => {
    expect(findShortcutConflict(DEFAULT_KEYBOARD_SHORTCUTS, 'openSearch', 'Ctrl+J')).toBeNull()
    expect(findShortcutConflict(DEFAULT_KEYBOARD_SHORTCUTS, 'openSearch', 'Ctrl+K')).toBeNull()
    expect(findShortcutConflict(DEFAULT_KEYBOARD_SHORTCUTS, 'openSearch', '')).toBeNull()
  })

  it('comparent les frappes, pas les chaînes écrites', () => {
    // « Ctrl+K » accepte la touche Cmd : posé sur un geste qui nomme déjà Cmd,
    // les deux partiraient sur la même frappe et le second ne se déclencherait
    // jamais. Le refus porte dans les deux sens, et même avec Ctrl en plus.
    expect(findShortcutConflict(DEFAULT_KEYBOARD_SHORTCUTS, 'openProfile', 'Cmd+K')).toBe('openSearch')
    expect(findShortcutConflict(DEFAULT_KEYBOARD_SHORTCUTS, 'openProfile', 'Ctrl+Cmd+K')).toBe('openSearch')
    const swapped = { ...DEFAULT_KEYBOARD_SHORTCUTS, openSearch: 'Cmd+K' }
    expect(findShortcutConflict(swapped, 'openProfile', 'Ctrl+K')).toBe('openSearch')
    // Une touche tenue seule, sans modificateur, ne peut pas satisfaire un geste
    // qui en exige un : « K » reste libre en face de « Ctrl+K ».
    expect(findShortcutConflict(DEFAULT_KEYBOARD_SHORTCUTS, 'openProfile', 'K')).toBeNull()
  })

  it('ne laissent pas deux gestes du lancement sur la même combinaison', () => {
    for (const name of SHORTCUT_NAMES) {
      expect(findShortcutConflict(DEFAULT_KEYBOARD_SHORTCUTS, name, DEFAULT_KEYBOARD_SHORTCUTS[name])).toBeNull()
    }
  })
})

describe('gestes présentés à l’écran', () => {
  it('couvrent les quinze combinaisons du magasin, chacune une fois', () => {
    const fromStore = Object.keys(DEFAULT_KEYBOARD_SHORTCUTS) as ShortcutName[]
    expect([...SHORTCUT_NAMES].sort()).toEqual([...fromStore].sort())
    expect(new Set(SHORTCUT_NAMES).size).toBe(15)
  })

  it('nomment chaque geste', () => {
    for (const name of SHORTCUT_NAMES) {
      expect(SHORTCUT_LABEL_KEYS[name]).toMatch(/^(settings|chat|common|contacts)\./)
    }
  })

  it('rangent les gestes par endroit où ils se jouent', () => {
    expect(SHORTCUT_GROUPS.map((group) => group.id)).toEqual(['composer', 'global', 'messages'])
    // Le composeur et les rangées de message restent hors de l'écouteur global ;
    // `closeModal` se règle avec les autres bien qu'il soit lu par les panneaux.
    expect(SHORTCUT_GROUPS[0].names).toEqual(['sendMessage', 'newLine'])
    expect(SHORTCUT_GROUPS[2].names).toEqual([...MESSAGE_ACTION_SHORTCUTS])
    expect(SHORTCUT_GROUPS[1].names).toContain('closeModal')
    for (const name of [...COMPOSER_SHORTCUTS, ...MESSAGE_ACTION_SHORTCUTS]) {
      expect(SHORTCUT_GROUPS[1].names).not.toContain(name)
    }
  })
})
