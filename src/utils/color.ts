/**
 * Convert a hex color string to RGB values.
 * @param hex - Hex color string (e.g., '#4FC3F7' or '4FC3F7')
 * @returns Object with r, g, b values (0-255)
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '')
  
  // Parse hex values
  let r: number, g: number, b: number
  
  if (cleanHex.length === 3) {
    // Short format: #RGB
    r = parseInt(cleanHex[0] + cleanHex[0], 16)
    g = parseInt(cleanHex[1] + cleanHex[1], 16)
    b = parseInt(cleanHex[2] + cleanHex[2], 16)
  } else if (cleanHex.length === 6) {
    // Long format: #RRGGBB
    r = parseInt(cleanHex.slice(0, 2), 16)
    g = parseInt(cleanHex.slice(2, 4), 16)
    b = parseInt(cleanHex.slice(4, 6), 16)
  } else {
    return null
  }
  
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null
  }
  
  return { r, g, b }
}

/**
 * Convert RGB values to a CSS RGB string.
 * @param r - Red (0-255)
 * @param g - Green (0-255)
 * @param b - Blue (0-255)
 * @returns CSS RGB string (e.g., '79 195 247')
 */
export function rgbToCssString(r: number, g: number, b: number): string {
  return `${r} ${g} ${b}`
}

/**
 * Convert a hex color to CSS RGB string format.
 * @param hex - Hex color string (e.g., '#4FC3F7')
 * @returns CSS RGB string (e.g., '79 195 247') or null if invalid
 */
export function hexToCssRgb(hex: string): string | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return rgbToCssString(rgb.r, rgb.g, rgb.b)
}

/**
 * Lighten a hex color by a percentage.
 * @param hex - Hex color string
 * @param percent - Percentage to lighten (0-100)
 * @returns Lightened hex color
 */
export function lightenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  
  const factor = percent / 100
  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * factor))
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * factor))
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * factor))
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Darken a hex color by a percentage.
 * @param hex - Hex color string
 * @param percent - Percentage to darken (0-100)
 * @returns Darkened hex color
 */
export function darkenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  
  const factor = 1 - percent / 100
  const r = Math.max(0, Math.round(rgb.r * factor))
  const g = Math.max(0, Math.round(rgb.g * factor))
  const b = Math.max(0, Math.round(rgb.b * factor))
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Check if a color is dark (low luminance).
 * @param hex - Hex color string
 * @returns True if the color is dark
 */
export function isColorDark(hex: string): boolean {
  const rgb = hexToRgb(hex)
  if (!rgb) return true
  // Calculate luminance using the formula for relative luminance
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b)
  return luminance < 128
}

/**
 * Convert a dark color to a light variant for light mode.
 * Preserves the hue while creating a light, pastel version.
 * @param hex - Hex color string (dark)
 * @returns Light hex color preserving the original hue
 */
export function invertColorForLight(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#f5f5f5'
  
  // Convert to HSL to preserve hue
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  
  // Create light version: keep hue, reduce saturation, high lightness
  const newH = h
  const newS = Math.min(s * 0.6, 0.35)  // Subtle saturation for pastel
  const newL = 0.93  // Very light
  
  // HSL to RGB conversion
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  
  let newR: number, newG: number, newB: number
  if (newS === 0) {
    newR = newG = newB = newL
  } else {
    const q = newL < 0.5 ? newL * (1 + newS) : newL + newS - newL * newS
    const p = 2 * newL - q
    newR = hue2rgb(p, q, newH + 1/3)
    newG = hue2rgb(p, q, newH)
    newB = hue2rgb(p, q, newH - 1/3)
  }
  
  const ri = Math.round(newR * 255)
  const gi = Math.round(newG * 255)
  const bi = Math.round(newB * 255)
  
  return `#${ri.toString(16).padStart(2, '0')}${gi.toString(16).padStart(2, '0')}${bi.toString(16).padStart(2, '0')}`
}
