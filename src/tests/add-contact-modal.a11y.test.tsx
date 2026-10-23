/**
 * La modale d'ajout de contact s'annonce comme un dialogue nommé, relie ses
 * libellés visibles à leurs champs, annonce l'erreur, et se ferme avec Échap
 * sans interrompre une composition IME en cours.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModalContainer } from '@/components/modals/ModalContainer'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const openModal = () =>
  render(
    <MemoryRouter>
      <ModalContainer />
    </MemoryRouter>,
  )

beforeEach(() => {
  useUIStore.setState({ modal: { type: 'addContact' } })
})

afterEach(() => {
  cleanup()
  useUIStore.setState({ modal: { type: null } })
})

describe('modale d’ajout de contact', () => {
  it('s’annonce comme un dialogue nommé et relie ses champs à leurs libellés', () => {
    openModal()

    expect(screen.getByRole('dialog', { name: 'modal.addContact' })).toBeInTheDocument()
    expect(screen.getByLabelText('modal.publicKey')).toHaveAttribute('id', 'add-contact-public-key')
    expect(screen.getByLabelText('modal.displayName')).toHaveAttribute('id', 'add-contact-display-name')
    expect(document.activeElement).toBe(screen.getByLabelText('modal.publicKey'))
  })

  it('se ferme avec Échap hors composition IME', async () => {
    openModal()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    fireEvent.keyDown(window, { key: 'Escape', keyCode: 229 })
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('annonce l’erreur et la rattache au champ de clé', () => {
    openModal()
    fireEvent.click(screen.getByRole('button', { name: 'modal.add' }))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('modal.error.publicKeyRequired')
    const input = screen.getByLabelText('modal.publicKey')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'add-contact-error')
  })
})
