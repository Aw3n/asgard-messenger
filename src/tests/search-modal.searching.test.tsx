/**
 * La recherche Hyperbee est asynchrone : sans indicateur, la modale affichait
 * « aucun résultat » pendant que les conversations étaient encore fouillées.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({ searching: true }))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({
    results: [],
    contactResults: [],
    messageResults: [],
    groupResults: [],
    isSearching: mockState.searching,
  }),
}))

import { SearchModal } from '@/components/search/SearchModal'

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

beforeEach(() => {
  mockState.searching = true
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('recherche globale — état de chargement', () => {
  it('annonce la recherche profonde au lieu de « aucun résultat »', () => {
    render(
      <MemoryRouter>
        <SearchModal isOpen onClose={() => {}} />
      </MemoryRouter>
    )
    const input = screen.getByRole('combobox')

    fireEvent.change(input, { target: { value: 'bonjour' } })

    expect(screen.getByRole('status')).toHaveTextContent('search.searching')
    expect(screen.queryByText('search.noResults')).not.toBeInTheDocument()
  })

  it('bascule sur « aucun résultat » une fois la recherche terminée', () => {
    mockState.searching = false
    render(
      <MemoryRouter>
        <SearchModal isOpen onClose={() => {}} />
      </MemoryRouter>
    )
    const input = screen.getByRole('combobox')

    fireEvent.change(input, { target: { value: 'bonjour' } })

    expect(screen.getByText('search.noResults')).toBeInTheDocument()
    expect(screen.queryByText('search.searching')).not.toBeInTheDocument()
  })
})
