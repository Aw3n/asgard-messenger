import React from 'react'

/**
 * Icon — pictogrammes de l'interface en SVG vectoriel.
 *
 * Pourquoi pas des émojis : un émoji n'est PAS une icône, c'est un caractère
 * qu'une police doit dessiner. Linux n'impose aucune police émoji — sur la
 * machine de test, `fc-list | grep -ci emoji` renvoie 0 et seules dejavu, lato
 * et ubuntu sont installées. Résultat : à la place du pictogramme, l'utilisateur
 * voit un rectangle « glyphe manquant », et ce uniquement sous Linux, puisque
 * Windows possède Segoe UI Emoji et macOS Apple Color Emoji. Le tracé SVG ne
 * dépend d'aucune police : il rend partout à l'identique, et `currentColor` le
 * fait suivre le thème comme le texte.
 *
 * Ce fichier ne doit contenir aucun émoji : `scripts/check-no-emoji-icons.mjs`
 * le vérifie, ainsi que dans les composants d'interface qui l'utilisent.
 */

/** Tracés 24×24, coup de crayon « trait » : épaisseur constante, coins arrondis.
 * Aucune annotation de type ici : `keyof typeof paths` doit donner la liste
 * exacte des noms, ce qu'un `Record<string, …>` élargirait à `string`. */
const paths = {
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  shield: (
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  ),
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  refresh: (
    <>
      <path d="M23 4v6h-6" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  bot: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="3" />
      <path d="M12 8V4" />
      <circle cx="12" cy="3" r="1" />
      <path d="M8 13v2" />
      <path d="M16 13v2" />
    </>
  ),
  star: (
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  diamond: <polygon points="12 2 22 12 12 22 2 12 12 2" />,
  // Commandes de fenêtre : la barre de titre Linux les dessinait avec « − □ ❐ × ».
  // Le caractère de restauration (U+2750) est un dingbat que les polices de base
  // n'ont pas ; le tracé SVG ne peut pas manquer.
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="4" y="4" width="16" height="16" rx="1.5" />,
  restore: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="1.5" />
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
    </>
  ),
  close: (
    <>
      <path d="M5 5l14 14" />
      <path d="M19 5L5 19" />
    </>
  ),
}

export type IconName = keyof typeof paths

export interface IconProps {
  name: IconName
  /** Côté du carré en pixels (défaut 20). */
  size?: number
  className?: string
  style?: React.CSSProperties
  /** Sans libellé, l'icône est décorative et les lecteurs d'écran l'ignorent. */
  title?: string
}

export const Icon: React.FC<IconProps> = ({ name, size = 20, className, style, title }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={size <= 14 ? 2 : 1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
  >
    {title ? <title>{title}</title> : null}
    {paths[name]}
  </svg>
)

export default Icon
