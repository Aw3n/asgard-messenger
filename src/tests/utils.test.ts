import { describe, it, expect } from 'vitest'
import { generateId, shortPublicKey, formatPublicKey } from '@/utils/id'
import { formatFileSize } from '@/utils/time'
import { cn } from '@/utils/cn'

describe('ID utilities', () => {
  it('generateId returns a non-empty string', () => {
    const id = generateId()
    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')
  })

  it('generateId returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, generateId))
    expect(ids.size).toBe(100)
  })

  it('shortPublicKey returns correct length', () => {
    const pk = 'a'.repeat(64)
    expect(shortPublicKey(pk)).toHaveLength(8)
    expect(shortPublicKey(pk, 12)).toHaveLength(12)
  })

  it('formatPublicKey truncates long keys', () => {
    const pk = 'abc123def456789012345678901234567890'
    const formatted = formatPublicKey(pk)
    expect(formatted).toContain('...')
    expect(formatted).toHaveLength(15) // 6 + 3 + 6
  })
})

describe('cn utility', () => {
  it('combines class names', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('filters falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })
})

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500.0 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
  })

  it('handles zero', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })
})
