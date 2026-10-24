/**
 * Panneau latéral : sa croix n'avait pas de nom.
 *
 * Le bouton ne contenait qu'une icône SVG : au lecteur d'écran il s'annonçait
 * « bouton », sans dire qu'il ferme le panneau. Il porte désormais le libellé
 * commun de fermeture, et ce test vérifie aussi que le clic referme bien.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RightPanel } from '@/components/panels/RightPanel'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

beforeEach(() => {
  // « search » affiche la barre d'onglets sans monter de panneau qui irait
  // interroger un service : la croix est le seul contrôle à éprouver.
  useUIStore.setState({ rightPanelView: 'search' })
})

afterEach(() => {
  cleanup()
})

describe('fermeture du panneau latéral', () => {
  it('la croix est nommée et referme le panneau', () => {
    render(<RightPanel />)

    const close = screen.getByRole('button', { name: 'common.close' })
    fireEvent.click(close)

    expect(useUIStore.getState().rightPanelView).toBeNull()
  })
})
