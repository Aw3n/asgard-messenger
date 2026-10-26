/**
 * MessageDeleteConfirm — le dialogue qui sépare la demande de la disparition.
 *
 * Trois modes, trois promesses différentes : la mention « Supprimé » reste chez
 * les autres pour l'un, rien ne subsiste pour le deuxième, le troisième ne
 * retire que la copie de cet appareil. Le texte d'avertissement le dit, et les
 * gestes du dialogue viennent du reste de l'application : Échap (la combinaison
 * réglée, pas une touche en dur) referme sans rien effacer, Tab reste piégé dans
 * le panneau, le focus revient à la rangée qui l'a ouvert.
 */
import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useDialogBehavior } from '@/hooks/useDialogBehavior'
import { useGestureHint } from '@/hooks/useGestureHint'
import {
  DELETE_MODE_LABEL_KEYS,
  DELETE_MODE_WARNING_KEYS,
  type DeleteMode,
} from '@/hooks/useDeleteConfirmation'

interface MessageDeleteConfirmProps {
  mode: DeleteMode
  onCancel: () => void
  onConfirm: () => void
}

export const MessageDeleteConfirm: React.FC<MessageDeleteConfirmProps> = ({ mode, onCancel, onConfirm }) => {
  const { t } = useTranslation()
  const dialogRef = useDialogBehavior<HTMLDivElement>(onCancel)
  // « Annuler » et la touche réglée renvoient au même endroit : le bouton la nomme.
  const cancelGesture = useGestureHint('closeModal', t('common.cancel'))
  const titleId = React.useId()
  const warningId = React.useId()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <motion.div
        ref={dialogRef}
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={warningId}
        tabIndex={-1}
        className="mica-card border border-asgard-border rounded-3xl p-6 w-full max-w-sm mx-4 shadow-modal focus:outline-none"
      >
        <h3 id={titleId} className="text-lg font-semibold text-asgard-text-primary mb-3">
          {t('chat.deleteMessageConfirm')}
        </h3>
        <p id={warningId} className="text-sm text-asgard-text-secondary mb-5">
          {t(DELETE_MODE_WARNING_KEYS[mode])}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            title={cancelGesture.title}
            aria-keyshortcuts={cancelGesture.ariaKeyShortcuts}
            className="px-4 py-2 text-sm text-asgard-text-secondary hover:text-asgard-text-primary transition-colors rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            {t(DELETE_MODE_LABEL_KEYS[mode])}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
