/**
 * Fermer un dialogue : la combinaison du réglage, plus une touche figée.
 *
 * `settings.keyboardShortcuts.closeModal` était écrit et persisté sans
 * lecteur : la recherche, la modale globale et les cinq dialogues posés par
 * leur vue fermaient tous sur un `e.key === 'Escape'` recopié trois fois. Ces
 * tests jouent la frappe sur des composants réels et sur le hook partagé, puis
 * changent le réglage : Échap doit lâcher, la nouvelle combinaison prendre.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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
  }),
}))

import { SearchModal } from '@/components/search/SearchModal'
import { useDialogBehavior } from '@/hooks/useDialogBehavior'
import { useUIStore } from '@/stores/uiStore'

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

function LocalDialog({ onClose }: { onClose: () => void }) {
  const ref = useDialogBehavior<HTMLDivElement>(onClose)
  return (
    <div ref={ref} role="dialog" aria-label="panneau">
      <button type="button">ok</button>
    </div>
  )
}

const baselineShortcuts = { ...useUIStore.getState().settings.keyboardShortcuts }

const setClose = (combo: string) => {
  const current = useUIStore.getState().settings.keyboardShortcuts
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...current, closeModal: combo } })
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  setClose('Escape')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useUIStore.getState().updateSettings({ keyboardShortcuts: { ...baselineShortcuts } })
})

describe('fermeture réglée d’un dialogue', () => {
  it('ferme la recherche sur Échap tant que le réglage le dit', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <SearchModal isOpen onClose={onClose} />
      </MemoryRouter>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('rend la main au réglage changé : Échap lâche, la nouvelle combinaison ferme', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <SearchModal isOpen onClose={onClose} />
      </MemoryRouter>,
    )
    setClose('Ctrl+X')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('n’écoute pas Échap tenu avec un modificateur en trop', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <SearchModal isOpen onClose={onClose} />
      </MemoryRouter>,
    )
    fireEvent.keyDown(window, { key: 'Escape', ctrlKey: true })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ferme un dialogue posé par sa vue sur la même combinaison', () => {
    const onClose = vi.fn()
    render(<LocalDialog onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    setClose('Ctrl+Shift+Q')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Q', ctrlKey: true, shiftKey: true })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reste muet sur une combinaison vide : le bouton fermer reste la sortie', () => {
    const onClose = vi.fn()
    render(<LocalDialog onClose={onClose} />)
    setClose('')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
