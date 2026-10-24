/**
 * Recherche globale au clavier.
 *
 * Le pied de la modale annonce « ↑↓ naviguer » et « ↵ ouvrir », mais seule la
 * souris ouvrait un résultat : ↵ ne faisait rien et la sélection n'existait
 * pas dans le DOM. Ces tests fixent le comportement attendu.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
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
import { useUIStore } from '@/stores/uiStore'
import { DEFAULT_KEYBOARD_SHORTCUTS } from '@/utils/shortcuts'

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

  it('laisse l’Entrée d’une composition IME au champ de recherche', () => {
    const { input, onClose } = renderModal()
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    // Contrôle négatif : ni la sélection ni l’ouverture ne bougent.
    expect(fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true })).toBe(true)
    expect(input.getAttribute('aria-activedescendant')).toBe('search-result-0')
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    // Contrôle positif : hors composition, Entrée ouvre toujours la sélection.
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('laisse l’Échap d’une composition IME au champ de recherche', () => {
    const { onClose } = renderModal()

    expect(fireEvent.keyDown(window, { key: 'Escape', isComposing: true })).toBe(true)
    expect(fireEvent.keyDown(window, { key: 'Escape', keyCode: 229 })).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
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

  it('nomme le champ de recherche global', () => {
    const { input } = renderModal()

    // Le placeholder s'efface dès la première frappe : le combobox a besoin
    // de son propre nom.
    expect(input).toHaveAccessibleName('search.placeholder')
  })

  it('nomme le bouton d’effacement et annonce le filtre actif', () => {
    const { input } = renderModal()
    fireEvent.change(input, { target: { value: 'ali' } })

    // La croix du champ efface la requête : l'appeler « Fermer » faisait
    // annoncer au lecteur d’écran une action que le clic ne faisait pas.
    const clear = screen.getByRole('button', { name: 'search.clearQuery' })
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

describe('la touche de fermeture réglée est celle que la modale écoute', () => {
  const bindCloseKey = (combo: string) => {
    const current = useUIStore.getState().settings.keyboardShortcuts
    act(() => {
      useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, closeModal: combo } })
    })
  }

  // La pastille vit dans la rangée du champ, pas au pied de la modale où ↑↓ et ↵
  // promettent déjà leur propre touche.
  const chip = (): HTMLElement | null =>
    screen.getByRole('combobox').parentElement?.querySelector('kbd') ?? null

  afterEach(() => {
    bindCloseKey(DEFAULT_KEYBOARD_SHORTCUTS.closeModal)
  })

  it('la pastille du champ lit la combinaison réglée, pas ESC en dur', () => {
    renderModal()
    expect(chip()?.textContent).toBe('Escape')

    bindCloseKey('Ctrl+Shift+X')
    expect(chip()?.textContent).toBe('Ctrl + Shift + X')
  })

  it('la pastille s’efface avec le geste et Échap ne referme plus', () => {
    const { onClose } = renderModal()
    bindCloseKey('')

    expect(chip()).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('c’est la combinaison réglée qui referme, et Échap rendu libre ne fait rien', () => {
    const { onClose } = renderModal()
    bindCloseKey('Ctrl+Shift+X')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true, shiftKey: true })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
