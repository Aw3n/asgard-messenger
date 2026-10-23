/**
 * Bouton de sourdine d'en-tête.
 *
 * Le fil 1:1 n'exposait la sourdine que par le clic droit de la liste, alors
 * que les canaux de groupe avaient déjà un bouton. Le bouton partagé doit
 * annoncer son état aux lecteurs d'écran, basculer le libellé et rester muet
 * côté action : c'est l'appelant qui écrit dans le store.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MuteButton } from '@/components/ui/MuteButton'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('bouton de sourdine', () => {
  it('bascule le libellé et l’état pressé', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<MuteButton muted={false} onToggle={onToggle} />)

    const active = screen.getByRole('button', { name: 'chat.muteConversation' })
    expect(active).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(active)
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<MuteButton muted onToggle={onToggle} />)

    const silenced = screen.getByRole('button', { name: 'chat.unmuteConversation' })
    expect(silenced).toHaveAttribute('aria-pressed', 'true')
    expect(silenced).toHaveAttribute('title', 'chat.unmuteConversation')
    expect(screen.queryByRole('button', { name: 'chat.muteConversation' })).toBeNull()
  })

  it('annonce l’échéance d’une sourdine temporisée', () => {
    render(<MuteButton muted mutedUntil={Date.now() + 3_600_000} onToggle={() => {}} />)
    const button = screen.getByRole('button', {
      name: 'chat.unmuteConversation · panels.mutedUntil',
    })
    expect(button).toHaveAttribute('title', 'chat.unmuteConversation · panels.mutedUntil')
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })
})
