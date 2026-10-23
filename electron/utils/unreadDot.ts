/**
 * Point de badge dessiné pour la superposition d'icône de la barre des tâches
 * Windows. Un PNG embarqué serait figé ; le tampon brut permet d'ajuster le
 * diamètre et le liseré antialiasé sans dépendance graphique dans le process
 * principal.
 */
export const UNREAD_DOT_SIZE = 16

/**
 * Peint un disque aux couleurs d'Asgard dans un tampon BGRA prémultiplié,
 * format attendu par `nativeImage.createFromBitmap`. Le dégradé d'un pixel
 * sur le pourtour évite l'escalier à cette taille minuscule.
 */
export function paintUnreadDot(size: number = UNREAD_DOT_SIZE): Buffer {
  const buffer = Buffer.alloc(size * size * 4)
  const center = (size - 1) / 2
  const radius = size * (6.5 / 16)
  const antialias = 0.75
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - center, y - center)
      const coverage = Math.max(0, Math.min(1, radius + antialias - distance))
      if (coverage === 0) continue
      const offset = (y * size + x) * 4
      // #4FC3F7 (asgard-glacier) en BGRA, canaux prémultipliés par l'alpha.
      buffer[offset] = Math.round(0xf7 * coverage)
      buffer[offset + 1] = Math.round(0xc3 * coverage)
      buffer[offset + 2] = Math.round(0x4f * coverage)
      buffer[offset + 3] = Math.round(0xff * coverage)
    }
  }
  return buffer
}
