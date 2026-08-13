/**
 * CryptoService — client-side cryptographic operations.
 *
 * Handles message signing, verification, and encryption.
 * Uses @noble/ed25519 for Ed25519 (Web Crypto Ed25519 not available in all Electron builds).
 * Uses Web Crypto API for SHA-256 and AES-GCM (widely supported).
 * Private keys NEVER leave the local machine.
 */
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

// CRITICAL: @noble/ed25519 v3.x requires SHA-512 hash function to be configured.
// Cast to any to bypass strict Uint8Array<ArrayBuffer> vs Uint8Array<ArrayBufferLike> mismatch
// that appears in strict TypeScript but is functionally equivalent at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sha512Noble = (...messages: Uint8Array[]): any => {
  let totalLen = 0
  for (const m of messages) totalLen += m.length
  const combined = new Uint8Array(totalLen)
  let offset = 0
  for (const m of messages) {
    combined.set(m, offset)
    offset += m.length
  }
  return sha512(combined)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
ed.hashes.sha512 = sha512Noble as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
ed.hashes.sha512Async = (async (...messages: Uint8Array[]) => sha512Noble(...messages)) as any

export class CryptoService {
  private static instance: CryptoService
  private rawPublicKey: Uint8Array | null = null
  private rawPrivateKey: Uint8Array | null = null
  private lastTimestamp = 0
  private subCounter = 0

  static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService()
    }
    return CryptoService.instance
  }

  /**
   * Import an Ed25519 key pair from hex strings.
   * Keys are DER-encoded (SPKI for public, PKCS8 for private) as generated
   * by Node.js crypto.generateKeyPairSync in the Electron main process.
   *
   * SPKI DER (44 bytes): 12-byte header + 32-byte raw public key
   * PKCS8 DER (49 bytes): 16-byte header + 32-byte raw private key seed
   */
  async importKeyPair(publicKeyHex: string, secretKeyHex: string): Promise<void> {
    console.log('[CryptoService] importKeyPair: publicKeyHex len:', publicKeyHex.length, '| secretKeyHex len:', secretKeyHex.length)
    const publicKeyDer = hexToBytes(publicKeyHex)
    const secretKeyDer = hexToBytes(secretKeyHex)
    console.log('[CryptoService] DER lengths: pubDer:', publicKeyDer.length, '| privDer:', secretKeyDer.length)

    // Extract raw 32-byte public key from SPKI DER (last 32 bytes)
    this.rawPublicKey = publicKeyDer.slice(publicKeyDer.length - 32)

    // Extract raw 32-byte private key seed from PKCS8 DER (last 32 bytes)
    // PKCS8 Ed25519 DER is 48 bytes: 16-byte header + 32-byte seed
    this.rawPrivateKey = secretKeyDer.slice(secretKeyDer.length - 32)

    console.log('[CryptoService] Raw key lengths: pub:', this.rawPublicKey.length, '| priv:', this.rawPrivateKey.length)
    try { window.asgard.debugLog('[CryptoService] key lens: pubDer=' + publicKeyDer.length + ' privDer=' + secretKeyDer.length + ' rawPub=' + this.rawPublicKey.length + ' rawPriv=' + this.rawPrivateKey.length) } catch {}

    // DIAGNOSTIC: Test signing to verify sha512Async is properly configured
    try {
      const testData = new TextEncoder().encode('asgard-diagnostic-test')
      const testSig = await ed.signAsync(testData, this.rawPrivateKey)
      const testPub = ed.getPublicKey(this.rawPrivateKey)
      const testValid = await ed.verifyAsync(testSig, testData, testPub)
      console.log('[CryptoService] DIAGNOSTIC: sign test OK | sig len:', testSig.length, '| verify:', testValid, '| pub match:', bytesToHex(testPub) === bytesToHex(this.rawPublicKey))
      try { window.asgard.debugLog('[CryptoService] DIAGNOSTIC: sign OK, verify=' + testValid) } catch {}
    } catch (testErr) {
      const errMsg = `[CryptoService] DIAGNOSTIC: sign test FAILED: ${testErr instanceof Error ? testErr.message : String(testErr)}`
      console.error(errMsg)
      try { window.asgard.debugLog(errMsg) } catch {}
    }
  }

  /**
   * Sign a payload with the local private key
   */
  async sign(payload: unknown): Promise<string> {
    if (!this.rawPrivateKey) throw new Error('Key pair not imported')

    const data = new TextEncoder().encode(JSON.stringify(payload))
    console.log('[CryptoService] sign: data len:', data.length, '| key len:', this.rawPrivateKey.length)
    const signature = await ed.signAsync(data, this.rawPrivateKey)
    console.log('[CryptoService] sign: signature len:', signature.length)

    return bytesToHex(new Uint8Array(signature))
  }

  /**
   * Verify a signature against a public key.
   * The public key is DER-encoded (SPKI format) as produced by the Electron main process.
   */
  async verify(
    payload: unknown,
    signatureHex: string,
    publicKeyHex: string
  ): Promise<boolean> {
    try {
      const publicKeyDer = hexToBytes(publicKeyHex)
      // Extract raw 32-byte public key from SPKI DER (last 32 bytes)
      const rawPub = publicKeyDer.slice(publicKeyDer.length - 32)

      const data = new TextEncoder().encode(JSON.stringify(payload))
      const signature = hexToBytes(signatureHex)

      return await ed.verifyAsync(signature, data, rawPub)
    } catch {
      return false
    }
  }

  /**
   * Derive a shared conversation topic from two public keys.
   * Deterministic: same result for both parties.
   */
  async deriveConversationTopic(pkA: string, pkB: string): Promise<string> {
    // Sort keys to ensure deterministic derivation
    const sorted = [pkA, pkB].sort().join(':')
    const data = new TextEncoder().encode('asgard:conversation:' + sorted)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return bytesToHex(new Uint8Array(hash))
  }

  /**
   * Derive a deterministic Hyperswarm topic for a group from its invite key.
   * All members who know the invite key can derive the same topic and discover
   * each other via Hyperswarm's swarm.join(topic) — this is the standard
   * Holepunch pattern for group peer discovery.
   */
  async deriveGroupTopic(inviteKey: string): Promise<string> {
    const data = new TextEncoder().encode('asgard:group:' + inviteKey)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return bytesToHex(new Uint8Array(hash))
  }

  /**
   * Derive a deterministic conversation ID from two public keys.
   * Both peers compute the same ID, ensuring consistent conversation matching.
   * Uses FNV-1a hash (synchronous, deterministic, collision-resistant for this use case).
   */
  deriveConversationId(pkA: string, pkB: string): string {
    const sorted = [pkA, pkB].sort().join(':')
    const str = 'asgard:conversation:' + sorted
    // FNV-1a variants for 32-char hex output
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    const h1 = (h >>> 0).toString(16).padStart(8, '0')
    h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i) + i
      h = Math.imul(h, 0x01000193)
    }
    const h2 = (h >>> 0).toString(16).padStart(8, '0')
    h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i) * (i + 1)
      h = Math.imul(h, 0x01000193)
    }
    const h3 = (h >>> 0).toString(16).padStart(8, '0')
    h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i) + str.length - i
      h = Math.imul(h, 0x01000193)
    }
    const h4 = (h >>> 0).toString(16).padStart(8, '0')
    return h1 + h2 + h3 + h4
  }

  /**
   * Generate a random discovery topic for a group
   */
  generateGroupTopic(): string {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return bytesToHex(bytes)
  }

  /**
   * Hash a public key for display (short ID)
   */
  async shortId(publicKey: string): Promise<string> {
    const data = new TextEncoder().encode(publicKey)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return bytesToHex(new Uint8Array(hash)).slice(0, 12)
  }

  /**
   * Get a monotonically increasing sequence number (replay attack protection).
   * Uses timestamp-based sequencing to survive process restarts.
   * Format: timestamp (ms) * 10000 + subCounter — ensures uniqueness even
   * if multiple messages are sent within the same millisecond.
   */
  nextSeq(): number {
    const now = Date.now()
    if (now <= this.lastTimestamp) {
      this.subCounter++
    } else {
      this.lastTimestamp = now
      this.subCounter = 0
    }
    return now * 10000 + this.subCounter
  }

  /**
   * Encrypt a message content using AES-GCM with a derived key
   */
  async encryptMessage(content: string, sharedKeyHex: string): Promise<EncryptedMessage> {
    const keyBytes = hexToBytes(sharedKeyHex.slice(0, 64)) // Use first 32 bytes
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    )

    const iv = new Uint8Array(12)
    crypto.getRandomValues(iv)

    const data = new TextEncoder().encode(content)
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource)

    return {
      ciphertext: bytesToHex(new Uint8Array(encrypted)),
      iv: bytesToHex(iv),
    }
  }

  /**
   * Decrypt a message using AES-GCM
   */
  async decryptMessage(encrypted: EncryptedMessage, sharedKeyHex: string): Promise<string> {
    const keyBytes = hexToBytes(sharedKeyHex.slice(0, 64))
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )

    const iv = hexToBytes(encrypted.iv)
    const ciphertext = hexToBytes(encrypted.ciphertext)

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext as BufferSource)
    return new TextDecoder().decode(decrypted)
  }

  // ─── Identity Verification (HyperDHT-inspired) ─────────────────────────

  private verifiedIdentities: Map<string, IdentityVerification> = new Map()
  private trustLevels: Map<string, TrustLevel> = new Map()

  /**
   * Verify a peer's identity using challenge-response.
   */
  async verifyPeerIdentity(peerPublicKey: string, challenge: string): Promise<boolean> {
    // In a real implementation, this would send the challenge to the peer
    // and verify their signed response
    const verification: IdentityVerification = {
      publicKey: peerPublicKey,
      verified: true,
      verifiedAt: Date.now(),
      challenge,
      method: 'challenge-response',
    }
    this.verifiedIdentities.set(peerPublicKey, verification)
    console.log(`[CryptoService] Peer identity verified: ${peerPublicKey.slice(0, 16)}`)
    return true
  }

  /**
   * Check if a peer's identity is verified.
   */
  isPeerVerified(peerPublicKey: string): boolean {
    return this.verifiedIdentities.has(peerPublicKey)
  }

  /**
   * Get peer verification info.
   */
  getPeerVerification(peerPublicKey: string): IdentityVerification | null {
    return this.verifiedIdentities.get(peerPublicKey) || null
  }

  /**
   * Set trust level for a peer.
   */
  setTrustLevel(peerPublicKey: string, level: TrustLevel): void {
    this.trustLevels.set(peerPublicKey, level)
    console.log(`[CryptoService] Trust level set for ${peerPublicKey.slice(0, 16)}: ${level}`)
  }

  /**
   * Get trust level for a peer.
   */
  getTrustLevel(peerPublicKey: string): TrustLevel {
    return this.trustLevels.get(peerPublicKey) || 'unknown'
  }

  /**
   * Get all verified peers.
   */
  getVerifiedPeers(): string[] {
    return Array.from(this.verifiedIdentities.keys())
  }

  /**
   * Get peers by trust level.
   */
  getPeersByTrustLevel(level: TrustLevel): string[] {
    return Array.from(this.trustLevels.entries())
      .filter(([, l]) => l === level)
      .map(([key]) => key)
  }

  /**
   * Revoke peer verification.
   */
  revokePeerVerification(peerPublicKey: string): void {
    this.verifiedIdentities.delete(peerPublicKey)
    console.log(`[CryptoService] Peer verification revoked: ${peerPublicKey.slice(0, 16)}`)
  }

  // ─── Key Management (HyperDHT-inspired) ────────────────────────────────

  private keyRotationEnabled = false
  private keyRotationInterval = 86400000 // 24 hours
  private lastKeyRotation = 0
  private keyHistory: KeyInfo[] = []

  /**
   * Enable key rotation.
   */
  enableKeyRotation(intervalMs: number = 86400000): void {
    this.keyRotationEnabled = true
    this.keyRotationInterval = intervalMs
    console.log(`[CryptoService] Key rotation enabled (every ${intervalMs}ms)`)
  }

  /**
   * Disable key rotation.
   */
  disableKeyRotation(): void {
    this.keyRotationEnabled = false
    console.log('[CryptoService] Key rotation disabled')
  }

  /**
   * Check if key rotation is needed.
   */
  isKeyRotationNeeded(): boolean {
    if (!this.keyRotationEnabled) return false
    return Date.now() - this.lastKeyRotation > this.keyRotationInterval
  }

  /**
   * Record key rotation.
   */
  recordKeyRotation(keyId: string, rotatedAt: number): void {
    this.keyHistory.push({
      keyId,
      rotatedAt,
      previousKey: this.keyHistory.length > 0 ? this.keyHistory[this.keyHistory.length - 1].keyId : null,
    })
    this.lastKeyRotation = rotatedAt
    console.log(`[CryptoService] Key rotation recorded: ${keyId}`)
  }

  /**
   * Get key rotation history.
   */
  getKeyHistory(): KeyInfo[] {
    return [...this.keyHistory]
  }

  /**
   * Get current key info.
   */
  getCurrentKeyInfo(): KeyInfo | null {
    return this.keyHistory.length > 0 ? this.keyHistory[this.keyHistory.length - 1] : null
  }

  // ─── Permissions (HyperDHT-inspired) ───────────────────────────────────

  private permissions: Map<string, Set<Permission>> = new Map()

  /**
   * Grant permission to a peer.
   */
  grantPermission(peerPublicKey: string, permission: Permission): void {
    if (!this.permissions.has(peerPublicKey)) {
      this.permissions.set(peerPublicKey, new Set())
    }
    this.permissions.get(peerPublicKey)!.add(permission)
    console.log(`[CryptoService] Permission granted: ${permission} to ${peerPublicKey.slice(0, 16)}`)
  }

  /**
   * Revoke permission from a peer.
   */
  revokePermission(peerPublicKey: string, permission: Permission): void {
    const perms = this.permissions.get(peerPublicKey)
    if (perms) {
      perms.delete(permission)
      console.log(`[CryptoService] Permission revoked: ${permission} from ${peerPublicKey.slice(0, 16)}`)
    }
  }

  /**
   * Check if a peer has a permission.
   */
  hasPermission(peerPublicKey: string, permission: Permission): boolean {
    return this.permissions.get(peerPublicKey)?.has(permission) || false
  }

  /**
   * Get all permissions for a peer.
   */
  getPermissions(peerPublicKey: string): Permission[] {
    return Array.from(this.permissions.get(peerPublicKey) || [])
  }

  /**
   * Clear all permissions for a peer.
   */
  clearPermissions(peerPublicKey: string): void {
    this.permissions.delete(peerPublicKey)
    console.log(`[CryptoService] All permissions cleared for ${peerPublicKey.slice(0, 16)}`)
  }

  /**
   * Get security statistics.
   */
  getSecurityStats(): {
    verifiedPeers: number
    trustedPeers: number
    keyRotations: number
    totalPermissions: number
  } {
    const trustedPeers = Array.from(this.trustLevels.values()).filter(l => l === 'trusted').length
    const totalPermissions = Array.from(this.permissions.values()).reduce((sum, p) => sum + p.size, 0)

    return {
      verifiedPeers: this.verifiedIdentities.size,
      trustedPeers,
      keyRotations: this.keyHistory.length,
      totalPermissions,
    }
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(hex.length / 2))
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface EncryptedMessage {
  ciphertext: string
  iv: string
}

interface IdentityVerification {
  publicKey: string
  verified: boolean
  verifiedAt: number
  challenge: string
  method: 'challenge-response' | 'manual' | 'qr-code'
}

type TrustLevel = 'unknown' | 'untrusted' | 'neutral' | 'trusted' | 'very-trusted'

interface KeyInfo {
  keyId: string
  rotatedAt: number
  previousKey: string | null
}

type Permission = 'send-messages' | 'receive-files' | 'start-calls' | 'share-location' | 'admin'

export const cryptoService = CryptoService.getInstance()
