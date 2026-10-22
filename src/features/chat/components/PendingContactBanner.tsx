import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { Contact } from '@/types'

interface PendingContactBannerProps {
  contact: Contact
}

/**
 * Bandeau affiché tant que l'ajout n'est pas confirmé.
 *
 * Entrant : le pair nous a ajoutés, il attend notre réponse — répondre dans la
 * conversation vaut acceptation. Sortant : nous avons ajouté sa clé, l'ajout
 * sera confirmé à sa première réponse. Le bandeau disparaît de lui-même : la
 * relation passe à `contact` dans le store, ce composant se re-rend.
 */
export const PendingContactBanner: React.FC<PendingContactBannerProps> = ({ contact }) => {
  const { t } = useTranslation()
  if (contact.relation !== 'pending') return null

  // Une demande sans direction vient d'un pair qui nous a ajoutés (ancienne
  // donnée) : c'est la réponse qui la confirme.
  const incoming = contact.requestDirection !== 'outgoing'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      role="status"
      className="mx-4 mb-2 flex items-start gap-2.5 rounded-xl border border-asgard-away/25 bg-asgard-away/10 px-3 py-2"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 flex-shrink-0 text-asgard-away"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <p className="text-xs leading-relaxed text-asgard-text-secondary">
        {t(incoming ? 'contacts.replyToConfirm' : 'contacts.requestSent')}
      </p>
    </motion.div>
  )
}
