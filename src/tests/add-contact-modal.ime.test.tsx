/**
 * Ajout de contact : Entrée soumet le formulaire depuis les deux champs. Une
 * composition IME en cours garde son Entrée pour valider le texte, sinon la
 * frappe serait soumise avant d'être terminée.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModalContainer } from '@/components/modals/ModalContainer'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

beforeEach(() => {
  useUIStore.setState({ modal: { type: 'addContact' } })
})

afterEach(() => {
  cleanup()
  useUIStore.setState({ modal: { type: null } })
})

describe('ajout de contact et composition IME', () => {
  it('ne soumet pas pendant la composition, puis soumet hors composition', () => {
    render(
      <MemoryRouter>
        <ModalContainer />
      </MemoryRouter>,
    )
    const publicKey = screen.getByPlaceholderText('modal.publicKeyPlaceholder')
    const displayName = screen.getByPlaceholderText('modal.displayNamePlaceholder')

    fireEvent.change(publicKey, { target: { value: 'こんにちは' } })
    fireEvent.change(displayName, { target: { value: 'Équipe' } })
    expect(fireEvent.keyDown(publicKey, { key: 'Enter', isComposing: true })).toBe(true)
    expect(fireEvent.keyDown(displayName, { key: 'Enter', keyCode: 229 })).toBe(true)
    expect(screen.queryByText('modal.error.publicKeyRequired')).toBeNull()
    expect(screen.queryByText('modal.error.invalidPublicKey')).toBeNull()

    fireEvent.change(publicKey, { target: { value: '' } })
    fireEvent.keyDown(displayName, { key: 'Enter' })
    expect(screen.getByText('modal.error.publicKeyRequired')).toBeInTheDocument()
  })
})
