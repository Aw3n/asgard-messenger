/**
 * Network types — P2P connection status and events
 */

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface NetworkPeer {
  id: string
  publicKey: string
  remotePublicKey: string
  connected: boolean
  connectedAt?: number
  latency?: number
  bandwidth?: { up: number; down: number }
}

export interface NetworkStatus {
  state: ConnectionState
  peers: number
  topics: string[]
  bandwidth: { up: number; down: number }
  /** NAT type detected */
  natType?: 'open' | 'moderate' | 'strict'
  /** Number of connections currently being established */
  connecting?: number
  /** Per-peer latency in ms (0 = just connected, unknown) */
  peerLatency?: Record<string, number>
}

export interface NetworkMessage {
  from: string
  data: Uint8Array
  timestamp: number
}

/** Protocol message types exchanged over Protomux */
export type ProtocolMessageType =
  | 'chat:message'
  | 'chat:edit'
  | 'chat:delete'
  | 'chat:reaction'
  | 'chat:read'
  | 'chat:receipt'
  | 'chat:recall'
  | 'chat:ephemeral'
  | 'chat:thread'
  | 'chat:poll'
  | 'chat:location'
  | 'chat:event'
  | 'chat:task'
  | 'chat:contact'
  | 'chat:broadcast'
  | 'presence:update'
  | 'presence:typing'
  | 'presence:ping'
  | 'presence:pong'
  | 'contact:request'
  | 'contact:accept'
  | 'group:invite'
  | 'group:update'
  | 'group:message'
  | 'group:presence'
  | 'group:typing'
  | 'group:read'
  | 'group:receipt'
  | 'group:pin'
  | 'group:mention'
  | 'group:thread'
  | 'group:poll'
  | 'group:event'
  | 'group:task'
  | 'call:offer'
  | 'call:answer'
  | 'call:accept'
  | 'call:reject'
  | 'call:ice'
  | 'call:end'
  | 'call:participant:left'
  | 'call:participant:joined'
  | 'file:transfer'
  | 'file:chunk'
  | 'file:complete'
  | 'reaction:emoji'
  | 'contact:remove'
  | 'message:ephemeral'
  | 'message:thread'
  | 'message:reaction'
  | 'chat:ephemeral'

export interface ProtocolMessage {
  type: ProtocolMessageType
  payload: unknown
  timestamp: number
  /** Sender's public key */
  from: string
  /** Ed25519 signature of the payload */
  signature: string
  /** Monotonic sequence number for replay protection */
  seq: number
}
