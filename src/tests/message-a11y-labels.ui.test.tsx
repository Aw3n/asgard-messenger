/**
 * Les gestes et états d'une bulle se nomment.
 *
 * Les six réactions rapides n'étaient qu'un émoji : un lecteur d'écran
 * annonçait « bouton », sans dire ce que le clic allait poser. Les accusés de
 * remise (envoi, envoyé, distribué, lu) n'étaient qu'un dessin muet. Les deux
 * sont désormais nommés, dans la langue de l'interface.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import type { Message } from '@/types'

vi.mock('react-i18next', () => {
  const fr: Record<string, string> = {
    'chat.messageActions': 'Actions du message',
    'chat.reactWith': 'Réagir avec {{emoji}}',
    'chat.statusSending': 'Envoi en cours',
    'chat.statusSent': 'Envoyé',
    'chat.statusDelivered': 'Distribué',
    'chat.statusRead': 'Lu',
  }
  return {
    initReactI18next: { type: '3rdParty', init: () => {} },
    useTranslation: () => ({
      t: (key: string, opts?: { emoji?: string }) =>
        (fr[key] ?? key).replace('{{emoji}}', opts?.emoji ?? ''),
    }),
  }
})

const PEER = 'b'.repeat(64)

const message = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  conversationId: 'fil-1',
  senderId: PEER,
  type: 'text',
  content: 'texte',
  timestamp: 1_700_000_000_000,
  status: 'sent',
  ...overrides,
})

const row = () => screen.getByRole('group', { name: 'Actions du message' })

const revealActions = () => fireEvent.focus(row())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('bulle : réactions rapides nommées', () => {
  it('nomme chaque émoji quand la barre apparaît au focus', () => {
    render(<MessageBubble message={message()} isOwn={false} />)
    revealActions()

    for (const emoji of ['👍', '❤️', '😂', '😮', '😢', '🔥']) {
      const button = screen.getByRole('button', { name: `Réagir avec ${emoji}` })
      expect(button.getAttribute('title')).toBe(`Réagir avec ${emoji}`)
    }
  })

  it('transmet l’émoji cliqué à la vue', () => {
    const onReaction = vi.fn()
    render(<MessageBubble message={message()} isOwn={false} onReaction={onReaction} />)
    revealActions()

    fireEvent.click(screen.getByRole('button', { name: 'Réagir avec 🔥' }))
    expect(onReaction).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), '🔥')
  })
})

describe('bulle : accusés de remise nommés', () => {
  const cases: Array<[NonNullable<Message['status']>, string]> = [
    ['sending', 'Envoi en cours'],
    ['sent', 'Envoyé'],
    ['delivered', 'Distribué'],
    ['read', 'Lu'],
  ]

  it.each(cases)('nomme l’état %s', (status, label) => {
    render(<MessageBubble message={message({ status })} isOwn />)
    const icon = screen.getByRole('img', { name: label })
    expect(icon.getAttribute('title')).toBe(label)
  })

  it('ne nomme pas d’accusé sur le message d’un pair', () => {
    render(<MessageBubble message={message({ status: 'read' })} isOwn={false} />)
    expect(screen.queryByRole('img', { name: 'Lu' })).toBeNull()
  })
})
