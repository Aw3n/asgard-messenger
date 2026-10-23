/**
 * Recherche globale au clavier.
 *
 * Le pied de la modale annonce « ↑↓ naviguer » et « ↵ ouvrir », mais seule la
 * souris ouvrait un résultat : ↵ ne faisait rien et la sélection n'existait
 * pas dans le DOM. Ces tests fixent le comportement attendu.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/useSearch', () => {
  const contact = (publicKey: string, displayName: string) => ({ publicKey, displayName })
  const contacts = [contact('a'.repeat(64), 'Alice'), contact('b'.repeat(64), 'Bob')]
  const results = contacts.map((item) => ({ type: 'contact', contact: item, highlight: item.displayName }))
  return {
    useSearch: () => ({
      results,
      contactResults: results,
      messageResults: [],
      groupResults: [],
    }),
  }
})

import { SearchModal } from '@/components/search/SearchModal'

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

function renderModal(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <SearchModal isOpen onClose={onClose} />
    </MemoryRouter>
  )
  return { input: screen.getByRole('combobox'), onClose }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('recherche globale au clavier', () => {
  it('parcourt les résultats avec ↑↓ et ouvre le résultat sélectionné avec ↵', () => {
    const { input, onClose } = renderModal()

    expect(input.getAttribute('aria-activedescendant')).toBeNull()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe('search-result-0')
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe('search-result-1')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.getAttribute('aria-activedescendant')).toBe('search-result-0')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.getAttribute('aria-activedescendant')).toBe('search-result-1')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('n’ouvre rien tant qu’aucune ligne n’est sélectionnée', () => {
    const { input, onClose } = renderModal()

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('relâche la sélection dès que la requête change', () => {
    const { input } = renderModal()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe('search-result-0')

    fireEvent.change(input, { target: { value: 'a' } })
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
  })
})
