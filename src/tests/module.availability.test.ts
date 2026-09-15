import { describe, it, expect } from 'vitest'

describe('Holepunch module availability', () => {
  it('should import hyperswarm', async () => {
    const Hyperswarm = (await import('hyperswarm')).default
    expect(typeof Hyperswarm).toBe('function')
  })

  it('should import hypercore', async () => {
    const Hypercore = (await import('hypercore')).default
    expect(typeof Hypercore).toBe('function')
  })

  it('should import hyperdht', async () => {
    const HyperDHT = (await import('hyperdht')).default
    expect(typeof HyperDHT).toBe('function')
  })

  it('should import corestore', async () => {
    const Corestore = (await import('corestore')).default
    expect(typeof Corestore).toBe('function')
  })

  it('should import hyperbee', async () => {
    const Hyperbee = (await import('hyperbee')).default
    expect(typeof Hyperbee).toBe('function')
  })

  it('should import hyperblobs', async () => {
    const Hyperblobs = (await import('hyperblobs')).default
    expect(typeof Hyperblobs).toBe('function')
  })

  it('should import protomux', async () => {
    const Protomux = (await import('protomux')).default
    expect(typeof Protomux).toBe('function')
  })

  it('should import autobase', async () => {
    const Autobase = (await import('autobase')).default
    expect(typeof Autobase).toBe('function')
  })

  it('should import b4a', async () => {
    const b4a = await import('b4a')
    expect(b4a).toBeDefined()
    expect(typeof b4a.toString).toBe('function')
  })

  it('should import compact-encoding', async () => {
    const compactEncoding = await import('compact-encoding')
    expect(compactEncoding).toBeDefined()
    // compact-encoding exports individual encoders like uint, string, buffer, etc.
    expect(typeof compactEncoding.uint).toBeDefined()
    expect(typeof compactEncoding.string).toBeDefined()
  })

  it('should import noble/ed25519', async () => {
    const ed25519 = await import('@noble/ed25519')
    expect(ed25519).toBeDefined()
    expect(typeof ed25519.utils.randomSecretKey).toBe('function')
  })

  it('should import noble/hashes', async () => {
    const { sha256 } = await import('@noble/hashes/sha2.js')
    expect(typeof sha256).toBe('function')
  })
})
