/**
 * Envoi refusé : le composeur vide le champ avant de savoir si la vue a pu
 * envoyer. Si elle rend `false` (ou rejette), la phrase doit revenir — dans le
 * champ du fil affiché, en brouillon si l'utilisateur a changé de fil, et
 * jamais à la place d'un texte retapé entre-temps.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageInput } from '@/features/chat/components/MessageInput'
import { useConversationStore } from '@/stores/conversationStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const textarea = () => screen.getByRole('textbox') as HTMLTextAreaElement
const sendButton = () => screen.getByRole('button', { name: 'messageInput.send' })

const typeAndSend = (text: string) => {
  fireEvent.change(textarea(), { target: { value: text } })
  fireEvent.click(sendButton())
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

describe('envoi refusé du composeur', () => {
  it('restaure la phrase quand la vue rend false', async () => {
    const onSend = vi.fn(() => Promise.resolve(false))
    render(<MessageInput conversationId="fil-refus" onSend={onSend} />)

    typeAndSend('phrase perdue')

    expect(onSend).toHaveBeenCalledWith('phrase perdue')
    await waitFor(() => expect(textarea()).toHaveValue('phrase perdue'))
    expect(useConversationStore.getState().getDraft('fil-refus')).toBe('phrase perdue')
  })

  it('restaure aussi quand l’envoi rejette', async () => {
    const onSend = vi.fn(() => Promise.reject(new Error('signature refusée')))
    render(<MessageInput conversationId="fil-rejet" onSend={onSend} />)

    typeAndSend('phrase rejetée')

    await waitFor(() => expect(textarea()).toHaveValue('phrase rejetée'))
    expect(useConversationStore.getState().getDraft('fil-rejet')).toBe('phrase rejetée')
  })

  it('laisse le champ vide quand l’envoi aboutit', async () => {
    const onSend = vi.fn(() => Promise.resolve(true))
    render(<MessageInput conversationId="fil-ok" onSend={onSend} />)

    typeAndSend('partie')
    await waitFor(() => expect(onSend).toHaveBeenCalled())
    await act(async () => { await Promise.resolve() })

    expect(textarea()).toHaveValue('')
    expect(useConversationStore.getState().getDraft('fil-ok')).toBe('')
  })

  it('n’écrase pas un texte retapé pendant l’attente', async () => {
    let answer: (accepted: boolean) => void = () => {}
    const onSend = vi.fn(() => new Promise<boolean>((resolve) => { answer = resolve }))
    render(<MessageInput conversationId="fil-attente" onSend={onSend} />)

    typeAndSend('phrase refusée')
    expect(textarea()).toHaveValue('')
    fireEvent.change(textarea(), { target: { value: 'nouvelle frappe' } })

    await act(async () => { answer(false) })

    expect(textarea()).toHaveValue('nouvelle frappe')
    // Le brouillon est enregistré après un court délai : il doit suivre la
    // frappe neuve, jamais la phrase refusée.
    await waitFor(
      () => expect(useConversationStore.getState().getDraft('fil-attente')).toBe('nouvelle frappe'),
      { timeout: 1200 }
    )
  })

  it('rend la phrase en brouillon du fil quitté pendant l’envoi', async () => {
    let answer: (accepted: boolean) => void = () => {}
    const onSend = vi.fn(() => new Promise<boolean>((resolve) => { answer = resolve }))
    const { rerender } = render(<MessageInput conversationId="fil-quitte" onSend={onSend} />)

    typeAndSend('phrase du fil quitté')
    rerender(<MessageInput conversationId="fil-suivant" onSend={onSend} />)
    expect(textarea()).toHaveValue('')

    await act(async () => { answer(false) })

    expect(textarea()).toHaveValue('')
    expect(useConversationStore.getState().getDraft('fil-quitte')).toBe('phrase du fil quitté')
  })
})
