import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '@/types'
import {
  compareMessageCursor,
  newestMessageCursor,
  type MessageCursor,
} from '@/utils/messageGap'

/** Nombre de lignes avant la fin chargée qui déclenche la page suivante. */
const PREFETCH_ROWS = 8

interface VirtuosoRange {
  startIndex?: number
  endIndex: number
}

interface UseNewerMessagesOptions {
  /** Fil 1:1 ou canal affiché : changer de fil abandonne la couture. */
  dataId: string | undefined
  messages: Message[]
  firstItemIndex: number
  pageSize: number
  /** Charge la page qui suit ce curseur exact et la fusionne dans le store. */
  loadNewer: (cursor: MessageCursor, limit: number) => Promise<Message[] | void>
}

interface UseNewerMessagesResult {
  /** Une couture reste à combler : le suivi automatique du bas est suspendu. */
  gapArmed: boolean
  /** À appeler après un saut profond : comble depuis ce curseur jusqu'au plus ancien message déjà chargé. */
  armGap: (cursor: MessageCursor, boundary: MessageCursor) => void
  /** À brancher sur `rangeChanged` du Virtuoso. */
  onRangeChanged: (range: VirtuosoRange) => void
}

/**
 * useNewerMessages — comble le trou laissé sous une page de contexte.
 *
 * Un saut profond charge les messages autour de la cible, puis laisse un vide
 * jusqu'à la page récente. Charger tout l'intervalle d'un coup serait coûteux :
 * on n'avance d'une page que lorsque la vue approche du dernier message chargé.
 */
export function useNewerMessages({
  dataId,
  messages,
  firstItemIndex,
  pageSize,
  loadNewer,
}: UseNewerMessagesOptions): UseNewerMessagesResult {
  const [gapArmed, setGapArmed] = useState(false)
  const cursorRef = useRef<MessageCursor | null>(null)
  const boundaryRef = useRef<MessageCursor | null>(null)
  const cursorDataIdRef = useRef<string | undefined>(dataId)
  const loadingRef = useRef(false)
  const dataIdRef = useRef(dataId)
  dataIdRef.current = dataId
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const firstItemIndexRef = useRef(firstItemIndex)
  firstItemIndexRef.current = firstItemIndex
  const pageSizeRef = useRef(pageSize)
  pageSizeRef.current = pageSize
  const loadNewerRef = useRef(loadNewer)
  loadNewerRef.current = loadNewer

  // Un autre fil démarre avec sa propre fenêtre : la couture de l'ancien ne
  // doit ni charger ni continuer à suspendre le suivi du bas.
  useEffect(() => {
    if (cursorDataIdRef.current === dataId) return
    cursorDataIdRef.current = dataId
    cursorRef.current = null
    boundaryRef.current = null
    loadingRef.current = false
    setGapArmed(false)
  }, [dataId])

  const armGap = useCallback((cursor: MessageCursor, boundary: MessageCursor) => {
    // Deux sauts successifs peuvent créer deux tronçons : repartir du curseur
    // le plus ancien évite d'en sauter un. La borne la plus récente gagne.
    if (!cursorRef.current || compareMessageCursor(cursor, cursorRef.current) < 0) {
      cursorRef.current = cursor
    }
    if (!boundaryRef.current || compareMessageCursor(boundary, boundaryRef.current) > 0) {
      boundaryRef.current = boundary
    }
    cursorDataIdRef.current = dataIdRef.current
    setGapArmed(true)
  }, [])

  const onRangeChanged = useCallback((range: VirtuosoRange) => {
    const dataLength = messagesRef.current.length
    if (dataLength === 0) return
    const first = firstItemIndexRef.current
    // Selon la version de Virtuoso, `endIndex` inclut l'ancrage ou non :
    // normaliser avant de le comparer aux données.
    const end = range.endIndex >= first ? range.endIndex - first : range.endIndex
    if (end < 0) return

    const cursor = cursorRef.current
    if (!cursor || cursorDataIdRef.current !== dataIdRef.current) {
      if (gapArmed) setGapArmed(false)
      return
    }
    if (end < dataLength - PREFETCH_ROWS) return
    if (loadingRef.current) return

    loadingRef.current = true
    const limit = pageSizeRef.current
    const requestDataId = dataIdRef.current
    void (async () => {
      try {
        const page = await loadNewerRef.current(cursor, limit)
        if (dataIdRef.current !== requestDataId) return
        const loaded = Array.isArray(page) ? page : []
        const newest = newestMessageCursor(loaded)
        const boundary = boundaryRef.current
        const reachedBoundary =
          boundary != null && newest != null && compareMessageCursor(newest, boundary) >= 0
        if (
          !newest ||
          loaded.length < limit ||
          compareMessageCursor(newest, cursor) <= 0 ||
          reachedBoundary
        ) {
          // Couture comblée (ou plus rien à lire) : la session s'arrête, mais
          // le rendu qui vient d'ajouter la page ne doit pas suivre le bas.
          cursorRef.current = null
          boundaryRef.current = null
          return
        }
        cursorRef.current = newest
      } finally {
        loadingRef.current = false
      }
    })()
  }, [gapArmed])

  return { gapArmed, armGap, onRangeChanged }
}
