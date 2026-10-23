/**
 * Résultat de message : la recherche doit ouvrir le fil sur CE message.
 *
 * L'identifiant et la date voyagent avec la navigation pour que la vue puisse
 * charger le contexte depuis Hyperbee quand le message est trop ancien.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/useSearch', () => {
  const message = (id: string, conversationId: string, timestamp: number) => ({
    id,
    conversationId,
    senderId: 'b'.repeat(64),
    type: 'text',
    content: `ancien ${id}`,
    timestamp,
    status: 'delivered',
  })
  const direct = message('m-direct', 'conv-1', 1_700_000_000_000)
  const channel = message('m-canal', 'chan-1', 1_700_000_100_000)
  const results = [
    { type: 'message', message: direct, highlight: direct.content },
    {
      type: 'message',
      message: channel,
      groupId: 'group-1',
      channelId: 'chan-1',
      sourceLabel: 'Équipe · #général',
      highlight: channel.content,
    },
  ]
  return {
    useSearch: () => ({
      results,
      contactResults: [],
      messageResults: results,
      groupResults: [],
      isSearching: false,
    }),
  }
})

import { SearchModal } from '@/components/search/SearchModal'

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

function LocationProbe() {
  const location = useLocation()
  const state = location.state as {
    messageId?: string
    messageTimestamp?: number
    conversationId?: string
  } | null
  return (
    <div data-testid="location">
      {`${location.pathname}|${state?.conversationId ?? ''}|${state?.messageId ?? ''}|${state?.messageTimestamp ?? ''}`}
    </div>
  )
}

function renderModal() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <SearchModal isOpen onClose={vi.fn()} />
      <LocationProbe />
    </MemoryRouter>
  )
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('recherche : ouvrir un message', () => {
  it('ouvre le fil 1:1 sur le message trouvé', () => {
    renderModal()

    fireEvent.click(screen.getAllByRole('option')[0])

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/conversations/conv-1|conv-1|m-direct|1700000000000`
    )
  })

  it('ouvre le canal de groupe sur le message trouvé', () => {
    renderModal()

    fireEvent.click(screen.getAllByRole('option')[1])

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/groups/group-1/channels/chan-1|chan-1|m-canal|1700000100000`
    )
  })
})
