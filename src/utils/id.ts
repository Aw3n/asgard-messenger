/**
 * ID generation utilities
 */

/**
 * Generate a UUID v4 (using crypto.randomUUID when available)
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Generate a short human-readable ID from a public key
 */
export function shortPublicKey(publicKey: string, length = 8): string {
  return publicKey.slice(0, length).toUpperCase()
}

/**
 * Format a public key for display: first 6 + ... + last 6 chars
 */
export function formatPublicKey(publicKey: string): string {
  if (publicKey.length <= 16) return publicKey
  return `${publicKey.slice(0, 6)}...${publicKey.slice(-6)}`
}
