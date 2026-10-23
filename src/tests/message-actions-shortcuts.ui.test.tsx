/**
 * Les gestes réglés sur les messages du fil ouvert.
 *
 * `settings.keyboardShortcuts` promettait « Ctrl+C », « Ctrl+R », « Ctrl+F » et
 * « Ctrl+E » ; ces quatre-là ne vivaient que dans le menu à clic droit et la
 * touche seule ne faisait rien. Le hook les relit à la frappe et leur donne une
 * cible — la rangée sous le focus, sinon le message qu'une recherche a fait
 * briller — et rend la main au navigateur quand il n'a rien à faire : une touche
 * non réclamée ne doit pas avaler la copie d'une sélection.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { useMessageActionShortcuts } from '@/hooks/useMessageActionShortcuts'
import { useUIStore } from '@/stores/uiStore'
import { MESSAGE_ACTION_SHORTCUTS, type ShortcutName } from '@/utils/shortcuts'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)

const msg = (id: string, overrides: Partial<Message> = {}): Message => ({
  id,
  conversationId: 'fil-1',
  senderId: PEER,
  type: 'text',
  content: `texte ${id}`,
  timestamp: 1_700_000_000_000,
  status: 'sent',
  ...overrides,
})

const baseline = { ...useUIStore.getState().settings.keyboardShortcuts }

const setShortcut = (name: ShortcutName, combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, [name]: combo } })
}

/**
 * Frappe jouée sur l'élément sous le focus : l'écouteur est sur `window`, mais
 * la cible de l'événement décide du champ qui tient la frappe.
 * `false` = le geste a revendiqué la touche.
 */
const press = (key: string, modifiers: Record<string, boolean> = {}, init: KeyboardEventInit = {}) => {
  const origin = (document.activeElement ?? document.body) as Element
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init, ...modifiers })
  let keptByTheBrowser = true
  act(() => { keptByTheBrowser = origin.dispatchEvent(event) })
  return keptByTheBrowser
}

interface Handlers {
  onReply?: (message: Message) => void
  onEdit?: (message: Message) => void
  onForward?: (message: Message) => void
}

function Thread({ messages, highlightedMessageId, handlers }: {
  messages: Message[]
  highlightedMessageId?: string | null
  handlers: Handlers
}) {
  useMessageActionShortcuts({ messages, ownSenderId: ME, highlightedMessageId, handlers })
  return (
    <>
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} isOwn={message.senderId === ME} {...handlers} />
      ))}
    </>
  )
}

const row = (id: string) => document.querySelector<HTMLElement>(`[data-message-id="${id}"]`)
// La rangée allume sa barre d'actions en se focalisant : un rendu React à
// cadrer dans `act`.
const focusRow = (id: string) => {
  const element = row(id)
  if (!element) throw new Error(`aucune rangée pour ${id}`)
  act(() => { element.focus() })
}

const writeText = vi.fn(() => Promise.resolve())

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  writeText.mockClear()
  setShortcut('copyMessage', 'Ctrl+C')
  setShortcut('replyToMessage', 'Ctrl+R')
  setShortcut('forwardMessage', 'Ctrl+F')
  setShortcut('editLastMessage', 'Ctrl+E')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...baseline } })
  window.getSelection()?.removeAllRanges()
})

describe('cible du geste', () => {
  it('rend la rangée focalisable et portée par son identifiant', () => {
    render(<Thread messages={[msg('m1')]} handlers={{}} />)
    expect(row('m1')).toBeInTheDocument()
    expect(row('m1')).toHaveAttribute('tabindex', '0')
  })

  it('agit sur la rangée sous le focus', () => {
    const onReply = vi.fn()
    render(<Thread messages={[msg('m1'), msg('m2')]} handlers={{ onReply }} />)
    focusRow('m2')

    expect(press('r', { ctrlKey: true })).toBe(false)
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'm2' }))
  })

  it('replie sur le message mis en évidence par une recherche', () => {
    const onForward = vi.fn()
    render(<Thread messages={[msg('m1'), msg('m2')]} highlightedMessageId="m1" handlers={{ onForward }} />)

    expect(press('f', { ctrlKey: true })).toBe(false)
    expect(onForward).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }))
  })

  it('garde la rangée focalisée devant un message surligné', () => {
    const onReply = vi.fn()
    render(<Thread messages={[msg('m1'), msg('m2')]} highlightedMessageId="m1" handlers={{ onReply }} />)
    focusRow('m2')

    press('r', { ctrlKey: true })
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'm2' }))
  })

  it('ne revendique pas la touche sans cible', () => {
    const onReply = vi.fn()
    const onForward = vi.fn()
    render(<Thread messages={[msg('m1')]} handlers={{ onReply, onForward }} />)

    expect(press('r', { ctrlKey: true })).toBe(true)
    expect(press('f', { ctrlKey: true })).toBe(true)
    expect(onReply).not.toHaveBeenCalled()
    expect(onForward).not.toHaveBeenCalled()
  })

  it('ne fait rien sur un message supprimé', () => {
    const onReply = vi.fn()
    render(<Thread messages={[msg('m1', { deleted: true })]} handlers={{ onReply }} />)
    const placeholder = screen.getByText('chat.messageDeleted')

    // Le fantôme d'un message supprimé n'est ni une cible pour le geste, ni un
    // endroit où le focus pourrait se poser.
    expect(placeholder.closest('[data-message-id]')).toBeNull()
    expect(press('r', { ctrlKey: true })).toBe(true)
    expect(onReply).not.toHaveBeenCalled()
  })

  it('édite le dernier message à soi, même sans focus', () => {
    const onEdit = vi.fn()
    const messages = [
      msg('m1', { senderId: ME, content: 'premier' }),
      msg('m2', { content: 'réponse du pair' }),
      msg('m3', { senderId: ME, content: 'le mien' }),
      msg('m4', { senderId: ME, deleted: true }),
      msg('m5', { senderId: ME, content: '' }),
    ]
    render(<Thread messages={messages} handlers={{ onEdit }} />)

    expect(press('e', { ctrlKey: true })).toBe(false)
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'm3' }))
  })
})

describe('copie', () => {
  it('copie le texte de la rangée visée', () => {
    render(<Thread messages={[msg('m1')]} handlers={{}} />)
    focusRow('m1')

    expect(press('c', { ctrlKey: true })).toBe(false)
    expect(writeText).toHaveBeenCalledWith('texte m1')
  })

  it('laisse la copie d’une sélection au navigateur', () => {
    render(<Thread messages={[msg('m1')]} handlers={{}} />)
    focusRow('m1')
    // jsdom ne rend jamais le texte d'une sélection : `toString` est posé à la
    // main pour jouer le cas réel d'un fragment de bulle sélectionné à la souris.
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'texte m1',
      removeAllRanges: () => {},
    } as unknown as Selection)

    expect(press('c', { ctrlKey: true })).toBe(true)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('ne revendique pas la touche d’un message sans texte', () => {
    const onReply = vi.fn()
    render(<Thread messages={[msg('m1', { content: '' })]} highlightedMessageId="m1" handlers={{ onReply }} />)

    expect(press('c', { ctrlKey: true })).toBe(true)
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('combinaison réglée', () => {
  it('suit la combinaison écrite plutôt qu’un geste deviné', () => {
    const onReply = vi.fn()
    setShortcut('replyToMessage', 'Ctrl+Shift+G')
    render(<Thread messages={[msg('m1')]} handlers={{ onReply }} />)
    focusRow('m1')

    expect(press('r', { ctrlKey: true })).toBe(true)
    expect(onReply).not.toHaveBeenCalled()

    expect(press('G', { ctrlKey: true, shiftKey: true })).toBe(false)
    expect(onReply).toHaveBeenCalledOnce()
  })

  it('éteint le geste quand sa combinaison est vide', () => {
    const onReply = vi.fn()
    setShortcut('replyToMessage', '')
    render(<Thread messages={[msg('m1')]} handlers={{ onReply }} />)
    focusRow('m1')

    expect(press('r', { ctrlKey: true })).toBe(true)
    expect(onReply).not.toHaveBeenCalled()
  })

  it('ne revendique pas une action que la vue ne câble pas', () => {
    // `onEdit`, `onReply`, `onForward` absents — canal en écriture fermée : les
    // trois frappes restent au navigateur, et le geste muet ne se paie d'aucune
    // exception avalée silencieusement par la page.
    const uncaught: string[] = []
    const onError = (event: ErrorEvent) => uncaught.push(event.message)
    window.addEventListener('error', onError)
    render(<Thread messages={[msg('m1', { senderId: ME })]} handlers={{}} />)
    focusRow('m1')

    try {
      expect(press('e', { ctrlKey: true })).toBe(true)
      expect(press('r', { ctrlKey: true })).toBe(true)
      expect(press('f', { ctrlKey: true })).toBe(true)
    } finally {
      window.removeEventListener('error', onError)
    }
    expect(uncaught).toEqual([])
  })
})

describe('frappes qui n’appartiennent pas au fil', () => {
  it('laisse un champ de saisie garder ses gestes', () => {
    const onReply = vi.fn()
    render(
      <>
        <textarea data-testid="champ" />
        {/* Une cible existe pourtant, trouvée par la surbrillance de recherche :
            sans la exemption du champ, « Ctrl+R » répondrait au fil pendant
            qu'on écrit dans un champ. */}
        <Thread messages={[msg('m1')]} highlightedMessageId="m1" handlers={{ onReply }} />
      </>,
    )
    screen.getByTestId('champ').focus()

    expect(press('r', { ctrlKey: true })).toBe(true)
    expect(onReply).not.toHaveBeenCalled()
  })

  it('laisse la main à un dialogue posé sur le fil', () => {
    const onReply = vi.fn()
    render(
      <>
        <div role="dialog" data-testid="dialogue" tabIndex={0} />
        <Thread messages={[msg('m1')]} handlers={{ onReply }} />
      </>,
    )
    focusRow('m1')

    expect(press('r', { ctrlKey: true })).toBe(true)
    expect(onReply).not.toHaveBeenCalled()
  })

  it('ignore une frappe pendant une composition IME', () => {
    const onReply = vi.fn()
    render(<Thread messages={[msg('m1')]} handlers={{ onReply }} />)
    focusRow('m1')

    expect(press('r', { ctrlKey: true }, { isComposing: true })).toBe(true)
    expect(onReply).not.toHaveBeenCalled()
  })

  it('ne reconnaît pas une frappe qui ne matche pas la combinaison', () => {
    render(<Thread messages={[msg('m1')]} handlers={{}} />)
    focusRow('m1')

    expect(press('c', { shiftKey: true })).toBe(true)
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('garde de source des gestes de message', () => {
  const source = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

  it('borne les quatre actions à des combinaisons du réglage', () => {
    const declared = Object.keys(baseline)
    for (const name of MESSAGE_ACTION_SHORTCUTS as readonly ShortcutName[]) {
      expect(declared).toContain(name)
      expect(typeof baseline[name]).toBe('string')
    }
  })

  it('les câble dans le fil 1:1 comme dans un canal de groupe', () => {
    for (const file of ['src/features/chat/ChatView.tsx', 'src/features/groups/components/GroupView.tsx']) {
      expect(source(file)).toContain('useMessageActionShortcuts({')
    }
  })

  it('donne à la rangée l’identifiant que le geste cherche', () => {
    expect(source('src/features/chat/components/MessageBubble.tsx')).toContain('data-message-id={message.id}')
  })

  it('lit les deux combinaisons du composeur, sans touche codée en dur', () => {
    const composer = source('src/features/chat/components/MessageInput.tsx')
    expect(composer).toContain('keyboardShortcuts.sendMessage')
    expect(composer).toContain('keyboardShortcuts.newLine')
    // Ni « Ctrl+Entrée » en dur, ni Échap en dur : la frappe vient du réglage.
    expect(composer).not.toMatch(/e\.(ctrlKey|metaKey|shiftKey)/)
    expect(composer).not.toMatch(/=== 'Escape'/)
    expect(composer).toContain('isCloseKeypress')
  })

  it('ne laisse plus le menu du message coder Échap en dur', () => {
    const bubble = source('src/features/chat/components/MessageBubble.tsx')
    expect(bubble).toContain('isCloseKeypress')
    expect(bubble).not.toMatch(/=== 'Escape'/)
  })
})
