/**
 * Panneaux « Fichiers » et « Liens ».
 *
 * Les deux lisaient le store via `getMessages()`, une fonction d'identité
 * stable : le sélecteur zustand ne voyait jamais de changement et le panneau
 * restait figé à son contenu d'ouverture. Ils doivent suivre les messages en
 * direct, comme le fil de discussion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import '@/i18n/config'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import { FilesPanel } from '@/components/panels/FilesPanel'
import { LinksPanel } from '@/components/panels/LinksPanel'
import type { Message } from '@/types'

vi.mock('@/features/chat/components/FileAttachment', () => ({
  FileAttachment: ({ attachment }: { attachment: { name: string } }) => (
    <div data-testid="file-attachment">{attachment.name}</div>
  ),
}))

const message = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  conversationId: 'conv-1',
  senderId: 'peer',
  type: 'text',
  content: '',
  timestamp: 1,
  status: 'sent',
  ...over,
})

describe('panneaux Fichiers et Liens', () => {
  beforeEach(() => {
    cleanup()
    useConversationStore.setState({ activeConversationId: 'conv-1' })
    useMessageStore.setState({ messages: {}, loading: {}, hasMore: {}, pending: {} })
  })

  it('affiche une pièce jointe arrivée après le montage', () => {
    render(<FilesPanel />)
    expect(screen.queryByTestId('file-attachment')).toBeNull()

    act(() => {
      useMessageStore.setState({
        messages: {
          'conv-1': [message({
            attachments: [{
              id: 'att-1',
              type: 'document',
              name: 'rapport.pdf',
              size: 10,
              mimeType: 'application/pdf',
            }],
          })],
        },
      })
    })

    expect(screen.getByText('rapport.pdf')).toBeInTheDocument()
  })

  it('affiche un lien arrivé après le montage, sans doublon', () => {
    render(<LinksPanel />)
    expect(screen.queryByText('example.com')).toBeNull()

    act(() => {
      useMessageStore.setState({
        messages: {
          'conv-1': [
            message({ id: 'm1', content: 'voir https://example.com/page', timestamp: 2 }),
            message({ id: 'm2', content: 'encore https://example.com/page', timestamp: 3 }),
          ],
        },
      })
    })

    expect(screen.getAllByText('example.com')).toHaveLength(1)
  })

  it('retire la ponctuation qui suit un lien', () => {
    render(<LinksPanel />)
    act(() => {
      useMessageStore.setState({
        messages: {
          'conv-1': [
            message({ id: 'm1', content: 'voir (https://example.com/page), puis "https://example.com/autre".' }),
          ],
        },
      })
    })

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(hrefs).toContain('https://example.com/page')
    expect(hrefs).toContain('https://example.com/autre')
  })

  it('garde une parenthèse fermante qui appartient au lien', () => {
    render(<LinksPanel />)
    act(() => {
      useMessageStore.setState({
        messages: {
          'conv-1': [message({ content: 'https://en.wikipedia.org/wiki/Foo_(bar)' })],
        },
      })
    })

    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://en.wikipedia.org/wiki/Foo_(bar)',
    )
  })

  it('déduplique un lien répété avec une ponctuation différente', () => {
    render(<LinksPanel />)
    act(() => {
      useMessageStore.setState({
        messages: {
          'conv-1': [
            message({ id: 'm1', content: 'https://example.com/page.', timestamp: 2 }),
            message({ id: 'm2', content: 'https://example.com/page', timestamp: 3 }),
          ],
        },
      })
    })

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('https://example.com/page')
  })
})
