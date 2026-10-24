/**
 * Profil : un enregistrement raté ne dit plus « sauvegardé ».
 *
 * `updateProfile` avalait l'échec de `identity.save` : la page Réglages, le
 * statut des Contacts et l'onboarding annonçaient tous un succès que le disque
 * n'avait pas vu. Le store renvoie désormais l'issue réelle et chaque écran la
 * dit.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { SettingsPage } from '@/features/settings/SettingsPage'
import { ContactsPage } from '@/features/contacts/ContactsPage'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    takeRecords() { return [] }
    disconnect() {}
  })
})

const ME = 'a'.repeat(64)

/** Le disque refuse d'écrire l'identité (ou l'accepte quand `succeed`). */
function storageWrites(...issues: Array<'reject' | 'resolve'>) {
  const save = vi.fn()
  for (const issue of issues) {
    if (issue === 'reject') save.mockRejectedValueOnce(new Error('disque plein'))
    else save.mockResolvedValueOnce(undefined)
  }
  Object.assign(window.asgard.identity, { save })
  return save
}

const toasts = () => useUIStore.getState().toasts

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: ME, secretKey: 'b'.repeat(128) },
      profile: {
        publicKey: ME,
        displayName: 'Moi',
        status: 'online',
        avatar: 'data:image/webp;base64,AA',
        createdAt: 0,
        updatedAt: 0,
      },
    },
    isSetup: true,
    isLoading: false,
  })
  useUIStore.setState({ toasts: [] })
  storageWrites('resolve')
})

afterEach(() => {
  cleanup()
  // clearAllMocks et non restoreAllMocks : ce dernier viderait aussi les
  // implémentations du pont Electron posées dans setup.ts (identity.create).
  vi.clearAllMocks()
})

describe('IdentityStore : l’issue de l’écriture remonte', () => {
  it('rend false quand la sauvegarde échoue, true quand elle passe', async () => {
    const save = storageWrites('reject', 'resolve')

    await expect(useIdentityStore.getState().updateProfile({ displayName: 'Alice' })).resolves.toBe(false)
    await expect(useIdentityStore.getState().updateProfile({ displayName: 'Bob' })).resolves.toBe(true)

    expect(save).toHaveBeenCalledTimes(2)
    expect(useIdentityStore.getState().identity?.profile.displayName).toBe('Bob')
  })

  it('setStatus rapporte le même verdict', async () => {
    storageWrites('reject')

    await expect(useIdentityStore.getState().setStatus('away')).resolves.toBe(false)
    expect(useIdentityStore.getState().identity?.profile.status).toBe('away')
  })
})

describe('Réglages : le profil', () => {
  async function openProfile() {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )
    await screen.findByRole('button', { name: 'settings.saveChanges' })
  }

  it('dit l’échec au lieu de « Profil sauvegardé »', async () => {
    storageWrites('reject')
    await openProfile()

    fireEvent.click(screen.getByRole('button', { name: 'settings.saveChanges' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.profileSaveFailed')
      expect(toast?.type).toBe('error')
    })
    expect(toasts().some((entry) => entry.title === 'settings.profileSaved')).toBe(false)
  })

  it('garde le succès quand l’écriture passe', async () => {
    await openProfile()

    fireEvent.click(screen.getByRole('button', { name: 'settings.saveChanges' }))

    await waitFor(() => expect(toasts().some((entry) => entry.title === 'settings.profileSaved')).toBe(true))
    expect(toasts().some((entry) => entry.title === 'settings.profileSaveFailed')).toBe(false)
  })

  it('un changement de statut raté ne s’annonce pas comme appliqué', async () => {
    storageWrites('reject')
    await openProfile()

    fireEvent.click(screen.getByRole('button', { name: 'common.away' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.profileSaveFailed')
      expect(toast?.type).toBe('error')
    })
    expect(toasts().some((entry) => entry.title.includes('settings.status:'))).toBe(false)
  })

  it('un retrait d’avatar raté se dit', async () => {
    storageWrites('reject')
    await openProfile()

    fireEvent.click(screen.getByRole('button', { name: 'settings.remove' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.profileSaveFailed')
      expect(toast?.type).toBe('error')
    })
    expect(toasts().some((entry) => entry.title === 'settings.avatarRemoved')).toBe(false)
  })
})

describe('Contacts : un statut raté se dit', () => {
  beforeEach(() => {
    useUIStore.setState({ toasts: [] })
    Object.assign(window.asgard.storage, { getContacts: vi.fn().mockResolvedValue([]) })
  })

  it('annonce l’échec plutôt que de laisser le menu muet', async () => {
    storageWrites('reject')
    render(
      <MemoryRouter initialEntries={['/contacts']}>
        <Routes>
          <Route path="/contacts" element={<ContactsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'settings.status: common.online' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'common.away' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.profileSaveFailed')
      expect(toast?.type).toBe('error')
    })
  })
})

describe('Onboarding : rester sur le profil si l’enregistrement échoue', () => {
  it('ne fait pas avancer l’étape et annonce l’échec', async () => {
    useIdentityStore.setState({ identity: null, isSetup: false, isLoading: false })
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'onboarding.enterRealm' }))
    fireEvent.click(await screen.findByRole('button', { name: 'onboarding.createAccount' }))
    fireEvent.click(await screen.findByRole('checkbox', {}, { timeout: 3000 }))
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }))

    const name = await screen.findByLabelText('onboarding.displayName', {}, { timeout: 3000 })
    fireEvent.change(name, { target: { value: 'Freya' } })
    storageWrites('reject')

    fireEvent.click(screen.getByRole('button', { name: 'onboarding.continue' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.profileSaveFailed')
      expect(toast?.type).toBe('error')
    })
    expect(screen.queryByRole('button', { name: 'onboarding.finish' })).toBeNull()
    expect(screen.getByRole('button', { name: 'onboarding.continue' })).toBeInTheDocument()
  })
})
