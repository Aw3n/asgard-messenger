import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/uiStore'

/**
 * useHistoryErrorNotice — une seule alerte par panne d'historique, rejouable.
 *
 * Une page qui échoue se retente aux bords suivants de la liste : sans garde,
 * chaque approche empilerait un toast et une seule panne paraîtrait multiple.
 * `resetKey` (le fil ou le canal affiché) rouvre le droit d'alerter : changer
 * de conversation est une nouvelle tentative, pas la même panne qui dure.
 *
 * Le toast passe en cinq secondes et l'écran reste vide : `historyFailed` garde
 * la panne visible et `retryHistory` relance la lecture initiale, portée par
 * `historyRetry` que les vues ajoutent aux dépendances de leur effet d'ouverture.
 */
export function useHistoryErrorNotice(resetKey?: string): {
  noticeHistoryError: () => void
  historyLoaded: () => void
  historyFailed: boolean
  retryHistory: () => void
  historyRetry: number
} {
  const { t } = useTranslation()
  const shownRef = useRef(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  // Les vues placent ces callbacks dans les dépendances d'un effet : ils
  // doivent rester stables, sinon l'effet se relance à chaque rendu — et le
  // rechargement demandé relance le rendu.
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    shownRef.current = false
    // Changer de fil n'est pas la fin de la panne du précédent : la bannière
    // doit suivre le fil affiché, pas l'historique de la session.
    setFailed(false)
  }, [resetKey])

  const noticeHistoryError = useCallback(() => {
    setFailed(true)
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
    setFailed(false)
  }, [])

  const retryHistory = useCallback(() => {
    setFailed(false)
    setRetry((count) => count + 1)
  }, [])

  return {
    noticeHistoryError,
    historyLoaded,
    historyFailed: failed,
    retryHistory,
    historyRetry: retry,
  }
}
