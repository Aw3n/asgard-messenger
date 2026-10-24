/**
 * Le bouton « recharger les contacts » terminait par `alert()` : boîte native
 * bloquante, sans style, et sans trace une fois fermée. Les trois issues
 * passent maintenant par les toasts de l'app — l'erreur porte son message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { ContactsPage } from '@/features/contacts/ContactsPage'
import { useContactStore } from '@/stores/contactStore'
import { useUIStore } from '@/stores/uiStore'

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

const getContacts = vi.fn()

beforeEach(() => {
  useContactStore.setState({ contacts: {}, searchQuery: '' })
  useUIStore.setState({ toasts: [] })
  getContacts.mockReset()
  ;(window.asgard.storage as unknown as { getContacts: typeof getContacts }).getContacts = getContacts
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderContacts() {
  return render(
    <MemoryRouter initialEntries={['/contacts']}>
      <Routes>
        <Route path="/contacts" element={<ContactsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const reload = () => fireEvent.click(screen.getByTitle('contacts.reloadContacts'))
const toasts = () => useUIStore.getState().toasts

describe('rechargement des contacts depuis Hyperbee', () => {
  it('annonce l’absence de contacts par un toast, pas par alert', async () => {
    getContacts.mockResolvedValue([])
    renderContacts()

    reload()

    await waitFor(() =>
      expect(toasts().some((toast) => toast.type === 'warning' && toast.title === 'contacts.error.noContactsFound')).toBe(true),
    )
    expect(window.alert).not.toHaveBeenCalled()
  })

  it('annonce l’échec avec son message, sans alert', async () => {
    getContacts.mockRejectedValue(new Error('bee fermé'))
    renderContacts()

    reload()

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'contacts.error.failedToReload')
      expect(toast?.type).toBe('error')
      expect(toast?.message).toContain('bee fermé')
    })
    expect(window.alert).not.toHaveBeenCalled()
  })
})
