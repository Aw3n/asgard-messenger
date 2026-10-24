/**
 * Fiche contact : le blocage réseau échouait derrière une annonce de succès.
 *
 * `handleToggleBlock` bascule d'abord l'état local puis annonce « Contact
 * bloqué ». Le pare-feu, lui, est appliqué ensuite et son échec ne sortait
 * que dans la console : l'utilisateur croyait le pair coupé alors qu'il
 * pouvait toujours se connecter. Le blocage local reste (les messages sont
 * filtrés), mais l'écart est maintenant annoncé — dans les deux sens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/services/ChatService', () => ({
  chatService: { probeContact: vi.fn(), removeContact: vi.fn() },
}))

import { ContactDetailView } from '@/features/contacts/components/ContactDetailView'
import { useContactStore } from '@/stores/contactStore'
import { useUIStore } from '@/stores/uiStore'
import type { Contact } from '@/types'

const PEER = 'b'.repeat(64)

const contact = (relation: Contact['relation'] = 'contact'): Contact => ({
  publicKey: PEER,
  displayName: 'Camille',
  relation,
  status: 'offline',
  verified: false,
  addedAt: 0,
})

const network = () => window.asgard.network as unknown as Record<string, ReturnType<typeof vi.fn>>
const toasts = () => useUIStore.getState().toasts
const stored = () => useContactStore.getState().contacts[PEER]

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  })
  Object.assign(window.asgard.network, {
    fetchProfile: vi.fn().mockResolvedValue(null),
    deriveNoisePublicKey: vi.fn().mockResolvedValue('c'.repeat(64)),
    blockPeer: vi.fn().mockResolvedValue(undefined),
  })
  useUIStore.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  useContactStore.setState({ contacts: {} })
})

function view(relation: Contact['relation'] = 'contact') {
  useContactStore.setState({ contacts: { [PEER]: contact(relation) } })
  render(
    <MemoryRouter>
      <ContactDetailView contact={contact(relation)} />
    </MemoryRouter>,
  )
  // Bloquer et supprimer sont repliés derrière « Plus d'actions ».
  fireEvent.click(screen.getByRole('button', { name: 'contacts.moreActions' }))
}

describe('bloquer un contact', () => {
  it('un blocage réussi ne signale aucune panne réseau', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'contacts.block' }))

    await waitFor(() => expect(network().blockPeer).toHaveBeenCalledWith('c'.repeat(64), true))
    expect(stored()?.relation).toBe('blocked')
    expect(toasts().some((entry) => entry.title === 'contacts.blockNetworkFailed')).toBe(false)
  })

  it('un pare-feu en échec le dit sans annuler le blocage local', async () => {
    network().blockPeer.mockRejectedValueOnce(new Error('pare-feu indisponible'))
    view()

    fireEvent.click(screen.getByRole('button', { name: 'contacts.block' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'contacts.blockNetworkFailed')
      expect(toast?.type).toBe('error')
    })
    expect(stored()?.relation).toBe('blocked')
  })
})

describe('débloquer un contact', () => {
  it('un déblocage réseau en échec le dit après le déblocage local', async () => {
    network().blockPeer.mockRejectedValueOnce(new Error('pare-feu indisponible'))
    view('blocked')

    fireEvent.click(screen.getByRole('button', { name: 'contacts.unblock' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'contacts.unblockNetworkFailed')
      expect(toast?.type).toBe('error')
    })
    expect(stored()?.relation).toBe('contact')
  })
})
