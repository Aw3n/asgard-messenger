/**
 * Champs partagés : le libellé doit nommer le champ.
 *
 * `Input` rendait un <label> sans `htmlFor` et un <input> sans `id` : sur ses
 * onze champs — nom du canal, nom du groupe, ajout de contact, réglages — un
 * lecteur d'écran n'annonçait qu'une « zone d'édition » vide, et l'erreur
 * posée sous le champ restait muette. Le curseur de taille d'avatar était dans
 * le même cas.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Input } from '@/components/ui/Input'
import { AvatarCropDialog } from '@/components/ui/Avatar'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(() => {
  cleanup()
})

describe('champ de saisie', () => {
  it('nomme le champ par son libellé', () => {
    render(<Input label="Nom du canal" />)

    expect(screen.getByLabelText('Nom du canal')).toBeEnabled()
  })

  it('attend un libellé : sans lui, le champ n’a pas de nom volé', () => {
    render(<Input placeholder="chercher" />)

    expect(screen.queryByLabelText(/.*/)).not.toBeInTheDocument()
  })

  it('annonce l’erreur comme description et signale le champ invalide', () => {
    render(<Input label="Nom du canal" error="Ce nom est déjà pris" hint="Trois lettres minimum" />)

    const field = screen.getByLabelText('Nom du canal')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('Ce nom est déjà pris')
  })

  it('donne le conseil comme description tant que le champ est valide', () => {
    render(<Input label="Nom du canal" hint="Trois lettres minimum" />)

    const field = screen.getByLabelText('Nom du canal')
    expect(field).toHaveAccessibleDescription('Trois lettres minimum')
    expect(field).not.toHaveAttribute('aria-invalid')
  })

  /** Un `id` figé aurait câblé le premier libellé à tous les champs de la
   *  page : c'est exactement le piège que ce test referme. */
  it('donne un identifiant distinct à deux champs de même libellé', () => {
    render(
      <div>
        <Input label="Nom" />
        <Input label="Nom" />
      </div>,
    )

    const fields = screen.getAllByLabelText('Nom')
    expect(fields).toHaveLength(2)
    expect(fields[0].id).toBeTruthy()
    expect(fields[0].id).not.toBe(fields[1].id)
  })

  it('garde l’identifiant demandé par l’appelant', () => {
    render(<Input id="group-name" label="Nom du groupe" />)

    expect(screen.getByLabelText('Nom du groupe')).toHaveAttribute('id', 'group-name')
    expect(document.querySelector('label')?.htmlFor).toBe('group-name')
  })
})

describe('curseur de taille de l’avatar', () => {
  it('est nommé par son libellé', () => {
    render(<AvatarCropDialog imageSrc="data:image/png;base64,AAAA" onCrop={() => {}} onClose={() => {}} />)

    const slider = screen.getByLabelText('avatar.size')
    expect(slider).toHaveAttribute('type', 'range')
  })
})
