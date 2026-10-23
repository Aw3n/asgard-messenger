/**
 * Les erreurs ne doivent pas attendre derrière une file de succès : elles
 * vivent dans une zone assertive, le reste dans la zone polie.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastContainer } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(() => {
  cleanup()
  useUIStore.setState({ toasts: [] })
})

describe('annonce des toasts', () => {
  it('isole les erreurs dans la zone assertive et garde le reste en poli', () => {
    useUIStore.setState({
      toasts: [
        { id: 'erreur', type: 'error', title: 'Échec', message: 'Disque plein' },
        { id: 'succes', type: 'success', title: 'Envoyé' },
        { id: 'info', type: 'info', title: 'Nouvelle version' },
      ],
    })
    render(<ToastContainer />)

    const assertive = document.querySelector('[aria-live="assertive"]') as HTMLElement
    const polite = document.querySelector('[aria-live="polite"]') as HTMLElement
    expect(assertive).toHaveAttribute('aria-atomic', 'true')
    expect(within(assertive).getByText('Échec')).toBeInTheDocument()
    expect(within(assertive).getByText('Disque plein')).toBeInTheDocument()
    expect(within(assertive).queryByText('Envoyé')).not.toBeInTheDocument()

    expect(within(polite).getByText('Envoyé')).toBeInTheDocument()
    expect(within(polite).getByText('Nouvelle version')).toBeInTheDocument()
    expect(within(polite).queryByText('Échec')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'toast.dismiss' })).toHaveLength(3)
  })
})
