/**
 * ConfirmDialog — le panneau rouge qui précède une action irréversible.
 *
 * Il porte les gestes communs aux confirmations posées par une vue : la touche
 * de fermeture réglée, Tab piégé dans le panneau, focus rendu au déclencheur.
 * Les libellés restent des clés de traduction, l'avertissement reçoit `name`.
 */
import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useDialogBehavior } from '@/hooks/useDialogBehavior'
import { useGestureHint } from '@/hooks/useGestureHint'

interface ConfirmDialogProps {
  title: string
  warning: string
  confirmLabel: string
  /** Valeur interpolée dans l'avertissement sous le nom `{{name}}`. */
  name?: string
  onCancel: () => void
  onConfirm: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  warning,
  confirmLabel,
  name,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation()
  const dialogRef = useDialogBehavior<HTMLDivElement>(onCancel)
  const cancelGesture = useGestureHint('closeModal', t('common.cancel'))
  const titleId = React.useId()
  const warningId = React.useId()
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        ref={dialogRef}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={warningId}
        tabIndex={-1}
        className="mica-card border border-asgard-border rounded-2xl p-6 shadow-modal max-w-sm mx-4 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-busy">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </div>
          <div>
            <h3 id={titleId} className="text-sm font-semibold text-asgard-text-primary">{t(title)}</h3>
            <p className="text-xs text-asgard-text-muted">{t('chat.cannotUndo')}</p>
          </div>
        </div>
        <p id={warningId} className="text-sm text-asgard-text-secondary mb-5">
          {t(warning, name === undefined ? undefined : { name })}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            title={cancelGesture.title}
            aria-keyshortcuts={cancelGesture.ariaKeyShortcuts}
            className="px-4 py-2 text-sm rounded-lg text-asgard-text-secondary hover:bg-asgard-surface-alt transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors font-medium"
          >
            {t(confirmLabel)}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
