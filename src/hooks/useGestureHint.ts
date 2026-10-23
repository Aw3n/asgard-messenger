/**
 * Un bouton qui fait la même chose qu'une combinaison réglée doit le dire.
 *
 * Les quinze gestes sont listés à l'écran « Raccourcis », mais la moitié d'entre
 * eux ont aussi un clic qui fait pareil : ouvrir les réglages, escamoter le
 * panneau de liste, envoyer le message. Ce clic-là ne disait rien, et une touche
 * changée dans les réglages restait invisible là où l'on clique. L'indice vient
 * donc du réglage, au présent : survol et lecteur d'écran entendent la
 * combinaison réellement lue par l'écouteur, pas celle du lancement.
 */

import { useUIStore } from '@/stores/uiStore'
import { formatCombo, toAriaKeyShortcuts, type ShortcutName } from '@/utils/shortcuts'

export interface GestureHint {
  /** La combinaison telle qu'elle est écrite dans le réglage (`''` = geste éteint). */
  combo: string
  /** La combinaison telle que l'œil la lit, `null` quand le geste ne parle pas ici. */
  shown: string | null
  /** Ce que l'infobulle native prononce, libellé de l'action en tête. */
  title: string
  /** Attribut ARIA, dans le vocabulaire que réclament les lecteurs d'écran. */
  ariaKeyShortcuts?: string
}

/**
 * @param label Le nom de l'action, tel que le bouton le prononce déjà.
 * @param when Un geste qui n'agit pas toujours — « Entrée » envoie seulement
 *             quand la bascule du composeur l'y autorise — ne s'annonce que
 *             quand il agit.
 */
export function useGestureHint(
  name: ShortcutName,
  label: string,
  when?: (combo: string) => boolean,
): GestureHint {
  const combo = useUIStore((s) => s.settings.keyboardShortcuts[name])
  const shown = when && !when(combo) ? null : formatCombo(combo)
  return {
    combo,
    shown,
    title: shown ? `${label} — ${shown}` : label,
    ...(shown ? { ariaKeyShortcuts: toAriaKeyShortcuts(combo) } : {}),
  }
}
