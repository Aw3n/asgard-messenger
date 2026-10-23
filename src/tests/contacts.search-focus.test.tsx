/**
 * Un résultat de recherche qui vise un contact sans conversation ouvrait la
 * liste complète sans sélection : l'utilisateur devait retrouver le contact.
 * La page Contacts doit consommer l'état de navigation et ouvrir sa fiche.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { ContactsPage } from '@/features/contacts/ContactsPage'
import { useContactStore } from '@/stores/contactStore'
import type { Contact } from '@/types'

const PUBLIC_KEY = 'a'.repeat(64)

const contact: Contact = {
  publicKey: PUBLIC_KEY,
  displayName: 'Alice',
  status: 'online',
  relation: 'contact',
  verified: false,
  addedAt: 0,
}

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

beforeEach(() => {
  useContactStore.setState({ contacts: { [PUBLIC_KEY]: contact }, searchQuery: '' })
})

afterEach(() => {
  document.body.innerHTML = ''
})

function renderContacts(state?: { contactPublicKey: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/contacts', state }]}>
      <Routes>
        <Route path="/contacts" element={<ContactsPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('page Contacts — cible de recherche', () => {
  it('ouvre directement la fiche du contact visé', async () => {
    renderContacts({ contactPublicKey: PUBLIC_KEY })

    expect(await screen.findByText('contacts.publicKey')).toBeInTheDocument()
  })

  it('ne sélectionne aucun contact sans cible explicite', () => {
    renderContacts()

    expect(screen.queryByText('contacts.publicKey')).not.toBeInTheDocument()
  })
})
