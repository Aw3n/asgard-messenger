/**
 * Les erreurs ne doivent pas attendre derrière une file de succès : elles
 * vivent dans une zone assertive, le reste dans la zone polie.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastContainer } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(() => {
  cleanup()
  for (const toast of useUIStore.getState().toasts) {
    useUIStore.getState().removeToast(toast.id)
  }
  useUIStore.setState({ toasts: [] })
  vi.useRealTimers()
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

  it('suspend l’auto-fermeture au survol et reprend le temps restant', () => {
    vi.useFakeTimers()
    useUIStore.getState().addToast({ type: 'error', title: 'Échec', duration: 1000 })
    render(<ToastContainer />)
    const item = screen.getByText('Échec').closest('.mica-card') as HTMLElement

    act(() => { vi.advanceTimersByTime(600) })
    fireEvent.mouseEnter(item)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(useUIStore.getState().toasts).toHaveLength(1)

    fireEvent.mouseLeave(item)
    act(() => { vi.advanceTimersByTime(399) })
    expect(useUIStore.getState().toasts).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(1) })
    expect(useUIStore.getState().toasts).toHaveLength(0)
  })

  it('suspend aussi pendant l’exploration au clavier', () => {
    vi.useFakeTimers()
    useUIStore.getState().addToast({ type: 'info', title: 'Info', duration: 500 })
    render(<ToastContainer />)
    const dismiss = screen.getByRole('button', { name: 'toast.dismiss' })

    act(() => dismiss.focus())
    act(() => { vi.advanceTimersByTime(2000) })
    expect(useUIStore.getState().toasts).toHaveLength(1)

    act(() => dismiss.blur())
    act(() => { vi.advanceTimersByTime(500) })
    expect(useUIStore.getState().toasts).toHaveLength(0)
  })
})
