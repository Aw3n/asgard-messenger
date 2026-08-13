/**
 * Byte conversion utilities — safe handling of Uint8Array across IPC boundaries.
 *
 * CRITICAL: Electron IPC (structured clone) serializes Uint8Array as plain objects
 * like {0: 48, 1: 48, ...}. Array.from() on such objects returns [] because they
 * lack Symbol.iterator. These helpers handle both real Uint8Arrays and structured-
 * clone artifacts.
 */

/**
 * Convert any Uint8Array-like (real Uint8Array or structured-clone plain object)
 * to a hex string.
 *
 * Handles:
 * - Real Uint8Array (from fresh IPC calls)
 * - Plain object {0: byte, 1: byte, ...} (from structured clone deserialization)
 * - Already-hex strings (pass-through)
 */
export function bytesToHexSafe(input: unknown): string {
  if (typeof input === 'string') return input

  if (input instanceof Uint8Array) {
    return Array.from(input)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // Structured-clone artifact: plain object {0: byte, 1: byte, ..., length?: N}
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    const keys = Object.keys(obj).filter((k) => k !== 'length' && !isNaN(Number(k)))
    if (keys.length > 0) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => Number(obj[k]).toString(16).padStart(2, '0'))
        .join('')
    }
  }

  return ''
}

/**
 * Convert any Uint8Array-like (real Uint8Array or structured-clone plain object)
 * to a proper Uint8Array suitable for TextDecoder, crypto.subtle, etc.
 *
 * CRITICAL: Electron's contextBridge serializes Uint8Array as plain objects
 * {0: byte, 1: byte, ...}. TextDecoder.decode() rejects plain objects.
 * This helper ensures we always have a real Uint8Array.
 */
export function toUint8Array(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input

  if (typeof input === 'string') {
    // Hex string → Uint8Array
    const bytes = new Uint8Array(input.length / 2)
    for (let i = 0; i < input.length; i += 2) {
      bytes[i / 2] = parseInt(input.slice(i, i + 2), 16)
    }
    return bytes
  }

  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    const keys = Object.keys(obj).filter((k) => k !== 'length' && !isNaN(Number(k)))
    if (keys.length > 0) {
      const arr = new Uint8Array(keys.length)
      keys.sort((a, b) => Number(a) - Number(b)).forEach((k, i) => {
        arr[i] = Number(obj[k])
      })
      return arr
    }
  }

  return new Uint8Array(0)
}
