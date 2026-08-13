/**
 * Contact types
 */

import type { UserStatus } from './identity'

export type ContactRelation = 'contact' | 'blocked' | 'pending' | 'favorite'

export interface Contact {
  /** Contact's public key (primary ID) */
  publicKey: string
  /** Display name (user's custom label or the contact's own name) */
  displayName: string
  /** Contact's self-reported display name */
  remoteName?: string
  /** Avatar (base64 or blob key) */
  avatar?: string
  /** Current status */
  status: UserStatus
  /** Custom status message (e.g., "In a meeting") */
  customStatus?: string
  /** Relationship type */
  relation: ContactRelation
  /** Whether the contact's identity has been verified */
  verified: boolean
  /** Custom note about this contact */
  note?: string
  /** When this contact was added */
  addedAt: number
  /** Last seen timestamp */
  lastSeen?: number
  /** Last message excerpt for display */
  lastMessage?: string
  /** Whether we have an active conversation */
  conversationId?: string
}

export interface ContactInvite {
  /** The public key to add */
  publicKey: string
  /** Optional display name hint */
  displayName?: string
  /** Invite source */
  source: 'qr' | 'key' | 'link'
}
