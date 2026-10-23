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

  it('ne montre pas de commutateur sans conversation active', () => {
    useConversationStore.setState({ activeConversationId: null })
    render(<ConversationInfoPanel />)
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
