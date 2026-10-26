/**
 * Gras et italique rendaient leur contenu brut : un emoji automatique ou une
 * URL nue placés dedans restaient inertes, alors que le même texte hors
 * emphase était converti. Le contenu traverse désormais le rendu simple —
 * sauf le code, qui doit rester littéral.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownRenderer } from '@/features/chat/components/MarkdownRenderer'
import { useUIStore } from '@/stores/uiStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const pristineSettings = useUIStore.getState().settings

beforeEach(() => {
  useUIStore.setState({
    settings: {
      ...pristineSettings,
      chat: { ...pristineSettings.chat, inlinePreviews: true, autoEmoji: true },
    },
  })
})

afterEach(() => {
  cleanup()
  useUIStore.setState({ settings: pristineSettings })
})

describe('emphase et rendu simple', () => {
  it('convertit les emojis à l’intérieur du gras et de l’italique', () => {
    render(<MarkdownRenderer content="**salut :-)** et *bravo :D*" />)

    expect(screen.getByText('salut 🙂')).toBeInTheDocument()
    expect(screen.getByText('bravo 😄')).toBeInTheDocument()
  })

  it('rend cliquable une URL nue dans le gras', () => {
    render(<MarkdownRenderer content="**https://exemple.org/page**" />)

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://exemple.org/page')
    expect(link.closest('strong')).not.toBeNull()
  })

  it('laisse le code littéral, emoji et URL compris', () => {
    render(<MarkdownRenderer content="`:-) https://exemple.org`" />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(':-) https://exemple.org')).toBeInTheDocument()
  })
})
