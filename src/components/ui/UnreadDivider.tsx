import React from 'react'

/**
 * Trait « Nouveaux messages » posé au-dessus du premier message non lu.
 * Purement visuel : le texte est aussi lu par les lecteurs d'écran via le
 * séparateur, sans annonce live (il ne bouge pas après l'ouverture).
 */
export const UnreadDivider: React.FC<{ label: string }> = ({ label }) => (
  <div
    role="separator"
    aria-label={label}
    className="flex items-center gap-3 px-4 py-2"
    data-testid="unread-divider"
  >
    <span aria-hidden="true" className="h-px flex-1 bg-asgard-glacier/40" />
    <span className="text-xxs font-semibold uppercase tracking-wider text-asgard-glacier">
      {label}
    </span>
    <span aria-hidden="true" className="h-px flex-1 bg-asgard-glacier/40" />
  </div>
)
