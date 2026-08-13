import { create } from 'zustand'
import type { NetworkStatus, NetworkPeer, ConnectionState } from '@/types'

interface NetworkState {
  status: NetworkStatus
  peers: Record<string, NetworkPeer>
  typingUsers: Record<string, Set<string>> // conversationId -> Set<publicKey>
  swarmSuspended: boolean // Whether swarm is suspended for battery saving

  // Actions
  setConnectionState: (state: ConnectionState) => void
  updateStatus: (status: Partial<NetworkStatus>) => void
  addPeer: (peer: NetworkPeer) => void
  removePeer: (id: string) => void
  updatePeer: (id: string, updates: Partial<NetworkPeer>) => void
  setTyping: (conversationId: string, userId: string, typing: boolean) => void
  getTypingUsers: (conversationId: string) => string[]
  setSwarmSuspended: (suspended: boolean) => void
  setPeerLatency: (peerId: string, rtt: number) => void
}

/**
 * Network store — manages P2P connection state and peer registry.
 */
export const useNetworkStore = create<NetworkState>()((set, get) => ({
  status: {
    state: 'disconnected',
    peers: 0,
    topics: [],
    bandwidth: { up: 0, down: 0 },
    connecting: 0,
    peerLatency: {},
  },
  peers: {},
  typingUsers: {},
  swarmSuspended: false,

  setConnectionState: (state) => {
    set((s) => ({
      status: { ...s.status, state },
    }))
  },

  updateStatus: (updates) => {
    set((s) => ({
      status: { ...s.status, ...updates },
    }))
  },

  addPeer: (peer) => {
    set((s) => ({
      peers: { ...s.peers, [peer.id]: peer },
      status: { ...s.status, peers: Object.keys(s.peers).length + 1 },
    }))
  },

  removePeer: (id) => {
    set((s) => {
      const peers = { ...s.peers }
      delete peers[id]
      return { peers, status: { ...s.status, peers: Object.keys(peers).length } }
    })
  },

  updatePeer: (id, updates) => {
    set((s) => {
      if (!s.peers[id]) return s
      return { peers: { ...s.peers, [id]: { ...s.peers[id], ...updates } } }
    })
  },

  setTyping: (conversationId, userId, typing) => {
    set((s) => {
      const current = new Set(s.typingUsers[conversationId] ?? [])
      if (typing) {
        current.add(userId)
      } else {
        current.delete(userId)
      }
      return {
        typingUsers: { ...s.typingUsers, [conversationId]: current },
      }
    })
  },

  getTypingUsers: (conversationId) => {
    return Array.from(get().typingUsers[conversationId] ?? [])
  },

  setSwarmSuspended: (suspended) => {
    set({ swarmSuspended: suspended })
  },

  setPeerLatency: (peerId, rtt) => {
    set((s) => ({
      status: {
        ...s.status,
        peerLatency: { ...s.status.peerLatency, [peerId]: rtt },
      },
    }))
  },
}))
