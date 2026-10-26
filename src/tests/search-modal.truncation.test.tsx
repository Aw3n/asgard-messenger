/**
 * La liste de résultats est bornée par type : sans mention de la coupure,
 * l'utilisateur croyait avoir vu tout ce que Asgard savait trouver.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  truncated: { contacts: true, groups: false, messages: false },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/useSearch', () => ({
  useSearch: () => {
    const message = {
      id: 'm1',
      conversationId: 'conv-1',
      senderId: 'peer',
      type: 'text',
      content: 'bonjour le monde',
      timestamp: 1_700_000_000_000,
      status: 'delivered',
    }
    return {
      results: [{ type: 'message', message, highlight: 'bonjour' }],
      contactResults: [],
      messageResults: [{ type: 'message', message, highlight: 'bonjour' }],
      groupResults: [],
      isSearching: false,
      truncated: mockState.truncated,
    }
  },
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
  mockState.truncated = { contacts: true, groups: false, messages: false }
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

describe('recherche globale — résultat coupé', () => {
  it('dit qu’il reste des résultats non affichés', () => {
    openAndSearch()

    expect(screen.getByText('search.moreResults')).toBeInTheDocument()
  })

  it('se tait quand rien n’a été coupé', () => {
    mockState.truncated = { contacts: false, groups: false, messages: false }
    openAndSearch()

    expect(screen.queryByText('search.moreResults')).not.toBeInTheDocument()
  })

  it('n’accuse pas l’onglet Messages d’une coupure qui ne touche que les contacts', () => {
    openAndSearch()
    fireEvent.click(screen.getByRole('button', { name: 'search.messages' }))

    expect(screen.queryByText('search.moreResults')).not.toBeInTheDocument()
  })
})
