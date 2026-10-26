/**
 * Les trois densités de message doivent se distinguer à l'écran.
 *
 * Le catalogue traduisait « cozy » par le même mot que « comfortable » dans
 * 24 des 25 langues : deux boutons voisins affichaient donc exactement le même
 * libellé, et rien ne permettait de savoir lequel était déjà actif autrement
 * qu'en lisant leur bordure. Les audits ne voyaient rien — les clés existaient,
 * la valeur était simplement la copie de sa voisine. Ce test compare les
 * valeurs du catalogue entre elles, langue par langue.
 */
import { describe, it, expect } from 'vitest'
import { SUPPORTED_LANGUAGES } from '@/i18n/config'
import { translations } from '@/i18n/translations'

type Blocks = Record<string, { translation: Record<string, string> }>
const CATALOG = translations as unknown as Blocks

const DENSITIES = ['comfortable', 'cozy', 'compact'] as const

describe('libellés de densité des messages', () => {
  for (const { code } of SUPPORTED_LANGUAGES) {
    it(`${code} — les trois densités portent trois mots distincts`, () => {
      const block = CATALOG[code]?.translation
      const labels = DENSITIES.map((d) => block?.[`settings.chatDensity_${d}`])
      expect(labels.every((label) => typeof label === 'string' && label.trim().length > 0)).toBe(true)
      expect(new Set(labels).size).toBe(DENSITIES.length)
    })
  }
})
