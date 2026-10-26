/**
 * Afficher sa clé n'a de sens que si le QR arrive à la dessiner. Une génération
 * ratée laissait un carré vide, indistinguable d'une clé refusée : la modale
 * dit maintenant l'échec et renvoie vers la clé copiable affichée dessous.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/services/ChatService', () => ({
  chatService: { registerContact: vi.fn() },
}))

const toCanvas = vi.hoisted(() => vi.fn())

vi.mock('qrcode', () => ({ default: { toCanvas } }))

import { QRCodeModal } from '@/features/contacts/components/QRCodeModal'
import { useIdentityStore } from '@/stores/identityStore'

const PUBLIC_KEY = 'a'.repeat(64)

function renderModal() {
  return render(
    <MemoryRouter>
      <QRCodeModal onClose={() => {}} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: PUBLIC_KEY, secretKey: 'b'.repeat(64) },
      profile: {
        publicKey: PUBLIC_KEY,
        displayName: 'Moi',
        status: 'online',
        createdAt: 0,
        updatedAt: 0,
      },
    },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  toCanvas.mockReset()
  useIdentityStore.setState({ identity: null })
})

describe('génération du QR code', () => {
  it('dit l’échec au lieu de laisser un carré vide', async () => {
    toCanvas.mockRejectedValueOnce(new Error('générateur indisponible'))

    renderModal()

    expect(await screen.findByRole('status')).toHaveTextContent('contacts.qrFailed')
    expect(screen.getByText('contacts.copyPublicKey')).toBeInTheDocument()
  })

  it('ne dit rien quand le QR est dessiné', async () => {
    toCanvas.mockResolvedValueOnce(undefined)

    renderModal()

    await waitFor(() => expect(toCanvas).toHaveBeenCalled())
    expect(screen.queryByText('contacts.qrFailed')).not.toBeInTheDocument()
  })
})
