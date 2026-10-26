/**
 * Panneau latéral : sa croix n'avait pas de nom.
 *
 * Le bouton ne contenait qu'une icône SVG : au lecteur d'écran il s'annonçait
 * « bouton », sans dire qu'il ferme le panneau. Il porte désormais le libellé
 * commun de fermeture, et ce test vérifie aussi que le clic referme bien.
 *
 * Les onglets, eux, masquent leur libellé sous `xl` : jsdom ne calcule pas la
 * CSS, donc l'audit les croyait nommés alors qu'un vrai navigateur ne laissait
 * que l'icône. Le nom doit donc être porté par l'attribut, pas par le texte.
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

describe('onglets du panneau latéral', () => {
  it('porte un nom d’attribut, seul garant quand le libellé est masqué', () => {
    render(<RightPanel />)

    // Sous xl le <span> est display:none : le nom accessible doit venir de
    // aria-label, sinon le bouton ne s'annonce plus que « bouton ».
    for (const name of ['panels.info', 'panels.files', 'panels.links']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-label', name)
    }
  })

  it('n’offre pas d’onglet « membres » dans une conversation à deux', () => {
    render(<RightPanel />)

    // Le panneau ne s'affiche que dans le fil 1:1 (ChatView) : un onglet
    // « membres » y lisait le dernier groupe actif, donc hors sujet.
    expect(screen.queryByRole('button', { name: 'chat.members' })).not.toBeInTheDocument()
  })

  it('annonce l’onglet actif et suit le clic', () => {
    render(<RightPanel />)

    const files = screen.getByRole('button', { name: 'panels.files' })
    expect(files).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(files)

    expect(useUIStore.getState().rightPanelView).toBe('files')
    expect(files).toHaveAttribute('aria-pressed', 'true')
  })
})
