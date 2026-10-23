import { useEffect, useRef, useState, type RefObject } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { useMessageStore } from '@/stores/messageStore'
import { compareMessageCursor, newestMessageCursor, type MessageCursor } from '@/utils/messageGap'
import type { MessageJumpState } from '@/utils/messageJump'
import type { Message } from '@/types'

/** Durée de la mise en évidence : assez pour repérer la bulle, sans rester. */
const HIGHLIGHT_DURATION_MS = 2000

interface UseMessageJumpOptions {
  request: MessageJumpState | null
  /** Fil 1:1 ou canal actuellement affiché. */
  dataId: string | undefined
  messages: Message[]
  firstItemIndex: number
  virtuosoRef: RefObject<VirtuosoHandle>
  /** Résout quand la page la plus récente du fil est chargée. */
  waitForInitialHistory: () => Promise<unknown>
  /** Charge et fusionne une page autour de cette date ; rend la page obtenue. */
  loadContext: (timestamp: number) => Promise<Message[] | void>
  /** Décale l'ancrage Virtuoso du nombre de messages insérés avant la fenêtre. */
  onPrependedMessages: (count: number) => void
  /**
   * Signale la couture entre la page de contexte et la fenêtre récente :
   * des messages restent à charger entre `cursor` et `boundary`.
   */
  onNewerGap?: (cursor: MessageCursor, boundary: MessageCursor) => void
  /** Le suivi du bas doit être coupé avant l'arrivée des messages. */
  onJumpStart?: () => void
}

/**
 * useMessageJump — amène le fil sur un message trouvé par la recherche.
 *
 * Le message peut être trop ancien pour figurer dans la page de démarrage :
 * on charge alors une page de contexte autour de sa date, on corrige l'ancrage
 * Virtuoso, puis on centre la bulle et on la surligne brièvement.
 */
export function useMessageJump({
  request,
  dataId,
  messages,
  firstItemIndex,
  virtuosoRef,
  waitForInitialHistory,
  loadContext,
  onPrependedMessages,
  onNewerGap,
  onJumpStart,
}: UseMessageJumpOptions): string | undefined {
  const [pending, setPending] = useState<MessageJumpState | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | undefined>()
  const consumedRef = useRef<string | null>(null)
  const attemptedRef = useRef<string | null>(null)
  const jumpedRef = useRef<string | null>(null)
  const dataIdRef = useRef(dataId)
  dataIdRef.current = dataId
  // Lu dans requestAnimationFrame : l'ancrage peut avoir été corrigé entre-temps.
  const firstItemIndexRef = useRef(firstItemIndex)
  firstItemIndexRef.current = firstItemIndex
  // Le callback de couture peut changer sans devoir relancer le chargement.
  const onNewerGapRef = useRef(onNewerGap)
  onNewerGapRef.current = onNewerGap

  // Changer de fil abandonne une cible qui appartenait à l'ancien.
  useEffect(() => {
    setPending(null)
    setHighlightedId(undefined)
  }, [dataId])

  // Une cible de navigation n'est adoptée qu'une fois : revenir sur le fil ne
  // doit pas rejouer le saut ni voler le défilement à l'utilisateur.
  useEffect(() => {
    if (!request || !dataId || request.conversationId !== dataId) return
    const key = `${dataId}:${request.messageId}`
    if (consumedRef.current === key) return
    consumedRef.current = key
    setPending(request)
    onJumpStart?.()
  }, [request, dataId, onJumpStart])

  // Rien à charger si le message est déjà dans la fenêtre affichée.
  useEffect(() => {
    if (!pending || !dataId || pending.conversationId !== dataId) return
    const key = `${dataId}:${pending.messageId}`
    const present = useMessageStore.getState().messages[dataId] ?? []
    if (present.some((message) => message.id === pending.messageId)) return
    if (attemptedRef.current === key) return
    attemptedRef.current = key
    const targetDataId = dataId
    const targetMessageId = pending.messageId
    const timestamp = pending.messageTimestamp

    void (async () => {
      await waitForInitialHistory()
      if (dataIdRef.current !== targetDataId) return
      const before = useMessageStore.getState().messages[targetDataId] ?? []
      if (before.some((message) => message.id === targetMessageId)) return
      const beforeIds = new Set(before.map((message) => message.id))
      // Le premier message de la fenêtre déjà chargée borne la couture : au-delà,
      // la page suivante est déjà en mémoire.
      const initialOldest = before[0]
        ? { timestamp: before[0].timestamp, id: before[0].id }
        : null
      const page = await loadContext(timestamp)
      if (dataIdRef.current !== targetDataId) return
      const after = useMessageStore.getState().messages[targetDataId] ?? []
      let added = 0
      for (const message of after) {
        if (!beforeIds.has(message.id)) added++
      }
      if (added > 0) onPrependedMessages(added)
      if (!after.some((message) => message.id === targetMessageId)) {
        setPending(null)
        return
      }
      const contextNewest = Array.isArray(page) ? newestMessageCursor(page) : null
      if (
        contextNewest &&
        initialOldest &&
        compareMessageCursor(contextNewest, initialOldest) < 0
      ) {
        onNewerGapRef.current?.(contextNewest, initialOldest)
      }
    })()
  }, [pending, dataId, waitForInitialHistory, loadContext, onPrependedMessages])

  // Le message est en mémoire : centrer puis surligner, une seule fois.
  useEffect(() => {
    if (!pending || !dataId) return
    const index = messages.findIndex((message) => message.id === pending.messageId)
    if (index < 0) return
    const key = `${dataId}:${pending.messageId}`
    if (jumpedRef.current === key) {
      setPending(null)
      return
    }
    jumpedRef.current = key
    setPending(null)
    setHighlightedId(pending.messageId)
    // L'ancrage peut encore être corrigé par le parent dans le même cycle :
    // l'index se calcule à la frame, pas au moment de l'effet.
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({
        index: firstItemIndexRef.current + index,
        align: 'center',
        behavior: 'auto',
      })
    })
  }, [pending, dataId, messages, virtuosoRef])

  useEffect(() => {
    if (!highlightedId) return
    const timer = setTimeout(() => setHighlightedId(undefined), HIGHLIGHT_DURATION_MS)
    return () => clearTimeout(timer)
  }, [highlightedId])

  return highlightedId
}
