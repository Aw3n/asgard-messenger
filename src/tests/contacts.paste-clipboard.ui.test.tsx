/**
 * Le bouton « coller » du formulaire d'ajout ignorait en silence tout contenu
 * qui n'était ni une clé ni un lien d'invitation : l'utilisateur voyait un
 * bouton sans effet, sans savoir ce qui clochait. Les trois issues sont
 * maintenant visibles : contenu invalide, lecture refusée, ou succès.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { ContactsPage } from '@/features/contacts/ContactsPage'
import { useContactStore } from '@/stores/contactStore'
import { useUIStore } from '@/stores/uiStore'
import { SPKI_ED25519_PREFIX } from '@/utils/invite'

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

const RAW_HEX = 'ab'.repeat(32)
const readText = vi.fn()
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

beforeEach(() => {
  useContactStore.setState({ contacts: {}, searchQuery: '' })
  useUIStore.setState({ toasts: [] })
  readText.mockReset()
  Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true })
})

afterEach(() => {
  cleanup()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else delete (navigator as { clipboard?: unknown }).clipboard
  vi.restoreAllMocks()
})

function openAddModal(): HTMLInputElement {
  render(
    <MemoryRouter initialEntries={['/contacts']}>
      <Routes>
        <Route path="/contacts" element={<ContactsPage />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('contacts.add'))
  return screen.getByLabelText('contacts.publicKey') as HTMLInputElement
}

describe('recherche de contacts', () => {
  it('nomme le champ de recherche pour le lecteur d’écran', () => {
    render(
      <MemoryRouter initialEntries={['/contacts']}>
        <Routes>
          <Route path="/contacts" element={<ContactsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByLabelText('search.placeholder')).toHaveAttribute('placeholder', 'search.placeholder')
  })
})

describe('collage d’un contact depuis le presse-papiers', () => {
  it('signale un contenu qui n’est pas une clé au lieu de ne rien faire', async () => {
    readText.mockResolvedValue('bonjour tout le monde')
    const field = openAddModal()

    fireEvent.click(screen.getByText('common.paste'))

    expect(await screen.findByText('contacts.error.invalidPublicKey')).toBeTruthy()
    expect(field.value).toBe('')
  })

  it('remplit le champ avec une clé brute valide et efface l’erreur', async () => {
    readText.mockResolvedValue(RAW_HEX)
    const field = openAddModal()
    fireEvent.change(field, { target: { value: 'texte précédent' } })

    fireEvent.click(screen.getByText('common.paste'))

    await waitFor(() => expect(field.value).toBe(SPKI_ED25519_PREFIX + RAW_HEX))
    expect(screen.queryByText('contacts.error.invalidPublicKey')).toBeNull()
  })

  it('annonce une lecture du presse-papiers refusée', async () => {
    readText.mockRejectedValue(new Error('permission refusée'))
    openAddModal()

    fireEvent.click(screen.getByText('common.paste'))

    expect(await screen.findByText('common.clipboardError')).toBeTruthy()
  })
})
