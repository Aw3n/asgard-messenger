/**
 * Vignettes des pièces jointes en attente : une URL blob par fichier, créée
 * une seule fois et révoquée au retrait ou au démontage. Auparavant l'URL était
 * recréée à chaque rendu du composeur, donc à chaque frappe, sans révocation.
 * Le bouton de retrait doit aussi porter un nom accessible.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageInput } from '@/features/chat/components/MessageInput'
import { useConversationStore } from '@/stores/conversationStore'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

let counter = 0
let revoked: string[] = []
const createObjectURL = vi.fn(() => `blob:preview-${++counter}`)
const revokeObjectURL = vi.fn((url: string) => { revoked.push(url) })
Object.assign(URL, { createObjectURL, revokeObjectURL })

const image = new File(['contenu'], 'photo.png', { type: 'image/png' })

const editTarget: Message = {
  id: 'message-1',
  conversationId: 'fil-pj',
  senderId: 'a'.repeat(64),
  type: 'text',
  content: 'texte original',
  timestamp: 1_700_000_000_000,
  status: 'sent',
}

const upload = (file: File) => {
  const input = document.querySelector('input[type="file"]')
  if (!input) throw new Error('champ fichier introuvable')
  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => {
  counter = 0
  revoked = []
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  useConversationStore.setState({ conversations: {}, drafts: {}, activeConversationId: null, filter: {} })
})

afterEach(() => {
  cleanup()
})

describe('vignettes des pièces jointes en attente', () => {
  it('crée une seule URL, ne la recrée pas à la frappe et la révoque au retrait', async () => {
    render(<MessageInput conversationId="fil-pj" onSend={vi.fn()} />)
    upload(image)

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const src = screen.getByAltText('photo.png').getAttribute('src')
    expect(src).toBe('blob:preview-1')

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'salut' } })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(screen.getByAltText('photo.png')).toHaveAttribute('src', src)

    fireEvent.click(screen.getByRole('button', { name: 'messageInput.removeFile — photo.png' }))
    await waitFor(() => expect(screen.queryByAltText('photo.png')).toBeNull())
    expect(revoked).toContain(src)
  })

  it('révoque la vignette quand le composeur est démonté', () => {
    const view = render(<MessageInput conversationId="fil-pj" onSend={vi.fn()} />)
    upload(image)
    const src = screen.getByAltText('photo.png').getAttribute('src')

    view.unmount()
    expect(revoked).toContain(src)
  })

  it('garde les pièces jointes en attente quand une édition est annulée', () => {
    const onCancelEdit = vi.fn()
    const { rerender } = render(
      <MessageInput
        conversationId="fil-pj"
        editingMessage={editTarget}
        onSend={vi.fn()}
        onEditSubmit={vi.fn()}
        onCancelEdit={onCancelEdit}
      />,
    )
    upload(image)
    expect(screen.getByAltText('photo.png')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(onCancelEdit).toHaveBeenCalledOnce()

    // Le parent referme l'édition ; sans texte, seule la pièce jointe peut
    // encore rendre l'envoi possible.
    rerender(<MessageInput conversationId="fil-pj" onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'messageInput.send' })).toBeEnabled()
    expect(revoked).toEqual([])
  })

  it('garde une URL vivante sous StrictMode', () => {
    render(
      <React.StrictMode>
        <MessageInput conversationId="fil-pj" onSend={vi.fn()} />
      </React.StrictMode>,
    )
    upload(image)

    const src = screen.getByAltText('photo.png').getAttribute('src')
    expect(src).not.toBeNull()
    expect(revoked).not.toContain(src)
  })
})
