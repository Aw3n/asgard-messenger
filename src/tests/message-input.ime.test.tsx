/**
 * Composition IME : le premier Enter valide la saisie du clavier (japonais,
 * chinois, coréen…), il n'appartient pas au chat. L'envoyer enverrait un texte
 * incomplet et empêcherait la validation de la composition.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageInput } from '@/features/chat/components/MessageInput'
import { useConversationStore } from '@/stores/conversationStore'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

beforeEach(() => {
  useConversationStore.setState({
    conversations: {},
    drafts: {},
    activeConversationId: null,
    filter: {},
  })
  const settings = useUIStore.getState().settings
  useUIStore.setState({ settings: { ...settings, chat: { ...settings.chat, sendOnEnter: true } } })
})

afterEach(() => {
  cleanup()
})

const type = (value: string) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })
}

describe('composition IME du composeur', () => {
  it('envoie sur Enter hors composition', () => {
    const onSend = vi.fn()
    render(<MessageInput conversationId="fil-ime" onSend={onSend} />)
    type('bonjour')

    expect(fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' })).toBe(false)
    expect(onSend).toHaveBeenCalledWith('bonjour')
  })

  it('laisse Enter valider la composition au lieu d’envoyer', () => {
    const onSend = vi.fn()
    render(<MessageInput conversationId="fil-ime" onSend={onSend} />)
    type('こんにちは')

    expect(fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter', isComposing: true })).toBe(true)
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('こんにちは')
  })

  it('reconnaît aussi le keyCode 229 des IME qui taisent isComposing', () => {
    const onSend = vi.fn()
    render(<MessageInput conversationId="fil-ime" onSend={onSend} />)
    type('你好')

    expect(fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', keyCode: 229 })).toBe(true)
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('你好')
  })
})
