/**
 * Les réglages de rendu doivent rejoindre les bulles déjà affichées.
 *
 * Trois interrupteurs de la page Paramètres restaient sans effet : le
 * MessageBubble et le MarkdownRenderer lisaient `useUIStore.getState()` au moment
 * du rendu, valeur figée jusqu'au remontage suivant. Basculer « aperçus de liens »,
 * « emoji automatiques » ou « liens dans les URLs » ne changeait donc rien à
 * l'écran. Ces tests gardent le même arbre monté et retournent le réglage : ce
 * qu'on vérifie est le changement, pas le premier rendu.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MarkdownRenderer } from '@/features/chat/components/MarkdownRenderer'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { useUIStore } from '@/stores/uiStore'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const ME = 'a'.repeat(64)
const URL_DU_MESSAGE = 'https://exemple.org/article'

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderId: ME,
    type: 'text',
    content: `vois ${URL_DU_MESSAGE}`,
    timestamp: 1_700_000_000_000,
    status: 'sent',
    ...overrides,
  }
}

const pristineSettings = useUIStore.getState().settings

beforeEach(() => {
  useUIStore.setState({ settings: pristineSettings })
  Object.assign(window.asgard.app, {
    fetchLinkPreview: vi.fn(async (url: string) => ({ url, title: 'Titre du site', description: null })),
    openExternal: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useUIStore.setState({ settings: pristineSettings })
})

/** Un seul réglage à la fois, par l'API publique du store. */
function setChat(patch: Record<string, boolean>) {
  const chat = useUIStore.getState().settings.chat
  act(() => { useUIStore.getState().updateSettings({ chat: { ...chat, ...patch } }) })
}

function setPrivacy(patch: Record<string, boolean>) {
  const privacy = useUIStore.getState().settings.privacy
  act(() => { useUIStore.getState().updateSettings({ privacy: { ...privacy, ...patch } }) })
}

describe('emoji automatiques', () => {
  it('se convertissent ou non selon le réglage, sur la bulle déjà montée', () => {
    setChat({ autoEmoji: true })
    render(<MarkdownRenderer content="salut :-)" />)
    expect(screen.getByText('salut 🙂')).toBeInTheDocument()

    // Aucun rerender : c'est la souscription au store qui doit faire bouger
    // l'arbre déjà posé.
    setChat({ autoEmoji: false })
    expect(screen.getByText('salut :-)')).toBeInTheDocument()
  })

  it('traversent aussi le texte gras', () => {
    setChat({ autoEmoji: true })
    render(<MarkdownRenderer content="**attention** :D" />)
    expect(screen.getByText('attention')).toBeInTheDocument()
    expect(screen.getByText(/😄/)).toBeInTheDocument()

    setChat({ autoEmoji: false })
    expect(screen.getByText(/:-?D/)).toBeInTheDocument()
  })
})

describe('liens dans les URLs nues', () => {
  it('rendent cliquable une URL seule quand le réglage est pris', () => {
    setChat({ inlinePreviews: true, autoEmoji: false })
    render(<MarkdownRenderer content={`lis ${URL_DU_MESSAGE}`} />)
    expect(screen.getByRole('link', { name: URL_DU_MESSAGE })).toBeInTheDocument()

    setChat({ inlinePreviews: false })
    expect(screen.queryByRole('link', { name: URL_DU_MESSAGE })).toBeNull()
  })
})

describe('aperçus de liens du message', () => {
  it('apparaissent et disparaissent sans démonter la bulle', async () => {
    setPrivacy({ linkPreviews: false })
    render(<MessageBubble message={message()} isOwn />)
    await act(async () => {})
    expect(screen.queryByText('Titre du site')).toBeNull()

    setPrivacy({ linkPreviews: true })
    await act(async () => {})
    expect(screen.getByText('Titre du site')).toBeInTheDocument()

    setPrivacy({ linkPreviews: false })
    await act(async () => {})
    expect(screen.queryByText('Titre du site')).toBeNull()
  })
})

describe('lecture des réglages dans le rendu', () => {
  const source = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

  it('ne se fait plus en coup d’œil non réactif au store', () => {
    expect(source('src/features/chat/components/MessageBubble.tsx'))
      .not.toMatch(/useUIStore\.getState\(\)\.settings/)
    expect(source('src/features/chat/components/MarkdownRenderer.tsx'))
      .not.toMatch(/useUIStore\.getState\(\)\.settings/)
  })

  it('passe par un sélecteur souscrit dans les deux composants', () => {
    expect(source('src/features/chat/components/MessageBubble.tsx'))
      .toMatch(/useUIStore\(\(s\) => s\.settings\.privacy\.linkPreviews\)/)
    const markdown = source('src/features/chat/components/MarkdownRenderer.tsx')
    expect(markdown).toMatch(/useUIStore\(\(s\) => s\.settings\.chat\.autoEmoji\)/)
    expect(markdown).toMatch(/useUIStore\(\(s\) => s\.settings\.chat\.inlinePreviews\)/)
  })
})
