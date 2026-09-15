/**
 * Cadre d'une miniature d'image.
 *
 * Les miniatures étaient fabriquées comme des carrés 128×128 par recadrage
 * centré (`drawImage` sur la plus petite dimension de la source). Or une
 * miniature est persistée dans le message et c'est elle que la visionneuse
 * affiche en premier, le temps de relire l'original : un paysage apparaissait
 * amputé de ses deux côtés, un portrait privé du haut et du bas — le « l'image
 * est rognée, elle n'est pas complète » remonté par l'utilisateur. La boîte
 * calculée doit donc contenir le cadre ENTIER, aux proportions de la source.
 */
import { describe, it, expect } from 'vitest'
import { fitWithin, THUMBNAIL_MAX_SIDE } from '@/services/FileService'

/** Le ratio est arrondi à des entiers de pixels : tolérance d'un demi-pixel. */
const ratioOf = (w: number, h: number) => w / h
const near = (a: number, b: number, eps = 0.03) => Math.abs(a - b) <= eps * Math.max(a, b)

describe('fitWithin', () => {
  it('garde le ratio d’un paysage comme celui d’un portrait', () => {
    const landscape = fitWithin(4000, 3000, THUMBNAIL_MAX_SIDE)
    const portrait = fitWithin(3000, 4000, THUMBNAIL_MAX_SIDE)

    expect(near(ratioOf(landscape.w, landscape.h), 4 / 3)).toBe(true)
    expect(near(ratioOf(portrait.w, portrait.h), 3 / 4)).toBe(true)
    // Aucun bord n'est perdu : le plus grand côté touche la limite, l'autre est
    // strictement plus petit — un carré aurait signifié un recadrage.
    expect(Math.max(landscape.w, landscape.h)).toBe(THUMBNAIL_MAX_SIDE)
    expect(landscape.w).not.toBe(landscape.h)
    expect(portrait.w).not.toBe(portrait.h)
  })

  it('ne rogne pas les formats très allongés', () => {
    const pano = fitWithin(6000, 800, THUMBNAIL_MAX_SIDE)
    expect(pano.w).toBe(THUMBNAIL_MAX_SIDE)
    expect(pano.h).toBeGreaterThan(1)
    expect(near(ratioOf(pano.w, pano.h), 6000 / 800)).toBe(true)
  })

  it('n’agrandit pas une source déjà petite', () => {
    const small = fitWithin(64, 48, THUMBNAIL_MAX_SIDE)
    expect(small).toEqual({ w: 64, h: 48 })
  })

  it('reste un canevas valide pour une dimension nulle ou abusive', () => {
    // `canvas.toDataURL` sur une surface de 0 px échoue : la miniature doit
    // toujours être dessinable, quitte à être minuscule.
    expect(fitWithin(0, 500, THUMBNAIL_MAX_SIDE)).toEqual({ w: 1, h: 1 })
    expect(fitWithin(NaN, 500, THUMBNAIL_MAX_SIDE)).toEqual({ w: 1, h: 1 })
    const thin = fitWithin(10_000, 1, THUMBNAIL_MAX_SIDE)
    expect(thin.w).toBeGreaterThan(0)
    expect(thin.h).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(thin.w) && Number.isInteger(thin.h)).toBe(true)
  })
})
