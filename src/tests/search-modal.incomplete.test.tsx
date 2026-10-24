/**
 * La recherche profonde interroge chaque conversation par IPC. Quand l'une
 * échoue, ses anciens messages restent introuvables : la liste ne doit pas
 * laisser croire que tout a été fouillé.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  storageIncomplete: true,
}))

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
    isSearching: false,
    truncated: { contacts: false, groups: false, messages: false },
    storageIncomplete: mockState.storageIncomplete,
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
  mockState.storageIncomplete = true
})

afterEach(() => {
  document.body.innerHTML = ''
})

function openAndSearch() {
  render(
    <MemoryRouter>
      <SearchModal isOpen onClose={() => {}} />
    </MemoryRouter>
  )
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bonjour' } })
}

describe('recherche globale — lecture incomplète', () => {
  it('dit qu’une conversation n’a pas pu être fouillée', () => {
    openAndSearch()

    expect(screen.getByText('search.incomplete')).toBeInTheDocument()
  })

  it('se tait quand toutes les conversations ont répondu', () => {
    mockState.storageIncomplete = false
    openAndSearch()

    expect(screen.queryByText('search.incomplete')).not.toBeInTheDocument()
  })
})
