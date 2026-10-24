/**
 * La modale d'ajout de contact ouverte depuis « nouvelle conversation » a le
 * même bouton « coller » que la page Contacts. Elle ignorait elle aussi, en
 * silence, un presse-papiers qui n'était ni une clé ni un lien d'invitation —
 * le champ restait vide sans explication.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { ModalContainer } from '@/components/modals/ModalContainer'
import { useUIStore } from '@/stores/uiStore'
import { SPKI_ED25519_PREFIX } from '@/utils/invite'

const RAW_HEX = 'cd'.repeat(32)
const readText = vi.fn()
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

beforeEach(() => {
  useUIStore.setState({ modal: { type: 'addContact' }, toasts: [] })
  readText.mockReset()
  Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true })
})

afterEach(() => {
  cleanup()
  useUIStore.setState({ modal: { type: null } })
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else delete (navigator as { clipboard?: unknown }).clipboard
})

function openModal(): HTMLInputElement {
  render(
    <MemoryRouter>
      <ModalContainer />
    </MemoryRouter>,
  )
  return screen.getByLabelText('modal.publicKey') as HTMLInputElement
}

const paste = () => fireEvent.click(screen.getByRole('button', { name: 'common.paste' }))

describe('collage dans la modale d’ajout de contact', () => {
  it('signale un contenu invalide au lieu de rester sans effet', async () => {
    readText.mockResolvedValue('ceci n’est pas une clé')
    const field = openModal()

    paste()

    expect(await screen.findByRole('alert')).toHaveTextContent('modal.error.invalidPublicKey')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field.value).toBe('')
  })

  it('remplit le champ avec une clé brute valide et efface l’erreur', async () => {
    readText.mockResolvedValue(RAW_HEX)
    const field = openModal()
    fireEvent.change(field, { target: { value: 'texte précédent' } })

    paste()

    await waitFor(() => expect(field.value).toBe(SPKI_ED25519_PREFIX + RAW_HEX))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('annonce une lecture du presse-papiers refusée', async () => {
    readText.mockRejectedValue(new Error('permission refusée'))
    openModal()

    paste()

    expect(await screen.findByRole('alert')).toHaveTextContent('common.clipboardError')
  })
})
