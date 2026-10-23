/**
 * Édition de message : Ctrl+Entrée valide, Échap ferme. Une composition IME en
 * cours garde ces deux touches (Entrée valide le texte, Échap annule la
 * composition) — la modale ne doit ni enregistrer ni se fermer.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageEditModal } from '@/features/chat/components/MessageEditModal'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const message: Message = {
  id: 'message-1',
  conversationId: 'fil-1',
  senderId: 'a'.repeat(64),
  type: 'text',
  content: 'texte original',
  timestamp: 1_700_000_000_000,
  status: 'sent',
}

afterEach(() => {
  cleanup()
})

describe('édition de message et composition IME', () => {
  it('ne valide ni ne ferme pendant la composition, puis fonctionne hors composition', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<MessageEditModal message={message} onSave={onSave} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'corrigé' } })

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true, isComposing: true })
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true, keyCode: 229 })
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    expect(onSave).toHaveBeenCalledWith('message-1', 'corrigé')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
