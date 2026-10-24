/**
 * Sélecteur de présence de la page Contacts.
 *
 * Le déclencheur n'était qu'un point coloré nommé par son `title` : le lecteur
 * d'écran ne savait pas qu'il ouvrait un menu, ni quel statut était actif. Le
 * panneau, lui, n'avait ni rôle de menu ni geste de fermeture — ni Échap, ni
 * clic extérieur, ni parcours aux flèches.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { ContactsPage } from '@/features/contacts/ContactsPage'
import { useContactStore } from '@/stores/contactStore'
import { useIdentityStore } from '@/stores/identityStore'
import type { UserStatus } from '@/types'

const PUBLIC_KEY = 'a'.repeat(64)
const TRIGGER = 'settings.status: common.online'

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/contacts']}>
      <Routes>
        <Route path="/contacts" element={<ContactsPage />} />
      </Routes>
    </MemoryRouter>,
  )

const trigger = () => screen.getByRole('button', { name: TRIGGER })

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  useContactStore.setState({ contacts: {}, searchQuery: '' })
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: PUBLIC_KEY, secretKey: 'b'.repeat(128) },
      profile: {
        publicKey: PUBLIC_KEY,
        displayName: 'Moi',
        status: 'online',
        createdAt: 0,
        updatedAt: 0,
      },
    },
    isSetup: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('page Contacts — sélecteur de présence', () => {
  it('nomme le déclencheur et expose l’état du menu', () => {
    renderPage()

    const button = trigger()
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: 'settings.status' })
    const items = within(menu).getAllByRole('menuitemradio')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveAttribute('aria-checked', 'true')
    expect(items[1]).toHaveAttribute('aria-checked', 'false')
  })

  it('s’ouvre et se parcourt au clavier, puis Échap rend le focus', async () => {
    renderPage()

    const button = trigger()
    button.focus()
    fireEvent.keyDown(button, { key: 'ArrowDown' })

    const items = screen.getAllByRole('menuitemradio')
    expect(document.activeElement).toBe(items[0])

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(window, { key: 'End' })
    expect(document.activeElement).toBe(items[3])

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(document.activeElement).toBe(button)
  })

  it('se referme d’un second clic sur le déclencheur', async () => {
    renderPage()

    const button = trigger()
    fireEvent.pointerDown(button)
    fireEvent.click(button)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.pointerDown(button)
    fireEvent.click(button)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('applique le statut choisi et referme le menu', async () => {
    const setStatus = vi.fn(async (_status: UserStatus) => true)
    useIdentityStore.setState({ setStatus })
    renderPage()

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'common.away' }))

    expect(setStatus).toHaveBeenCalledWith('away')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })
})
