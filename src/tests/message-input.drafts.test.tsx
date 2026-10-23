/**
 * Brouillons du composeur : le texte non envoyé appartient au fil affiché.
 * Changer de fil ne doit ni le perdre, ni le laisser dans le champ du suivant,
 * et entrer en édition ne doit jamais remplacer le brouillon par le texte édité.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageInput } from '@/features/chat/components/MessageInput'
import { useConversationStore } from '@/stores/conversationStore'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const editTarget: Message = {
  id: 'message-1',
  conversationId: 'fil-1',
  senderId: 'a'.repeat(64),
  type: 'text',
  content: 'texte original',
  timestamp: 1_700_000_000_000,
  status: 'sent',
}

beforeEach(() => {
  useConversationStore.setState({
    conversations: {},
    drafts: {},
    activeConversationId: null,
    filter: {},
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('brouillons du composeur', () => {
  it('restaure le brouillon du fil quand on y revient', () => {
    const { rerender } = render(<MessageInput conversationId="fil-1" onSend={vi.fn()} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: 'à finir' } })
    rerender(<MessageInput conversationId="fil-2" onSend={vi.fn()} />)
    expect(textarea.value).toBe('')
    expect(useConversationStore.getState().getDraft('fil-1')).toBe('à finir')

    rerender(<MessageInput conversationId="fil-1" onSend={vi.fn()} />)
    expect(textarea.value).toBe('à finir')
    expect(useConversationStore.getState().getDraft('fil-2')).toBe('')
  })

  it('garde aussi les brouillons des canaux de groupe', () => {
    const { rerender } = render(<MessageInput conversationId="canal-42" onSend={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'note de canal' } })

    rerender(<MessageInput conversationId="canal-autre" onSend={vi.fn()} />)
    rerender(<MessageInput conversationId="canal-42" onSend={vi.fn()} />)

    expect(screen.getByRole('textbox')).toHaveValue('note de canal')
    expect(useConversationStore.getState().getDraft('canal-42')).toBe('note de canal')
  })

  it('ne remplace pas le brouillon par le texte édité', () => {
    useConversationStore.getState().setDraft('fil-1', 'mon brouillon')
    const { rerender } = render(
      <MessageInput
        conversationId="fil-1"
        editingMessage={editTarget}
        onSend={vi.fn()}
        onEditSubmit={vi.fn()}
      />
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('texte original')

    fireEvent.change(textarea, { target: { value: 'correction' } })
    rerender(<MessageInput conversationId="fil-1" onSend={vi.fn()} onEditSubmit={vi.fn()} />)

    expect(textarea.value).toBe('mon brouillon')
    expect(useConversationStore.getState().getDraft('fil-1')).toBe('mon brouillon')
  })

  it('efface le brouillon après envoi et ne le ressuscite pas', async () => {
    const onSend = vi.fn()
    render(<MessageInput conversationId="fil-1" onSend={onSend} />)
    const textarea = screen.getByRole('textbox')

    fireEvent.change(textarea, { target: { value: 'salut' } })
    fireEvent.click(screen.getByRole('button', { name: 'messageInput.send' }))

    expect(onSend).toHaveBeenCalledWith('salut')
    expect(useConversationStore.getState().getDraft('fil-1')).toBe('')
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(useConversationStore.getState().getDraft('fil-1')).toBe('')
  })

  it('enregistre la frappe après un court délai', async () => {
    render(<MessageInput conversationId="fil-3" onSend={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'brouillon différé' } })

    expect(useConversationStore.getState().getDraft('fil-3')).toBe('')
    await waitFor(
      () => expect(useConversationStore.getState().getDraft('fil-3')).toBe('brouillon différé'),
      { timeout: 1200 }
    )
  })
})
