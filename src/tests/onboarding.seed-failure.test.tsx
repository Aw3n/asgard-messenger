/**
 * Onboarding : une phrase de récupération illisible après la création ne doit
 * pas faire croire que la création a échoué. Le bouton rejoué relit la phrase
 * — regénérer une identité écraserait celle dont aucune sauvegarde n'a été
 * montrée.
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

const SEED = Array(24).fill('abandon')
const CREATED = {
  publicKey: 'a'.repeat(64),
  keyPair: { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) },
}

beforeEach(() => {
  useIdentityStore.setState({ identity: null, isSetup: false, isLoading: false })
  vi.mocked(window.asgard.identity.create).mockResolvedValue(CREATED)
  vi.mocked(window.asgard.identity.exportSeedPhrase).mockResolvedValue(SEED)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const renderOnboarding = () =>
  render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  )

describe('échec de lecture de la phrase', () => {
  it('rejoue la lecture seule, sans recréer l’identité', async () => {
    const create = vi.mocked(window.asgard.identity.create)
    const exportSeed = vi.mocked(window.asgard.identity.exportSeedPhrase)
    exportSeed.mockRejectedValueOnce(new Error('ipc indisponible'))

    renderOnboarding()
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.enterRealm' }))
    fireEvent.click(await screen.findByRole('button', { name: 'onboarding.createAccount' }))

    // Le bouton ne promet plus une création : l'identité existe déjà.
    const retry = await screen.findByRole('button', { name: 'common.retry' })
    expect(create).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    fireEvent.click(retry)

    expect(await screen.findByRole('checkbox')).toBeInTheDocument()
    expect(create).toHaveBeenCalledTimes(1)
    expect(exportSeed).toHaveBeenCalledTimes(2)
  })

  it('une création réellement ratée garde son bouton de création', async () => {
    vi.mocked(window.asgard.identity.create).mockRejectedValueOnce(new Error('disk full'))

    renderOnboarding()
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.enterRealm' }))
    fireEvent.click(await screen.findByRole('button', { name: 'onboarding.createAccount' }))

    // Toujours à l'étape de création : rien à relire, rien n'a été créé.
    expect(await screen.findByRole('button', { name: 'onboarding.createAccount' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.retry' })).not.toBeInTheDocument()
  })
})
