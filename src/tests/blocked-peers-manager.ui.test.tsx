/**
 * Pairs bloqués : une lecture ratée se lisait « aucun pair bloqué ».
 *
 * `loadBlockedPeers` avalait son erreur et laissait la liste vide : l'écran
 * affirmait alors qu'aucun pair n'était bloqué, ce qui est faux et rassurant.
 * Le déblocage, lui, restait muet en cas d'échec. Ces tests font parler les
 * deux chemins, et vérifient que le bouton Réessayer recharge vraiment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { BlockedPeersManager } from '@/features/settings/components/BlockedPeersManager'
import { useContactStore } from '@/stores/contactStore'
import { useUIStore } from '@/stores/uiStore'

const PEER = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'
const network = () => window.asgard.network as unknown as Record<string, ReturnType<typeof vi.fn>>
const toasts = () => useUIStore.getState().toasts

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(window.asgard.network, {
    getBlockedPeers: vi.fn().mockResolvedValue([]),
    blockPeer: vi.fn().mockResolvedValue(undefined),
  })
  useContactStore.setState({ contacts: {} })
  useUIStore.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('lire la liste des pairs bloqués', () => {
  it('annonce le chargement au lecteur d’écran', () => {
    network().getBlockedPeers.mockReturnValueOnce(new Promise(() => {}))
    render(<BlockedPeersManager />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('common.loading')
    expect(status.closest('[aria-busy="true"]')).not.toBeNull()
  })

  it('dit l’échec au lieu de prétendre qu’aucun pair n’est bloqué', async () => {
    network().getBlockedPeers.mockRejectedValueOnce(new Error('Hyperbee fermé'))
    render(<BlockedPeersManager />)

    expect(await screen.findByText('settings.blockedPeersLoadFailed')).toBeInTheDocument()
    expect(screen.queryByText('settings.noBlockedPeers')).toBeNull()
    expect(screen.getByRole('button', { name: 'common.retry' })).toBeInTheDocument()
  })

  it('le bouton Réessayer recharge et affiche la liste', async () => {
    network().getBlockedPeers
      .mockRejectedValueOnce(new Error('Hyperbee fermé'))
      .mockResolvedValueOnce([PEER])
    render(<BlockedPeersManager />)

    fireEvent.click(await screen.findByRole('button', { name: 'common.retry' }))

    expect(await screen.findByText(PEER.slice(0, 24) + '…')).toBeInTheDocument()
    expect(network().getBlockedPeers).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('settings.blockedPeersLoadFailed')).toBeNull()
  })

  it('nomme un pair inconnu dans la langue, pas avec un mot anglais en dur', async () => {
    network().getBlockedPeers.mockResolvedValue([PEER])
    render(<BlockedPeersManager />)

    // Aucun contact ne porte cette clé : la rangée doit composer son libellé
    // avec « settings.peer » plutôt que d'écrire « Peer » en dur.
    expect(await screen.findByText(`settings.peer ${PEER.slice(0, 12)}…`)).toBeInTheDocument()
    expect(screen.queryByText(`Peer ${PEER.slice(0, 12)}…`)).toBeNull()
  })
})

describe('débloquer un pair', () => {
  it('un échec garde la rangée et le dit', async () => {
    network().getBlockedPeers.mockResolvedValue([PEER])
    network().blockPeer.mockRejectedValueOnce(new Error('journal en lecture seule'))
    render(<BlockedPeersManager />)

    fireEvent.click(await screen.findByRole('button', { name: 'contacts.unblock' }))

    await waitFor(() => {
      const toast = toasts().find((entry) => entry.title === 'settings.blockedPeersUnblockFailed')
      expect(toast?.type).toBe('error')
    })
    expect(screen.getByRole('button', { name: 'contacts.unblock' })).toBeInTheDocument()
  })

  it('désactive le bouton pendant le déblocage et n’appelle le réseau qu’une fois', async () => {
    network().getBlockedPeers.mockResolvedValue([PEER])
    let release: () => void = () => {}
    network().blockPeer.mockImplementationOnce(
      () => new Promise<void>((resolve) => { release = resolve })
    )
    render(<BlockedPeersManager />)

    const button = await screen.findByRole('button', { name: 'contacts.unblock' })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(network().blockPeer).toHaveBeenCalledTimes(1)

    await act(async () => { release() })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'contacts.unblock' })).toBeNull()
    })
  })

  it('un succès retire la rangée', async () => {
    network().getBlockedPeers.mockResolvedValue([PEER])
    render(<BlockedPeersManager />)

    fireEvent.click(await screen.findByRole('button', { name: 'contacts.unblock' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'contacts.unblock' })).toBeNull()
    })
    expect(network().blockPeer).toHaveBeenCalledWith(PEER, false)
    expect(toasts().some((entry) => entry.title === 'settings.blockedPeersUnblockFailed')).toBe(false)
  })
})
