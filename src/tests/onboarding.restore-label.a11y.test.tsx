/**
 * Restauration d'identité : le champ de la phrase n'avait aucun nom.
 *
 * L'étape n'affichait qu'un placeholder, qui disparaît à la première frappe :
 * un lecteur d'écran annonçait une zone d'édition vide. Le champ porte
 * maintenant le nom de la phrase de récupération.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('restauration d’identité', () => {
  it('nomme le champ où coller la phrase de récupération', async () => {
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'onboarding.restoreIdentity' }))

    const field = await screen.findByLabelText('onboarding.recoveryPhrase')
    expect(field.tagName).toBe('TEXTAREA')
  })
})
