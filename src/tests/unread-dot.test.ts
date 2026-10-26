/**
 * Pastille de non-lus de la barre des tâches.
 *
 * Windows n'accepte que des images natives : le point est peint en mémoire au
 * format BGRA prémultiplié attendu par Electron. Un centre opaque aux couleurs
 * glacier, des coins transparents et un pourtour antialiasé sont ce qui rend
 * la pastille lisible à 16 px sur fond clair comme sombre.
 */
import { describe, it, expect } from 'vitest'
import { paintUnreadDot, UNREAD_DOT_SIZE } from '../../electron/utils/unreadDot'

const pixel = (buffer: Buffer, size: number, x: number, y: number) => {
  const offset = (y * size + x) * 4
  return {
    b: buffer[offset],
    g: buffer[offset + 1],
    r: buffer[offset + 2],
    a: buffer[offset + 3],
  }
}

describe('pastille de non-lus', () => {
  it('peint un disque glacier opaque au centre, transparent aux coins', () => {
    const size = UNREAD_DOT_SIZE
    const buffer = paintUnreadDot()

    expect(buffer).toHaveLength(size * size * 4)
    expect(pixel(buffer, size, 8, 8)).toEqual({ b: 0xf7, g: 0xc3, r: 0x4f, a: 0xff })
    expect(pixel(buffer, size, 0, 0).a).toBe(0)
    expect(pixel(buffer, size, size - 1, 0).a).toBe(0)
    expect(pixel(buffer, size, 0, size - 1).a).toBe(0)
  })

  it('garde un pourtour antialiasé', () => {
    const size = UNREAD_DOT_SIZE
    const buffer = paintUnreadDot()
    let partial = 0
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const { a } = pixel(buffer, size, x, y)
        if (a > 0 && a < 255) partial += 1
      }
    }
    expect(partial).toBeGreaterThan(0)
  })

  it('s’adapte à une autre taille', () => {
    const buffer = paintUnreadDot(8)
    expect(buffer).toHaveLength(8 * 8 * 4)
    expect(pixel(buffer, 8, 4, 4).a).toBe(0xff)
    expect(pixel(buffer, 8, 0, 0).a).toBe(0)
  })
})
