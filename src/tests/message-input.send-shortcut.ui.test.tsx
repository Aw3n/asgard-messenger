/**
 * Les deux combinaisons du composeur : « envoyer » et « nouvelle ligne ».
 *
 * `settings.keyboardShortcuts` écrivait `sendMessage: 'Enter'` et
 * `newLine: 'Shift+Enter'` sans que le composeur les lise : il comparait
 * `e.ctrlKey || e.metaKey` en dur. Changer la combinaison de l'envoi ne
 * changeait rien, et « Entrée » restait soumis au seul interrupteur
 * `chat.sendOnEnter`. Ici la combinaison est relue à la frappe, et le partage
 * de la touche « Entrée » avec la bascule est fixe : `sendOnEnter` ne décide
 * que d'« Entrée » seule.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageInput } from '@/features/chat/components/MessageInput'
import { useConversationStore } from '@/stores/conversationStore'
import { useUIStore } from '@/stores/uiStore'
import type { ShortcutName } from '@/utils/shortcuts'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const baseline = { ...useUIStore.getState().settings.keyboardShortcuts }
const sendOnEnterBaseline = useUIStore.getState().settings.chat.sendOnEnter

const setShortcut = (name: ShortcutName, combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  // `act` : le composeur lit la combinaison par sélecteur, elle ne lui parvient
  // qu'au rendu suivant — comme pour un réglage changé à l'écran.
  act(() => { useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, [name]: combo } }) })
}

const setSendOnEnter = (value: boolean) => {
  const settings = useUIStore.getState().settings
  act(() => { useUIStore.getState().updateSettings({ chat: { ...settings.chat, sendOnEnter: value } }) })
}

/** `false` = l'application a pris la touche ; `true` = elle reste au navigateur. */
const press = (key: string, modifiers: Record<string, boolean> = {}) =>
  fireEvent.keyDown(screen.getByRole('textbox'), { key, ...modifiers })

// Une frappe de texte est un rendu React : `fireEvent.change` seul laisserait
// le composeur sur sa valeur vide et l'envoi ne partirait qu'au rendu suivant.
const type = (value: string) => {
  act(() => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value } })
  })
}

beforeEach(() => {
  useConversationStore.setState({ conversations: {}, drafts: {}, activeConversationId: null, filter: {} })
  setShortcut('sendMessage', 'Enter')
  setShortcut('newLine', 'Shift+Enter')
  setShortcut('closeModal', 'Escape')
  setSendOnEnter(true)
})

afterEach(() => {
  cleanup()
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...baseline }, chat: { ...useUIStore.getState().settings.chat, sendOnEnter: sendOnEnterBaseline } })
})

describe('envoi réglé', () => {
  it('envoie sur la combinaison du réglage quand « Entrée » envoie', () => {
    const onSend = vi.fn()
    render(<MessageInput conversationId="fil-send" onSend={onSend} />)
    type('bonjour')

    expect(press('Enter')).toBe(false)
    expect(onSend).toHaveBeenCalledWith('bonjour')
  })

  it('laisse « Entrée » au navigateur quand la bascule est éteinte', () => {
    const onSend = vi.fn()
    setSendOnEnter(false)
    render(<MessageInput conversationId="fil-send" onSend={onSend} />)
    type('bonjour')

    expect(press('Enter')).toBe(true)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('envoie sur « Ctrl+Entrée » même bascule éteinte', () => {
    const onSend = vi.fn()
    setShortcut('sendMessage', 'Ctrl+Enter')
    setSendOnEnter(false)
    render(<MessageInput conversationId="fil-send" onSend={onSend} />)
    type('bonjour')

    expect(press('Enter', { ctrlKey: true })).toBe(false)
    expect(onSend).toHaveBeenCalledWith('bonjour')
  })

  it('ne laisse plus « Entrée » envoyer dès que la combinaison porte un modificateur', () => {
    // La bascule reste allumée : c'est le réglage de la touche qui a déplacé
    // l'envoi, « Entrée » retombe donc dans le saut de ligne du navigateur.
    const onSend = vi.fn()
    setShortcut('sendMessage', 'Cmd+Enter')
    render(<MessageInput conversationId="fil-send" onSend={onSend} />)
    type('bonjour')

    expect(press('Enter')).toBe(true)
    expect(onSend).not.toHaveBeenCalled()
    expect(press('Enter', { metaKey: true })).toBe(false)
    expect(onSend).toHaveBeenCalledWith('bonjour')
  })

  it('suit un re-réglage sans démonter le composeur', () => {
    const onSend = vi.fn()
    render(<MessageInput conversationId="fil-send" onSend={onSend} />)
    type('bonjour')

    setShortcut('sendMessage', 'Ctrl+Alt+S')
    press('Enter')
    expect(onSend).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 's', ctrlKey: true, altKey: true })
    expect(onSend).toHaveBeenCalledWith('bonjour')
  })

  it('éteint l’envoi quand la combinaison est vide, sans rien inventer', () => {
    const onSend = vi.fn()
    setShortcut('sendMessage', '')
    render(<MessageInput conversationId="fil-send" onSend={onSend} />)
    type('bonjour')

    press('Enter')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('rend la touche au navigateur quand il n’y a rien à envoyer', () => {
    // Champ vide : un geste muet ne doit pas avaler la frappe.
    const onSend = vi.fn()
    render(<MessageInput conversationId="fil-send" onSend={onSend} />)

    expect(press('Enter')).toBe(true)
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('retour à la ligne réglé', () => {
  it('insère la ligne sur « Shift+Entrée » sans rien envoyer', () => {
    const onSend = vi.fn()
    render(<MessageInput conversationId="fil-newline" onSend={onSend} />)
    type('ab')
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    textarea.setSelectionRange(1, 1)

    expect(press('Enter', { shiftKey: true })).toBe(false)
    expect(textarea.value).toBe('a\nb')
    expect(textarea.selectionStart).toBe(2)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('suit la combinaison réglée, pas un geste deviné', () => {
    const onSend = vi.fn()
    setShortcut('newLine', 'Ctrl+Alt+Enter')
    render(<MessageInput conversationId="fil-newline" onSend={onSend} />)
    type('ab')

    // « Shift+Entrée » n'est plus la combinaison réglée : le composeur ne la
    // revendique pas, et le texte ne change pas ici (le navigateur n'insère
    // rien sous un événement synthétique).
    expect(press('Enter', { shiftKey: true })).toBe(true)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('ab')

    expect(fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true, altKey: true })).toBe(false)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('ab\n')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('n’envoie pas quand « Entrée » et « nouvelle ligne » portent la même frappe', () => {
    // Les deux réglages écrits sur « Shift+Entrée » : la ligne passe en premier,
    // un seul geste ne peut pas faire les deux.
    const onSend = vi.fn()
    setShortcut('sendMessage', 'Shift+Enter')
    setShortcut('newLine', 'Shift+Enter')
    render(<MessageInput conversationId="fil-newline" onSend={onSend} />)
    type('ab')

    expect(press('Enter', { shiftKey: true })).toBe(false)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('ab\n')
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('annulation du composeur', () => {
  const reply: Message = {
    id: 'msg-1',
    conversationId: 'fil-close',
    senderId: 'b'.repeat(64),
    type: 'text',
    content: 'répondre',
    timestamp: 1_700_000_000_000,
    status: 'sent',
  }

  it('suit la combinaison de fermeture réglée', () => {
    const onCancelReply = vi.fn()
    setShortcut('closeModal', 'Ctrl+Shift+X')
    render(<MessageInput conversationId="fil-close" replyTo={reply} onSend={vi.fn()} onCancelReply={onCancelReply} />)

    press('Escape')
    expect(onCancelReply).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'x', ctrlKey: true, shiftKey: true })
    expect(onCancelReply).toHaveBeenCalledOnce()
  })

  it('annule une édition sur la combinaison réglée', () => {
    const onCancelEdit = vi.fn()
    render(
      <MessageInput
        conversationId="fil-close"
        editingMessage={{ ...reply, senderId: 'a'.repeat(64), content: 'ancien' }}
        onSend={vi.fn()}
        onEditSubmit={vi.fn()}
        onCancelEdit={onCancelEdit}
      />,
    )

    expect(press('Escape')).toBe(false)
    expect(onCancelEdit).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
