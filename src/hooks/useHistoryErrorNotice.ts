import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/uiStore'

/**
 * useHistoryErrorNotice — une seule alerte par panne d'historique.
 *
 * Une page qui échoue se retente aux bords suivants de la liste : sans garde,
 * chaque approche empilerait un toast et une seule panne paraîtrait multiple.
 * `resetKey` (le fil ou le canal affiché) rouvre le droit d'alerter : changer
 * de conversation est une nouvelle tentative, pas la même panne qui dure.
 */
export function useHistoryErrorNotice(resetKey?: string): {
  noticeHistoryError: () => void
  historyLoaded: () => void
} {
  const { t } = useTranslation()
  const shownRef = useRef(false)
  // Les vues placent ces callbacks dans les dépendances d'un effet : ils
  // doivent rester stables, sinon l'effet se relance à chaque rendu — et le
  // rechargement demandé relance le rendu.
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    shownRef.current = false
  }, [resetKey])

  const noticeHistoryError = useCallback(() => {
    if (shownRef.current) return
    shownRef.current = true
    useUIStore.getState().addToast({
      type: 'error',
      title: tRef.current('chat.historyLoadFailed'),
      duration: 5000,
    })
  }, [])

  // Une lecture qui réussit rouvre le droit d'alerter sur la panne suivante.
  const historyLoaded = useCallback(() => {
    shownRef.current = false
  }, [])

  return { noticeHistoryError, historyLoaded }
}
