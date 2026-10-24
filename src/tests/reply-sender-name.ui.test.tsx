/**
 * Une citation nomme son auteur.
 *
 * La bulle et la barre de réponse du composeur affichaient les huit premiers
 * caractères de la clé publique (« bbbbbbbb… ») alors que la vue connaît le nom
 * du contact ou du membre. La clé reste le repli quand aucun nom n'est connu :
 * mieux vaut un repère vrai qu'un « inconnu » inventé.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { MessageInput } from '@/features/chat/components/MessageInput'
import { useConversationStore } from '@/stores/conversationStore'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const PEER = 'b'.repeat(64)

const message = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  conversationId: 'fil-1',
  senderId: PEER,
  type: 'text',
  content: 'texte',
  timestamp: 1_700_000_000_000,
  status: 'sent',
  ...over,
})

const replyTo = { id: 'm0', senderId: PEER, content: 'question initiale', type: 'text' as const }
const quoted = message({ id: 'm0', content: 'question initiale' })

beforeEach(() => {
  useConversationStore.setState({
    conversations: {},
    drafts: {},
    activeConversationId: null,
    filter: {},
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('citations : nom de l’auteur', () => {
  it('affiche le nom résolu par la vue dans la bulle', () => {
    render(
      <MessageBubble
        message={message({ replyTo })}
        isOwn={false}
        senderNameFor={() => 'Alice'}
      />,
    )
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(document.body.textContent).not.toContain('bbbbbbbb…')
  })

  it('retombe sur la clé tronquée quand la vue ne connaît pas l’auteur', () => {
    render(<MessageBubble message={message({ replyTo })} isOwn={false} />)
    expect(screen.getByText('bbbbbbbb…')).toBeTruthy()
  })

  it('nomme aussi l’auteur dans la barre de réponse du composeur', () => {
    render(
      <MessageInput conversationId="fil-1" replyTo={quoted} replyToName="Alice" onSend={vi.fn()} />,
    )
    expect(screen.getByText('messageInput.replyingTo Alice')).toBeTruthy()
  })

  it('garde la clé tronquée dans le composeur sans nom résolu', () => {
    render(<MessageInput conversationId="fil-1" replyTo={quoted} onSend={vi.fn()} />)
    expect(screen.getByText('messageInput.replyingTo bbbbbbbb…')).toBeTruthy()
  })
})
