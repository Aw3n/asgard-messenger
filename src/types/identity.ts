/**
 * Identity types — local cryptographic identity and user profile
 */

export type UserStatus = 'online' | 'away' | 'busy' | 'offline' | 'invisible' | 'dnd'

export interface UserProfile {
  /** Unique public key (hex) used as user ID */
  publicKey: string
  /** Display name chosen by the user */
  displayName: string
  /** Current presence status */
  status: UserStatus
  /** Optional avatar (base64 data URL or blob key) */
  avatar?: string
  /** Optional bio/about text */
  about?: string
  /** Custom status message (e.g., "In a meeting", "On vacation") */
  customStatus?: string
  /** Account creation timestamp */
  createdAt: number
  /** Last profile update timestamp */
  updatedAt: number
}

export interface KeyPair {
  /** Ed25519 public key (hex) */
  publicKey: string
  /** Ed25519 secret key (hex) — NEVER transmitted */
  secretKey: string
}

export interface LocalIdentity {
  keyPair: KeyPair
  profile: UserProfile
}

export interface ContactIdentity {
  publicKey: string
  displayName: string
  avatar?: string
  status: UserStatus
  /** Whether this identity has been cryptographically verified */
  verified: boolean
  /** Timestamp of last seen */
  lastSeen?: number
}
