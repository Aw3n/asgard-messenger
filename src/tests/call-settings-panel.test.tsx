/**
 * Le panneau de réglages ouvert pendant un appel montrait trois boutons branchés
 * sur un `useState` local : la qualité ne changeait rien à l'envoi, les
 * commutateurs micro ne prévenaient personne, et leur état initial venait du
 * code, pas du micro. Il commande maintenant CallService — ces tests rendent la
 * barre, ouvrent le panneau et vérifient que le geste sort du composant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { CallControls } from '@/features/calls/components/CallControls'
import { callService } from '@/services/CallService'
import { useCallStore } from '@/stores/callStore'

async function openPanel() {
  render(<CallControls />)
  // CallButton donne son infobulle au nom accessible : c'est `callSettings` que
  // la barre annonce, pas `settingsLabel`.
  fireEvent.click(screen.getByRole('button', { name: 'calls.callSettings' }))
  await screen.findByRole('group', { name: 'calls.videoQuality' })
  return screen.getByRole('group', { name: 'calls.videoQuality' })
}

const pressedIn = (row: HTMLElement) =>
  within(row).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')

beforeEach(() => {
  useCallStore.setState({ videoQuality: 'auto' })
  // Sortie d'acquisition : les deux traitements demandés sont allumés.
  callService.setNoiseSuppression(true)
  callService.setEchoCancellation(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('panneau de réglages en appel', () => {
  it('offre les quatre paliers et n’en presse qu’un', async () => {
    const row = await openPanel()

    expect(within(row).getAllByRole('button')).toHaveLength(4)
    expect(pressedIn(row)).toHaveLength(1)
    expect(pressedIn(row)[0]).toHaveAccessibleName('calls.qualityAuto')
  })

  it('envoie le choix de qualité au service qui commande l’encodeur', async () => {
    const spy = vi.spyOn(callService, 'setVideoQuality')
    const row = await openPanel()

    fireEvent.click(within(row).getByRole('button', { name: 'calls.qualityHigh' }))

    expect(spy).toHaveBeenCalledWith('high')
    expect(useCallStore.getState().videoQuality).toBe('high')
    expect(pressedIn(row)).toHaveLength(1)
    expect(pressedIn(row)[0]).toHaveAccessibleName('calls.qualityHigh')
  })

  it('peint le micro tel que le service l’a réellement obtenu', async () => {
    callService.setNoiseSuppression(false)

    await openPanel()

    // Le commutateur anti-écho reste allumé : les deux états sont distincts et
    // lus séparément, pas portés par un défaut commun.
    expect(screen.getByRole('switch', { name: 'calls.noiseSuppression' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'calls.echoCancellation' })).toBeChecked()
  })

  it('éteint puis rallume la réduction de bruit sur la piste', async () => {
    const spy = vi.spyOn(callService, 'setNoiseSuppression')
    await openPanel()
    const toggle = screen.getByRole('switch', { name: 'calls.noiseSuppression' })

    fireEvent.click(toggle)

    expect(spy).toHaveBeenCalledWith(false)
    expect(toggle).not.toBeChecked()

    fireEvent.click(toggle)

    expect(spy).toHaveBeenLastCalledWith(true)
    expect(toggle).toBeChecked()
  })

  it('nomme chaque commutateur : sans texte, il serait muet', async () => {
    await openPanel()

    // Un bouton sans libellé n'annonce que « commutateur, éteint » : les deux
    // réglages du micro étaient indiscernables l'un de l'autre.
    expect(screen.getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual([
      'calls.noiseSuppression',
      'calls.echoCancellation',
    ])
  })
})
