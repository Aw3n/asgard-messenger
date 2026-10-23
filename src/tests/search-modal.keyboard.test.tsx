/**
 * Recherche globale au clavier.
 *
 * Le pied de la modale annonce « ↑↓ naviguer » et « ↵ ouvrir », mais seule la
 * souris ouvrait un résultat : ↵ ne faisait rien et la sélection n'existait
 * pas dans le DOM. Ces tests fixent le comportement attendu.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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
      isSearching: false,
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

function LocationProbe() {
  const location = useLocation()
  const state = location.state as { contactPublicKey?: string } | null
  return <div data-testid="location">{`${location.pathname}|${state?.contactPublicKey ?? ''}`}</div>
}

function renderModal(onClose = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <SearchModal isOpen onClose={onClose} />
    </MemoryRouter>
  )
  return { input: screen.getByRole('combobox'), onClose, view }
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

  it('garde le focus dans la modale : Tab et ⇧Tab bouclent', () => {
    const { input } = renderModal()
    const options = screen.getAllByRole('option')
    const last = options[options.length - 1]

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(input)

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('ouvre la fiche du contact trouvé quand aucun fil n’existe', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <SearchModal isOpen onClose={vi.fn()} />
        <LocationProbe />
      </MemoryRouter>
    )
    const input = screen.getByRole('combobox')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByTestId('location')).toHaveTextContent(`/contacts|${'a'.repeat(64)}`)
  })

  it('nomme le bouton d’effacement et annonce le filtre actif', () => {
    const { input } = renderModal()
    fireEvent.change(input, { target: { value: 'ali' } })

    const clear = screen.getByRole('button', { name: 'common.close' })
    expect(input).toHaveValue('ali')
    fireEvent.click(clear)
    expect(input).toHaveValue('')

    const all = screen.getByRole('button', { name: 'search.all' })
    const messages = screen.getByRole('button', { name: 'search.messages' })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(messages).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(messages)
    expect(messages).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveAttribute('aria-pressed', 'false')
  })

  it('garde la modale montée le temps de son animation de fermeture', () => {
    const onClose = vi.fn()
    const view = render(
      <MemoryRouter>
        <SearchModal isOpen onClose={onClose} />
      </MemoryRouter>
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    view.rerender(
      <MemoryRouter>
        <SearchModal isOpen={false} onClose={onClose} />
      </MemoryRouter>
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('rend le focus à l’élément déclencheur à la fermeture', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'ouvrir'
    document.body.appendChild(trigger)
    trigger.focus()

    const onClose = vi.fn()
    const view = render(
      <MemoryRouter>
        <SearchModal isOpen onClose={onClose} />
      </MemoryRouter>
    )
    view.rerender(
      <MemoryRouter>
        <SearchModal isOpen={false} onClose={onClose} />
      </MemoryRouter>
    )

    expect(document.activeElement).toBe(trigger)
  })
})
