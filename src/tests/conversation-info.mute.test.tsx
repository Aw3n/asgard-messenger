/**
 * Sourdine d'une conversation 1:1 depuis le panneau d'information.
 *
 * Le store savait mémoriser `muted` et ChatService savait le lire, mais aucun
 * contrôle ne permettait de le changer. Le commutateur doit basculer l'état
 * et se réafficher immédiatement (abonnement à la table des conversations).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@/i18n/config'
import { ConversationInfoPanel } from '@/components/panels/ConversationInfoPanel'
import { useConversationStore } from '@/stores/conversationStore'
import { useContactStore } from '@/stores/contactStore'
import { getCurrentLanguage } from '@/i18n/config'
import type { Conversation } from '@/types'

vi.mock('@/components/ui/Avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}))

const PEER = 'b'.repeat(64)

const direct: Conversation = {
  id: 'conv-mute',
  type: 'direct',
  participantId: PEER,
  unreadCount: 0,
  muted: false,
  pinned: false,
  archived: false,
  createdAt: 1,
  updatedAt: 2,
}

describe('sourdine dans le panneau de conversation', () => {
  beforeEach(() => {
    cleanup()
    useContactStore.setState({ contacts: {} })
    useConversationStore.setState({
      conversations: { [direct.id]: { ...direct } },
      activeConversationId: direct.id,
      chatViewVisible: true,
    })
  })

  it('coupe puis rétablit le son, en suivant l’état affiché', () => {
    render(<ConversationInfoPanel />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)
    expect(useConversationStore.getState().conversations[direct.id].muted).toBe(true)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('switch'))
    expect(useConversationStore.getState().conversations[direct.id].muted).toBe(false)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('affiche l’échéance d’une sourdine temporisée', () => {
    const until = Date.now() + 60 * 60 * 1000
    useConversationStore.setState({
      conversations: { [direct.id]: { ...direct, muted: true, mutedUntil: until } },
    })
    render(<ConversationInfoPanel />)
    const formatted = new Date(until).toLocaleString(getCurrentLanguage(), {
      dateStyle: 'short',
      timeStyle: 'short',
    })
    const expiry = screen.getByText(`Sourdine jusqu’à ${formatted}`)
    expect(expiry).toHaveAttribute('id', 'conversation-mute-expiry')
    expect(screen.getByRole('switch')).toHaveAttribute(
      'aria-describedby',
      'conversation-mute-expiry'
    )
  })

  it('n’affiche pas d’échéance pour une sourdine permanente', () => {
    useConversationStore.setState({
      conversations: { [direct.id]: { ...direct, muted: true } },
    })
    render(<ConversationInfoPanel />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByText(/Sourdine jusqu’à/)).toBeNull()
    expect(screen.getByRole('switch')).not.toHaveAttribute('aria-describedby')
  })

  it('ne montre pas de commutateur sans conversation active', () => {
    useConversationStore.setState({ activeConversationId: null })
    render(<ConversationInfoPanel />)
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
