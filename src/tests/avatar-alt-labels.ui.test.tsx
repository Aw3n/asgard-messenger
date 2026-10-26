/**
 * Le texte alternatif d'une photo d'avatar est ce qu'un lecteur d'écran
 * annonce. Deux replis anglais (« Avatar », « Member ») échappaient au
 * catalogue : hors du français, ils restaient anglais dans les 25 langues.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { Avatar, GroupAvatar } from '@/components/ui/Avatar'

const SRC = 'data:image/png;base64,AAAA'

afterEach(cleanup)

describe('textes alternatifs d’avatar', () => {
  it('laisse une photo sans nom décorative au lieu d’un mot anglais', () => {
    const { container } = render(<Avatar src={SRC} lazy={false} />)
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
  })

  it('garde le nom réel d’une photo quand il existe', () => {
    const { container } = render(<Avatar src={SRC} name="Alice" lazy={false} />)
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Alice')
  })

  it('nomme une photo de groupe sans nom avec le catalogue', () => {
    const { container } = render(<GroupAvatar src={SRC} />)
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('search.groupFallback')
  })

  it('nomme une vignette de membre sans nom avec le catalogue', () => {
    const { container } = render(<GroupAvatar memberAvatars={[{ src: SRC }]} />)
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('common.member')
  })
})
