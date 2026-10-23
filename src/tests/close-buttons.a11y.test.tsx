/**
 * Les boutons de fermeture réduits à une icône n’avaient aucun nom accessible :
 * un lecteur d’écran annonçait « bouton » sans dire ce qu’il fait. Chaque
 * panneau nomme désormais le sien, et le commutateur de diffusion s’annonce
 * comme un interrupteur avec son état.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrashManager } from '@/features/settings/components/TrashManager'
import { DownloadHistory } from '@/features/settings/components/DownloadHistory'
import { FileTransferManager } from '@/features/settings/components/FileTransferManager'
import { ShareLinksManager } from '@/features/settings/components/ShareLinksManager'
import { BlockedPeersManager } from '@/features/settings/components/BlockedPeersManager'
import { FavoritesManager } from '@/features/settings/components/FavoritesManager'
import { GroupSettings } from '@/features/groups/components/GroupSettings'
import { CallControls } from '@/features/calls/components/CallControls'
import { ModalContainer } from '@/components/modals/ModalContainer'
import { useUIStore } from '@/stores/uiStore'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useConversationStore } from '@/stores/conversationStore'
import type { Conversation, Group } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const GROUP_ID = 'groupe-abcdef123456'
const OWNER = 'a'.repeat(64)

const group: Group = {
  id: GROUP_ID,
  name: 'Équipe',
  members: [],
  channels: [],
  createdAt: 1,
  ownerId: OWNER,
  isPublic: false,
  maxMembers: 100,
}

const conversation: Conversation = {
  id: GROUP_ID,
  type: 'group',
  groupId: GROUP_ID,
  unreadCount: 0,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  broadcastMode: false,
}

const closeButton = (): HTMLElement =>
  screen.getByRole('button', { name: 'common.close' })

beforeEach(() => {
  Object.assign(window.asgard.network, { getBlockedPeers: vi.fn().mockResolvedValue([]) })
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useUIStore.setState({ modal: { type: null } })
})

describe('boutons de fermeture nommés', () => {
  it('corbeille', () => {
    const onClose = vi.fn()
    render(<TrashManager onClose={onClose} />)
    fireEvent.click(closeButton())
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'common.close' })).toHaveAttribute('title', 'common.close')
  })

  it('historique des téléchargements', () => {
    render(<DownloadHistory onClose={() => {}} />)
    expect(closeButton()).toHaveAttribute('title', 'common.close')
  })

  it('gestionnaire des transferts', () => {
    render(<FileTransferManager onClose={() => {}} />)
    expect(closeButton()).toHaveAttribute('title', 'common.close')
  })

  it('liens de partage', () => {
    render(<ShareLinksManager onClose={() => {}} />)
    expect(closeButton()).toHaveAttribute('title', 'common.close')
  })

  it('pairs bloqués', async () => {
    render(<BlockedPeersManager onClose={() => {}} />)
    expect(closeButton()).toHaveAttribute('title', 'common.close')
    await waitFor(() => expect(screen.getByText('settings.noBlockedPeers')).toBeInTheDocument())
  })

  it('fichiers favoris', () => {
    render(<FavoritesManager onClose={() => {}} />)
    expect(closeButton()).toHaveAttribute('title', 'common.close')
  })

  it('boîte de dialogue d’ajout de contact', () => {
    useUIStore.setState({ modal: { type: 'addContact' } })
    render(
      <MemoryRouter>
        <ModalContainer />
      </MemoryRouter>,
    )
    expect(closeButton()).toHaveAttribute('title', 'common.close')
  })

  it('réglages de groupe', () => {
    useGroupStore.setState({ groups: { [GROUP_ID]: group }, activeGroupId: GROUP_ID })
    useIdentityStore.setState({
      identity: {
        keyPair: { publicKey: OWNER, secretKey: 'b'.repeat(128) },
        profile: { publicKey: OWNER, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
      },
      isSetup: true,
    })
    useConversationStore.setState({ conversations: { [GROUP_ID]: conversation } })

    render(<GroupSettings onClose={() => {}} />)
    expect(closeButton()).toHaveAttribute('title', 'common.close')

    const toggle = screen.getByRole('switch', { name: 'groups.broadcastMode' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(screen.getByRole('switch', { name: 'groups.broadcastMode' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('panneau des réglages d’appel', () => {
  it('nomme sa fermeture et la referme', async () => {
    render(<CallControls />)
    fireEvent.click(screen.getByRole('button', { name: 'calls.callSettings' }))
    const close = closeButton()
    expect(close).toHaveAttribute('title', 'common.close')

    fireEvent.click(close)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument(),
    )
  })
})
