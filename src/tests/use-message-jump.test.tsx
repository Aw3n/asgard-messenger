/**
 * Saut vers un résultat de recherche profond.
 *
 * Le message peut être absent de la page de démarrage : le hook doit charger
 * son contexte, corriger l'ancrage Virtuoso, centrer la bulle et la surligner
 * sans rejouer le saut aux rendus suivants.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { RefObject } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessageJump } from '@/hooks/useMessageJump'
import { useMessageStore } from '@/stores/messageStore'
import type { MessageCursor } from '@/utils/messageGap'
import type { MessageJumpState } from '@/utils/messageJump'
import type { Message } from '@/types'

const CONVERSATION = 'conv-jump'

function makeMessage(id: string, timestamp: number): Message {
  return {
    id,
    conversationId: CONVERSATION,
    senderId: 'b'.repeat(64),
    type: 'text',
    content: id,
    timestamp,
    status: 'delivered',
  }
}

function makeRef() {
  const scrollToIndex = vi.fn()
  return {
    ref: { current: { scrollToIndex } as unknown as VirtuosoHandle } as RefObject<VirtuosoHandle>,
    scrollToIndex,
  }
}

interface HarnessProps {
  request: MessageJumpState | null
  virtuosoRef: RefObject<VirtuosoHandle>
  loadContext: (timestamp: number) => Promise<Message[] | void>
  waitForInitialHistory: () => Promise<unknown>
  onJumpStart: () => void
  onNewerGap?: (cursor: MessageCursor, boundary: MessageCursor) => void
}

function Harness({ request, virtuosoRef, loadContext, waitForInitialHistory, onJumpStart, onNewerGap }: HarnessProps) {
  const messages = useMessageStore((s) => s.messages[CONVERSATION] ?? [])
  const [firstItemIndex, setFirstItemIndex] = useState(100_000)
  const highlightedId = useMessageJump({
    request,
    dataId: CONVERSATION,
    messages,
    firstItemIndex,
    virtuosoRef,
    waitForInitialHistory,
    loadContext,
    onPrependedMessages: (added) => setFirstItemIndex((index) => index - added),
    onNewerGap,
    onJumpStart,
  })
  return <div data-testid="highlighted">{highlightedId ?? ''}</div>
}

beforeEach(() => {
  useMessageStore.setState({ messages: {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('saut vers un message', () => {
  it('charge le contexte d’un message absent, corrige l’ancrage et le centre', async () => {
    useMessageStore.setState({
      messages: { [CONVERSATION]: [makeMessage('recent-1', 5_000), makeMessage('recent-2', 5_001)] },
    })
    const target = makeMessage('cible', 1_000)
    const contextMessages = [makeMessage('avant', 900), target, makeMessage('apres', 1_100)]
    const loadContext = vi.fn(async () => {
      useMessageStore.getState().addMessages(CONVERSATION, contextMessages)
      return contextMessages
    })
    const onJumpStart = vi.fn()
    const onNewerGap = vi.fn()
    const { ref: virtuosoRef, scrollToIndex } = makeRef()
    const request: MessageJumpState = {
      messageId: target.id,
      messageTimestamp: target.timestamp,
      conversationId: CONVERSATION,
    }

    render(
      <Harness
        request={request}
        virtuosoRef={virtuosoRef}
        loadContext={loadContext}
        waitForInitialHistory={() => Promise.resolve()}
        onJumpStart={onJumpStart}
        onNewerGap={onNewerGap}
      />
    )

    await waitFor(() => expect(screen.getByTestId('highlighted')).toHaveTextContent('cible'))
    expect(loadContext).toHaveBeenCalledWith(1_000)
    expect(onJumpStart).toHaveBeenCalledTimes(1)
    // Le contexte s'arrête bien avant la fenêtre récente : la couture est
    // signalée avec le dernier message chargé et le premier déjà présent.
    expect(onNewerGap).toHaveBeenCalledWith(
      { timestamp: 1_100, id: 'apres' },
      { timestamp: 5_000, id: 'recent-1' },
    )
    // 3 messages insérés devant la fenêtre : l'index Virtuoso recule d'autant,
    // la cible étant le 2e message chargé (index de données 1).
    await waitFor(() => expect(scrollToIndex).toHaveBeenCalledWith({
      index: 100_000 - 3 + 1,
      align: 'center',
      behavior: 'auto',
    }))
  })

  it('centre sans rien charger quand le message est déjà affiché', async () => {
    const target = makeMessage('cible', 1_000)
    useMessageStore.setState({
      messages: {
        [CONVERSATION]: [makeMessage('avant', 900), target, makeMessage('apres', 1_100)],
      },
    })
    const loadContext = vi.fn()
    const onJumpStart = vi.fn()
    const { ref: virtuosoRef, scrollToIndex } = makeRef()

    render(
      <Harness
        request={{ messageId: target.id, messageTimestamp: target.timestamp, conversationId: CONVERSATION }}
        virtuosoRef={virtuosoRef}
        loadContext={loadContext}
        waitForInitialHistory={() => Promise.resolve()}
        onJumpStart={onJumpStart}
      />
    )

    await waitFor(() => expect(screen.getByTestId('highlighted')).toHaveTextContent('cible'))
    expect(loadContext).not.toHaveBeenCalled()
    await waitFor(() => expect(scrollToIndex).toHaveBeenCalledWith({
      index: 100_000 + 1,
      align: 'center',
      behavior: 'auto',
    }))
  })

  it('n’arme pas de couture quand le contexte rejoint la fenêtre récente', async () => {
    useMessageStore.setState({
      messages: { [CONVERSATION]: [makeMessage('recent-1', 5_000)] },
    })
    const target = makeMessage('cible', 1_000)
    const contextMessages = [
      makeMessage('avant', 900),
      target,
      makeMessage('apres', 1_100),
      makeMessage('recent-1', 5_000),
    ]
    const loadContext = vi.fn(async () => {
      useMessageStore.getState().addMessages(CONVERSATION, contextMessages)
      return contextMessages
    })
    const onNewerGap = vi.fn()
    const { ref: virtuosoRef } = makeRef()

    render(
      <Harness
        request={{ messageId: target.id, messageTimestamp: target.timestamp, conversationId: CONVERSATION }}
        virtuosoRef={virtuosoRef}
        loadContext={loadContext}
        waitForInitialHistory={() => Promise.resolve()}
        onJumpStart={vi.fn()}
        onNewerGap={onNewerGap}
      />
    )

    await waitFor(() => expect(screen.getByTestId('highlighted')).toHaveTextContent('cible'))
    expect(onNewerGap).not.toHaveBeenCalled()
  })

  it('ignore une cible qui appartient à un autre fil', async () => {
    useMessageStore.setState({
      messages: { [CONVERSATION]: [makeMessage('recent-1', 5_000)] },
    })
    const loadContext = vi.fn()
    const { ref: virtuosoRef, scrollToIndex } = makeRef()

    render(
      <Harness
        request={{ messageId: 'cible', messageTimestamp: 1_000, conversationId: 'autre-fil' }}
        virtuosoRef={virtuosoRef}
        loadContext={loadContext}
        waitForInitialHistory={() => Promise.resolve()}
        onJumpStart={vi.fn()}
      />
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(loadContext).not.toHaveBeenCalled()
    expect(scrollToIndex).not.toHaveBeenCalled()
    expect(screen.getByTestId('highlighted')).toBeEmptyDOMElement()
  })
})
