/**
 * Conversation types — direct messages and group conversations
 */

import type { Message } from './message'

export type ConversationType = 'direct' | 'group' | 'channel'

export interface Conversation {
  /** Unique conversation ID (derived from participant keys) */
  id: string
  type: ConversationType
  /** For direct messages: the other participant's public key */
  participantId?: string
  /** For groups: the group ID */
  groupId?: string
  /** Last message in this conversation */
  lastMessage?: Message
  /** Number of unread messages */
  unreadCount: number
  /** Whether this conversation is muted */
  muted: boolean
  /** Whether this conversation is pinned */
  pinned: boolean
  /** Whether this conversation is archived */
  archived: boolean
  /** Conversation creation timestamp */
  createdAt: number
  /** Last activity timestamp */
  updatedAt: number
  /** Draft message that hasn't been sent */
  draft?: string
  /** BROADCAST MODE: When true, only admins can post, others can only react */
  broadcastMode?: boolean
  /** For broadcast: public key of the admin/broadcaster */
  broadcasterKey?: string
}

export interface ConversationFilter {
  search?: string
  type?: ConversationType
  unreadOnly?: boolean
  archivedOnly?: boolean
}
