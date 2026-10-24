/**
 * L'étoile de favori n'était qu'un dessin : au lecteur d'écran, une ligne en
 * favori se lisait comme les autres. Le nom accessible de la rangée doit dire
 * la relation, et seulement pour les favoris.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Virtuoso ne mesure pas de hauteur en jsdom : on rend les lignes directement.
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent }: {
    data: unknown[]
    itemContent: (index: number, item: unknown) => React.ReactNode
  }) => React.createElement(
    'div',
    null,
    data.map((item, index) => React.createElement('div', { key: index }, itemContent(index, item))),
  ),
}))

import { ContactsPage } from '@/features/contacts/ContactsPage'
import { useContactStore } from '@/stores/contactStore'
import type { Contact } from '@/types'

const FAVORITE_KEY = 'a'.repeat(64)
const PLAIN_KEY = 'b'.repeat(64)

const favorite: Contact = {
  publicKey: FAVORITE_KEY,
  displayName: 'Alice',
  status: 'online',
  relation: 'favorite',
  verified: false,
  addedAt: 0,
}

const plain: Contact = {
  publicKey: PLAIN_KEY,
  displayName: 'Bob',
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
  useContactStore.setState({
    contacts: { [FAVORITE_KEY]: favorite, [PLAIN_KEY]: plain },
    searchQuery: '',
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

function rowFor(name: string): HTMLElement {
  const row = screen.getAllByRole('button').find((button) => button.textContent?.includes(name))
  if (!row) throw new Error(`rangée ${name} introuvable`)
  return row
}

describe('liste des contacts — relation de favori', () => {
  it('annonce le favori dans le nom de sa rangée', () => {
    render(
      <MemoryRouter initialEntries={['/contacts']}>
        <Routes>
          <Route path="/contacts" element={<ContactsPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(rowFor('Alice')).toHaveAccessibleName(/contacts\.relationFavorite/)
  })

  it('ne dit rien d’une relation ordinaire', () => {
    render(
      <MemoryRouter initialEntries={['/contacts']}>
        <Routes>
          <Route path="/contacts" element={<ContactsPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(rowFor('Bob')).not.toHaveAccessibleName(/contacts\.relationFavorite/)
  })
})
