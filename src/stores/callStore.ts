import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type CallStatus = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'connected' | 'ended'
export type CallType = 'audio' | 'video'
export type CallDirection = 'incoming' | 'outgoing'
export type VideoQuality = 'auto' | 'low' | 'medium' | 'high'

export interface CallChatMessage {
  id: string
  text: string
  senderId: string
  senderName: string
  timestamp: number
}

export interface CallReaction {
  id: string
  emoji: string
  senderId: string
  senderName: string
  timestamp: number
}

export interface CallRecord {
  id: string
  peerId: string
  peerName: string
  peerAvatar?: string
  type: CallType
  status: CallStatus
  direction: CallDirection
  startedAt: number
  /** Timestamp when call actually connected (for accurate duration) */
  connectedAt?: number
  endedAt?: number
  duration?: number
  missed: boolean
  /** Group call fields */
  isGroupCall?: boolean
  groupId?: string
  groupName?: string
  /** Peers participating in this group call (peer public keys) */
  participants?: string[]
}

const HISTORY_STORAGE_KEY = 'asgard-call-history'
const MAX_HISTORY = 100

/** Load history from localStorage */
function loadHistory(): CallRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

/** Save history to localStorage */
function saveHistory(history: CallRecord[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history))
  } catch {}
}

interface CallState {
  /** Current active call */
  activeCall: CallRecord | null
  /** Incoming call waiting */
  incomingCall: CallRecord | null
  /** Call history (persisted to localStorage) */
  history: CallRecord[]
  /** Local media state */
  isMuted: boolean
  isCameraOff: boolean
  isScreenSharing: boolean
  /** Private mode — hides chat content during call */
  isPrivateMode: boolean
  /** Local video fullscreen mode (PiP expanded) */
  isLocalVideoFullscreen: boolean
  /** Peer video fullscreen mode */
  isPeerVideoFullscreen: boolean
  /** Manual video quality override */
  videoQuality: VideoQuality
  /** In-call chat messages */
  callChatMessages: CallChatMessage[]
  /** In-call reactions (ephemeral, shown for a few seconds) */
  callReactions: CallReaction[]
  /** Show in-call chat panel */
  showCallChat: boolean
  /** Actions */
  startCall: (peerId: string, peerName: string, type: CallType, peerAvatar?: string) => void
  startGroupCall: (groupId: string, groupName: string, participantIds: string[], type: CallType) => void
  receiveCall: (call: CallRecord) => void
  acceptCall: () => void
  rejectCall: () => void
  endCall: () => void
  /** End an incoming call that was never answered (caller hung up) */
  endIncomingCall: () => void
  /** Remove a single participant from a group call (they left but call continues) */
  removeParticipant: (peerId: string) => void
  /** Add a participant to an active group call (late joiner) */
  addParticipant: (peerId: string) => void
  setCallStatus: (status: CallStatus) => void
  toggleMute: () => void
  toggleCamera: () => void
  toggleScreenShare: () => void
  togglePrivateMode: () => void
  toggleLocalVideoFullscreen: () => void
  togglePeerVideoFullscreen: () => void
  setVideoQuality: (quality: VideoQuality) => void
  /** In-call chat */
  addCallChatMessage: (message: CallChatMessage) => void
  clearCallChat: () => void
  toggleCallChat: () => void
  /** In-call reactions */
  addCallReaction: (reaction: CallReaction) => void
  removeCallReaction: (id: string) => void
  addToHistory: (record: CallRecord) => void
  clearHistory: () => void
}

/**
 * Call store — manages call state, history, and media controls.
 * History is persisted to localStorage so it survives app restarts.
 */
export const useCallStore = create<CallState>()(
  immer((set, get) => ({
    activeCall: null,
    incomingCall: null,
    history: loadHistory(),
    isMuted: false,
    isCameraOff: false,
    isScreenSharing: false,
    isPrivateMode: false,
    isLocalVideoFullscreen: false,
    isPeerVideoFullscreen: false,
    videoQuality: 'auto' as VideoQuality,
    callChatMessages: [],
    callReactions: [],
    showCallChat: false,

    startCall: (peerId, peerName, type, peerAvatar) => {
      const call: CallRecord = {
        id: `call-${Date.now()}`,
        peerId,
        peerName,
        peerAvatar,
        type,
        status: 'outgoing',
        direction: 'outgoing',
        startedAt: Date.now(),
        missed: false,
      }
      set((s) => {
        s.activeCall = call
      })
    },

    startGroupCall: (groupId, groupName, participantIds, type) => {
      const call: CallRecord = {
        id: `call-${Date.now()}`,
        peerId: groupId,
        peerName: groupName,
        type,
        status: 'outgoing',
        direction: 'outgoing',
        startedAt: Date.now(),
        missed: false,
        isGroupCall: true,
        groupId,
        groupName,
        participants: participantIds,
      }
      set((s) => {
        s.activeCall = call
      })
    },

    receiveCall: (call) => {
      set((s) => {
        s.incomingCall = call
      })
    },

    acceptCall: () => {
      const incoming = get().incomingCall
      if (!incoming) return
      set((s) => {
        s.activeCall = { ...incoming, status: 'connected', direction: 'incoming' }
        s.incomingCall = null
      })
    },

    rejectCall: () => {
      const incoming = get().incomingCall
      if (incoming) {
        get().addToHistory({ ...incoming, status: 'ended', missed: true, endedAt: Date.now() })
      }
      set((s) => {
        s.incomingCall = null
      })
    },

    endCall: () => {
      const active = get().activeCall
      if (active) {
        // Use connectedAt for accurate duration (only count connected time)
        const startTime = active.connectedAt ?? active.startedAt
        const duration = Math.floor((Date.now() - startTime) / 1000)
        // If call never connected (still outgoing/connecting), mark as missed
        const wasMissed = active.status === 'outgoing' || active.status === 'connecting'
        get().addToHistory({
          ...active,
          status: 'ended',
          endedAt: Date.now(),
          duration: wasMissed ? 0 : duration,
          missed: wasMissed,
        })
      }
      set((s) => {
        s.activeCall = null
        s.isMuted = false
        s.isCameraOff = false
        s.isScreenSharing = false
        s.callChatMessages = []
        s.callReactions = []
        s.showCallChat = false
        s.isPeerVideoFullscreen = false
      })
    },

    /**
     * End an incoming call that was never answered.
     * Called when the caller hangs up (call:end received while incomingCall exists).
     */
    endIncomingCall: () => {
      const incoming = get().incomingCall
      if (incoming) {
        get().addToHistory({
          ...incoming,
          status: 'ended',
          missed: true,
          endedAt: Date.now(),
        })
      }
      set((s) => {
        s.incomingCall = null
      })
    },

    /**
     * Remove a single participant from a group call.
     * The call continues with remaining participants.
     * If no participants remain, the call ends.
     */
    removeParticipant: (peerId) => {
      const active = get().activeCall
      if (!active || !active.isGroupCall || !active.participants) return

      const remaining = active.participants.filter((id) => id !== peerId)

      if (remaining.length === 0) {
        // No participants left — end the call
        get().endCall()
        return
      }

      set((s) => {
        if (s.activeCall) {
          s.activeCall.participants = remaining
        }
      })

      console.log(`[CallStore] Participant removed: ${peerId.slice(0, 16)} | remaining: ${remaining.length}`)
    },

    /**
     * Add a participant to an active group call (late joiner).
     */
    addParticipant: (peerId) => {
      const active = get().activeCall
      if (!active || !active.isGroupCall || !active.participants) return
      if (active.participants.includes(peerId)) return

      set((s) => {
        if (s.activeCall?.participants) {
          s.activeCall.participants.push(peerId)
        }
      })

      console.log(`[CallStore] Participant added: ${peerId.slice(0, 16)} | total: ${active.participants.length + 1}`)
    },

    setCallStatus: (status) => {
      set((s) => {
        if (s.activeCall) {
          s.activeCall.status = status
          if (status === 'connected' && !s.activeCall.connectedAt) {
            s.activeCall.connectedAt = Date.now()
          }
        }
      })
    },

    toggleMute: () => set((s) => { s.isMuted = !s.isMuted }),
    toggleCamera: () => set((s) => { s.isCameraOff = !s.isCameraOff }),
    toggleScreenShare: () => set((s) => { s.isScreenSharing = !s.isScreenSharing }),
    togglePrivateMode: () => set((s) => { s.isPrivateMode = !s.isPrivateMode }),
    toggleLocalVideoFullscreen: () => set((s) => { s.isLocalVideoFullscreen = !s.isLocalVideoFullscreen }),
    togglePeerVideoFullscreen: () => set((s) => { s.isPeerVideoFullscreen = !s.isPeerVideoFullscreen }),
    setVideoQuality: (quality) => set((s) => { s.videoQuality = quality }),

    addCallChatMessage: (message) => set((s) => {
      s.callChatMessages.push(message)
      // Keep last 100 messages
      if (s.callChatMessages.length > 100) s.callChatMessages = s.callChatMessages.slice(-100)
    }),

    clearCallChat: () => set((s) => { s.callChatMessages = [] }),

    toggleCallChat: () => set((s) => { s.showCallChat = !s.showCallChat }),

    addCallReaction: (reaction) => set((s) => {
      s.callReactions.push(reaction)
      // Keep last 10 reactions
      if (s.callReactions.length > 10) s.callReactions = s.callReactions.slice(-10)
    }),

    removeCallReaction: (id) => set((s) => {
      s.callReactions = s.callReactions.filter(r => r.id !== id)
    }),

    addToHistory: (record) => {
      set((s) => {
        s.history.unshift(record)
        if (s.history.length > MAX_HISTORY) s.history = s.history.slice(0, MAX_HISTORY)
        // Persist to localStorage
        saveHistory(s.history)
      })
    },

    clearHistory: () => {
      set((s) => { s.history = [] })
      saveHistory([])
    },
  }))
)
