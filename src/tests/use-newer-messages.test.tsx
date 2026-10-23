/**
 * Comblement de la couture laissée sous une page de contexte.
 *
 * Après un saut profond, la page chargée autour de la cible s'arrête avant la
 * fenêtre récente. Le hook ne doit avancer d'une page que lorsque la vue
 * approche du dernier message chargé, puis s'arrêter une fois la couture
 * refermée.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useNewerMessages } from '@/hooks/useNewerMessages'
import type { MessageCursor } from '@/utils/messageGap'
import type { Message } from '@/types'

const SENDER = 'a'.repeat(64)

function makeMessage(number: number): Message {
  return {
    id: `m-${number}`,
    conversationId: 'conv',
    senderId: SENDER,
    type: 'text',
    content: `message ${number}`,
    timestamp: number,
    status: 'delivered',
  }
}

function page(from: number, count: number): Message[] {
  return Array.from({ length: count }, (_, index) => makeMessage(from + index))
}

function cursor(number: number): MessageCursor {
  return { timestamp: number, id: `m-${number}` }
}

interface HookProps {
  dataId: string | undefined
  messages: Message[]
}

function setup(
  loadNewer: (after: MessageCursor, limit: number) => Promise<Message[] | void>,
  initialMessages: Message[],
) {
  return renderHook(
    ({ dataId, messages }: HookProps) => useNewerMessages({
      dataId,
      messages,
      firstItemIndex: 100_000,
      pageSize: 50,
      loadNewer,
    }),
    { initialProps: { dataId: 'conv', messages: initialMessages } },
  )
}

describe('comblement de la couture', () => {
  it('ne charge qu’une page près de la fin puis avance le curseur', async () => {
    const loadNewer = vi.fn(async (after: MessageCursor, limit: number) =>
      page(after.timestamp + 1, limit))
    const initial = page(1, 10)
    const { result, rerender } = setup(loadNewer, initial)

    act(() => result.current.armGap(cursor(10), cursor(200)))
    expect(result.current.gapArmed).toBe(true)

    // La vue est encore loin du dernier message chargé.
    act(() => result.current.onRangeChanged({ endIndex: 0 }))
    expect(loadNewer).not.toHaveBeenCalled()

    act(() => result.current.onRangeChanged({ endIndex: 9 }))
    await waitFor(() => expect(loadNewer).toHaveBeenCalledTimes(1))
    expect(loadNewer).toHaveBeenCalledWith(cursor(10), 50)

    // La page est fusionnée par le parent, puis la vue s'en approche encore.
    rerender({ dataId: 'conv', messages: [...initial, ...page(11, 50)] })
    act(() => result.current.onRangeChanged({ endIndex: 59 }))
    await waitFor(() => expect(loadNewer).toHaveBeenCalledTimes(2))
    expect(loadNewer).toHaveBeenLastCalledWith(cursor(60), 50)
  })

  it('s’arrête quand la page rejoint le dernier message déjà chargé', async () => {
    const loadNewer = vi.fn(async () => page(11, 50))
    const { result } = setup(loadNewer, page(1, 10))

    // La borne est déjà dans la première page : inutile d'aller plus loin.
    act(() => result.current.armGap(cursor(10), cursor(60)))
    act(() => result.current.onRangeChanged({ endIndex: 9 }))
    await waitFor(() => expect(loadNewer).toHaveBeenCalledTimes(1))

    act(() => result.current.onRangeChanged({ endIndex: 0 }))
    expect(result.current.gapArmed).toBe(false)
    act(() => result.current.onRangeChanged({ endIndex: 9 }))
    expect(loadNewer).toHaveBeenCalledTimes(1)
  })

  it('s’arrête aussi sur une page incomplète', async () => {
    const loadNewer = vi.fn(async () => page(11, 5))
    const { result } = setup(loadNewer, page(1, 10))

    act(() => result.current.armGap(cursor(10), cursor(200)))
    act(() => result.current.onRangeChanged({ endIndex: 9 }))
    await waitFor(() => expect(loadNewer).toHaveBeenCalledTimes(1))

    act(() => result.current.onRangeChanged({ endIndex: 0 }))
    expect(result.current.gapArmed).toBe(false)
    act(() => result.current.onRangeChanged({ endIndex: 9 }))
    expect(loadNewer).toHaveBeenCalledTimes(1)
  })

  it('normalise un index absolu qui inclut l’ancrage Virtuoso', async () => {
    const loadNewer = vi.fn(async (after: MessageCursor, limit: number) =>
      page(after.timestamp + 1, limit))
    const { result } = setup(loadNewer, page(1, 10))

    act(() => result.current.armGap(cursor(10), cursor(200)))
    act(() => result.current.onRangeChanged({ endIndex: 100_009 }))

    await waitFor(() => expect(loadNewer).toHaveBeenCalledWith(cursor(10), 50))
  })

  it('abandonne la couture quand le fil change', async () => {
    const loadNewer = vi.fn(async () => page(11, 50))
    const { result, rerender } = setup(loadNewer, page(1, 10))

    act(() => result.current.armGap(cursor(10), cursor(200)))
    rerender({ dataId: 'autre-fil', messages: page(1, 10) })
    expect(result.current.gapArmed).toBe(false)

    act(() => result.current.onRangeChanged({ endIndex: 9 }))
    expect(loadNewer).not.toHaveBeenCalled()
  })
})
