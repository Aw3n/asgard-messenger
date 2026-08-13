/**
 * Message types — all message formats and attachments
 */

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'voice'
  | 'file'
  | 'gif'
  | 'sticker'
  | 'link'
  | 'system'
  | 'mention'
  | 'recall'
  | 'thread'
  | 'draft'
  | 'scheduled'
  | 'priority'
  | 'poll'
  | 'location'
  | 'event'
  | 'task'
  | 'contact'

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'scheduled'

export interface MessageReaction {
  emoji: string
  /** Array of public keys of users who reacted */
  users: string[]
  count: number
}

export interface MessageAttachment {
  id: string
  type: 'image' | 'video' | 'audio' | 'document' | 'voice'
  name: string
  size: number
  mimeType: string
  /** Hyperblobs key for P2P retrieval */
  blobKey?: string
  /** Local URL for already-downloaded files */
  localUrl?: string
  /** Thumbnail data URL */
  thumbnail?: string
  duration?: number // for audio/video in seconds
  width?: number
  height?: number
  /** SHA-256 hash for integrity verification */
  checksum?: string
  /** Whether the file was compressed before sending */
  compressed?: boolean
  /** Original size before compression */
  originalSize?: number
  /** Waveform data for audio/voice messages */
  waveform?: number[]
  /** Progress of download (0-100) */
  downloadProgress?: number
  /** Whether the file has been deleted by the sender */
  deleted?: boolean
  /** Timestamp when the file was deleted */
  deletedAt?: number
}

export interface MessageEdit {
  /** Timestamp of the edit */
  editedAt: number
  /** Previous content before this edit */
  previousContent: string
}

export interface LinkPreview {
  url: string
  title?: string
  description?: string
  image?: string
  favicon?: string
}

export interface Mention {
  publicKey: string
  displayName: string
  startIndex: number
  endIndex: number
}

export interface ThreadInfo {
  /** ID of the parent message this thread is replying to */
  parentMessageId: string
  /** Number of replies in this thread */
  replyCount: number
  /** Last reply timestamp */
  lastReplyAt?: number
  /** Participants in this thread */
  participants?: string[]
}

export interface ScheduledMessage {
  /** Unique ID for the scheduled message */
  id: string
  /** Conversation ID */
  conversationId: string
  /** Peer ID for DM */
  peerId?: string
  /** Group ID for group messages */
  groupId?: string
  /** Channel ID for group messages */
  channelId?: string
  /** Message content */
  content: string
  /** Message type */
  type: MessageType
  /** Scheduled timestamp (Unix ms) */
  scheduledAt: number
  /** Whether the message has been sent */
  sent: boolean
  /** Error message if send failed */
  error?: string
  /** Created timestamp */
  createdAt: number
}

export interface DraftMessage {
  /** Conversation ID */
  conversationId: string
  /** Draft content */
  content: string
  /** Last updated timestamp */
  updatedAt: number
  /** Attachments pending */
  attachments?: File[]
}

export interface PollOption {
  id: string
  text: string
  votes: string[] // Array of public keys who voted
}

export interface PollData {
  question: string
  options: PollOption[]
  multipleAnswers: boolean
  endsAt?: number // Optional end timestamp
  anonymous: boolean
}

export interface LocationData {
  latitude: number
  longitude: number
  altitude?: number
  accuracy?: number
  name?: string // Place name
  address?: string
}

export interface EventData {
  title: string
  description?: string
  startTime: number
  endTime: number
  location?: LocationData
  attendees: string[] // Public keys
  rsvp?: 'accepted' | 'declined' | 'tentative'
  recurring?: 'daily' | 'weekly' | 'monthly' | 'yearly'
}

export interface TaskData {
  title: string
  description?: string
  dueDate?: number
  completed: boolean
  completedAt?: number
  completedBy?: string
  assignees: string[] // Public keys
  priority: 'low' | 'medium' | 'high' | 'urgent'
  subtasks?: TaskData[]
}

export interface ContactCard {
  publicKey: string
  displayName: string
  avatar?: string
  status?: string
  customStatus?: string
  /** Additional contact fields to share */
  shareEmail?: boolean
  sharePhone?: boolean
  email?: string
  phone?: string
}

export interface Message {
  /** Unique message ID (UUID) */
  id: string
  /** Conversation or group ID this message belongs to */
  conversationId: string
  /** Sender's public key */
  senderId: string
  /** Message type */
  type: MessageType
  /** Raw text content (supports markdown) */
  content: string
  /** Timestamp (Unix ms) */
  timestamp: number
  /** Delivery status */
  status: MessageStatus
  /** Message this is replying to */
  replyTo?: {
    id: string
    senderId: string
    content: string
    type: MessageType
  }
  /** File attachments */
  attachments?: MessageAttachment[]
  /** Emoji reactions */
  reactions?: MessageReaction[]
  /** Edit history */
  edits?: MessageEdit[]
  /** Whether the message has been deleted */
  deleted?: boolean
  /** Forwarded from */
  forwardedFrom?: {
    messageId: string
    senderId: string
    conversationId: string
  }
  /** Cryptographic signature */
  signature?: string
  /** Whether the message is pinned */
  pinned?: boolean
  /** Link previews extracted from content */
  linkPreviews?: LinkPreview[]
  /** Users mentioned in this message */
  mentions?: Mention[]
  /** TTL for disappearing messages (in ms, 0 = no expiration) */
  expiresAt?: number
  /** Whether this message was recalled by the sender */
  recalled?: boolean
  /** Recall reason (optional) */
  recallReason?: string
  /** Thread information for threaded replies */
  thread?: ThreadInfo
  /** Whether this is a priority/urgent message */
  priority?: boolean
  /** Voice message waveform data (for visualization) */
  waveform?: number[]
  /** Scheduled send timestamp (for scheduled messages) */
  scheduledAt?: number
  /** Poll data (for poll messages) */
  poll?: PollData
  /** Location data (for location messages) */
  location?: LocationData
  /** Event data (for event messages) */
  event?: EventData
  /** Task data (for task messages) */
  task?: TaskData
  /** Contact card data (for contact sharing) */
  contactCard?: ContactCard
  /** Broadcast message IDs (for tracking broadcast delivery) */
  broadcastIds?: string[]
  /** Group ID for group messages (enables offline sync and routing) */
  groupId?: string
  /** Per-recipient delivery tracking for group messages: publicKey → status */
  deliveryReceipts?: Record<string, 'delivered' | 'read'>
  /** List of public keys who have read this message (for group read receipts) */
  readBy?: string[]
}

export interface OutgoingMessage {
  conversationId: string
  type: MessageType
  content: string
  replyTo?: string // message ID
  attachments?: File[]
  mentions?: Mention[]
  expiresAt?: number
  /** Thread parent message ID for threaded replies */
  threadParentId?: string
  /** Whether this is a priority/urgent message */
  priority?: boolean
  /** Voice message waveform data */
  waveform?: number[]
  /** Scheduled send timestamp (for scheduled messages) */
  scheduledAt?: number
  /** Poll data (for poll messages) */
  poll?: PollData
  /** Location data (for location messages) */
  location?: LocationData
  /** Event data (for event messages) */
  event?: EventData
  /** Task data (for task messages) */
  task?: TaskData
  /** Contact card data (for contact sharing) */
  contactCard?: ContactCard
  /** Recipient public keys for broadcast messages */
  broadcastRecipients?: string[]
}

/**
 * Message template — reusable message templates for quick responses
 */
export interface MessageTemplate {
  /** Unique template ID */
  id: string
  /** Template name/title */
  name: string
  /** Template content with placeholders (e.g., {name}, {time}) */
  content: string
  /** Category for organization */
  category?: string
  /** Variables used in the template */
  variables?: string[]
  /** Usage count for sorting by frequency */
  usageCount: number
  /** Last used timestamp */
  lastUsedAt?: number
  /** Whether this is a system default template */
  isDefault?: boolean
  /** Creation timestamp */
  createdAt: number
}
