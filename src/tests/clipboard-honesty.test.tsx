/**
 * Copier : le bouton ne dit « Copié » que si le presse-papiers a pris le texte.
 *
 * `navigator.clipboard.writeText` rejette quand la fenêtre n'a pas le focus ou
 * que la permission est refusée. Les boutons basculaient leur libellé avant la
 * réponse et laissaient le rejet en « unhandled promise rejection ». Ces tests
 * suivent la promesse, pas la couleur du bouton : le refus laisse le libellé
 * d'origine et pose un toast d'erreur ; l'acceptation seule bascule le libellé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShareLinksManager } from '@/features/settings/components/ShareLinksManager'
import { useUIStore } from '@/stores/uiStore'
import { copyMessageText, copyToClipboard } from '@/utils/clipboard'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/services/FileService', () => ({
  fileService: {
    getActiveShareLinks: () => [{
      token: 'tok-1',
      blobKey: 'bafyblobkeyexample00000000',
      createdAt: 1_700_000_000_000,
      expiresAt: Date.now() + 86_400_000,
      accessCount: 1,
      maxAccess: 5,
    }],
    revokeShareLink: vi.fn(),
  },
}))

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
    writable: true,
  })
}

const toasts = () => useUIStore.getState().toasts

beforeEach(() => {
  useUIStore.setState({ toasts: [] })
  stubClipboard(async () => {})
})

afterEach(() => {
  cleanup()
})

describe('copier vers le presse-papiers', () => {
  it('répond vrai quand le presse-papiers a pris le texte', async () => {
    await expect(copyToClipboard('salut')).resolves.toBe(true)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('salut')
  })

  it('répond faux quand le presse-papiers refuse', async () => {
    stubClipboard(async () => { throw new Error('Document is not focused') })
    await expect(copyToClipboard('salut')).resolves.toBe(false)
  })

  it('n’écrit rien pour un message sans texte', () => {
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>
    expect(copyMessageText({ content: '' } as Message)).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('bouton « copier le lien » d’un partage', () => {
  it('garde son libellé et annonce l’échec quand le presse-papiers refuse', async () => {
    stubClipboard(async () => { throw new Error('NotAllowedError') })
    render(<ShareLinksManager />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.copyLink' }))

    await waitFor(() =>
      expect(toasts().some((toast) => toast.type === 'error' && toast.title === 'common.copyFailed')).toBe(true),
    )
    expect(screen.queryByRole('button', { name: 'common.copied' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.copyLink' })).toBeInTheDocument()
  })

  it('ne bascule qu’après l’acceptation, sans toast d’erreur', async () => {
    render(<ShareLinksManager />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.copyLink' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'common.copied' })).toBeInTheDocument())
    expect(toasts().some((toast) => toast.title === 'common.copyFailed')).toBe(false)
  })
})
