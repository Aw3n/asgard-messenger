/**
 * Liens nus du fil : la ponctuation de la phrase n'appartient pas à l'URL,
 * mais les parenthèses d'un chemin si.
 *
 * Le fil coupait le lien à la première parenthèse (`Foo_(bar)` s'ouvrait sur
 * `Foo_`) parce que sa classe de caractères les excluait toutes pour éviter
 * d'avaler un fermant de prose. Il partage désormais le nettoyage du panneau
 * Liens, qui ne retire un fermant que s'il est orphelin.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownRenderer } from '@/features/chat/components/MarkdownRenderer'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { useUIStore } from '@/stores/uiStore'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const pristineSettings = useUIStore.getState().settings

beforeEach(() => {
  useUIStore.setState({
    settings: {
      ...pristineSettings,
      chat: { ...pristineSettings.chat, inlinePreviews: true, autoEmoji: false },
    },
  })
})

afterEach(() => {
  cleanup()
  useUIStore.setState({ settings: pristineSettings })
})

describe('liens nus du fil', () => {
  it('garde les parenthèses qui appartiennent au chemin', () => {
    render(<MarkdownRenderer content="voir https://en.wikipedia.org/wiki/Foo_(bar)." />)

    const link = screen.getByRole('link')
    expect(link).toHaveTextContent('https://en.wikipedia.org/wiki/Foo_(bar)')
    expect(link).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Foo_(bar)')
  })

  it('laisse la ponctuation de la phrase hors du lien', () => {
    const { container } = render(
      <MarkdownRenderer content="(voir https://exemple.org/page)." />
    )

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://exemple.org/page')
    // Le point et la parenthèse restent visibles, simplement après le lien.
    expect(container.textContent).toBe('(voir https://exemple.org/page).')
  })

  it('retire la virgule et le point-virgule d’une énumération', () => {
    render(<MarkdownRenderer content="https://exemple.org/a, https://exemple.org/b;" />)

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['https://exemple.org/a', 'https://exemple.org/b'])
  })
})

describe('aperçu du message', () => {
  it('demande la page entière, parenthèses comprises', () => {
    const fetchLinkPreview = vi.fn(async (url: string) => ({ url, title: null, description: null }))
    Object.assign(window.asgard.app, { fetchLinkPreview, openExternal: vi.fn() })
    useUIStore.setState({
      settings: {
        ...pristineSettings,
        privacy: { ...pristineSettings.privacy, linkPreviews: true },
      },
    })
    const message: Message = {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'a'.repeat(64),
      type: 'text',
      content: 'voir https://en.wikipedia.org/wiki/Foo_(bar).',
      timestamp: 1_700_000_000_000,
      status: 'sent',
    }

    render(<MessageBubble message={message} isOwn />)

    expect(fetchLinkPreview).toHaveBeenCalledWith('https://en.wikipedia.org/wiki/Foo_(bar)')
  })
})
