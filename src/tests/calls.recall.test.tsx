import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/services/CallService', () => ({
  callService: { startCall: vi.fn(), startGroupCall: vi.fn() },
}))

import { CallsPage } from '@/features/calls/CallsPage'
import { callService } from '@/services/CallService'
import { useCallStore, type CallRecord } from '@/stores/callStore'
import { useContactStore } from '@/stores/contactStore'

const missedCall: CallRecord = {
  id: 'call-manque', peerId: 'peer-manque', peerName: 'Camille', type: 'video',
  status: 'ended', direction: 'incoming', startedAt: Date.now(), missed: true,
}

const groupCall: CallRecord = {
  id: 'call-groupe', peerId: 'groupe-1', peerName: 'Les amis', type: 'video',
  status: 'ended', direction: 'outgoing', startedAt: Date.now(), missed: false,
  isGroupCall: true, groupId: 'groupe-1', groupName: 'Les amis',
  participants: ['pair-a', 'pair-b'],
}

// jsdom n'implémente pas IntersectionObserver, utilisé par l'avatar paresseux.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  // La page interroge le réseau au montage et s'abonne aux événements de
  // groupe : le stub de setup.ts ne couvre pas ces canaux.
  Object.assign(window.asgard.network, {
    getConnectingCount: vi.fn().mockResolvedValue(0),
    getConnectedPeersInfo: vi.fn().mockResolvedValue(new Map()),
    getServerAddress: vi.fn().mockResolvedValue(null),
    onPeerBanned: vi.fn().mockReturnValue(() => {}),
  })
  Object.assign(window.asgard.storage, {
    onGroupActive: vi.fn(),
    onGroupActiveEvent: vi.fn().mockReturnValue(() => {}),
  })
  useContactStore.setState({ contacts: {} })
  useCallStore.setState({ history: [] })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('rappel depuis l’historique des appels', () => {
  it('propose de rappeler un appel manqué et relance en 1:1', () => {
    useCallStore.setState({ history: [missedCall] })
    render(<CallsPage />)

    fireEvent.click(screen.getByTitle('calls.audioCall'))
    expect(callService.startCall).toHaveBeenCalledWith('peer-manque', 'Camille', 'audio', undefined)
  })

  it('reforme un appel de groupe quand ses participants sont connus', () => {
    useCallStore.setState({ history: [groupCall] })
    render(<CallsPage />)

    fireEvent.click(screen.getByTitle('calls.videoCall'))
    expect(callService.startGroupCall).toHaveBeenCalledWith('groupe-1', 'Les amis', ['pair-a', 'pair-b'], 'video')
  })

  it('masque le rappel d’un appel de groupe sans participants connus', () => {
    useCallStore.setState({ history: [{ ...groupCall, id: 'call-groupe-2', participants: undefined }] })
    render(<CallsPage />)

    expect(screen.queryByTitle('calls.audioCall')).toBeNull()
    expect(screen.queryByTitle('calls.videoCall')).toBeNull()
  })
})

describe('rangée d’historique dépliable', () => {
  const olderCall: CallRecord = { ...missedCall, id: 'call-plus-ancien', startedAt: Date.now() - 60_000 }

  it('s’ouvre au clic d’un bouton et annonce son état', () => {
    useCallStore.setState({ history: [missedCall, olderCall] })
    render(<CallsPage />)

    const row = screen.getByRole('button', { expanded: false, name: /Camille/ })
    expect(row).toHaveAttribute('tabindex', '0')
    const regionId = row.getAttribute('aria-controls')
    expect(regionId).toBeTruthy()

    fireEvent.click(row)

    expect(screen.getByRole('button', { expanded: true, name: /Camille/ })).toBe(row)
    expect(document.getElementById(regionId!)).not.toBeNull()

    fireEvent.keyDown(row, { key: 'Enter' })
    expect(screen.getByRole('button', { expanded: false, name: /Camille/ })).toBe(row)
    expect(document.getElementById(regionId!)).toBeNull()

    fireEvent.keyDown(row, { key: ' ' })
    expect(screen.getByRole('button', { expanded: true, name: /Camille/ })).toBe(row)
  })

  it('un appel unique ne se présente pas comme dépliable', () => {
    useCallStore.setState({ history: [missedCall] })
    render(<CallsPage />)

    expect(screen.queryByRole('button', { name: /Camille/ })).toBeNull()
    expect(document.querySelector('[aria-expanded]')).toBeNull()
    expect(document.querySelector('.cursor-pointer')).toBeNull()
  })
})
