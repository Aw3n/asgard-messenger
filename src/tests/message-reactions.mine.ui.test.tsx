/**
 * Les réactions de l'utilisateur se distinguent des autres.
 *
 * La pastille ne portait aucune marque : cliquer sur une réaction déjà posée
 * la retirait pourtant côté service. La vue reçoit donc la clé courante,
 * colore la pastille et l'annonce comme enfoncée au lecteur d'écran.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const ME = 'a'.repeat(64)
const PEER = 'b'.repeat(64)

const reacted = (users: string[]): Message => ({
  id: 'm1',
  conversationId: 'fil-1',
  senderId: PEER,
  type: 'text',
  content: 'texte',
  timestamp: 1_700_000_000_000,
  status: 'sent',
  reactions: [{ emoji: '👍', users, count: users.length }],
})

const chip = () => screen.getByRole('button', { name: /👍/ })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('réactions : la mienne se voit', () => {
  it('marque la pastille à laquelle j’ai participé', () => {
    render(<MessageBubble message={reacted([PEER, ME])} isOwn={false} ownSenderId={ME} />)
    expect(chip().getAttribute('aria-pressed')).toBe('true')
    expect(chip().className).toContain('asgard-glacier/15')
  })

  it('laisse les autres pastilles neutres', () => {
    render(<MessageBubble message={reacted([PEER])} isOwn={false} ownSenderId={ME} />)
    expect(chip().getAttribute('aria-pressed')).toBe('false')
    expect(chip().className).toContain('asgard-surface-alt')
  })

  it('reste neutre quand la vue ne fournit pas la clé courante', () => {
    render(<MessageBubble message={reacted([ME])} isOwn={false} />)
    expect(chip().getAttribute('aria-pressed')).toBe('false')
  })
})
