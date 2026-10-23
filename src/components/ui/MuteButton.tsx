import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

interface MuteButtonProps {
  muted: boolean
  onToggle: () => void
}

/**
 * Bouton de sourdine d'en-tête, partagé par le fil 1:1 et les canaux de
 * groupe : sans lui, couper les alertes d'un fil 1:1 demandait de connaître
 * le clic droit de la liste. Le libellé bascule avec l'état, comme le menu.
 */
export const MuteButton: React.FC<MuteButtonProps> = ({ muted, onToggle }) => {
  const { t } = useTranslation()
  const label = t(muted ? 'chat.unmuteConversation' : 'chat.muteConversation')
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      aria-label={label}
      aria-pressed={muted}
      title={label}
      onClick={onToggle}
      className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${
        muted
          ? 'bg-asgard-nordic/30 text-asgard-glacier'
          : 'text-asgard-text-muted hover:bg-asgard-surface-alt hover:text-asgard-text-primary'
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        {muted ? (
          <path d="M20 18.69L7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42v5l-2 2v1h13.73l2 2L21 19.72l-1-1.03zM12 22c1.11 0 2-.89 2-2h-4c0 1.11.89 2 2 2zm6-7.32V11c0-3.08-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.15.03-.29.08-.42.12-.1.03-.2.07-.3.11h-.01c-.01 0-.01 0-.02.01-.23.09-.46.2-.68.31 0 0-.01 0-.01.01L18 14.68z" />
        ) : (
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        )}
      </svg>
    </motion.button>
  )
}
