import { useTranslation } from 'react-i18next'
import { Button } from './Button'

/**
 * Panne de lecture de l'historique : le fil ou le canal paraît vide alors qu'il
 * ne l'est pas. Le toast s'efface, l'écran reste trompeur — la panne doit donc
 * rester affichée, avec de quoi la rejouer sans changer de conversation.
 */
export function HistoryFailureNotice({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
      role="alert"
    >
      <p className="text-sm text-asgard-text-muted">{t('chat.historyLoadFailed')}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  )
}
