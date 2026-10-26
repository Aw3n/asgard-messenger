import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
import type { Contact } from '@/types'

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

describe('type d’appel dans l’historique', () => {
  it('affiche le libellé traduit, pas l’identifiant brut', () => {
    useCallStore.setState({ history: [missedCall] })
    render(<CallsPage />)

    // `type` vaut 'audio' | 'video' : la classe `capitalize` ne faisait que
    // mettre une majuscule à l'identifiant, resté anglais dans 24 langues.
    expect(screen.getByText('calls.typeVideo')).toBeInTheDocument()
    expect(screen.queryByText('video')).toBeNull()
  })

  it('nomme aussi les appels audio', () => {
    useCallStore.setState({ history: [{ ...missedCall, id: 'call-audio', type: 'audio' }] })
    render(<CallsPage />)

    expect(screen.getByText('calls.typeAudio')).toBeInTheDocument()
    expect(screen.queryByText('audio')).toBeNull()
  })

  it('traduit le type des appels révélés au dépliage', () => {
    const olderAudio: CallRecord = {
      ...missedCall, id: 'call-audio-plus-ancien', type: 'audio', startedAt: Date.now() - 60_000,
    }
    useCallStore.setState({ history: [missedCall, olderAudio] })
    render(<CallsPage />)

    fireEvent.click(screen.getByRole('button', { expanded: false, name: /Camille/ }))

    expect(screen.getAllByText('calls.typeVideo')).toHaveLength(1)
    expect(screen.getByText('calls.typeAudio')).toBeInTheDocument()
  })
})

describe('vidage de l’historique', () => {
  const openConfirm = () => {
    fireEvent.click(screen.getByRole('button', { name: 'calls.clearHistory' }))
    return screen.getByRole('dialog', { name: 'calls.clearHistory' })
  }

  it('demande confirmation et garde la liste avant l’acquiescement', () => {
    useCallStore.setState({ history: [missedCall] })
    render(<CallsPage />)

    const dialog = openConfirm()

    expect(within(dialog).getByText('calls.clearHistoryWarning')).toBeInTheDocument()
    expect(useCallStore.getState().history).toHaveLength(1)
  })

  it('vide la liste après confirmation', async () => {
    useCallStore.setState({ history: [missedCall] })
    render(<CallsPage />)
    const dialog = openConfirm()

    fireEvent.click(within(dialog).getByRole('button', { name: 'calls.clearHistory' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'calls.clearHistory' })).toBeNull())
    expect(useCallStore.getState().history).toHaveLength(0)
  })

  it('annuler garde la liste', async () => {
    useCallStore.setState({ history: [missedCall] })
    render(<CallsPage />)
    openConfirm()

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'calls.clearHistory' })).toBeNull())
    expect(useCallStore.getState().history).toHaveLength(1)
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

    expect(screen.queryByRole('button', { expanded: false })).toBeNull()
    expect(document.querySelector('[aria-expanded]')).toBeNull()
    expect(document.querySelector('.cursor-pointer')).toBeNull()
  })
})

describe('liste des contacts d’appel', () => {
  const alice: Contact = {
    publicKey: 'peer-alice', displayName: 'Alice', status: 'online', relation: 'contact',
    verified: false, addedAt: Date.now(),
  }
  const seedAlice = (status: Contact['status'] = 'online') => {
    useContactStore.setState({ contacts: { [alice.publicKey]: { ...alice, status } } })
  }

  it('nomme chaque bouton d’appel par son contact', () => {
    seedAlice()
    render(<CallsPage />)

    // Deux boutons identiques par contact : sans le nom, un lecteur d'écran
    // annonçait « Appel audio » sans dire à qui.
    expect(screen.getByRole('button', { name: 'calls.audioCall — Alice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'calls.videoCall — Alice' })).toBeInTheDocument()
  })

  it('annonce la présence d’un contact joignable, pas celle d’un contact absent', () => {
    seedAlice('online')
    render(<CallsPage />)

    expect(screen.getByText('common.online')).toBeInTheDocument()

    act(() => seedAlice('offline'))

    expect(screen.queryByText('common.online')).toBeNull()
  })

  it('nomme aussi le rappel par contact dans l’historique', () => {
    useCallStore.setState({ history: [missedCall] })
    render(<CallsPage />)

    expect(screen.getByRole('button', { name: 'calls.audioCall — Camille' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'calls.videoCall — Camille' })).toBeInTheDocument()
  })
})
