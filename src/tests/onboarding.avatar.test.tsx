/**
 * Étape profil de l'onboarding : le crayon affiché à côté de l'avatar ne
 * déclenchait rien. L'avatar doit proposer un vrai changement de photo, relié
 * au sélecteur de fichiers, et rester visible quand il reçoit le focus clavier.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'
import { useIdentityStore } from '@/stores/identityStore'

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

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  useIdentityStore.setState({ identity: null, isSetup: false, isLoading: false })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('avatar de l’onboarding', () => {
  it('ouvre le sélecteur de fichiers depuis l’étape profil', async () => {
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'onboarding.enterRealm' }))
    fireEvent.click(await screen.findByRole('button', { name: 'onboarding.createAccount' }))
    fireEvent.click(await screen.findByRole('checkbox', {}, { timeout: 3000 }))
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }))

    const upload = await screen.findByRole('button', { name: 'avatar.uploadPhoto' }, { timeout: 3000 })
    expect(upload.className).toContain('focus-visible:opacity-100')

    const createElement = vi.spyOn(document, 'createElement')
    const before = createElement.mock.calls.filter(([tag]) => tag === 'input').length
    fireEvent.click(upload)
    const after = createElement.mock.calls.filter(([tag]) => tag === 'input').length
    expect(after).toBe(before + 1)
  })
})
