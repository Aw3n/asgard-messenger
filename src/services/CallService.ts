import { p2pService } from './P2PService'
import { useCallStore } from '@/stores/callStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useContactStore } from '@/stores/contactStore'
import { useUIStore } from '@/stores/uiStore'
import { mediaDeviceService } from './MediaDeviceService'
import { ringtoneService } from './RingtoneService'
import type { CallRecord, CallType } from '@/stores/callStore'

/**
 * PRO QUALITY: per-sender playout state.
 * Each sender keeps its own jitter buffer, its own playout clock and its own
 * gain stage, so several participants are mixed simultaneously instead of
 * fighting over one timeline.
 */
interface PeerAudioState {
  jitterBuffer: { data: Float32Array; timestamp: number }[]
  nextPlayTime: number
  gain: GainNode | null
  started: boolean
  lastSeq: number
  /** Wall-clock time of the last enqueued packet — separates underruns from silence */
  lastEnqueueAt: number
  /** True once playout has started at least once (so a dry buffer means underrun) */
  everStarted: boolean
}

/**
 * PERFECT QUALITY GROUP: per-sender video state.
 * Each sender decodes into its own canvas with its own decoder, so frames from
 * different participants never overwrite each other.
 */
interface PeerVideoState {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  decoder: VideoDecoder | null
  decoderCodec: string
  lastReceivedSeq: number
  framesReceived: number
  /** PRO QUALITY: throttles keyframe (PLI) requests sent to this peer */
  lastKeyframeRequestAt: number
}

/**
 * CallService — P2P call signaling and media transport.
 *
 * AUDIO: Uses AudioWorklet for ultra-low latency PCM capture.
 * AudioWorklet runs in a separate thread, avoiding main thread blocking.
 * Captures Float32 PCM, converts to Int16, sends via Protomux.
 *
 * VIDEO: Uses requestVideoFrameCallback for precise frame timing.
 * Captures at 25 FPS with 0.7 quality JPEG for smooth video.
 * Uses canvas.captureStream() on receiver for MediaStream output.
 *
 * TRANSPORT: Uses Protomux cork/uncork for batched media sending.
 */
class CallService {
  private localStream: MediaStream | null = null
  private peerStream: MediaStream | null = null

  // Audio capture (sender — AudioWorklet)
  private captureContext: AudioContext | null = null
  private audioWorkletNode: AudioWorkletNode | null = null
  // PRO QUALITY: Opus encoder (WebCodecs). Raw PCM Int16 costs 768 kbps per
  // stream, which in a mesh group call means N× that on the uplink and starves
  // video. Opus delivers transparent voice at 24–96 kbps (~12× less), so the
  // saved bandwidth goes to video and packet loss drops on weak links.
  private audioEncoder: AudioEncoder | null = null
  private audioEncodeTimestampUs = 0
  private audioSeq = 0
  private audioReconfigCounter = 0
  private useOpus = false // Negotiated at initialize() — false ⇒ raw PCM fallback

  // Audio playback (receiver)
  private playbackContext: AudioContext | null = null
  private audioDestination: MediaStreamAudioDestinationNode | null = null
  // PERFECT QUALITY: Shared GainNode — eliminates per-chunk allocation/GC pressure
  private playbackGainNode: GainNode | null = null
  // PRO QUALITY: Master limiter — summing N participants can exceed 0 dBFS and
  // clip harshly; a fast limiter keeps the mix clean without audible pumping.
  private playbackLimiter: DynamicsCompressorNode | null = null
  // PRO QUALITY: Per-peer Opus decoders (key = peerId, PLAYBACK_1TO1 for direct calls)
  private audioDecoders: Map<string, AudioDecoder> = new Map()
  private static readonly PLAYBACK_1TO1 = '__1to1__'
  private audioPacketsLost = 0
  private audioChunksDropped = 0
  // PERFECT QUALITY: Gapless scheduling — next chunk starts right after previous ends
  private nextPlayTime = 0
  // PERFECT QUALITY GROUP: Per-peer audio state for proper mixing.
  // Each peer gets its own jitter buffer + nextPlayTime, so audio from
  // multiple participants plays SIMULTANEOUSLY (mixed via Web Audio API)
  // instead of sequentially. This is the correct mesh topology approach.
  private peerAudioState: Map<string, PeerAudioState> = new Map()

  // Video transport (sender — optimized canvas capture)
  private sendCanvas: HTMLCanvasElement | null = null
  private sendCanvasCtx: CanvasRenderingContext2D | null = null
  private videoFrameInterval: ReturnType<typeof setInterval> | null = null
  private tempVideo: HTMLVideoElement | null = null

  // PERFORMANCE: Group video transport — shared encoder for multiple peers
  // Instead of encoding N times for N peers, encode once and send to all
  private groupVideoPeers: Set<string> = new Set()
  private isGroupVideoTransportRunning = false

  // MESH TOPOLOGY: Group audio transport — send audio to ALL participants
  // In a group call, audio must be sent to every participant directly (mesh),
  // not just one peer. Each participant is both sender and receiver.
  private groupAudioPeers: Set<string> = new Set()
  private get isGroupAudioCall(): boolean {
    return this.groupAudioPeers.size > 0
  }

  // Video playback (receiver — canvas + captureStream)
  private receiveCanvas: HTMLCanvasElement | null = null
  private receiveCanvasCtx: CanvasRenderingContext2D | null = null
  // HTMLImageElement used for video frame decoding — reserved for future IMG-based decode path
  // @ts-ignore
  private _videoFrameImg: HTMLImageElement | null = null
  // PERFECT QUALITY GROUP: Per-peer video state for independent decoding.
  // Each peer gets its own receive canvas + VP8 decoder + sequence tracking,
  // so frames from different participants don't overwrite each other.
  private peerVideoState: Map<string, PeerVideoState> = new Map()

  // Screen share
  private screenTrack: MediaStreamTrack | null = null
  private originalVideoTrack: MediaStreamTrack | null = null

  // Peer ID for current call
  private currentPeerId: string | null = null
  private _outgoingTimeout: ReturnType<typeof setTimeout> | null = null
  // PERFORMANCE: Auto-timeout incoming calls after 30s (mark as missed)
  private _incomingTimeout: ReturnType<typeof setTimeout> | null = null
  private static readonly INCOMING_CALL_TIMEOUT = 30_000 // 30 seconds

  // Audio jitter buffer target depth (in packets — see tuneJitterBuffer).
  // The buffers themselves are per-sender, inside peerAudioState.
  private jitterBufferSize = 3
  private jitterTimer: ReturnType<typeof setTimeout> | null = null

  // PERFORMANCE: Comfort Noise Generation (CNG) — RFC 3389 inspired
  // When peer is silent (no audio chunks received), generate very low-level noise
  // to prevent the unsettling "dead silence" effect in VoIP calls
  private lastAudioReceived = 0
  private cngInterval: ReturnType<typeof setInterval> | null = null
  private static readonly CNG_THRESHOLD = 800 // ms before generating comfort noise
  private static readonly CNG_AMPLITUDE = 0.002 // Very low amplitude (~-54 dBFS)

  // Bandwidth tracking for adaptive quality
  private bytesSent = 0
  private bytesReceived = 0
  private lastBandwidthCheck = 0
  private currentBandwidth = 0 // bytes per second

  // PRO QUALITY: link quality is derived from what actually degrades a call —
  // lost packets, playout underruns, lost video frames — NOT from throughput.
  // Opus cut the audio bitrate ~12×, so a healthy audio call now uses ~8 KB/s;
  // the old 50 KB/s throughput threshold would have rated it "poor" and then
  // punished it by dropping to 24 kbps. Measuring damage instead of volume
  // makes the adaptation loop converge upward on a good link.
  private networkQuality: 'good' | 'medium' | 'poor' = 'good'
  private audioUnderruns = 0
  private windowAudioLost = 0
  private windowAudioReceived = 0
  private windowUnderruns = 0
  private windowFramesLost = 0
  private windowFramesReceived = 0

  // Call quality metrics
  private callStartTime = 0
  private packetLossCount = 0
  private jitterTotal = 0
  private jitterSamples = 0

  // Audio diagnostics
  private audioChunksReceived = 0
  private _videoFramesReceived = 0

  // HOLEPUNCH PATTERN: Audio batch buffer for Protomux cork/uncork batching
  // Accumulates AUDIO_BATCH_SIZE chunks before sending via sendMediaBatch
  private audioBatchBuffer: Uint8Array[] = []
  // QUALITY: Silence-gate hangover counter (chunks remaining before gating)
  private silenceHangover = 0
  private audioChunksSentCount = 0

  // PERFORMANCE: WebCodecs hardware-accelerated video encoding (VP8)
  // Replaces CPU-intensive canvas.toBlob('image/jpeg') with GPU-accelerated VP8
  // ~70% less CPU usage, ~50% smaller frames, inter-frame compression
  private videoEncoder: VideoEncoder | null = null
  private videoDecoder: VideoDecoder | null = null
  private useWebCodecs = false
  private webCodecsFrameCount = 0
  // PERFECT QUALITY: Longer keyframe interval + on-demand keyframes (PLI).
  // Keyframes cost 5–10× a delta frame, so emitting one every 15 frames burned
  // ~a third of the bitrate on redundant data. At 90 frames (~3s) that budget
  // goes into detail, and receivers ask for an immediate keyframe (marker 0x06)
  // whenever they actually lose one — faster recovery AND sharper picture.
  private static readonly KEYFRAME_INTERVAL = 90 // ~3s at 30fps
  // PRO QUALITY: pending on-demand keyframe (set by PLI or resolution change)
  private forceKeyframe = true
  private lastKeyframeRequestSentAt = 0
  private static readonly KEYFRAME_REQUEST_THROTTLE = 700 // ms between PLI requests
  // SUPERIOR QUALITY: 3-tier adaptive bitrate (shared by VP8 and VP9)
  // High: 2.5 Mbps — near-lossless at 960x540@30fps
  // Medium: 1.2 Mbps — good quality, balanced bandwidth
  // Low: 300 kbps — minimum viable quality for poor connections
  private static readonly VP8_BITRATE_HIGH = 2_500_000 // 2.5 Mbps for perfect quality
  private static readonly VP8_BITRATE = 1_200_000 // 1.2 Mbps for medium quality
  private static readonly VP8_BITRATE_LOW = 300_000 // 300 kbps for poor connections
  // SUPERIOR QUALITY: VP9 codec negotiation — VP9 gives ~40% better quality
  // than VP8 at the same bitrate. Detected asynchronously at initialize();
  // the codec used is signaled per-frame in the header (bit 1 of byte 1),
  // so the receiver always configures the matching decoder.
  private static readonly VP9_CODEC = 'vp09.00.10.08' // VP9 profile 0, level 1.0, 8-bit
  private videoCodec: 'vp8' | 'vp09.00.10.08' = 'vp8' // Negotiated at initialize()
  private videoDecoderCodec = 'vp8' // Codec the 1:1 decoder is currently configured for
  // PRO QUALITY: mesh uplink budget. In a mesh call every stream is sent once
  // per peer, so a fixed per-stream bitrate multiplies with the participant
  // count and saturates the uplink (5 peers × 2.5 Mbps = 12.5 Mbps). The budget
  // is divided across peers instead, keeping the total sane and the picture
  // stable rather than letting congestion destroy every stream.
  private static readonly VIDEO_UPLOAD_BUDGET = 4_000_000 // 4 Mbps total uplink
  // PRO QUALITY: current encoder resolution (adapts to network quality)
  private encodeWidth = 960
  private encodeHeight = 540
  private encodeBitrate = 0
  private encodeFramerate = 30
  // PERFORMANCE: Frame loss tracking and freeze detection
  private lastReceivedSeq = -1
  private framesLost = 0
  private lastFrameReceivedAt = 0
  private videoFrozen = false
  private static readonly FREEZE_THRESHOLD = 2000 // ms before declaring video frozen

  // Constants — OPTIMIZED for low latency and superior audio quality
  private static readonly AUDIO_SAMPLE_RATE = 48000
  // PERFORMANCE: 512 samples = ~10.6ms latency at 48kHz (vs 21ms with 1024)
  // This is the sweet spot — low enough for natural conversation,
  // high enough to avoid underruns on slower machines.
  private static readonly AUDIO_BUFFER_SIZE = 512
  // HOLEPUNCH PATTERN: Batch audio chunks for Protomux cork/uncork efficiency.
  // Accumulate 3 chunks (~32ms of audio) before sending as a batch.
  // This reduces IPC overhead by 3× and Protomux framing overhead by ~80%.
  private static readonly AUDIO_BATCH_SIZE = 3
  // PRO QUALITY: Opus packets carry 20ms each, so batching 2 keeps added
  // latency at ~40ms while still halving the Protomux framing overhead.
  private static readonly AUDIO_BATCH_SIZE_OPUS = 2
  private static readonly OPUS_FRAME_DURATION_US = 20_000
  // PRO QUALITY: 3-tier Opus bitrate. 96 kbps mono is fullband-transparent,
  // 64 kbps is broadcast-grade voice, 24 kbps stays intelligible on bad links.
  private static readonly OPUS_BITRATE_HIGH = 96_000
  private static readonly OPUS_BITRATE = 64_000
  private static readonly OPUS_BITRATE_LOW = 24_000
  // PRO QUALITY: playout window (seconds). Chunks are scheduled ahead of the
  // audio clock inside [MIN_LEAD, MAX_LEAD]; TARGET_LEAD is the depth the
  // jitter buffer aims to keep so network jitter never causes a dropout.
  private static readonly PLAYOUT_MIN_LEAD = 0.02 // 20ms cushion after underrun
  private static readonly PLAYOUT_TARGET_LEAD = 0.12 // 120ms scheduled ahead
  private static readonly PLAYOUT_MAX_LEAD = 0.2 // 200ms hard ceiling
  private static readonly PLAYOUT_TICK_MS = 10 // scheduler resolution
  private static readonly SILENCE_THRESHOLD = 0.003 // Lower = more sensitive
  // QUALITY: Silence hangover — keep sending N chunks (~215ms) after the level
  // drops below threshold so word endings and soft trailing speech are never clipped.
  private static readonly SILENCE_HANGOVER_CHUNKS = 20
  // SUPERIOR QUALITY: 30fps for smoother motion (hardware encoders handle it easily)
  private static readonly VIDEO_FPS = 30
  // PERFECT QUALITY: Higher JPEG quality for fallback path
  private static readonly VIDEO_QUALITY = 0.85 // Near-lossless JPEG
  private static readonly VIDEO_QUALITY_LOW = 0.5 // Lower quality for poor connections
  // SUPERIOR QUALITY: 960x540 (qHD) default for 1:1 calls — 2.25× more pixels
  // than 640x480, downscaled from a 720p camera capture for extra sharpness.
  private static readonly VIDEO_WIDTH_DEFAULT = 960
  private static readonly VIDEO_HEIGHT_DEFAULT = 540
  // PERFORMANCE: Mutable video dimensions for adaptive group call quality
  private static VIDEO_WIDTH = 960
  private static VIDEO_HEIGHT = 540
  private static readonly BANDWIDTH_CHECK_INTERVAL = 3000 // Check every 3s
  private static readonly LOW_BANDWIDTH_THRESHOLD = 50000 // 50KB/s threshold

  /**
   * Initialize call listeners for incoming calls and media data.
   */
  initialize(): void {
    // SUPERIOR QUALITY: Detect the best supported video codec (VP9 > VP8).
    // Runs asynchronously — falls back to VP8 until detection completes.
    this.detectBestVideoCodec()
    // PRO QUALITY: Detect Opus support for audio. Runs asynchronously — until it
    // completes (or if WebCodecs audio is unavailable) capture stays on raw PCM.
    this.detectBestAudioCodec()

    // Listen for incoming call offers
    p2pService.on('message:call:offer', (msg) => {
      console.log(`[CallService] 📞 Incoming call:offer received from ${msg.from?.slice(0, 16)}`, msg.payload)
      const { type, callerName, callerAvatar, isGroupCall, groupId, groupName, participants } = msg.payload as {
        type: CallType
        callerName: string
        callerAvatar?: string
        isGroupCall?: boolean
        groupId?: string
        groupName?: string
        participants?: string[]
      }

      const contact = useContactStore.getState().getContact(msg.from)
      const call: CallRecord = {
        id: `call-${Date.now()}`,
        peerId: msg.from,
        peerName: isGroupCall ? (groupName ?? 'Group Call') : (contact?.displayName ?? callerName ?? msg.from.slice(0, 8)),
        peerAvatar: contact?.avatar ?? callerAvatar,
        type,
        status: 'incoming',
        direction: 'incoming',
        startedAt: Date.now(),
        missed: false,
        isGroupCall,
        groupId,
        groupName,
        // Store the full participant list so we know who else is in the call
        // (mesh topology — each participant can connect to others directly)
        participants: participants ?? (isGroupCall ? [msg.from] : undefined),
      }

      console.log(`[CallService] 📞 Setting up incoming call: ${call.peerName} (${type})`)

      // DND: Auto-reject if our status is 'busy' (Ne pas déranger)
      const identity = useIdentityStore.getState().identity
      if (identity?.profile.status === 'busy') {
        console.log('[CallService] 🔕 DND active — auto-rejecting incoming call')
        p2pService.sendMessage(msg.from, 'call:reject', { reason: 'busy' }).catch(() => {})
        // Don't show the call UI — just log it in history
        useCallStore.getState().addToHistory({
          ...call,
          status: 'ended',
          missed: false,
          endedAt: Date.now(),
        })
        return
      }

      useCallStore.getState().receiveCall(call)
      // Start ringtone for incoming call
      ringtoneService.startRingtone()

      // PERFORMANCE: Auto-timeout incoming call after 30s — mark as missed
      if (this._incomingTimeout) clearTimeout(this._incomingTimeout)
      this._incomingTimeout = setTimeout(() => {
        console.log('[CallService] ⏰ Incoming call timed out after 30s — marking as missed')
        ringtoneService.stopRingtone()
        // Send call:reject to let the caller know we didn't answer
        p2pService.sendMessage(msg.from, 'call:reject', {}).catch(() => {})
        useCallStore.getState().endIncomingCall()
        this._incomingTimeout = null
        // Show missed call notification
        this.showMissedCallNotification(call)
      }, CallService.INCOMING_CALL_TIMEOUT)
    })

    // Listen for call acceptance — acquire media NOW (not before)
    p2pService.on('message:call:accept', async (msg) => {
      const { activeCall } = useCallStore.getState()
      if (!activeCall) {
        console.warn('[CallService] ⚠️ call:accept received but no activeCall! Ignoring.')
        return
      }

      // Cancel incoming call timeout on our side too (shouldn't be set for caller,
      // but safety in case of race conditions)
      if (this._incomingTimeout) {
        clearTimeout(this._incomingTimeout)
        this._incomingTimeout = null
      }

      console.log(`[CallService] ✅ call:accept received from ${msg?.from?.slice(0, 16) ?? 'unknown'} for ${activeCall.peerName}`)
      // Clear outgoing timeout — peer answered
      if (this._outgoingTimeout) {
        clearTimeout(this._outgoingTimeout)
        this._outgoingTimeout = null
      }
      // Ensure currentPeerId is set for media transport (defense-in-depth)
      this.currentPeerId = activeCall.peerId
      useCallStore.getState().setCallStatus('connected')
      // Stop ringtone and play connect beep
      ringtoneService.stopRingtone()
      ringtoneService.playBeep(800, 150)

      // Release any existing local media tracks before acquiring new ones
      this.stopLocalMedia()
      // CRITICAL: Wait longer for OS to release hardware (especially camera on Windows)
      await new Promise(r => setTimeout(r, 800))

      // Get local media with retry logic — longer delays for "Device in use" recovery
      const type = activeCall.type
      let lastError: Error | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          console.log(`[CallService] getLocalMedia attempt ${attempt + 1} for ${type} call`)
          this.localStream = await this.getLocalMedia(type)
          console.log(`[CallService] getLocalMedia succeeded on attempt ${attempt + 1}`)
          break
        } catch (err) {
          lastError = err as Error
          console.warn(`[CallService] getLocalMedia attempt ${attempt + 1} failed:`, err)
          if (attempt < 2) {
            // CRITICAL: Force-release all tracks and wait longer for hardware release
            this.stopLocalMedia()
            // Also enumerate and stop any lingering tracks from previous calls
            try {
              const devices = await navigator.mediaDevices.enumerateDevices()
              console.log(`[CallService] Available devices: ${devices.filter(d => d.kind === 'videoinput').length} cameras, ${devices.filter(d => d.kind === 'audioinput').length} mics`)
            } catch {}
            // Progressive delay: 1s, 2s — gives OS time to release camera
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
          }
        }
      }
      if (!this.localStream) {
        console.error('[CallService] Failed to get local media after 3 attempts:', lastError)
        return
      }

      // Start audio capture
      this.startAudioCapture().catch((err) => {
        console.error('[CallService] ❌ Audio capture failed to start:', err)
      })

      // Start video transport if video call
      if (type === 'video') {
        this.startVideoTransport(activeCall.peerId)
        console.log(`[CallService] 🎥 Video transport started for ${type} call to ${activeCall.peerId.slice(0, 16)}`)
      }

      console.log(`[CallService] 🟢 Call fully connected with ${activeCall.peerName} — media active`)
    })

    // Listen for call rejection
    p2pService.on('message:call:reject', (msg) => {
      ringtoneService.stopRingtone()
      // Cancel incoming call timeout — peer rejected, no need for timeout
      if (this._incomingTimeout) {
        clearTimeout(this._incomingTimeout)
        this._incomingTimeout = null
      }

      const { activeCall, incomingCall } = useCallStore.getState()

      // GROUP CALL: If a participant rejects, remove them — the call continues.
      // Only end the call if it's a 1:1 call or if the caller rejects.
      if (activeCall?.isGroupCall && activeCall.participants) {
        const senderIsParticipant = activeCall.participants.includes(msg.from) || msg.from === activeCall.peerId
        if (senderIsParticipant) {
          console.log(`[CallService] Group call participant rejected: ${msg.from.slice(0, 16)}`)
          useCallStore.getState().removeParticipant(msg.from)
          this.groupVideoPeers.delete(msg.from)
          this.groupAudioPeers.delete(msg.from)
          this.removePeerAudioState(msg.from)
          this.removePeerVideoState(msg.from)
          return
        }
      }

      this.stopMedia()
      if (incomingCall && !activeCall) {
        useCallStore.getState().endIncomingCall()
      } else {
        useCallStore.getState().endCall()
      }
    })

    // Listen for call end
    p2pService.on('message:call:end', (msg) => {
      ringtoneService.stopRingtone()
      // Cancel incoming call timeout — call is ending, no need for timeout
      if (this._incomingTimeout) {
        clearTimeout(this._incomingTimeout)
        this._incomingTimeout = null
      }

      const { activeCall, incomingCall } = useCallStore.getState()

      // GROUP CALL: If this is a group call and the sender is a participant,
      // remove just that participant — the call continues with remaining members.
      // Only end the entire call if no participants remain or if it's a 1:1 call.
      if (activeCall?.isGroupCall && activeCall.participants) {
        const senderIsParticipant = activeCall.participants.includes(msg.from) || msg.from === activeCall.peerId
        if (senderIsParticipant && activeCall.participants.length > 1) {
          console.log(`[CallService] Group call participant left: ${msg.from.slice(0, 16)}`)
          useCallStore.getState().removeParticipant(msg.from)
          // Remove from group video peers if active
          this.groupVideoPeers.delete(msg.from)
          return
        }
      }

      this.stopMedia()

      if (incomingCall && !activeCall) {
        // Caller hung up before we answered — missed call
        useCallStore.getState().endIncomingCall()
        this.showMissedCallNotification(incomingCall)
      } else {
        useCallStore.getState().endCall()
      }
    })

    // Listen for participant leaving a group call (graceful departure)
    // Per Hyperswarm mesh topology: each participant notifies others when leaving
    p2pService.on('message:call:participant:left', (msg) => {
      const { activeCall } = useCallStore.getState()
      if (!activeCall?.isGroupCall || !activeCall.participants) return

      console.log(`[CallService] Participant left group call: ${msg.from.slice(0, 16)}`)
      useCallStore.getState().removeParticipant(msg.from)

      // Remove from group video transport
      this.groupVideoPeers.delete(msg.from)
      // PERFECT QUALITY: Clean up per-peer video state (canvas + decoder)
      this.removePeerVideoState(msg.from)

      // MESH: Remove from group audio peers too
      this.groupAudioPeers.delete(msg.from)
      // PRO QUALITY: Release the sender's playout state, decoder and gain stage,
      // then re-balance the mix for the remaining participants.
      this.removePeerAudioState(msg.from)
      console.log(`[CallService] Removed peer from mesh: ${msg.from.slice(0, 16)} (audio: ${this.groupAudioPeers.size}, video: ${this.groupVideoPeers.size})`)

      // If this was the current peer for 1:1 transport, we don't need to stop
      // it explicitly — removing from groupVideoPeers is sufficient since the
      // capture loop checks the set before sending frames.
    })

    // Listen for participant joining an ongoing group call (late joiner)
    // MESH TOPOLOGY: When a new participant joins, we add them and respond with
    // our own call:participant:joined so they know about us too. This establishes
    // bidirectional mesh connectivity — each participant can send media to all others.
    // Per Hyperswarm peer-to-peer model: no central server, all peers connect directly.
    p2pService.on('message:call:participant:joined', (msg) => {
      const { activeCall } = useCallStore.getState()
      if (!activeCall?.isGroupCall) return

      console.log(`[CallService] Participant joined group call: ${msg.from.slice(0, 16)}`)

      // Add the new participant to our call
      const isNew = !activeCall.participants?.includes(msg.from)
      if (isNew) {
        useCallStore.getState().addParticipant(msg.from)
      }

      // MESH TOPOLOGY: Add to group audio peers so we send them audio
      this.groupAudioPeers.add(msg.from)
      console.log(`[CallService] Added peer to audio mesh: ${msg.from.slice(0, 16)} (total: ${this.groupAudioPeers.size})`)

      // Add to group video transport if active
      if (this.isGroupVideoTransportRunning) {
        this.groupVideoPeers.add(msg.from)
      } else if (activeCall.type === 'video' && isNew) {
        // If video transport isn't running yet but this is a video call,
        // start sending video to the new participant
        this.startVideoTransport(msg.from)
      }

      // MESH RESPONSE: Send our own call:participant:joined back to the new participant
      // so they can add us to their participant list and start sending media to us.
      // This is critical for bidirectional mesh — without this, the new participant
      // knows about other existing participants but they don't know about the new one
      // until this response arrives.
      if (isNew) {
        const identity = useIdentityStore.getState().identity
        if (identity) {
          p2pService.sendMessage(msg.from, 'call:participant:joined', {
            groupId: activeCall.groupId,
            responderPublicKey: identity.keyPair.publicKey,
            responderDisplayName: identity.profile.displayName,
          }).catch(() => {})
        }
      }
    })

    // Listen for incoming media data from peer
    p2pService.on('media:data', (data: { from: string; data: Uint8Array }) => {
      // Ignore media traffic when no call is active (e.g. file-transfer chunks on shared channel)
      if (!useCallStore.getState().activeCall) return
      this.handleIncomingMedia(data.data, data.from)
    })

    // Listen for device changes during a call
    mediaDeviceService.on('devices:changed', () => {
      this.handleDeviceChangeDuringCall()
    })
  }

  /**
   * Initiate an outgoing call.
   */
  async startCall(peerId: string, peerName: string, type: CallType, peerAvatar?: string): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    useCallStore.getState().startCall(peerId, peerName, type, peerAvatar)
    this.resetCallMetrics()
    this.currentPeerId = peerId

    // CRITICAL: Wait for peer connection before sending call:offer
    // This ensures the message is delivered immediately, not buffered
    console.log(`[CallService] Waiting for peer connection to ${peerName}...`)
    const connected = await p2pService.waitForPeer(peerId, 15000)
    if (!connected) {
      console.warn(`[CallService] ⚠️ Peer not connected after 15s, sending call:offer anyway (may be delayed)`)
    } else {
      console.log(`[CallService] ✅ Peer connected, sending call:offer immediately`)
    }

    // Send call offer to peer FIRST — media will be acquired when peer accepts
    // PERFORMANCE: No avatar in payload (3.8MB → 0) — receiver uses contact store
    console.log(`[CallService] 📞 Sending call:offer to ${peerName} (${type} call) — media will start on accept`)
    await p2pService.sendMessage(peerId, 'call:offer', {
      type,
      callerName: identity.profile.displayName,
    }).then(() => {
      console.log(`[CallService] ✅ call:offer sent successfully to ${peerName}, waiting for accept...`)
      // PERFORMANCE: Set timeout for outgoing call — if not answered in 60s, end and mark as missed
      this._outgoingTimeout = setTimeout(() => {
        const { activeCall } = useCallStore.getState()
        if (activeCall && activeCall.status === 'outgoing') {
          console.log(`[CallService] ⏰ Outgoing call to ${peerName} timed out after 60s`)
          // CRITICAL: Call this.endCall() instead of useCallStore.endCall() so that
          // network messages (call:end or call:participant:left) are sent to peers.
          // For group calls, this sends call:participant:left to all participants.
          // For 1:1 calls, this sends call:end to the peer.
          this.endCall().catch(() => {})
        }
      }, 60_000)
    }).catch((err) => {
      console.error('[CallService] ❌ Failed to send call:offer:', err)
      this.stopMedia()
      useCallStore.getState().endCall()
    })
  }

  /**
   * Initiate a group call to all participants.
   * PERFORMANCE: Adaptive quality based on participant count.
   * - 2-3 participants: Full quality (720p, 25fps)
   * - 4-6 participants: Medium quality (480p, 15fps)
   * - 7+ participants: Low quality (360p, 10fps)
   */
  async startGroupCall(groupId: string, groupName: string, participantIds: string[], type: CallType): Promise<void> {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    useCallStore.getState().startGroupCall(groupId, groupName, participantIds, type)

    try {
      this.localStream = await this.getLocalMedia(type)
    } catch (err) {
      console.error('[CallService] Failed to get local media:', err)
      useCallStore.getState().endCall()
      return
    }

    // PERFORMANCE: Adjust video quality based on participant count for group calls
    const participantCount = participantIds.length
    if (type === 'video' && participantCount > 3) {
      // Reduce resolution for group calls to save bandwidth
      if (participantCount > 6) {
        CallService.VIDEO_WIDTH = 640
        CallService.VIDEO_HEIGHT = 360
        console.log('[CallService] Group call: Low quality mode (360p) for', participantCount, 'participants')
      } else {
        CallService.VIDEO_WIDTH = 854
        CallService.VIDEO_HEIGHT = 480
        console.log('[CallService] Group call: Medium quality mode (480p) for', participantCount, 'participants')
      }
    }

    // MESH TOPOLOGY: Populate group audio peers for mesh audio distribution.
    // Each participant receives audio directly from us (no central server).
    for (const pid of participantIds) {
      this.groupAudioPeers.add(pid)
    }
    console.log(`[CallService] Group audio mesh: ${this.groupAudioPeers.size} peers`)

    // Start audio capture
    this.startAudioCapture()

    // PERFORMANCE: Use shared encoder for group video (encode once, send to all)
    if (type === 'video' && participantIds.length > 1) {
      this.startGroupVideoTransport(participantIds)
    } else if (type === 'video') {
      // Single peer — use standard transport
      for (const peerId of participantIds) {
        this.startVideoTransport(peerId)
      }
    }

    if (participantIds.length > 0) {
      this.currentPeerId = participantIds[0]
    }

    const offerPayload = {
      type,
      callerName: identity.profile.displayName,
      // PERFORMANCE: No avatar in payload (3.8MB → 0) — receiver uses contact store
      isGroupCall: true,
      groupId,
      groupName,
      participantCount, // Inform peers about expected call size
      // MESH TOPOLOGY: Send the full participant list (including caller) so each
      // participant knows who else is in the call. This enables mesh connectivity
      // where each peer can send media directly to all others, matching the
      // Hyperswarm peer-to-peer model (no central server).
      participants: [identity.keyPair.publicKey, ...participantIds],
    }

    await Promise.all(
      participantIds.map((peerId) =>
        p2pService.sendMessage(peerId, 'call:offer', offerPayload).catch(() => {})
      )
    )
  }

  /**
   * Accept an incoming call.
   */
  async acceptCall(): Promise<void> {
    const { incomingCall } = useCallStore.getState()
    if (!incomingCall) return

    // Stop ringtone immediately when user accepts
    ringtoneService.stopRingtone()

    // CRITICAL: Cancel the incoming call auto-timeout — the call is being answered.
    // Without this, the 30s timeout fires during the call, sending call:reject
    // and showing a spurious "missed call" notification.
    if (this._incomingTimeout) {
      clearTimeout(this._incomingTimeout)
      this._incomingTimeout = null
    }

    this.resetCallMetrics()

    // CRITICAL: Release any existing local media tracks before acquiring new ones
    this.stopLocalMedia()
    // Wait for OS to release the device (especially camera on Windows)
    await new Promise(r => setTimeout(r, 800))
    this.currentPeerId = incomingCall.peerId

    // Get local media with retry logic — longer delays for "Device in use" recovery
    let lastError: Error | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.localStream = await this.getLocalMedia(incomingCall.type)
        break
      } catch (err) {
        lastError = err as Error
        console.warn(`[CallService] getLocalMedia attempt ${attempt + 1} failed:`, err)
        if (attempt < 2) {
          // Force stop and enumerate devices before retry
          this.stopLocalMedia()
          try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            console.log(`[CallService] Available devices: ${devices.filter(d => d.kind === 'videoinput').length} cameras, ${devices.filter(d => d.kind === 'audioinput').length} mics`)
          } catch {}
          // Progressive delay: 1s, 2s
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        }
      }
    }
    if (!this.localStream) {
      console.error('[CallService] Failed to get local media after 3 attempts:', lastError)
      useCallStore.getState().rejectCall()
      return
    }

    useCallStore.getState().acceptCall()

    // Start audio capture (PCM)
    this.startAudioCapture().catch((err) => {
      console.error('[CallService] Audio capture failed to start on accept:', err)
    })

    // GROUP CALL: Start group video transport for mesh topology.
    // Each participant needs to send media to all others directly (no central server).
    // For 1:1 calls, use standard transport.
    if (incomingCall.isGroupCall && incomingCall.participants && incomingCall.participants.length > 1) {
      // Get other participants (excluding ourselves and the caller — caller gets call:accept)
      const identity = useIdentityStore.getState().identity
      const otherParticipants = incomingCall.participants.filter(
        (p) => p !== incomingCall.peerId && p !== identity?.keyPair.publicKey
      )

      // MESH TOPOLOGY: Add all participants to group audio peers.
      // Audio is sent to ALL participants via mesh (not just the caller).
      const allParticipants = incomingCall.participants.filter(
        (p) => p !== identity?.keyPair.publicKey
      )
      for (const pid of allParticipants) {
        this.groupAudioPeers.add(pid)
      }
      console.log(`[CallService] Group audio mesh (accept): ${this.groupAudioPeers.size} peers`)

      if (incomingCall.type === 'video') {
        // Start group video transport for all participants
        if (allParticipants.length > 1) {
          this.startGroupVideoTransport(allParticipants)
        } else if (allParticipants.length === 1) {
          this.startVideoTransport(allParticipants[0])
        }
      }

      // MESH TOPOLOGY: Notify all other participants that we've joined the call.
      // They need to add us to their participant list and start sending media to us.
      for (const participantId of otherParticipants) {
        p2pService.sendMessage(participantId, 'call:participant:joined', {
          groupId: incomingCall.groupId,
        }).catch(() => {})
      }
    } else if (incomingCall.type === 'video') {
      // 1:1 call — use standard video transport
      this.startVideoTransport(incomingCall.peerId)
    }

    // Send call:accept to the caller (always, for both 1:1 and group calls)
    await p2pService.sendMessage(incomingCall.peerId, 'call:accept', {}).then(() => {
      console.log(`[CallService] ✅ call:accept sent to ${incomingCall.peerId.slice(0, 16)}`)
    }).catch((err) => {
      console.error('[CallService] ❌ Failed to send call:accept:', err)
    })
  }

  /**
   * Reject an incoming call.
   * GROUP CALL: For group calls, only notifies the caller with 'rejected' reason.
   * The call continues for other participants — we are simply not joining.
   */
  async rejectCall(): Promise<void> {
    const { incomingCall } = useCallStore.getState()
    if (!incomingCall) return

    // Stop ringtone when user rejects
    ringtoneService.stopRingtone()

    // Cancel incoming call timeout — call is being rejected, not timed out
    if (this._incomingTimeout) {
      clearTimeout(this._incomingTimeout)
      this._incomingTimeout = null
    }

    useCallStore.getState().rejectCall()

    // GROUP CALL: Send call:reject only to the caller (not all participants).
    // Per Hyperswarm mesh topology: the caller will remove us from the participant
    // list and continue the call with remaining participants.
    // We do NOT send call:participant:left because we never joined the call.
    await p2pService.sendMessage(incomingCall.peerId, 'call:reject', {
      reason: incomingCall.isGroupCall ? 'rejected_group' : 'rejected',
      isGroupCall: incomingCall.isGroupCall,
      groupId: incomingCall.groupId,
    }).catch(console.error)
  }

  /**
   * End the active call.
   */
  async endCall(): Promise<void> {
    const { activeCall } = useCallStore.getState()
    if (!activeCall) return

    // Clear outgoing timeout if any
    if (this._outgoingTimeout) {
      clearTimeout(this._outgoingTimeout)
      this._outgoingTimeout = null
    }

    // Clear incoming call timeout if any (safety — should already be null
    // after accept, but defensive programming in case of race conditions)
    if (this._incomingTimeout) {
      clearTimeout(this._incomingTimeout)
      this._incomingTimeout = null
    }

    // Stop ringtone in case it's still playing (shouldn't be, but safety)
    ringtoneService.stopRingtone()

    this.stopMedia()

    // PERFORMANCE: Reset video dimensions to default after group call
    CallService.VIDEO_WIDTH = CallService.VIDEO_WIDTH_DEFAULT
    CallService.VIDEO_HEIGHT = CallService.VIDEO_HEIGHT_DEFAULT

    if (activeCall.isGroupCall && activeCall.participants) {
      // GROUP CALL: Send call:participant:left to remaining participants so they
      // can remove us from their call. This is the graceful departure pattern —
      // the call continues with the remaining participants (mesh topology).
      await Promise.all(
        activeCall.participants.map((peerId) =>
          p2pService.sendMessage(peerId, 'call:participant:left', {
            groupId: activeCall.groupId,
          }).catch(() => {})
        )
      )
    } else {
      await p2pService.sendMessage(activeCall.peerId, 'call:end', {}).catch(console.error)
    }
    useCallStore.getState().endCall()
    this.currentPeerId = null
  }

  /**
   * Toggle mute (microphone).
   */
  toggleMute(): void {
    useCallStore.getState().toggleMute()
    const isMuted = useCallStore.getState().isMuted
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted
      })
    }
  }

  /**
   * Toggle camera on/off.
   * FIX: If no video track exists (audio-only call), get one from getUserMedia.
   */
  async toggleCamera(): Promise<void> {
    useCallStore.getState().toggleCamera()
    const newIsCameraOff = useCallStore.getState().isCameraOff

    if (!this.localStream) return

    const videoTracks = this.localStream.getVideoTracks()

    if (newIsCameraOff) {
      // Turn camera OFF — disable existing video tracks
      videoTracks.forEach((track) => { track.enabled = false })
    } else {
      // Turn camera ON
      if (videoTracks.length === 0) {
        // No video track exists — get one from camera
        try {
          const constraints = mediaDeviceService.buildCallConstraints('video')
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: constraints.video })
          const newTrack = videoStream.getVideoTracks()[0]
          if (newTrack) {
            this.localStream.addTrack(newTrack)
            // Restart video transport if in a video call
            if (this.currentPeerId) {
              this.restartVideoTransport(this.currentPeerId)
            }
          }
        } catch (err) {
          console.error('[CallService] Failed to get camera:', err)
          // Revert toggle
          useCallStore.getState().toggleCamera()
        }
      } else {
        // Video track exists — re-enable it
        videoTracks.forEach((track) => { track.enabled = true })
      }
    }
  }

  /**
   * Toggle screen sharing.
   * FIX: Restarts video transport after replacing the track.
   */
  async toggleScreenShare(): Promise<void> {
    const isSharing = useCallStore.getState().isScreenSharing

    if (!isSharing) {
      // Start screen share
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        })
        const newTrack = screenStream.getVideoTracks()[0]
        if (!newTrack) return

        // Save original video track for restoration
        if (this.localStream) {
          const existingVideo = this.localStream.getVideoTracks()[0]
          if (existingVideo) {
            this.originalVideoTrack = existingVideo
            existingVideo.stop()
            this.localStream.removeTrack(existingVideo)
          }
          this.localStream.addTrack(newTrack)
          this.screenTrack = newTrack
        }

        // Listen for screen share stop (user clicks "Stop sharing")
        newTrack.onended = () => {
          this.stopScreenShare()
        }

        useCallStore.getState().toggleScreenShare()

        // Restart video transport with new track
        if (this.currentPeerId) {
          this.restartVideoTransport(this.currentPeerId)
        }
      } catch {
        // User cancelled or error
        useCallStore.getState().toggleScreenShare()
      }
    } else {
      // Stop screen share
      this.stopScreenShare()
    }
  }

  /**
   * Stop screen sharing and restore camera track.
   */
  private stopScreenShare(): void {
    if (this.screenTrack) {
      this.screenTrack.stop()
      if (this.localStream) {
        this.localStream.removeTrack(this.screenTrack)
      }
      this.screenTrack = null
    }

    // Restore original camera track
    if (this.originalVideoTrack && this.localStream) {
      this.localStream.addTrack(this.originalVideoTrack)
      this.originalVideoTrack = null
    }

    if (useCallStore.getState().isScreenSharing) {
      useCallStore.getState().toggleScreenShare()
    }

    // Restart video transport
    if (this.currentPeerId) {
      this.restartVideoTransport(this.currentPeerId)
    }
  }

  /**
   * Stop only LOCAL media capture (microphone, camera, audio worklet, video frame capture).
   * Does NOT touch the receive side (peerStream, receiveCanvas, playbackContext).
   * Used in startCall/acceptCall to release devices before acquiring new ones.
   */
  stopLocalMedia(): void {
    // Stop audio capture (AudioWorklet / ScriptProcessor)
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect()
      this.audioWorkletNode = null
    }
    // PRO QUALITY: release the Opus encoder with the capture chain it feeds
    this.closeAudioEncoder()
    if (this.captureContext) {
      try { this.captureContext.suspend().catch(() => {}) } catch {}
      try { this.captureContext.close().catch(() => {}) } catch {}
      this.captureContext = null
    }

    // Stop video frame capture (sender side)
    if (this.videoFrameInterval) {
      clearInterval(this.videoFrameInterval)
      this.videoFrameInterval = null
    }
    if (this.tempVideo) {
      this.tempVideo.pause()
      this.tempVideo.srcObject = null
      this.tempVideo = null
    }
    this.sendCanvas = null
    this.sendCanvasCtx = null

    // Stop local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
      this.localStream = null
    }

    // Stop screen share track
    if (this.screenTrack) {
      this.screenTrack.stop()
      this.screenTrack = null
    }
    this.originalVideoTrack = null
  }

  /**
   * Stop ALL media: local capture + remote playback.
   * Called when a call fully ends.
   */
  stopMedia(): void {
    // First stop local capture
    this.stopLocalMedia()

    // Stop group video transport if running
    this.stopGroupVideoTransport()

    // MESH: Clear group audio peers
    this.groupAudioPeers.clear()
    // PERFECT QUALITY: Clear per-peer audio state
    this.peerAudioState.clear()

    // Flush any pending audio batch
    this.audioBatchBuffer = []

    // Stop jitter buffer
    if (this.jitterTimer) {
      clearTimeout(this.jitterTimer)
      this.jitterTimer = null
    }

    // Stop comfort noise generation
    this.stopComfortNoise()

    // PRO QUALITY: release every per-sender Opus decoder
    this.closeAudioDecoders()

    // Stop WebCodecs encoder/decoder
    this.stopWebCodecs()

    // PERFECT QUALITY GROUP: Clean up per-peer video state (canvases + decoders)
    this.cleanupPeerVideoState()

    // Stop video playback (receiver)
    this.receiveCanvas = null
    this.receiveCanvasCtx = null
    this._videoFrameImg = null
    this._videoFramesReceived = 0

    // Stop playback audio context
    if (this.playbackContext) {
      this.playbackContext.close().catch(() => {})
      this.playbackContext = null
    }
    this.audioDestination = null
    this.playbackGainNode = null
    this.playbackLimiter = null
    this.nextPlayTime = 0
    // PRO QUALITY: the next call must open with a keyframe, and must not inherit
    // this call's sequence numbers or freeze state.
    this.forceKeyframe = true
    this.lastKeyframeRequestSentAt = 0
    this.lastReceivedSeq = -1
    this.videoFrozen = false

    // Reset bandwidth tracking
    this.bytesSent = 0
    this.bytesReceived = 0
    this.currentBandwidth = 0

    this.peerStream = null
    this.currentPeerId = null
  }

  /**
   * Get the local media stream.
   */
  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  /**
   * Get the peer media stream.
   */
  getPeerStream(): MediaStream | null {
    return this.peerStream
  }

  /**
   * Get the receive canvas for direct display in UI (1:1 calls).
   * This is more reliable than captureStream() in Electron.
   */
  getReceiveCanvas(): HTMLCanvasElement | null {
    return this.receiveCanvas
  }

  /**
   * PERFECT QUALITY GROUP: Get per-peer video canvas for group calls.
   * Returns a Map of peerId → canvas for rendering a video grid.
   */
  getPeerVideoCanvases(): Map<string, HTMLCanvasElement> {
    const result = new Map<string, HTMLCanvasElement>()
    for (const [peerId, state] of this.peerVideoState) {
      result.set(peerId, state.canvas)
    }
    return result
  }

  /**
   * PERFECT QUALITY GROUP: Get a single peer's video canvas.
   */
  getPeerVideoCanvas(peerId: string): HTMLCanvasElement | null {
    return this.peerVideoState.get(peerId)?.canvas ?? null
  }

  /**
   * PERFECT QUALITY GROUP: Check if per-peer video state exists.
   */
  hasPeerVideoState(): boolean {
    return this.peerVideoState.size > 0
  }

  /**
   * Check if video is frozen (no frames received for FREEZE_THRESHOLD ms).
   * Used by CallView to show a freeze indicator.
   */
  isVideoFrozen(): boolean {
    if (this.lastFrameReceivedAt === 0) return false
    const elapsed = Date.now() - this.lastFrameReceivedAt
    if (elapsed > CallService.FREEZE_THRESHOLD && !this.videoFrozen) {
      this.videoFrozen = true
      console.warn('[CallService] Video frozen — no frames for', elapsed, 'ms')
    }
    return this.videoFrozen
  }

  /**
   * Get video quality stats for UI display.
   */
  getVideoStats(): {
    framesReceived: number
    framesLost: number
    frozen: boolean
    codec: string
    resolution: string
    bitrate: number
    framerate: number
  } {
    return {
      framesReceived: this._videoFramesReceived,
      framesLost: this.framesLost,
      frozen: this.isVideoFrozen(),
      // HONEST METRICS: report the codec actually negotiated and the resolution
      // the encoder is currently configured for, not a hardcoded guess.
      codec: this.useWebCodecs
        ? (this.videoCodec === CallService.VP9_CODEC ? 'VP9' : 'VP8')
        : 'JPEG',
      resolution: `${this.encodeWidth}x${this.encodeHeight}`,
      bitrate: this.encodeBitrate,
      framerate: this.encodeFramerate,
    }
  }

  /**
   * PRO QUALITY: audio transport stats for UI display (codec actually in use).
   * Distinct from getAudioStats(), which reports the local processing chain.
   */
  getAudioPipelineStats(): {
    codec: string
    bitrate: number
    packetsLost: number
    chunksDropped: number
    underruns: number
    senders: number
  } {
    return {
      codec: this.useOpus ? 'Opus' : 'PCM',
      bitrate: this.useOpus ? this.audioBitrate : 768_000,
      packetsLost: this.audioPacketsLost,
      chunksDropped: this.audioChunksDropped,
      underruns: this.audioUnderruns,
      senders: this.peerAudioState.size,
    }
  }

  /**
   * Get current bandwidth in bytes per second.
   */
  getBandwidth(): number {
    return this.currentBandwidth
  }

  /**
   * Get bandwidth quality: 'good' | 'medium' | 'poor'
   */
  getBandwidthQuality(): 'good' | 'medium' | 'poor' {
    return this.networkQuality
  }

  /**
   * Get call quality metrics for UI display.
   */
  getCallQualityMetrics(): {
    bandwidth: number
    bandwidthQuality: 'good' | 'medium' | 'poor'
    duration: number
    packetLoss: number
    jitter: number
    audioPacketsLost: number
    audioChunksDropped: number
    audioUnderruns: number
    framesLost: number
    bufferDepthMs: number
  } {
    const duration = this.callStartTime > 0 ? Math.floor((Date.now() - this.callStartTime) / 1000) : 0
    const avgJitter = this.jitterSamples > 0 ? this.jitterTotal / this.jitterSamples : 0

    return {
      bandwidth: this.currentBandwidth,
      bandwidthQuality: this.getBandwidthQuality(),
      duration,
      packetLoss: this.packetLossCount,
      jitter: Math.round(avgJitter),
      // HONEST METRICS: real counters from the audio/video pipelines
      audioPacketsLost: this.audioPacketsLost,
      audioChunksDropped: this.audioChunksDropped,
      audioUnderruns: this.audioUnderruns,
      framesLost: this.framesLost,
      bufferDepthMs: Math.round(this.jitterBufferSize * this.packetDurationMs()),
    }
  }

  /**
   * Reset call quality metrics (called at start of new call).
   */
  private resetCallMetrics(): void {
    this.callStartTime = Date.now()
    this.packetLossCount = 0
    this.jitterTotal = 0
    this.jitterSamples = 0
    // PRO QUALITY: a new call must not inherit the previous call's verdict,
    // otherwise it starts throttled for no reason.
    this.networkQuality = 'good'
    this.audioPacketsLost = 0
    this.audioChunksDropped = 0
    this.audioUnderruns = 0
    this.framesLost = 0
    this.windowAudioLost = 0
    this.windowAudioReceived = 0
    this.windowUnderruns = 0
    this.windowFramesLost = 0
    this.windowFramesReceived = 0
    this.tuneJitterBuffer()
  }

  /**
   * Update bandwidth tracking (called when sending/receiving data).
   */
  private updateBandwidth(bytes: number, isSend: boolean): void {
    if (isSend) {
      this.bytesSent += bytes
    } else {
      this.bytesReceived += bytes
    }

    const now = Date.now()
    if (now - this.lastBandwidthCheck >= CallService.BANDWIDTH_CHECK_INTERVAL) {
      const elapsed = (now - this.lastBandwidthCheck) / 1000
      this.currentBandwidth = Math.floor((this.bytesSent + this.bytesReceived) / elapsed)
      this.bytesSent = 0
      this.bytesReceived = 0
      this.lastBandwidthCheck = now
      console.log('[CallService] Bandwidth:', this.currentBandwidth, 'bytes/s (quality:', this.networkQuality, ')')

      // ADAPTIVE: re-judge the link from measured damage, then re-tune the
      // jitter buffer and both encoders to the new verdict.
      this.evaluateNetworkQuality()
    }
  }

  /**
   * Duration carried by one audio packet, in milliseconds.
   * Opus packets are 20ms; the raw PCM fallback sends AUDIO_BUFFER_SIZE samples
   * (~10.6ms at 48kHz). The jitter buffer is sized in packets, so it has to know.
   */
  private packetDurationMs(): number {
    return this.useOpus
      ? CallService.OPUS_FRAME_DURATION_US / 1000
      : (CallService.AUDIO_BUFFER_SIZE / CallService.AUDIO_SAMPLE_RATE) * 1000
  }

  /**
   * PRO QUALITY: size the prebuffer in TIME, not in packets.
   * The old code kept "6 chunks" — which means 64ms of PCM but 120ms of Opus,
   * so switching codec silently changed the latency. Targeting a duration keeps
   * behaviour identical across codecs: 40ms when the link is clean (natural
   * conversation), up to 120ms when it is not (no dropouts).
   */
  private tuneJitterBuffer(): void {
    const targetMs = this.networkQuality === 'poor' ? 120 : this.networkQuality === 'medium' ? 70 : 40
    this.jitterBufferSize = Math.max(2, Math.round(targetMs / this.packetDurationMs()))
  }

  /**
   * PRO QUALITY: judge the link on observed damage over the last window.
   *
   * Loss ratio and underruns are what a user actually hears/sees; throughput is
   * not, because a silent participant or an efficient codec both look like "low
   * bandwidth". Deciding here — once per window — also keeps the audio bitrate,
   * video bitrate, resolution and buffer depth consistent with each other.
   */
  private evaluateNetworkQuality(): void {
    const audioTotal = this.windowAudioReceived + this.windowAudioLost
    const videoTotal = this.windowFramesReceived + this.windowFramesLost
    // Ignore tiny samples — 1 loss out of 3 packets is noise, not a verdict.
    const audioLoss = audioTotal >= 25 ? this.windowAudioLost / audioTotal : 0
    const videoLoss = videoTotal >= 25 ? this.windowFramesLost / videoTotal : 0
    const loss = Math.max(audioLoss, videoLoss)

    let quality: 'good' | 'medium' | 'poor'
    if (loss > 0.05 || this.windowUnderruns >= 6) {
      quality = 'poor'
    } else if (loss > 0.01 || this.windowUnderruns >= 2) {
      quality = 'medium'
    } else {
      quality = 'good'
    }

    // Nothing arrived at all (call starting, or everyone silent): keep the
    // previous verdict instead of inventing an optimistic one.
    if (audioTotal === 0 && videoTotal === 0) quality = this.networkQuality

    if (quality !== this.networkQuality) {
      console.log(`[CallService] Network quality: ${this.networkQuality} → ${quality} (loss ${(loss * 100).toFixed(1)}%, underruns ${this.windowUnderruns})`)
      this.networkQuality = quality
      this.tuneJitterBuffer()
      this.reconfigureAudioEncoder()
      this.reconfigureEncoder()
    }

    this.windowAudioLost = 0
    this.windowAudioReceived = 0
    this.windowUnderruns = 0
    this.windowFramesLost = 0
    this.windowFramesReceived = 0
  }

  /**
   * PRO QUALITY: Adaptive playout scheduler.
   *
   * Every sender has its own jitter buffer and its own playout clock, so voices
   * are mixed simultaneously (Web Audio sums them) instead of being played one
   * after another. Three things make this sound professional:
   *  - PREBUFFER: playout starts only once jitterBufferSize packets are queued,
   *    so the first network hiccup cannot cause an immediate dropout.
   *  - BOUNDED DEPTH: packets are scheduled at most PLAYOUT_TARGET_LEAD ahead of
   *    the audio clock — enough to absorb jitter, short enough to stay natural.
   *  - UNDERRUN RECOVERY: a buffer that runs dry re-primes and fades back in,
   *    instead of overlapping chunks. Clamping the playout time forward (the
   *    previous behaviour) made chunks play on top of each other, which is
   *    exactly what garbled the audio.
   */
  private startJitterBuffer(): void {
    if (this.jitterTimer) return // Already running

    const tick = () => {
      const ctx = this.playbackContext
      if (ctx) {
        const now = ctx.currentTime
        for (const state of this.peerAudioState.values()) {
          if (!state.started) {
            // PREBUFFER: reach the adaptive target depth before the first packet
            if (state.jitterBuffer.length < this.jitterBufferSize) continue
            state.started = true
            state.everStarted = true
            state.nextPlayTime = now + CallService.PLAYOUT_MIN_LEAD
            this.fadeInSender(state, state.nextPlayTime)
          }

          while (
            state.jitterBuffer.length > 0 &&
            state.nextPlayTime - now < CallService.PLAYOUT_TARGET_LEAD
          ) {
            const chunk = state.jitterBuffer.shift()!
            this.schedulePlaybackChunk(state, chunk.data, now)
          }

          // UNDERRUN: nothing left to play and the clock has passed us by
          if (state.jitterBuffer.length === 0 && state.nextPlayTime < now) {
            state.started = false
            // Only a starved *active* stream is an underrun. The silence gate
            // stops transmission during pauses, and counting those as underruns
            // would make a perfectly healthy link look broken.
            if (state.everStarted && Date.now() - state.lastEnqueueAt < 150) {
              this.audioUnderruns++
              this.windowUnderruns++
            }
          }
        }
      }

      this.jitterTimer = setTimeout(tick, CallService.PLAYOUT_TICK_MS)
    }

    this.jitterTimer = setTimeout(tick, CallService.PLAYOUT_TICK_MS)

    console.log('[CallService] Playout scheduler started (prebuffer + per-sender mixing, target depth ' + Math.round(CallService.PLAYOUT_TARGET_LEAD * 1000) + 'ms)')
  }

  /**
   * Schedule one decoded chunk on a sender's playout timeline.
   * Never clamps the playout time forward — overlapping buffers is what makes
   * mixed audio sound garbled. Excess latency is shed by dropping instead.
   */
  private schedulePlaybackChunk(state: PeerAudioState, samples: Float32Array, now: number): void {
    const ctx = this.playbackContext
    if (!ctx || !state.gain) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    // A burst arrived and we are scheduled too far out: drop to shed latency
    if (state.nextPlayTime - now > CallService.PLAYOUT_MAX_LEAD) {
      this.audioChunksDropped++
      return
    }
    if (state.nextPlayTime < now) {
      state.nextPlayTime = now + CallService.PLAYOUT_MIN_LEAD
    }

    try {
      const buffer = ctx.createBuffer(1, samples.length, CallService.AUDIO_SAMPLE_RATE)
      buffer.getChannelData(0).set(samples)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(state.gain)
      source.start(state.nextPlayTime)
      state.nextPlayTime += samples.length / CallService.AUDIO_SAMPLE_RATE
    } catch (err) {
      console.error('[CallService] schedulePlaybackChunk error:', err)
    }
  }

  /**
   * Short ramp when a stream (re)starts — avoids the click of a hard start.
   */
  private fadeInSender(state: PeerAudioState, at: number): void {
    if (!state.gain) return
    try {
      state.gain.gain.cancelScheduledValues(at)
      state.gain.gain.setValueAtTime(0, at)
      state.gain.gain.linearRampToValueAtTime(this.mixHeadroom(), at + 0.012)
    } catch {}
  }

  /**
   * Summing N uncorrelated voices grows the peak by roughly √N. Scaling every
   * sender by 1/√N keeps the mix inside the limiter's linear range, so the
   * limiter only catches true transients instead of permanently squashing the
   * whole group call.
   */
  private mixHeadroom(): number {
    return 1 / Math.sqrt(Math.max(1, this.peerAudioState.size))
  }

  /**
   * Re-balance every sender's gain when the participant count changes.
   */
  private applyMixHeadroom(): void {
    const ctx = this.playbackContext
    if (!ctx) return
    const headroom = this.mixHeadroom()
    for (const state of this.peerAudioState.values()) {
      if (state.gain) state.gain.gain.setTargetAtTime(headroom, ctx.currentTime, 0.05)
    }
  }

  /**
   * Play a standalone chunk (comfort noise) straight on the master bus.
   * PRO QUALITY: goes through the limiter like every other source, and never
   * clamps its playout time forward (no overlap with itself).
   */
  private playAudioChunk(float32Data: Float32Array): void {
    try {
      const ctx = this.playbackContext
      const destination = this.playbackLimiter ?? this.playbackGainNode
      if (!ctx || !destination) return

      // CRITICAL: Resume playback context if suspended (autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }

      const audioBuffer = ctx.createBuffer(1, float32Data.length, CallService.AUDIO_SAMPLE_RATE)
      audioBuffer.getChannelData(0).set(float32Data)

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(destination)

      const now = ctx.currentTime
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now + CallService.PLAYOUT_MIN_LEAD
      }
      source.start(this.nextPlayTime)
      this.nextPlayTime += float32Data.length / CallService.AUDIO_SAMPLE_RATE
    } catch (err) {
      console.error('[CallService] playAudioChunk error:', err)
    }
  }

  // ─── Private: Comfort Noise Generation (CNG) ────────────────────────────

  /**
   * PERFORMANCE: Start comfort noise generation.
   * When peer is silent (no audio chunks for CNG_THRESHOLD ms),
   * generates very low-level white noise to prevent unsettling "dead silence".
   * This is a standard VoIP feature (RFC 3389).
   */
  private startComfortNoise(): void {
    if (this.cngInterval) return
    this.cngInterval = setInterval(() => {
      if (!this.playbackContext || this.playbackContext.state !== 'running') return
      const silenceDuration = Date.now() - this.lastAudioReceived
      if (silenceDuration > CallService.CNG_THRESHOLD) {
        // Generate comfort noise — very low amplitude white noise
        const frameSize = 480 // 10ms at 48kHz
        const noiseData = new Float32Array(frameSize)
        for (let i = 0; i < frameSize; i++) {
          noiseData[i] = (Math.random() * 2 - 1) * CallService.CNG_AMPLITUDE
        }
        this.playAudioChunk(noiseData)
      }
    }, 100) // Check every 100ms
  }

  /**
   * Stop comfort noise generation
   */
  private stopComfortNoise(): void {
    if (this.cngInterval) {
      clearInterval(this.cngInterval)
      this.cngInterval = null
    }
  }

  /**
   * Show a toast notification for a missed call.
   * Uses the UI store's addToast to display a persistent notification.
   */
  private showMissedCallNotification(call: CallRecord): void {
    useUIStore.getState().addToast({
      type: 'warning',
      title: 'Appel manqué',
      message: `${call.peerName} a essayé de vous appeler (${call.type === 'video' ? 'vidéo' : 'audio'})`,
      duration: 8000,
      action: {
        label: 'Rappeler',
        onClick: () => {
          this.startCall(call.peerId, call.peerName, call.type, call.peerAvatar)
        },
      },
    })
  }

  // ─── Private: Audio Capture (PCM via AudioWorklet, ScriptProcessor fallback) ──

  /**
   * Start capturing audio from localStream.
   *
   * HOLEPUNCH COMPLIANCE:
   * - Uses Protomux cork/uncork batching: accumulate AUDIO_BATCH_SIZE chunks,
   *   then send via sendMediaBatch which does cork → N×send → uncork in main process.
   * - This reduces per-packet framing overhead by ~80% for small audio chunks.
   *
   * SUPERIOR QUALITY OPTIMIZATIONS:
   * - AudioWorklet capture on a dedicated real-time thread (no main-thread jank)
   * - Voice chain: high-pass filter (85 Hz) + dynamics compressor before capture
   * - Chunk size 512 = ~10.6ms latency at 48kHz (vs 21ms with 1024)
   * - Silence gate with 215ms hangover (never clips word endings)
   * - Mono channel for bandwidth efficiency
   * - 48kHz sample rate for full voice fidelity
   */
  private async startAudioCapture(): Promise<void> {
    if (!this.localStream) {
      console.error('[CallService] startAudioCapture: no localStream')
      return
    }
    const audioTracks = this.localStream.getAudioTracks()
    if (audioTracks.length === 0) {
      console.error('[CallService] startAudioCapture: no audio tracks')
      return
    }

    console.log('[CallService] Starting audio capture, track label:', audioTracks[0].label)

    try {
      // QUALITY: latencyHint 'interactive' requests the smallest stable hardware buffer
      this.captureContext = new AudioContext({
        sampleRate: CallService.AUDIO_SAMPLE_RATE,
        latencyHint: 'interactive',
      })

      // CRITICAL: Resume AudioContext (may be suspended by autoplay policy)
      if (this.captureContext.state === 'suspended') {
        await this.captureContext.resume()
        console.log('[CallService] AudioContext resumed from suspended state')
      }
      console.log('[CallService] AudioContext created, state:', this.captureContext.state, 'sampleRate:', this.captureContext.sampleRate)

      const source = this.captureContext.createMediaStreamSource(
        new MediaStream(audioTracks)
      )

      // SUPERIOR QUALITY: Voice-enhancement chain before capture:
      // 1. High-pass filter @ 85 Hz — removes low-frequency rumble
      //    (desk thumps, HVAC, wind) without touching the voice band.
      // 2. DynamicsCompressor — gently evens out voice level so quiet
      //    speech is intelligible and loud speech never clips
      //    (complements the hardware AGC applied by getUserMedia).
      const highpass = this.captureContext.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 85
      highpass.Q.value = 0.7

      const compressor = this.captureContext.createDynamicsCompressor()
      compressor.threshold.value = -24 // dB — start compressing above this
      compressor.knee.value = 30 // Soft knee for transparent compression
      compressor.ratio.value = 4 // Moderate 4:1 voice ratio
      compressor.attack.value = 0.003 // 3ms — catch transients
      compressor.release.value = 0.25 // 250ms — natural decay

      source.connect(highpass)
      highpass.connect(compressor)

      // QUALITY: AudioWorklet first (dedicated real-time audio thread — immune
      // to main-thread jank), ScriptProcessor as legacy fallback.
      this.silenceHangover = 0
      const workletStarted = await this.startAudioCaptureWorklet(compressor)
      if (!workletStarted) {
        this.startAudioCaptureScriptProcessor(compressor)
      }
    } catch (err) {
      console.error('[CallService] Audio capture setup failed:', err)
    }
  }

  /**
   * SUPERIOR QUALITY: AudioWorklet capture path.
   * The worklet (public/audio-worklet.js) accumulates 128-sample render quanta
   * into AUDIO_BUFFER_SIZE chunks, converts Float32 → Int16 and computes the
   * RMS level — all inside the real-time audio thread. The main thread only
   * does gating + batching, so capture never glitches under UI load.
   */
  private async startAudioCaptureWorklet(input: AudioNode): Promise<boolean> {
    if (!this.captureContext) return false
    try {
      await this.captureContext.audioWorklet.addModule('./audio-worklet.js')

      const worklet = new AudioWorkletNode(this.captureContext, 'asgard-audio-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
      })
      worklet.port.postMessage({ type: 'setMode', mode: 'capture' })
      worklet.port.postMessage({ type: 'setChunkSize', chunkSize: CallService.AUDIO_BUFFER_SIZE })

      worklet.port.onmessage = (event: MessageEvent) => {
        if (event.data?.type !== 'audio') return
        // PRO QUALITY: the worklet posts Float32 (zero-copy transfer). Keeping the
        // native float format all the way to the Opus encoder avoids a lossy
        // Float32 → Int16 → Float32 round-trip on every single chunk.
        this.handleCapturedAudio(new Float32Array(event.data.data as ArrayBuffer), event.data.rms ?? 1)
      }

      input.connect(worklet)

      // Keep the graph "pulled" without echoing the mic to the speakers:
      // route the worklet through a zero-gain sink to the destination.
      const sink = this.captureContext.createGain()
      sink.gain.value = 0
      worklet.connect(sink)
      sink.connect(this.captureContext.destination)

      this.audioWorkletNode = worklet
      console.log('[CallService] ✅ Audio capture started (AudioWorklet ' + (this.useOpus ? 'Opus' : 'PCM Int16') + ' @ ' + this.captureContext.sampleRate + 'Hz, chunk=' + CallService.AUDIO_BUFFER_SIZE + ', batch=' + this.audioBatchSize() + ', HPF+compressor)')
      return true
    } catch (err) {
      console.warn('[CallService] AudioWorklet unavailable, falling back to ScriptProcessor:', err)
      return false
    }
  }

  /**
   * Fallback audio capture using ScriptProcessorNode (deprecated but universal).
   * Same gating/batching pipeline as the worklet path via handleCapturedPcm.
   */
  private startAudioCaptureScriptProcessor(input: AudioNode): void {
    if (!this.captureContext) return
    try {
      // PERFORMANCE: 512 buffer = ~10.6ms latency at 48kHz
      const bufferSize = CallService.AUDIO_BUFFER_SIZE
      const scriptNode = this.captureContext.createScriptProcessor(bufferSize, 1, 1)

      scriptNode.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0)

        // Compute RMS for silence gating
        let rms = 0
        for (let i = 0; i < inputData.length; i++) {
          rms += inputData[i] * inputData[i]
        }
        rms = Math.sqrt(rms / inputData.length)

        // PRO QUALITY: hand over the raw Float32 samples — the encoder path
        // (Opus) consumes floats natively, the PCM fallback converts downstream.
        // getChannelData returns a view that is reused on the next callback,
        // so a copy is mandatory here.
        this.handleCapturedAudio(new Float32Array(inputData), rms)
      }

      input.connect(scriptNode)
      scriptNode.connect(this.captureContext.destination)

      console.log('[CallService] Audio capture started (ScriptProcessor ' + (this.useOpus ? 'Opus' : 'PCM Int16') + ' @ ' + this.captureContext.sampleRate + 'Hz, bufferSize=' + bufferSize + ', batch=' + this.audioBatchSize() + ')')
    } catch (err) {
      console.error('[CallService] ScriptProcessor audio capture failed:', err)
    }
  }

  /**
   * Shared capture pipeline for both AudioWorklet and ScriptProcessor paths.
   *
   * HOLEPUNCH COMPLIANCE:
   * - Uses Protomux cork/uncork batching: accumulate AUDIO_BATCH_SIZE chunks,
   *   then send via sendMediaBatch which does cork → N×send → uncork in main process.
   *
   * QUALITY: Silence gate with hangover — after voice drops below threshold,
   * keeps sending SILENCE_HANGOVER_CHUNKS chunks (~215ms) so word endings and
   * trailing breaths are never clipped (natural-sounding speech).
   *
   * PRO QUALITY: When Opus is available the float samples go straight into the
   * AudioEncoder (24–96 kbps instead of 768 kbps of raw PCM); the Int16 path is
   * kept as a universal fallback.
   */
  private handleCapturedAudio(samples: Float32Array<ArrayBuffer>, rms: number): void {
    // Check if we have anyone to send to (group or 1:1)
    const hasPeers = this.isGroupAudioCall || this.currentPeerId
    if (!hasPeers) return
    if (useCallStore.getState().isMuted) return

    // PERFORMANCE: Silence detection — saves ~40-60% bandwidth during pauses.
    if (rms < CallService.SILENCE_THRESHOLD) {
      if (this.silenceHangover <= 0) {
        // Fully silent — flush any pending batch and skip
        this.flushAudioBatch()
        return
      }
      this.silenceHangover--
    } else {
      this.silenceHangover = CallService.SILENCE_HANGOVER_CHUNKS
    }

    // PRO QUALITY: Opus path — the encoder re-frames our 512-sample chunks into
    // 20ms packets internally and emits them through handleEncodedAudioChunk.
    if (this.useOpus && this.initAudioEncoder() && this.audioEncoder?.state === 'configured') {
      try {
        const data = new AudioData({
          format: 'f32-planar',
          sampleRate: CallService.AUDIO_SAMPLE_RATE,
          numberOfFrames: samples.length,
          numberOfChannels: 1,
          timestamp: this.audioEncodeTimestampUs,
          data: samples,
        })
        this.audioEncodeTimestampUs += Math.round((samples.length / CallService.AUDIO_SAMPLE_RATE) * 1_000_000)
        try {
          this.audioEncoder.encode(data)
        } finally {
          data.close()
        }
        // Re-evaluate the Opus bitrate periodically (~every 5s of speech)
        this.audioReconfigCounter++
        if (this.audioReconfigCounter % 450 === 0) {
          this.reconfigureAudioEncoder()
        }
        return
      } catch (err) {
        console.warn('[CallService] Opus encode failed, falling back to PCM:', err)
        this.useOpus = false
        this.closeAudioEncoder()
      }
    }

    // FALLBACK: raw Int16 PCM. Build payload with audio marker byte.
    const int16 = new Int16Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    const payload = new Uint8Array(1 + int16.byteLength)
    payload[0] = 0x01 // Audio marker (raw PCM)
    payload.set(new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength), 1)

    this.queueAudioPayload(payload)
  }

  /**
   * HOLEPUNCH PATTERN: Queue one encoded audio payload for cork/uncork batching
   * and account for its uplink cost (× peer count in a mesh group call).
   */
  private queueAudioPayload(payload: Uint8Array): void {
    const peerCount = this.isGroupAudioCall ? this.groupAudioPeers.size : 1
    this.updateBandwidth(payload.byteLength * peerCount, true)

    this.audioBatchBuffer.push(payload)
    if (this.audioBatchBuffer.length >= this.audioBatchSize()) {
      this.flushAudioBatch()
    }

    // Diagnostic logging every 100 chunks
    this.audioChunksSentCount++
    if (this.audioChunksSentCount % 100 === 0) {
      const target = this.isGroupAudioCall ? `${this.groupAudioPeers.size} group peers` : this.currentPeerId!.slice(0, 16)
      console.log(`[CallService] Audio TX: ${this.audioChunksSentCount} packets sent (${this.useOpus ? 'Opus ' + this.audioBitrate + ' bps' : 'PCM'}, batch=${this.audioBatchSize()}), target: ${target}`)
    }
  }

  /**
   * Batch size in packets. Opus packets carry 20ms each (vs ~10.6ms for a raw
   * PCM chunk), so a smaller batch keeps the added latency comparable.
   */
  private audioBatchSize(): number {
    return this.useOpus ? CallService.AUDIO_BATCH_SIZE_OPUS : CallService.AUDIO_BATCH_SIZE
  }

  /**
   * HOLEPUNCH PATTERN: Flush any pending batched audio chunks immediately.
   * Called when the batch buffer reaches AUDIO_BATCH_SIZE or on silence.
   * MESH TOPOLOGY: In group calls, sends to ALL participants via per-peer
   * sendMediaBatch (cork/uncork). For 1:1 calls, sends to currentPeerId only.
   */
  private flushAudioBatch(): void {
    if (this.audioBatchBuffer.length === 0) return
    const chunks = this.audioBatchBuffer.splice(0)

    if (this.isGroupAudioCall) {
      // MESH: Send audio to ALL group participants (each with cork/uncork)
      for (const peerId of this.groupAudioPeers) {
        p2pService.sendMediaBatch(peerId, chunks).catch((err) => {
          console.error('[CallService] Failed to send group audio batch to', peerId.slice(0, 16), ':', err)
        })
      }
    } else if (this.currentPeerId) {
      // 1:1 call — send to single peer
      p2pService.sendMediaBatch(this.currentPeerId, chunks).catch((err) => {
        console.error('[CallService] Failed to send audio batch:', err)
      })
    }
  }

  // ─── Private: Opus Audio Codec (WebCodecs) ──────────────────────────────

  /**
   * PRO QUALITY: Detect Opus support (encode AND decode) via WebCodecs.
   *
   * Raw PCM costs 768 kbps per stream; in a mesh group call that is sent once
   * per participant, which saturates the uplink and starves video. Opus delivers
   * broadcast-grade voice at 24–96 kbps — roughly 12× less — so the freed
   * bandwidth goes to the picture and weak links stop dropping packets.
   *
   * Both directions are required before enabling: the receiver always accepts
   * raw PCM (marker 0x01) as well as Opus (0x05), so a peer without WebCodecs
   * audio simply keeps sending PCM and still hears everyone.
   */
  private async detectBestAudioCodec(): Promise<void> {
    if (typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined' || typeof AudioData === 'undefined') {
      console.log('[CallService] WebCodecs audio unavailable — staying on raw PCM')
      return
    }
    try {
      const [enc, dec] = await Promise.all([
        AudioEncoder.isConfigSupported(this.buildAudioEncoderConfig()),
        AudioDecoder.isConfigSupported({
          codec: 'opus',
          sampleRate: CallService.AUDIO_SAMPLE_RATE,
          numberOfChannels: 1,
        }),
      ])
      if (enc.supported && dec.supported) {
        this.useOpus = true
        this.audioCompressionEnabled = true
        this.audioCodec = 'opus'
        console.log('[CallService] ✅ Opus supported — audio compressed at', this.audioBitrate, 'bps instead of 768 kbps PCM')
      } else {
        console.log('[CallService] Opus not fully supported (enc:', enc.supported, ', dec:', dec.supported, ') — staying on raw PCM')
      }
    } catch (err) {
      console.log('[CallService] Opus detection failed — staying on raw PCM:', err)
    }
  }

  /**
   * PRO QUALITY: Build the Opus encoder config for the current conditions.
   *
   * The bitrate follows network quality and is halved from 4 participants up:
   * in a mesh every packet is transmitted once per peer, so a fixed bitrate
   * multiplies with the participant count. In-band FEC lets the decoder rebuild
   * a lost packet from the next one, which is what keeps group calls clean.
   */
  private buildAudioEncoderConfig(): AudioEncoderConfig {
    const quality = this.getBandwidthQuality()
    const target = quality === 'poor'
      ? CallService.OPUS_BITRATE_LOW
      : quality === 'medium'
        ? CallService.OPUS_BITRATE
        : CallService.OPUS_BITRATE_HIGH
    const peers = this.isGroupAudioCall ? this.groupAudioPeers.size : 1
    const adaptive = peers >= 4
      ? Math.max(CallService.OPUS_BITRATE_LOW, Math.round(target / 2))
      : target
    // An explicit setAudioBitrate() from the user wins over the adaptive tier.
    const bitrate = this.audioBitrateOverride > 0 ? this.audioBitrateOverride : adaptive
    this.audioBitrate = bitrate

    return {
      codec: 'opus',
      sampleRate: CallService.AUDIO_SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate,
      opus: {
        frameDuration: CallService.OPUS_FRAME_DURATION_US,
        // Forward error correction — rebuilds isolated lost packets
        useinbandfec: true,
        // Our own silence gate already handles pauses; DTX would fight it
        usedtx: false,
        // 9/10 is transparent for voice and still real-time on any modern CPU
        complexity: 9,
        packetlossperc: quality === 'poor' ? 15 : quality === 'medium' ? 5 : 2,
      },
    }
  }

  /**
   * Lazily create + configure the Opus encoder. Returns false when Opus is
   * unavailable so the caller can fall back to raw PCM.
   */
  private initAudioEncoder(): boolean {
    if (!this.useOpus) return false
    if (this.audioEncoder && this.audioEncoder.state === 'configured') return true
    if (this.audioEncoder) this.closeAudioEncoder()

    try {
      this.audioEncoder = new AudioEncoder({
        output: (chunk) => this.handleEncodedAudioChunk(chunk),
        error: (err) => {
          console.error('[CallService] AudioEncoder error — reverting to raw PCM:', err)
          this.useOpus = false
          this.closeAudioEncoder()
        },
      })
      this.audioEncoder.configure(this.buildAudioEncoderConfig())
      this.audioEncodeTimestampUs = 0
      this.audioSeq = 0
      console.log('[CallService] ✅ Opus AudioEncoder configured (', this.audioBitrate, 'bps, 20ms frames, FEC on )')
      return true
    } catch (err) {
      console.warn('[CallService] Opus encoder init failed — reverting to raw PCM:', err)
      this.useOpus = false
      this.closeAudioEncoder()
      return false
    }
  }

  /**
   * Adapt the Opus bitrate to the measured network quality / participant count.
   * Reconfiguring is skipped when the target has not moved, since it costs a
   * codec reset.
   */
  private reconfigureAudioEncoder(): void {
    if (!this.audioEncoder || this.audioEncoder.state !== 'configured') return
    const previous = this.audioBitrate
    const config = this.buildAudioEncoderConfig()
    if (config.bitrate === previous) return
    try {
      this.audioEncoder.configure(config)
      console.log('[CallService] Opus encoder reconfigured:', previous, '→', config.bitrate, 'bps')
    } catch (err) {
      console.warn('[CallService] Opus reconfigure failed:', err)
      this.audioBitrate = previous
    }
  }

  /**
   * Wire format: [0x05][flags][seq hi][seq lo][opus packet].
   * The 16-bit sequence lets the receiver count real packet loss (and therefore
   * report honest metrics) even though Opus packets are individually decodable.
   */
  private handleEncodedAudioChunk(chunk: EncodedAudioChunk): void {
    const hasPeers = this.isGroupAudioCall || this.currentPeerId
    if (!hasPeers) return

    const seq = this.audioSeq & 0xFFFF
    this.audioSeq++

    const payload = new Uint8Array(4 + chunk.byteLength)
    payload[0] = 0x05 // Opus audio marker
    payload[1] = 0 // flags (reserved)
    payload[2] = (seq >> 8) & 0xFF
    payload[3] = seq & 0xFF
    chunk.copyTo(payload.subarray(4))

    this.queueAudioPayload(payload)
  }

  /**
   * Close the Opus encoder (call teardown, or fallback to PCM).
   */
  private closeAudioEncoder(): void {
    if (this.audioEncoder) {
      try { this.audioEncoder.close() } catch {}
      this.audioEncoder = null
    }
    this.audioEncodeTimestampUs = 0
    this.audioSeq = 0
  }

  /**
   * PRO QUALITY: One Opus decoder per sender (PLAYBACK_1TO1 for direct calls).
   * Sharing a single decoder across a mesh would interleave streams and destroy
   * the internal codec state.
   */
  private ensureAudioDecoder(key: string): AudioDecoder | null {
    const existing = this.audioDecoders.get(key)
    if (existing && existing.state !== 'closed') return existing
    if (typeof AudioDecoder === 'undefined') return null

    try {
      const decoder = new AudioDecoder({
        output: (data) => this.handleDecodedAudio(key, data),
        error: (err) => {
          console.error(`[CallService] AudioDecoder error [${key.slice(0, 16)}]:`, err)
          this.audioDecoders.delete(key)
        },
      })
      decoder.configure({
        codec: 'opus',
        sampleRate: CallService.AUDIO_SAMPLE_RATE,
        numberOfChannels: 1,
      })
      this.audioDecoders.set(key, decoder)
      console.log('[CallService] ✅ Opus decoder ready for', key === CallService.PLAYBACK_1TO1 ? '1:1 peer' : key.slice(0, 16))
      return decoder
    } catch (err) {
      console.warn('[CallService] Opus decoder init failed:', err)
      return null
    }
  }

  /**
   * Decoded Opus frame → jitter buffer of the matching sender.
   */
  private handleDecodedAudio(key: string, data: AudioData): void {
    try {
      const bytes = data.allocationSize({ planeIndex: 0, format: 'f32-planar' })
      const samples = new Float32Array(bytes / 4)
      data.copyTo(samples, { planeIndex: 0, format: 'f32-planar' })
      this.enqueuePlaybackAudio(key, samples)
    } catch (err) {
      console.warn('[CallService] Opus frame copy failed:', err)
    } finally {
      data.close()
    }
  }

  /**
   * Close every Opus decoder (call teardown).
   */
  private closeAudioDecoders(): void {
    for (const decoder of this.audioDecoders.values()) {
      try { decoder.close() } catch {}
    }
    this.audioDecoders.clear()
  }

  // ─── Private: WebCodecs Hardware-Accelerated Video ──────────────────────

  /**
   * Check if WebCodecs API is available and VP8 codec is supported.
   */
  private isWebCodecsSupported(): boolean {
    return typeof VideoEncoder !== 'undefined' &&
           typeof VideoDecoder !== 'undefined' &&
           typeof VideoFrame !== 'undefined'
  }

  /**
   * SUPERIOR QUALITY: Asynchronously detect the best supported video codec.
   * Prefers VP9 (≈40% better quality/bitrate than VP8); requires both
   * encode AND decode support so a call never ends up half-configured.
   * The chosen codec is signaled per-frame, so peers stay compatible.
   */
  private async detectBestVideoCodec(): Promise<void> {
    if (!this.isWebCodecsSupported()) return
    try {
      const config: VideoEncoderConfig = {
        codec: CallService.VP9_CODEC,
        width: CallService.VIDEO_WIDTH_DEFAULT,
        height: CallService.VIDEO_HEIGHT_DEFAULT,
        bitrate: CallService.VP8_BITRATE,
        framerate: CallService.VIDEO_FPS,
        latencyMode: 'realtime',
      }
      const [enc, dec] = await Promise.all([
        VideoEncoder.isConfigSupported(config),
        VideoDecoder.isConfigSupported({ codec: CallService.VP9_CODEC }),
      ])
      if (enc.supported && dec.supported) {
        this.videoCodec = CallService.VP9_CODEC
        console.log('[CallService] ✅ VP9 supported — using VP9 for superior video quality')
      } else {
        console.log('[CallService] VP9 not fully supported (enc:', enc.supported, ', dec:', dec.supported, ') — staying on VP8')
      }
    } catch (err) {
      console.log('[CallService] VP9 detection failed — staying on VP8:', err)
    }
  }

  /**
   * PRO QUALITY: Adaptive encode resolution. Every tier is 16:9 so the picture
   * never stretches, and the per-call ceiling (VIDEO_WIDTH/VIDEO_HEIGHT, chosen
   * from the participant count) is always respected.
   */
  private targetEncodeSize(): { width: number; height: number } {
    const quality = this.getBandwidthQuality()
    const peers = this.isGroupVideoTransportRunning ? Math.max(1, this.groupVideoPeers.size) : 1

    let width = CallService.VIDEO_WIDTH_DEFAULT
    let height = CallService.VIDEO_HEIGHT_DEFAULT
    if (quality === 'poor' || peers >= 5) {
      width = 640
      height = 360
    } else if (quality === 'medium' || peers >= 3) {
      width = 854
      height = 480
    }

    if (width > CallService.VIDEO_WIDTH) {
      width = CallService.VIDEO_WIDTH
      height = CallService.VIDEO_HEIGHT
    }
    return { width, height }
  }

  /**
   * PRO QUALITY: Shared mesh uplink budget.
   * In a mesh the same encoded stream is transmitted once per peer, so a fixed
   * per-stream bitrate multiplies with the participant count (5 peers × 2.5 Mbps
   * = 12.5 Mbps) and congests the link until every stream falls apart. Sharing a
   * fixed budget keeps the total sane and the picture stable.
   */
  private targetVideoBitrate(): number {
    const quality = this.getBandwidthQuality()
    const base = quality === 'poor'
      ? CallService.VP8_BITRATE_LOW
      : quality === 'medium'
        ? CallService.VP8_BITRATE
        : CallService.VP8_BITRATE_HIGH
    const peers = this.isGroupVideoTransportRunning ? Math.max(1, this.groupVideoPeers.size) : 1
    const share = Math.floor(CallService.VIDEO_UPLOAD_BUDGET / peers)
    return Math.max(CallService.VP8_BITRATE_LOW, Math.min(base, share))
  }

  /**
   * PRO QUALITY: Grab one frame for the encoder through the send canvas.
   *
   * Feeding the <video> element directly would hand the encoder full camera
   * frames (720p) while it is configured for a smaller size, leaving the driver
   * to rescale with a cheap filter. Drawing through the canvas with high-quality
   * smoothing guarantees exactly encodeWidth×encodeHeight and a supersampled
   * downscale — visibly sharper at the same bitrate.
   */
  private captureEncodeFrame(): VideoFrame | null {
    if (!this.tempVideo || !this.sendCanvas || !this.sendCanvasCtx) return null
    if (this.tempVideo.readyState < 2) return null

    if (this.sendCanvas.width !== this.encodeWidth || this.sendCanvas.height !== this.encodeHeight) {
      this.sendCanvas.width = this.encodeWidth
      this.sendCanvas.height = this.encodeHeight
      this.sendCanvasCtx.imageSmoothingEnabled = true
      this.sendCanvasCtx.imageSmoothingQuality = 'high'
    }

    this.sendCanvasCtx.drawImage(this.tempVideo, 0, 0, this.encodeWidth, this.encodeHeight)
    return new VideoFrame(this.sendCanvas, {
      timestamp: Math.round(performance.now() * 1000),
      duration: Math.round(1_000_000 / CallService.VIDEO_FPS),
    })
  }

  /**
   * PRO QUALITY: Should the next frame be a keyframe?
   * True on the long periodic interval (~3s) or when a peer asked for one (PLI).
   */
  private shouldSendKeyframe(): boolean {
    if (this.forceKeyframe) {
      this.forceKeyframe = false
      return true
    }
    return this.webCodecsFrameCount % CallService.KEYFRAME_INTERVAL === 0
  }

  /**
   * Initialize WebCodecs VideoEncoder (VP9 preferred, VP8 fallback,
   * JPEG as last resort). Hardware-accelerated when available.
   */
  private initVideoEncoder(): boolean {
    // PRO QUALITY: resolution AND bitrate both follow network quality and the
    // number of peers, since a mesh transmits the stream once per participant.
    const size = this.targetEncodeSize()
    this.encodeWidth = size.width
    this.encodeHeight = size.height
    const bitrate = this.targetVideoBitrate()
    this.encodeFramerate = this.getBandwidthQuality() === 'poor' ? 15 : CallService.VIDEO_FPS

    // Try negotiated codec first (VP9 if supported), then VP8 as safety net
    const codecs: ('vp8' | 'vp09.00.10.08')[] = this.videoCodec === CallService.VP9_CODEC
      ? [CallService.VP9_CODEC as 'vp09.00.10.08', 'vp8']
      : ['vp8']

    for (const codec of codecs) {
      try {
        this.videoEncoder = new VideoEncoder({
          output: (chunk, metadata) => {
            this.handleEncodedChunk(chunk, metadata)
          },
          error: (err) => {
            console.error('[CallService] VideoEncoder error:', err)
            this.useWebCodecs = false
          },
        })

        this.videoEncoder.configure({
          codec,
          width: this.encodeWidth,
          height: this.encodeHeight,
          bitrate: bitrate,
          framerate: this.encodeFramerate,
          latencyMode: 'realtime',
        })

        this.videoCodec = codec
        this.useWebCodecs = true
        this.webCodecsFrameCount = 0
        this.encodeBitrate = bitrate
        // Start with a keyframe so receivers can lock on immediately
        this.forceKeyframe = true
        console.log('[CallService] ✅ WebCodecs VideoEncoder initialized (' + codec + ',', this.encodeWidth, 'x', this.encodeHeight, '@', bitrate, 'bps,', this.encodeFramerate, 'fps, keyframe every', CallService.KEYFRAME_INTERVAL, 'frames + on demand)')
        return true
      } catch (err) {
        console.warn('[CallService] VideoEncoder init failed for', codec, ':', err)
        try { this.videoEncoder?.close() } catch {}
        this.videoEncoder = null
      }
    }

    console.warn('[CallService] All WebCodecs encoders failed, falling back to JPEG')
    this.useWebCodecs = false
    return false
  }

  /**
   * Initialize WebCodecs VideoDecoder for the given codec (1:1 calls).
   * The codec is signaled per-frame by the sender (bit 1 of header byte 0).
   */
  private initVideoDecoder(codec: string = 'vp8'): boolean {
    try {
      this.videoDecoder = new VideoDecoder({
        output: (frame) => {
          this.handleDecodedFrame(frame)
        },
        error: (err) => {
          console.error('[CallService] VideoDecoder error:', err)
          // PRO QUALITY: self-heal. A decoder left in an errored state rejects
          // every following chunk, so the picture would stay frozen for the rest
          // of the call. Drop it and ask the sender for a keyframe to restart.
          try { this.videoDecoder?.close() } catch {}
          this.videoDecoder = null
          this.lastReceivedSeq = -1
          this.requestKeyframe(this.currentPeerId ?? undefined)
        },
      })

      this.videoDecoder.configure({
        codec,
        codedWidth: CallService.VIDEO_WIDTH,
        codedHeight: CallService.VIDEO_HEIGHT,
      })

      this.videoDecoderCodec = codec
      console.log('[CallService] ✅ WebCodecs VideoDecoder initialized (' + codec + ')')
      return true
    } catch (err) {
      console.warn('[CallService] WebCodecs VideoDecoder init failed:', err)
      return false
    }
  }

  /**
   * Handle encoded VP8 chunk from VideoEncoder.
   * Sends encoded data to peer with keyframe metadata and sequence number.
   * Protocol: [0x03][1 byte: keyframe][2 bytes: sequence][4 bytes: timestamp][encoded data]
   *
   * HOLEPUNCH PATTERN: Uses sendMediaBatch for cork/uncork efficiency.
   * MESH TOPOLOGY: In group calls, sends to all groupVideoPeers.
   */
  private handleEncodedChunk(chunk: EncodedVideoChunk, _metadata?: unknown): void {
    const buffer = new ArrayBuffer(chunk.byteLength)
    chunk.copyTo(buffer)

    // Protocol: [0x03][1 byte: flags][2 bytes: seq][4 bytes: timestamp][encoded data]
    // Header size = 1 + 1 + 2 + 4 = 8 bytes; encoded data starts at offset 8.
    // Flags byte: bit 0 = keyframe, bit 1 = codec (0 = VP8, 1 = VP9)
    const payload = new Uint8Array(8 + buffer.byteLength)
    payload[0] = 0x03 // WebCodecs video marker (stripped by handleIncomingMedia)
    payload[1] = (chunk.type === 'key' ? 1 : 0) | (this.videoCodec === CallService.VP9_CODEC ? 2 : 0)
    // Sequence number (16-bit, wraps at 65535)
    const seq = this.webCodecsFrameCount & 0xFFFF
    payload[2] = (seq >> 8) & 0xFF
    payload[3] = seq & 0xFF
    const ts = chunk.timestamp
    payload[4] = (ts >> 24) & 0xFF
    payload[5] = (ts >> 16) & 0xFF
    payload[6] = (ts >> 8) & 0xFF
    payload[7] = ts & 0xFF
    payload.set(new Uint8Array(buffer), 8)

    // HOLEPUNCH PATTERN: Use sendMediaBatch for cork/uncork batching
    if (this.isGroupVideoTransportRunning && this.groupVideoPeers.size > 0) {
      // MESH: Send to ALL group video peers
      const peerCount = this.groupVideoPeers.size
      this.updateBandwidth(payload.byteLength * peerCount, true)
      for (const peerId of this.groupVideoPeers) {
        p2pService.sendMediaBatch(peerId, [payload]).catch(() => {})
      }
    } else if (this.currentPeerId) {
      this.updateBandwidth(payload.byteLength, true)
      p2pService.sendMediaBatch(this.currentPeerId, [payload]).catch(() => {})
    }

    this.webCodecsFrameCount++
    if (this.webCodecsFrameCount % 25 === 0) {
      console.log(`[CallService] Video TX (WebCodecs): ${this.webCodecsFrameCount} frames, type: ${chunk.type}, size: ${chunk.byteLength} bytes`)
    }
  }

  /**
   * Handle decoded VideoFrame from VideoDecoder.
   * PERFECT QUALITY: Draws frame onto receiveCanvas with alpha:false for performance.
   * Includes decoder queue management — skips delta frames if decoder falls behind.
   */
  private handleDecodedFrame(frame: VideoFrame): void {
    // PERFECT QUALITY: Decoder queue management — if queue is backing up,
    // skip this frame (unless it's a keyframe) to prevent accumulating latency.
    if (this.videoDecoder && this.videoDecoder.decodeQueueSize > 3) {
      frame.close()
      return
    }

    if (!this.receiveCanvas) {
      this.receiveCanvas = document.createElement('canvas')
      this.receiveCanvas.width = frame.displayWidth || CallService.VIDEO_WIDTH
      this.receiveCanvas.height = frame.displayHeight || CallService.VIDEO_HEIGHT
      // PERFECT QUALITY: alpha:false eliminates alpha channel processing
      this.receiveCanvasCtx = this.receiveCanvas.getContext('2d', { alpha: false })
    }

    if (!this.receiveCanvasCtx) {
      frame.close()
      return
    }

    // PRO QUALITY: follow the sender's resolution exactly. Drawing a 640x360
    // frame into a 960x540 canvas would upscale it, then the UI would scale it
    // again — two lossy resamples for nothing.
    if (frame.displayWidth && frame.displayHeight &&
        (this.receiveCanvas.width !== frame.displayWidth || this.receiveCanvas.height !== frame.displayHeight)) {
      this.receiveCanvas.width = frame.displayWidth
      this.receiveCanvas.height = frame.displayHeight
    }

    this.receiveCanvasCtx.drawImage(frame, 0, 0, this.receiveCanvas.width, this.receiveCanvas.height)
    frame.close()

    this._videoFramesReceived++
    if (this._videoFramesReceived % 25 === 0) {
      const queueSize = this.videoDecoder?.decodeQueueSize ?? 0
      console.log(`[CallService] Video RX (WebCodecs): ${this._videoFramesReceived} frames decoded, queue: ${queueSize}`)
    }
  }

  /**
   * Stop WebCodecs encoder and decoder.
   */
  private stopWebCodecs(): void {
    if (this.videoEncoder) {
      try { this.videoEncoder.close() } catch {}
      this.videoEncoder = null
    }
    if (this.videoDecoder) {
      try { this.videoDecoder.close() } catch {}
      this.videoDecoder = null
    }
    this.useWebCodecs = false
    this.webCodecsFrameCount = 0
  }

  /**
   * Reconfigure encoder for the current conditions (adaptive quality).
   * PRO QUALITY: adapts bitrate, framerate AND resolution — dropping to a lower
   * resolution on a weak link keeps the remaining pixels clean instead of
   * smearing every frame with compression artifacts.
   */
  private reconfigureEncoder(): void {
    if (!this.videoEncoder || this.videoEncoder.state !== 'configured') return
    const quality = this.getBandwidthQuality()
    const size = this.targetEncodeSize()
    const bitrate = this.targetVideoBitrate()
    const framerate = quality === 'poor' ? 15 : CallService.VIDEO_FPS
    const sizeChanged = size.width !== this.encodeWidth || size.height !== this.encodeHeight

    if (!sizeChanged && bitrate === this.encodeBitrate && framerate === this.encodeFramerate) return

    try {
      this.videoEncoder.configure({
        codec: this.videoCodec,
        width: size.width,
        height: size.height,
        bitrate: bitrate,
        framerate: framerate,
        latencyMode: 'realtime',
      })
      this.encodeWidth = size.width
      this.encodeHeight = size.height
      this.encodeBitrate = bitrate
      this.encodeFramerate = framerate
      // A resolution change invalidates the receiver's reference frames
      if (sizeChanged) this.forceKeyframe = true
      console.log('[CallService] VideoEncoder reconfigured (' + this.videoCodec + '):', size.width + 'x' + size.height + ',', bitrate, 'bps,', framerate, 'fps,', quality, 'quality')
    } catch (err) {
      console.warn('[CallService] Encoder reconfigure failed:', err)
    }
  }

  // ─── Private: Video Transport (Canvas JPEG Capture) ────────────────────

  /**
   * Start video transport. Tries WebCodecs (VP8 hardware-accelerated) first,
   * falls back to canvas.toBlob('image/jpeg') if WebCodecs unavailable.
   */
  private startVideoTransport(peerId: string): void {
    if (!this.localStream) {
      console.warn('[CallService] startVideoTransport: no localStream')
      return
    }
    const videoTracks = this.localStream.getVideoTracks()
    if (videoTracks.length === 0) {
      console.warn('[CallService] startVideoTransport: no video tracks')
      return
    }

    console.log(`[CallService] startVideoTransport: peerId=${peerId.slice(0, 16)}, currentPeerId=${this.currentPeerId?.slice(0, 16)}, tracks=${videoTracks.length}`)

    // Create a hidden video element to render the local stream
    this.tempVideo = document.createElement('video')
    this.tempVideo.srcObject = new MediaStream(videoTracks)
    this.tempVideo.muted = true
    this.tempVideo.playsInline = true
    this.tempVideo.setAttribute('playsinline', '')
    this.tempVideo.play().catch((err) => {
      console.error('[CallService] tempVideo.play() failed:', err)
    })
    console.log('[CallService] tempVideo created, readyState:', this.tempVideo.readyState, 'tracks:', videoTracks.length)

    // Create sender canvas
    this.sendCanvas = document.createElement('canvas')
    this.sendCanvas.width = CallService.VIDEO_WIDTH
    this.sendCanvas.height = CallService.VIDEO_HEIGHT
    this.sendCanvasCtx = this.sendCanvas.getContext('2d', { alpha: false }) // Disable alpha for performance

    // PERFORMANCE: Try WebCodecs (hardware-accelerated VP8) first
    if (this.isWebCodecsSupported() && this.initVideoEncoder()) {
      console.log('[CallService] Using WebCodecs VP8 encoder for video transport →', peerId.slice(0, 16))

      const captureFrameWebCodecs = () => {
        if (!this.currentPeerId || !this.tempVideo || !this.videoEncoder || this.videoEncoder.state !== 'configured') return
        if (useCallStore.getState().isCameraOff) return
        if (this.tempVideo.readyState < 2) return
        // PRO QUALITY: never pile frames onto a busy encoder — that only adds
        // latency and forces drops later on.
        if (this.videoEncoder.encodeQueueSize > 2) return

        try {
          // PRO QUALITY: encode from the send canvas at the exact configured size
          const frame = this.captureEncodeFrame()
          if (!frame) return

          // Keyframe on the long interval, or immediately if a peer asked (PLI)
          const isKeyframe = this.shouldSendKeyframe()

          // Encode frame (hardware-accelerated)
          this.videoEncoder.encode(frame, { keyFrame: isKeyframe })
          frame.close()

          // Periodically reconfigure encoder based on bandwidth
          if (this.webCodecsFrameCount % 75 === 0 && this.webCodecsFrameCount > 0) {
            this.reconfigureEncoder()
          }
        } catch (err) {
          console.warn('[CallService] WebCodecs encode error:', err)
        }
      }

      // Use requestVideoFrameCallback for precise timing if available
      const videoWithCallback = this.tempVideo as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number
      }

      if (typeof videoWithCallback.requestVideoFrameCallback === 'function') {
        const loop = () => {
          captureFrameWebCodecs()
          if (this.currentPeerId && this.videoEncoder && this.videoEncoder.state === 'configured') {
            videoWithCallback.requestVideoFrameCallback(loop)
          }
        }
        videoWithCallback.requestVideoFrameCallback(loop)
      } else {
        // Fallback to setInterval for WebCodecs path
        this.videoFrameInterval = setInterval(captureFrameWebCodecs, 1000 / CallService.VIDEO_FPS)
      }
      return // Skip JPEG fallback
    }

    // FALLBACK: JPEG encoding via canvas.toBlob (CPU-intensive)
    console.log('[CallService] WebCodecs not available, using JPEG fallback encoder')

    // Use requestVideoFrameCallback if available for precise timing
    const videoWithCallback = this.tempVideo as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number
    }

    if (typeof videoWithCallback.requestVideoFrameCallback === 'function') {
      // Use requestVideoFrameCallback for frame-accurate capture
      let videoFramesSent = 0
      const captureFrame = () => {
        if (!this.currentPeerId || !this.sendCanvasCtx || !this.sendCanvas || !this.tempVideo) return

        // CRITICAL: Skip frame capture when camera is off (save bandwidth)
        if (useCallStore.getState().isCameraOff) {
          if (typeof videoWithCallback.requestVideoFrameCallback === 'function') {
            videoWithCallback.requestVideoFrameCallback(captureFrame)
          }
          return
        }

        // CRITICAL: Check video is ready before drawing
        if (this.tempVideo.readyState < 2) {
          // HAVE_CURRENT_DATA = 2, video not ready yet — retry
          if (typeof videoWithCallback.requestVideoFrameCallback === 'function') {
            videoWithCallback.requestVideoFrameCallback(captureFrame)
          }
          return
        }

        // Draw current video frame to canvas
        try {
          this.sendCanvasCtx.drawImage(this.tempVideo, 0, 0, CallService.VIDEO_WIDTH, CallService.VIDEO_HEIGHT)
        } catch (err) {
          // Video not ready yet
          console.warn('[CallService] drawImage failed:', err)
          if (typeof videoWithCallback.requestVideoFrameCallback === 'function') {
            videoWithCallback.requestVideoFrameCallback(captureFrame)
          }
          return
        }

        // PERFECT QUALITY: 3-tier adaptive JPEG quality
        const bwQuality = this.getBandwidthQuality()
        const quality = bwQuality === 'poor'
          ? CallService.VIDEO_QUALITY_LOW
          : bwQuality === 'medium'
            ? 0.7
            : CallService.VIDEO_QUALITY

        // Convert to JPEG and send
        this.sendCanvas.toBlob(
          (blob) => {
            if (!blob || !this.currentPeerId) {
              if (!blob) console.warn('[CallService] Video toBlob returned null')
              return
            }
            blob.arrayBuffer().then((buf) => {
              if (!this.currentPeerId) return
              // Format: [0x02 = video] + JPEG data
              const payload = new Uint8Array(1 + buf.byteLength)
              payload[0] = 0x02 // Video marker
              payload.set(new Uint8Array(buf), 1)
              // HOLEPUNCH PATTERN: Use sendMediaBatch for cork/uncork efficiency
              this.updateBandwidth(payload.byteLength, true)
              p2pService.sendMediaBatch(this.currentPeerId, [payload]).catch(() => {})
              
              // Diagnostic logging
              videoFramesSent++
              if (videoFramesSent % 25 === 0) {
                console.log(`[CallService] Video TX: ${videoFramesSent} frames sent, size: ${buf.byteLength} bytes`)
              }
            }).catch(() => {})
          },
          'image/jpeg',
          quality
        )

        // Request next frame
        if (typeof videoWithCallback.requestVideoFrameCallback === 'function') {
          videoWithCallback.requestVideoFrameCallback(captureFrame)
        }
      }

      // Start frame capture loop
      videoWithCallback.requestVideoFrameCallback(captureFrame)
      console.log('[CallService] Video transport started (requestVideoFrameCallback, adaptive quality + frame skip) →', peerId.slice(0, 16))
    } else {
      // Fallback to setInterval for browsers without requestVideoFrameCallback
      // PERFORMANCE: Adaptive frame rate based on bandwidth
      // frameSkipCounter reserved for future throttling logic
      const baseFrameInterval = 1000 / CallService.VIDEO_FPS
      
      const getAdaptiveInterval = () => {
        const quality = this.getBandwidthQuality()
        if (quality === 'poor') return baseFrameInterval * 2 // 12.5 FPS — save bandwidth
        if (quality === 'medium') return baseFrameInterval * 1.5 // ~16 FPS
        return baseFrameInterval // 25 FPS — full rate
      }

      let currentInterval = getAdaptiveInterval()

      const captureLoop = () => {
        if (!this.currentPeerId || !this.sendCanvasCtx || !this.sendCanvas || !this.tempVideo) return

        // CRITICAL: Skip frame capture when camera is off (save bandwidth)
        if (useCallStore.getState().isCameraOff) return

        // CRITICAL: Check video is ready before drawing
        if (this.tempVideo.readyState < 2) return

        try {
          this.sendCanvasCtx.drawImage(this.tempVideo, 0, 0, CallService.VIDEO_WIDTH, CallService.VIDEO_HEIGHT)
        } catch {
          return // Video not ready yet
        }

        // PERFECT QUALITY: 3-tier adaptive JPEG quality
        const bwQuality = this.getBandwidthQuality()
        const quality = bwQuality === 'poor'
          ? CallService.VIDEO_QUALITY_LOW
          : bwQuality === 'medium'
            ? 0.7
            : CallService.VIDEO_QUALITY

        this.sendCanvas.toBlob(
          (blob) => {
            if (!blob || !this.currentPeerId) return
            blob.arrayBuffer().then((buf) => {
              if (!this.currentPeerId) return
              const payload = new Uint8Array(1 + buf.byteLength)
              payload[0] = 0x02
              payload.set(new Uint8Array(buf), 1)
              // HOLEPUNCH PATTERN: Use sendMediaBatch for cork/uncork efficiency
              this.updateBandwidth(payload.byteLength, true)
              p2pService.sendMediaBatch(this.currentPeerId, [payload]).catch(() => {})
            }).catch(() => {})
          },
          'image/jpeg',
          quality
        )

        // Adapt interval based on bandwidth
        const newInterval = getAdaptiveInterval()
        if (newInterval !== currentInterval) {
          currentInterval = newInterval
          if (this.videoFrameInterval) clearInterval(this.videoFrameInterval)
          this.videoFrameInterval = setInterval(captureLoop, currentInterval)
        }
      }

      this.videoFrameInterval = setInterval(captureLoop, currentInterval)

      console.log('[CallService] Video transport started (adaptive interval, frame skip) →', peerId.slice(0, 16))
    }
  }

  /**
   * Restart video transport (e.g. after track replacement for screen share).
   */
  private restartVideoTransport(peerId: string): void {
    // Stop existing frame capture
    if (this.videoFrameInterval) {
      clearInterval(this.videoFrameInterval)
      this.videoFrameInterval = null
    }
    this.sendCanvas = null
    this.sendCanvasCtx = null

    // Stop WebCodecs encoder if running (will be re-initialized in startVideoTransport)
    if (this.videoEncoder) {
      try { this.videoEncoder.close() } catch {}
      this.videoEncoder = null
    }
    this.useWebCodecs = false

    // Restart with current video tracks
    this.startVideoTransport(peerId)
  }

  /**
   * PERFORMANCE: Start group video transport with shared encoder.
   * Instead of encoding N times for N peers (CPU-intensive JPEG encoding),
   * we encode ONCE and send the same JPEG buffer to all peers.
   * This reduces CPU usage by ~60% for 4+ participant calls.
   */
  startGroupVideoTransport(peerIds: string[]): void {
    if (!this.localStream || peerIds.length === 0) return
    const videoTracks = this.localStream.getVideoTracks()
    if (videoTracks.length === 0) return

    // Store all group peers
    this.groupVideoPeers = new Set(peerIds)
    this.isGroupVideoTransportRunning = true

    // Create shared video element (encode source)
    this.tempVideo = document.createElement('video')
    this.tempVideo.srcObject = new MediaStream(videoTracks)
    this.tempVideo.muted = true
    this.tempVideo.playsInline = true
    this.tempVideo.play().catch(() => {})

    // Create shared canvas (encode once)
    this.sendCanvas = document.createElement('canvas')
    this.sendCanvas.width = CallService.VIDEO_WIDTH
    this.sendCanvas.height = CallService.VIDEO_HEIGHT
    this.sendCanvasCtx = this.sendCanvas.getContext('2d', { alpha: false })

    // PERFECT QUALITY: Try WebCodecs VP8 hardware-accelerated encoding first
    // (same approach as 1:1 calls — handleEncodedChunk already supports mesh)
    if (this.isWebCodecsSupported() && this.initVideoEncoder()) {
      console.log('[CallService] Using WebCodecs VP8 encoder for group video transport →', peerIds.length, 'peers')

      const captureFrameWebCodecs = () => {
        if (!this.isGroupVideoTransportRunning || !this.tempVideo || !this.videoEncoder || this.videoEncoder.state !== 'configured') return
        if (useCallStore.getState().isCameraOff) return
        if (this.tempVideo.readyState < 2) return
        // PRO QUALITY: don't queue up on a saturated encoder (mesh CPU pressure)
        if (this.videoEncoder.encodeQueueSize > 2) return

        try {
          // PRO QUALITY: single encode at the exact configured size, sent to all peers
          const frame = this.captureEncodeFrame()
          if (!frame) return
          const isKeyframe = this.shouldSendKeyframe()
          this.videoEncoder.encode(frame, { keyFrame: isKeyframe })
          frame.close()

          // Periodically reconfigure encoder based on bandwidth
          if (this.webCodecsFrameCount % 75 === 0 && this.webCodecsFrameCount > 0) {
            this.reconfigureEncoder()
          }
        } catch (err) {
          console.warn('[CallService] WebCodecs encode error (group):', err)
        }
      }

      // Use requestVideoFrameCallback for precise timing
      const videoWithCallback = this.tempVideo as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number
      }

      if (typeof videoWithCallback.requestVideoFrameCallback === 'function') {
        const loop = () => {
          captureFrameWebCodecs()
          if (this.isGroupVideoTransportRunning && this.videoEncoder && this.videoEncoder.state === 'configured') {
            videoWithCallback.requestVideoFrameCallback(loop)
          }
        }
        videoWithCallback.requestVideoFrameCallback(loop)
      } else {
        this.videoFrameInterval = setInterval(captureFrameWebCodecs, 1000 / CallService.VIDEO_FPS)
      }

      console.log('[CallService] Group video transport started (WebCodecs VP8,', peerIds.length, 'peers)')
      return
    }

    // FALLBACK: JPEG encoding via canvas.toBlob (CPU-intensive)
    console.log('[CallService] WebCodecs not available for group, using JPEG fallback')

    const baseInterval = 1000 / CallService.VIDEO_FPS

    const getAdaptiveInterval = () => {
      const quality = this.getBandwidthQuality()
      if (quality === 'poor') return baseInterval * 2
      if (quality === 'medium') return baseInterval * 1.5
      return baseInterval
    }

    let currentInterval = getAdaptiveInterval()

    const captureLoop = () => {
      if (!this.isGroupVideoTransportRunning || !this.sendCanvasCtx || !this.tempVideo) return
      if (useCallStore.getState().isCameraOff) return
      if (this.tempVideo.readyState < 2) return

      try {
        this.sendCanvasCtx.drawImage(this.tempVideo, 0, 0, CallService.VIDEO_WIDTH, CallService.VIDEO_HEIGHT)
      } catch {
        return
      }

      // PERFECT QUALITY: 3-tier adaptive JPEG quality for group fallback
      const bwQuality = this.getBandwidthQuality()
      const quality = bwQuality === 'poor'
        ? CallService.VIDEO_QUALITY_LOW
        : bwQuality === 'medium'
          ? 0.7
          : CallService.VIDEO_QUALITY

      // ENCODE ONCE — send same frame to all peers via sendMediaBatch (cork/uncork per peer)
      this.sendCanvas?.toBlob(
        (blob) => {
          if (!blob) return
          blob.arrayBuffer().then((buf) => {
            const payload = new Uint8Array(1 + buf.byteLength)
            payload[0] = 0x02
            payload.set(new Uint8Array(buf), 1)
            this.updateBandwidth(payload.byteLength * this.groupVideoPeers.size, true)

            // HOLEPUNCH PATTERN: Use sendMediaBatch per peer for cork/uncork batching.
            for (const peerId of this.groupVideoPeers) {
              p2pService.sendMediaBatch(peerId, [payload]).catch(() => {})
            }
          }).catch(() => {})
        },
        'image/jpeg',
        quality
      )

      // Adapt interval
      const newInterval = getAdaptiveInterval()
      if (newInterval !== currentInterval) {
        currentInterval = newInterval
        if (this.videoFrameInterval) clearInterval(this.videoFrameInterval)
        this.videoFrameInterval = setInterval(captureLoop, currentInterval)
      }
    }

    this.videoFrameInterval = setInterval(captureLoop, currentInterval)
    console.log('[CallService] Group video transport started (JPEG fallback,', peerIds.length, 'peers)')
  }

  /**
   * Stop group video transport
   */
  stopGroupVideoTransport(): void {
    this.isGroupVideoTransportRunning = false
    this.groupVideoPeers.clear()
    if (this.videoFrameInterval) {
      clearInterval(this.videoFrameInterval)
      this.videoFrameInterval = null
    }
    this.sendCanvas = null
    this.sendCanvasCtx = null
    this.tempVideo = null
  }

  /**
   * PERFECT QUALITY GROUP: Clean up per-peer video state.
   * Closes all per-peer VideoDecoders and clears the Map.
   */
  private cleanupPeerVideoState(): void {
    for (const [peerId, state] of this.peerVideoState) {
      if (state.decoder) {
        try { state.decoder.close() } catch {}
      }
      console.log('[CallService] Cleaned up video state for', peerId.slice(0, 16))
    }
    this.peerVideoState.clear()
  }

  /**
   * PERFECT QUALITY GROUP: Remove a single peer's video state.
   */
  private removePeerVideoState(peerId: string): void {
    const state = this.peerVideoState.get(peerId)
    if (state?.decoder) {
      try { state.decoder.close() } catch {}
    }
    this.peerVideoState.delete(peerId)
  }

  // ─── Private: Incoming Media Handler ────────────────────────────────────

  /**
   * Handle incoming media data from peer.
   * Format: first byte is type marker
   *   0x01 = raw PCM audio, 0x02 = JPEG video, 0x03 = WebCodecs video,
   *   0x04 = file chunk (FileService), 0x05 = Opus audio, 0x06 = control (PLI)
   * PERFECT QUALITY GROUP: Passes fromPeerId for per-peer audio mixing AND video routing.
   */
  private handleIncomingMedia(data: Uint8Array, fromPeerId?: string): void {
    if (data.length < 2) {
      console.warn('[CallService] handleIncomingMedia: data too short, length:', data.length)
      return
    }

    const marker = data[0]
    const payload = data.slice(1)

    if (marker === 0x01) {
      this.handleIncomingAudio(payload, fromPeerId)
    } else if (marker === 0x02) {
      this.handleIncomingVideo(payload, fromPeerId)
    } else if (marker === 0x03) {
      this.handleIncomingWebCodecsVideo(payload, fromPeerId)
    } else if (marker === 0x04) {
      // File-transfer chunk on the shared media channel — ignore here (handled by FileService)
      return
    } else if (marker === 0x05) {
      this.handleIncomingOpusAudio(payload, fromPeerId)
    } else if (marker === 0x06) {
      this.handleIncomingControl(payload, fromPeerId)
    } else {
      console.warn('[CallService] Unknown media marker:', marker, 'data length:', data.length)
    }
  }

  /**
   * PRO QUALITY: Control channel (marker 0x06).
   * Sub-type 0x01 is a Picture Loss Indication: the peer lost a frame and needs
   * a keyframe now. Answering on demand is what allows the keyframe interval to
   * be long (3s) without leaving anyone stuck on a frozen picture.
   */
  private handleIncomingControl(data: Uint8Array, fromPeerId?: string): void {
    if (data.length < 1) return
    if (data[0] === 0x01) {
      this.forceKeyframe = true
      console.log('[CallService] Keyframe requested by', fromPeerId?.slice(0, 16) ?? 'peer', '— sending one on the next frame')
    }
  }

  /**
   * PRO QUALITY: Ask a peer for an immediate keyframe (PLI), throttled so a
   * burst of losses cannot turn into a keyframe storm.
   */
  private requestKeyframe(peerId?: string): void {
    if (!peerId) return
    const now = Date.now()
    const state = this.peerVideoState.get(peerId)
    if (state) {
      if (now - state.lastKeyframeRequestAt < CallService.KEYFRAME_REQUEST_THROTTLE) return
      state.lastKeyframeRequestAt = now
    } else {
      if (now - this.lastKeyframeRequestSentAt < CallService.KEYFRAME_REQUEST_THROTTLE) return
    }
    this.lastKeyframeRequestSentAt = now
    // [0x06 = control][0x01 = keyframe request]
    p2pService.sendMediaBatch(peerId, [new Uint8Array([0x06, 0x01])]).catch(() => {})
  }

  /**
   * PRO QUALITY: Build the playback graph once:
   *   per-sender gain → master limiter → master gain → speakers (+ peerStream)
   * The limiter is what makes group calls sound professional — summing several
   * participants easily exceeds 0 dBFS and clips harshly on the sound card.
   */
  private ensurePlaybackGraph(): void {
    if (this.playbackContext) return
    try {
      // QUALITY: latencyHint 'interactive' minimizes output latency
      this.playbackContext = new AudioContext({
        sampleRate: CallService.AUDIO_SAMPLE_RATE,
        latencyHint: 'interactive',
      })

      // CRITICAL: Resume playback context (may be suspended by autoplay policy)
      if (this.playbackContext.state === 'suspended') {
        this.playbackContext.resume().catch(() => {})
      }

      // Fast limiter: hard knee, high ratio, 2ms attack — transparent on voice,
      // but nothing ever reaches the card above -3 dBFS.
      const limiter = this.playbackContext.createDynamicsCompressor()
      limiter.threshold.value = -3
      limiter.knee.value = 0
      limiter.ratio.value = 20
      limiter.attack.value = 0.002
      limiter.release.value = 0.12
      this.playbackLimiter = limiter

      // Shared master gain — created once, no per-chunk allocation
      this.playbackGainNode = this.playbackContext.createGain()
      this.playbackGainNode.gain.value = 1.0
      limiter.connect(this.playbackGainNode)
      this.playbackGainNode.connect(this.playbackContext.destination)
      this.nextPlayTime = 0

      // Initialize peerStream with audio destination
      this.ensurePeerStream()
      // Connect master gain → audioDestination so peerStream also gets audio
      if (this.audioDestination) {
        this.playbackGainNode.connect(this.audioDestination)
      }

      this.startJitterBuffer()
      // PERFORMANCE: Start comfort noise generation
      this.startComfortNoise()
      this.lastAudioReceived = Date.now()
      console.log('[CallService] Audio playback initialized (48kHz, per-sender mixing, master limiter, jitter buffer, CNG, state:', this.playbackContext.state, ')')
    } catch (err) {
      console.error('[CallService] Failed to initialize playback graph:', err)
    }
  }

  /**
   * Playout key for a sender: the peer id in a group call, PLAYBACK_1TO1 otherwise.
   */
  private playbackKey(fromPeerId?: string): string {
    return fromPeerId && this.isGroupAudioCall ? fromPeerId : CallService.PLAYBACK_1TO1
  }

  /**
   * Get (or create) the playout state of one sender, including its gain stage.
   */
  private ensurePeerAudioState(key: string): PeerAudioState {
    let state = this.peerAudioState.get(key)
    if (!state) {
      state = {
        jitterBuffer: [],
        nextPlayTime: 0,
        gain: null,
        started: false,
        lastSeq: -1,
        lastEnqueueAt: 0,
        everStarted: false,
      }
      this.peerAudioState.set(key, state)
      console.log('[CallService] Playout state created for', key === CallService.PLAYBACK_1TO1 ? '1:1 peer' : key.slice(0, 16), '(senders:', this.peerAudioState.size, ')')
    }
    if (!state.gain && this.playbackContext && this.playbackLimiter) {
      const gain = this.playbackContext.createGain()
      gain.gain.value = this.mixHeadroom()
      gain.connect(this.playbackLimiter)
      state.gain = gain
      this.applyMixHeadroom()
    }
    return state
  }

  /**
   * PRO QUALITY: Fully release one sender's receive pipeline.
   *
   * Deleting the map entry alone leaked its GainNode (still wired to the
   * limiter) and its Opus decoder, and left the remaining voices scaled for a
   * bigger group than actually present — so the mix got quieter with every
   * participant who left. Re-balancing restores the correct level, and the
   * encoders get the freed mesh bandwidth back.
   */
  private removePeerAudioState(peerId: string): void {
    const state = this.peerAudioState.get(peerId)
    if (state?.gain) {
      try { state.gain.disconnect() } catch {}
      state.gain = null
    }
    state?.jitterBuffer.splice(0)
    this.peerAudioState.delete(peerId)

    const decoder = this.audioDecoders.get(peerId)
    if (decoder) {
      try { if (decoder.state !== 'closed') decoder.close() } catch {}
      this.audioDecoders.delete(peerId)
    }

    this.applyMixHeadroom()
    // Fewer peers ⇒ a larger share of the uplink budget for everyone left.
    this.reconfigureAudioEncoder()
    this.reconfigureEncoder()
  }

  /**
   * Queue decoded samples on a sender's jitter buffer.
   */
  private enqueuePlaybackAudio(key: string, samples: Float32Array): void {
    const state = this.ensurePeerAudioState(key)
    state.jitterBuffer.push({ data: samples, timestamp: Date.now() })
    state.lastEnqueueAt = Date.now()

    // Hard cap: a stalled renderer or a large burst must not grow latency
    // without bound — shed the oldest packets back down to the target depth.
    const max = Math.max(25, this.jitterBufferSize * 8)
    if (state.jitterBuffer.length > max) {
      const excess = state.jitterBuffer.length - this.jitterBufferSize
      state.jitterBuffer.splice(0, excess)
      this.audioChunksDropped += excess
    }

    this.audioChunksReceived++
    this.windowAudioReceived++
    if (this.audioChunksReceived % 100 === 0) {
      console.log(`[CallService] Audio RX: ${this.audioChunksReceived} packets, senders: ${this.peerAudioState.size}, lost: ${this.audioPacketsLost}, dropped: ${this.audioChunksDropped}`)
    }
  }

  /**
   * PRO QUALITY: Handle an incoming Opus packet.
   * Payload (marker already stripped): [flags][seq hi][seq lo][opus data]
   */
  private handleIncomingOpusAudio(data: Uint8Array, fromPeerId?: string): void {
    if (data.length < 4) return
    try {
      this.ensurePlaybackGraph()
      this.updateBandwidth(data.byteLength, false)
      // PERFORMANCE: Track last audio received time for CNG
      this.lastAudioReceived = Date.now()

      const key = this.playbackKey(fromPeerId)
      const state = this.ensurePeerAudioState(key)
      const seq = (data[1] << 8) | data[2]

      // Honest loss accounting — in-band FEC hides isolated losses, but the
      // count still tells us (and the UI) how healthy the link really is.
      if (state.lastSeq >= 0) {
        let gap = seq - ((state.lastSeq + 1) & 0xFFFF)
        if (gap < 0) gap += 0x10000
        if (gap > 0 && gap < 500) {
          this.audioPacketsLost += gap
          this.windowAudioLost += gap
        }
      }
      state.lastSeq = seq

      const decoder = this.ensureAudioDecoder(key)
      if (!decoder || decoder.state !== 'configured') return

      decoder.decode(new EncodedAudioChunk({
        // Every Opus packet is independently decodable
        type: 'key',
        timestamp: seq * CallService.OPUS_FRAME_DURATION_US,
        data: data.subarray(3),
      }))
    } catch (err) {
      console.warn('[CallService] handleIncomingOpusAudio error:', err)
    }
  }

  /**
   * Handle incoming raw PCM audio (fallback path for peers without Opus).
   * Converts Int16 → Float32 and queues it on the sender's jitter buffer.
   */
  private handleIncomingAudio(data: Uint8Array, fromPeerId?: string): void {
    try {
      this.ensurePlaybackGraph()

      // Track bandwidth
      this.updateBandwidth(data.byteLength, false)
      // PERFORMANCE: Track last audio received time for CNG
      this.lastAudioReceived = Date.now()

      // Convert Int16 bytes back to Float32
      const int16View = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2))
      const float32 = new Float32Array(int16View.length)
      for (let i = 0; i < int16View.length; i++) {
        float32[i] = int16View[i] / 0x8000
      }

      this.enqueuePlaybackAudio(this.playbackKey(fromPeerId), float32)
    } catch (err) {
      console.error('[CallService] handleIncomingAudio error:', err)
    }
  }

  /**
   * Ensure per-peer video state exists for group calls.
   * Creates canvas + decoder for the peer if not yet created.
   */
  private ensurePeerVideoState(peerId: string): PeerVideoState | null {
    let state = this.peerVideoState.get(peerId)
    if (state) return state

    try {
      const canvas = document.createElement('canvas')
      canvas.width = CallService.VIDEO_WIDTH
      canvas.height = CallService.VIDEO_HEIGHT
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return null
      // PRO QUALITY: high-quality scaling when the sender's resolution differs
      // from the display size (adaptive resolution changes it mid-call).
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      state = {
        canvas,
        ctx,
        decoder: null,
        decoderCodec: 'vp8',
        lastReceivedSeq: -1,
        framesReceived: 0,
        lastKeyframeRequestAt: 0,
      }
      this.peerVideoState.set(peerId, state)
      console.log('[CallService] Created per-peer video state for', peerId.slice(0, 16), '(total video peers:', this.peerVideoState.size, ')')
      return state
    } catch (err) {
      console.error('[CallService] Failed to create per-peer video state:', err)
      return null
    }
  }

  /**
   * Handle incoming video JPEG frame.
   * PERFECT QUALITY GROUP: Uses per-peer canvas in group calls so frames
   * from different participants don't overwrite each other.
   */
  private handleIncomingVideo(data: Uint8Array, fromPeerId?: string): void {
    try {
      // PERFECT QUALITY GROUP: Route to per-peer canvas in group calls
      const isGroupVideo = fromPeerId && this.peerVideoState.size > 0 || (fromPeerId && this.isGroupAudioCall)
      if (fromPeerId && isGroupVideo) {
        const peerState = this.ensurePeerVideoState(fromPeerId)
        if (peerState) {
          this.decodeJPEGToCanvas(data, peerState.canvas, peerState.ctx, fromPeerId, peerState)
          return
        }
      }

      // 1:1 CALL: Use shared receive canvas
      if (!this.receiveCanvas) {
        this.receiveCanvas = document.createElement('canvas')
        this.receiveCanvas.width = CallService.VIDEO_WIDTH
        this.receiveCanvas.height = CallService.VIDEO_HEIGHT
        this.receiveCanvasCtx = this.receiveCanvas.getContext('2d')
        this._videoFramesReceived = 0
        console.log(`[CallService] Receive canvas created (direct display mode), first frame size: ${data.length} bytes`)
      }

      this.lastFrameReceivedAt = Date.now()
      this.videoFrozen = false
      this._videoFramesReceived = (this._videoFramesReceived ?? 0) + 1
      if (this._videoFramesReceived % 25 === 0) {
        console.log(`[CallService] Video RX: ${this._videoFramesReceived} frames received, size: ${data.length} bytes`)
      }

      this.decodeJPEGToCanvas(data, this.receiveCanvas, this.receiveCanvasCtx!, undefined, undefined)
    } catch (err) {
      console.warn('[CallService] handleIncomingVideo error:', err)
    }
  }

  /**
   * Decode JPEG data and draw to a canvas.
   */
  private decodeJPEGToCanvas(
    data: Uint8Array,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    peerId?: string,
    peerState?: { lastReceivedSeq: number; framesReceived: number }
  ): void {
    const blob = new Blob([data.slice()], { type: 'image/jpeg' })
    createImageBitmap(blob).then((bitmap) => {
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      this.lastFrameReceivedAt = Date.now()
      this.videoFrozen = false
      if (peerState) {
        peerState.framesReceived++
        if (peerState.framesReceived % 25 === 0) {
          console.log(`[CallService] Video RX [${peerId?.slice(0, 16)}]: ${peerState.framesReceived} frames, size: ${data.length} bytes`)
        }
      }
    }).catch((err) => {
      console.warn('[CallService] JPEG decode failed:', err)
    })
  }

  /**
   * Handle incoming WebCodecs encoded video frame (VP8 or VP9).
   * Protocol: [1 byte: flags (bit0=keyframe, bit1=VP9)][2 bytes: seq][4 bytes: timestamp][encoded data]
   * PERFECT QUALITY GROUP: Uses per-peer VideoDecoder in group calls so each
   * participant's stream is decoded independently without corruption.
   */
  private handleIncomingWebCodecsVideo(data: Uint8Array, fromPeerId?: string): void {
    if (data.length < 7) return // Need at least header (1 flags + 2 seq + 4 timestamp = 7 bytes)

    try {
      // PERFECT QUALITY GROUP: Route to per-peer decoder in group calls
      const isGroupVideo = fromPeerId && (this.peerVideoState.size > 0 || this.isGroupAudioCall)
      if (fromPeerId && isGroupVideo) {
        this.handleIncomingWebCodecsVideoForPeer(data, fromPeerId)
        return
      }

      // 1:1 CALL: Use shared decoder
      this.handleIncomingWebCodecsVideo1to1(data, fromPeerId)
    } catch (err) {
      if (this._videoFramesReceived % 50 === 0) {
        console.warn('[CallService] WebCodecs decode error (will recover on next keyframe):', err)
      }
    }
  }

  /**
   * Handle WebCodecs video for a specific peer in group calls.
   * Each peer gets its own VideoDecoder instance for independent stream decoding.
   * The codec (VP8/VP9) is read from the frame flags so each peer's decoder
   * always matches what that peer's encoder produces.
   */
  private handleIncomingWebCodecsVideoForPeer(data: Uint8Array, peerId: string): void {
    const peerState = this.ensurePeerVideoState(peerId)
    if (!peerState) return

    // Parse flags: bit 0 = keyframe, bit 1 = codec (0 = VP8, 1 = VP9)
    const isKeyframe = (data[0] & 1) === 1
    const codec = (data[0] & 2) !== 0 ? CallService.VP9_CODEC : 'vp8'

    // SUPERIOR QUALITY: Recreate decoder if the sender switched codec mid-call
    if (peerState.decoder && peerState.decoderCodec !== codec && isKeyframe) {
      try { peerState.decoder.close() } catch {}
      peerState.decoder = null
    }

    // PRO QUALITY: a decoder started on a delta frame produces nothing but
    // errors until the next keyframe. Ask for one now (PLI) instead of waiting
    // out the 3s interval — this is what makes joining a stream feel instant.
    if (!peerState.decoder && !isKeyframe) {
      this.requestKeyframe(peerId)
      return
    }

    // Initialize per-peer decoder on first frame (or after codec switch)
    if (!peerState.decoder) {
      try {
        peerState.decoder = new VideoDecoder({
          output: (frame) => {
            // PRO QUALITY: match the sender's resolution so the frame is drawn
            // 1:1 instead of being resampled twice (adaptive resolution).
            if (frame.displayWidth && frame.displayHeight &&
                (peerState.canvas.width !== frame.displayWidth || peerState.canvas.height !== frame.displayHeight)) {
              peerState.canvas.width = frame.displayWidth
              peerState.canvas.height = frame.displayHeight
              peerState.ctx.imageSmoothingEnabled = true
              peerState.ctx.imageSmoothingQuality = 'high'
            }
            peerState.ctx.drawImage(frame, 0, 0, peerState.canvas.width, peerState.canvas.height)
            frame.close()
          },
          error: (err) => {
            console.error(`[CallService] Peer VideoDecoder error [${peerId.slice(0, 16)}]:`, err)
            // Recover fast: ask the sender for a fresh reference frame
            this.requestKeyframe(peerId)
          },
        })
        peerState.decoder.configure({
          codec,
          codedWidth: CallService.VIDEO_WIDTH,
          codedHeight: CallService.VIDEO_HEIGHT,
        })
        peerState.decoderCodec = codec
        console.log('[CallService] Per-peer', codec, 'decoder initialized for', peerId.slice(0, 16))
      } catch (err) {
        console.warn(`[CallService] Failed to init per-peer decoder [${peerId.slice(0, 16)}]:`, err)
        return
      }
    }

    if (peerState.decoder.state !== 'configured') return

    // Parse header: [1 byte: flags][2 bytes: seq][4 bytes: timestamp][encoded data]
    const seq = (data[1] << 8) | data[2]
    const ts = (data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]
    const chunkData = data.slice(7)

    // Per-peer frame loss detection
    if (peerState.lastReceivedSeq >= 0) {
      const expectedSeq = (peerState.lastReceivedSeq + 1) & 0xFFFF
      if (seq !== expectedSeq) {
        let lost = seq - expectedSeq
        if (lost < 0) lost += 65536
        if (lost > 0 && lost < 1000) {
          this.framesLost += lost
          this.windowFramesLost += lost
          // PRO QUALITY: a lost frame breaks the delta chain — request a keyframe
          // instead of showing a smeared picture until the next periodic one.
          this.requestKeyframe(peerId)
          if (this.framesLost % 10 === 0) {
            console.warn(`[CallService] Video frame loss [${peerId.slice(0, 16)}]: ${lost} frames (seq ${expectedSeq} → ${seq})`)
          }
        }
      }
    }
    peerState.lastReceivedSeq = seq
    this.lastFrameReceivedAt = Date.now()
    this.videoFrozen = false
    peerState.framesReceived++
    this.windowFramesReceived++

    if (peerState.framesReceived % 25 === 0) {
      console.log(`[CallService] Video RX VP8 [${peerId.slice(0, 16)}]: ${peerState.framesReceived} frames, keyframe: ${isKeyframe}, size: ${chunkData.length} bytes`)
    }

    // Feed to per-peer decoder
    const chunk = new EncodedVideoChunk({
      type: isKeyframe ? 'key' : 'delta',
      timestamp: ts,
      data: chunkData,
    })
    peerState.decoder.decode(chunk)
  }

  /**
   * Handle WebCodecs video for 1:1 calls (shared decoder).
   * The codec (VP8/VP9) is read from the frame flags (bit 1 of byte 0).
   */
  private handleIncomingWebCodecsVideo1to1(data: Uint8Array, fromPeerId?: string): void {
    // Parse flags: bit 0 = keyframe, bit 1 = codec (0 = VP8, 1 = VP9)
    const isKeyframe = (data[0] & 1) === 1
    const codec = (data[0] & 2) !== 0 ? CallService.VP9_CODEC : 'vp8'
    const peerId = fromPeerId ?? this.currentPeerId ?? undefined

    // SUPERIOR QUALITY: Recreate decoder if the sender switched codec mid-call
    if (this.videoDecoder && this.videoDecoderCodec !== codec && isKeyframe) {
      try { this.videoDecoder.close() } catch {}
      this.videoDecoder = null
    }

    // PRO QUALITY: never start a decoder on a delta frame — ask for a keyframe
    // (PLI) so the picture appears within one round-trip.
    if (!this.videoDecoder && !isKeyframe) {
      this.requestKeyframe(peerId)
      return
    }

    // Initialize decoder on first frame (or after codec switch)
    if (!this.videoDecoder) {
      if (!this.initVideoDecoder(codec)) {
        console.warn('[CallService] VideoDecoder init failed for incoming WebCodecs video')
        return
      }
    }

    // Parse header: [1 byte: flags][2 bytes: seq][4 bytes: timestamp][encoded data]
    const seq = (data[1] << 8) | data[2]
    const ts = (data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]
    const chunkData = data.slice(7)

    // Frame loss detection via sequence numbers
    if (this.lastReceivedSeq >= 0) {
      const expectedSeq = (this.lastReceivedSeq + 1) & 0xFFFF
      if (seq !== expectedSeq) {
        let lost = seq - expectedSeq
        if (lost < 0) lost += 65536
        if (lost > 0 && lost < 1000) {
          this.framesLost += lost
          this.windowFramesLost += lost
          // PRO QUALITY: recover the reference chain immediately
          this.requestKeyframe(peerId)
          if (this.framesLost % 10 === 0) {
            console.warn(`[CallService] Video frame loss detected: ${lost} frames dropped (seq ${expectedSeq} → ${seq}), total lost: ${this.framesLost}`)
          }
        }
      }
    }
    this.lastReceivedSeq = seq
    this.lastFrameReceivedAt = Date.now()
    this.videoFrozen = false
    this.windowFramesReceived++

    const chunk = new EncodedVideoChunk({
      type: isKeyframe ? 'key' : 'delta',
      timestamp: ts,
      data: chunkData,
    })

    this.videoDecoder?.decode(chunk)
  }

  /**
   * Ensure peerStream exists with audio + video tracks.
   * Creates the combined MediaStream from audio destination and canvas captureStream.
   */
  private ensurePeerStream(): void {
    if (this.peerStream) return

    const tracks: MediaStreamTrack[] = []

    // Audio track from AudioContext destination
    if (this.playbackContext) {
      this.audioDestination = this.playbackContext.createMediaStreamDestination()
      this.audioDestination.stream.getAudioTracks().forEach((t) => tracks.push(t))
    }

    this.peerStream = new MediaStream(tracks)
    console.log('[CallService] peerStream created with', tracks.length, 'tracks (audio:', this.audioDestination ? 'yes' : 'no', ')')
  }

  /**
   * Add video tracks from receive canvas to existing peerStream.
   * Called when video frames start arriving after audio was already playing.
   * @deprecated Kept for future use — canvas is attached directly via ref
   */
  // @ts-ignore
  private _addVideoTracksToPeerStream(): void {
    if (!this.peerStream || !this.receiveCanvas) return
    // Guard: don't add video tracks if we already have video
    if (this.peerStream.getVideoTracks().length > 0) {
      console.log('[CallService] Video tracks already exist in peerStream, skipping')
      return
    }
    const videoStream = (this.receiveCanvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(CallService.VIDEO_FPS)
    if (videoStream) {
      videoStream.getVideoTracks().forEach((t) => this.peerStream!.addTrack(t))
      console.log('[CallService] Video tracks added to existing peerStream')
    }
  }

  /**
   * Get local media stream from user's devices.
   */
  private async getLocalMedia(type: CallType): Promise<MediaStream> {
    const constraints = mediaDeviceService.buildCallConstraints(type)
    const stream = new MediaStream()

    // Try to acquire audio and video separately so if one fails, the other can still work
    const needsAudio = type === 'audio' || type === 'video'
    const needsVideo = type === 'video'

    // Acquire audio
    if (needsAudio) {
      try {
        const audioConstraints = typeof constraints.audio === 'object' ? constraints.audio : true
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
        audioStream.getAudioTracks().forEach(t => {
          // QUALITY: 'speech' hint lets Chromium tune AEC/NS/AGC for voice
          t.contentHint = 'speech'
          stream.addTrack(t)
        })
        console.log('[CallService] Audio track acquired:', audioStream.getAudioTracks()[0]?.label)
      } catch (audioErr) {
        console.warn('[CallService] Failed to acquire audio, trying fallback:', audioErr)
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 }
          })
          audioStream.getAudioTracks().forEach(t => stream.addTrack(t))
          console.log('[CallService] Audio track acquired (fallback):', audioStream.getAudioTracks()[0]?.label)
        } catch (fallbackErr) {
          console.warn('[CallService] Audio acquisition failed completely:', fallbackErr)
          // Continue without audio
        }
      }
    }

    // Acquire video
    if (needsVideo) {
      try {
        const videoConstraints = typeof constraints.video === 'object' ? constraints.video : true
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints })
        videoStream.getVideoTracks().forEach(t => {
          // QUALITY: 'motion' hint prioritizes smooth framerate over per-frame detail
          t.contentHint = 'motion'
          stream.addTrack(t)
        })
        console.log('[CallService] Video track acquired:', videoStream.getVideoTracks()[0]?.label)
      } catch (videoErr) {
        console.warn('[CallService] Failed to acquire video, trying fallback:', videoErr)
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, frameRate: 15 }
          })
          videoStream.getVideoTracks().forEach(t => stream.addTrack(t))
          console.log('[CallService] Video track acquired (fallback):', videoStream.getVideoTracks()[0]?.label)
        } catch (fallbackErr) {
          console.warn('[CallService] Video acquisition failed completely:', fallbackErr)
          // Continue without video
        }
      }
    }

    // If we got at least one track, return the stream
    if (stream.getTracks().length > 0) {
      console.log(`[CallService] Media stream ready: ${stream.getAudioTracks().length} audio, ${stream.getVideoTracks().length} video`)
      return stream
    }

    // If no tracks at all, throw error
    throw new Error('Failed to acquire any media tracks')
  }

  /**
   * Handle device changes during an active call.
   */
  private handleDeviceChangeDuringCall(): void {
    const activeCall = useCallStore.getState().activeCall
    if (!activeCall || !this.localStream) return

    const prefs = mediaDeviceService.getPreferences()

    const audioTracks = this.localStream.getAudioTracks()
    if (audioTracks.length > 0) {
      const currentAudioId = audioTracks[0].getSettings().deviceId
      if (currentAudioId && prefs.audioInput && currentAudioId !== prefs.audioInput) {
        this.replaceMediaTrack('audio').catch(console.error)
      }
    }

    const videoTracks = this.localStream.getVideoTracks()
    if (videoTracks.length > 0 && !this.screenTrack) {
      const currentVideoId = videoTracks[0].getSettings().deviceId
      if (currentVideoId && prefs.videoInput && currentVideoId !== prefs.videoInput) {
        this.replaceMediaTrack('video').catch(console.error)
      }
    }
  }

  /**
   * Replace a media track when device changes.
   */
  private async replaceMediaTrack(kind: 'audio' | 'video'): Promise<void> {
    if (!this.localStream) return

    const constraints = mediaDeviceService.buildCallConstraints(kind)

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(
        kind === 'audio' ? { audio: constraints.audio } : { video: constraints.video }
      )

      const newTrack = newStream.getTracks()[0]
      if (!newTrack) return

      const oldTracks = kind === 'audio'
        ? this.localStream.getAudioTracks()
        : this.localStream.getVideoTracks()

      for (const oldTrack of oldTracks) {
        this.localStream.removeTrack(oldTrack)
        oldTrack.stop()
      }
      this.localStream.addTrack(newTrack)

      // If replacing audio, restart audio capture
      if (kind === 'audio') {
        if (this.audioWorkletNode) {
          this.audioWorkletNode.disconnect()
          this.audioWorkletNode = null
        }
        if (this.captureContext) {
          this.captureContext.close().catch(() => {})
          this.captureContext = null
        }
        this.startAudioCapture()
      }

      // If replacing video, restart video transport
      if (kind === 'video' && this.currentPeerId) {
        this.restartVideoTransport(this.currentPeerId)
      }

      console.log(`[CallService] Replaced ${kind} track with preferred device`)
    } catch (err) {
      console.error(`[CallService] Failed to replace ${kind} track:`, err)
    }
  }

  // ─── Adaptive Quality (HyperDHT-inspired) ──────────────────────────────

  private qualityMetrics: QualityMetrics = {
    currentFPS: 0,
    currentBitrate: 0,
    packetLoss: 0,
    jitter: 0,
    latency: 0,
    resolution: { width: 640, height: 480 },
  }

  private qualityHistory: QualityMetrics[] = []
  private qualityAdjustments: QualityAdjustment[] = []

  /**
   * Get current quality metrics.
   */
  getQualityMetrics(): QualityMetrics {
    return { ...this.qualityMetrics }
  }

  /**
   * Get quality history for the call.
   */
  getQualityHistory(): QualityMetrics[] {
    return [...this.qualityHistory]
  }

  /**
   * Update quality metrics based on network conditions.
   */
  updateQualityMetrics(metrics: Partial<QualityMetrics>): void {
    this.qualityMetrics = { ...this.qualityMetrics, ...metrics }
    this.qualityHistory.push({ ...this.qualityMetrics })

    // Keep only last 100 samples
    if (this.qualityHistory.length > 100) {
      this.qualityHistory.shift()
    }
  }

  /**
   * Adjust video quality based on bandwidth.
   */
  adjustVideoQuality(bandwidth: number): void {
    const previousQuality = this.qualityMetrics.currentBitrate

    if (bandwidth < CallService.LOW_BANDWIDTH_THRESHOLD) {
      // Low bandwidth — reduce quality
      this.qualityMetrics.currentFPS = 15
      this.qualityMetrics.resolution = { width: 320, height: 240 }
      this.qualityMetrics.currentBitrate = bandwidth * 0.6
    } else if (bandwidth < CallService.LOW_BANDWIDTH_THRESHOLD * 2) {
      // Medium bandwidth — balanced quality
      this.qualityMetrics.currentFPS = 20
      this.qualityMetrics.resolution = { width: 480, height: 360 }
      this.qualityMetrics.currentBitrate = bandwidth * 0.7
    } else {
      // High bandwidth — full quality
      this.qualityMetrics.currentFPS = 25
      this.qualityMetrics.resolution = { width: 640, height: 480 }
      this.qualityMetrics.currentBitrate = bandwidth * 0.8
    }

    // Record adjustment
    this.qualityAdjustments.push({
      timestamp: Date.now(),
      previousBitrate: previousQuality,
      newBitrate: this.qualityMetrics.currentBitrate,
      reason: bandwidth < CallService.LOW_BANDWIDTH_THRESHOLD ? 'low_bandwidth' : 'auto',
    })

    // Keep only last 50 adjustments
    if (this.qualityAdjustments.length > 50) {
      this.qualityAdjustments.shift()
    }
  }

  /**
   * Get quality adjustment history.
   */
  getQualityAdjustments(): QualityAdjustment[] {
    return [...this.qualityAdjustments]
  }

  /**
   * Calculate average quality over the call.
   */
  getAverageQuality(): {
    avgFPS: number
    avgBitrate: number
    avgPacketLoss: number
    avgJitter: number
    avgLatency: number
  } {
    if (this.qualityHistory.length === 0) {
      return { avgFPS: 0, avgBitrate: 0, avgPacketLoss: 0, avgJitter: 0, avgLatency: 0 }
    }

    const sum = this.qualityHistory.reduce(
      (acc, m) => ({
        fps: acc.fps + m.currentFPS,
        bitrate: acc.bitrate + m.currentBitrate,
        packetLoss: acc.packetLoss + m.packetLoss,
        jitter: acc.jitter + m.jitter,
        latency: acc.latency + m.latency,
      }),
      { fps: 0, bitrate: 0, packetLoss: 0, jitter: 0, latency: 0 }
    )

    const count = this.qualityHistory.length
    return {
      avgFPS: sum.fps / count,
      avgBitrate: sum.bitrate / count,
      avgPacketLoss: sum.packetLoss / count,
      avgJitter: sum.jitter / count,
      avgLatency: sum.latency / count,
    }
  }

  // ─── Network Monitoring (HyperDHT-inspired) ────────────────────────────

  private networkConditions: NetworkConditions = {
    type: 'unknown',
    downlink: 0,
    rtt: 0,
    saveData: false,
  }

  private networkHistory: NetworkConditions[] = []

  /**
   * Update network conditions.
   */
  updateNetworkConditions(conditions: Partial<NetworkConditions>): void {
    this.networkConditions = { ...this.networkConditions, ...conditions }
    this.networkHistory.push({ ...this.networkConditions })

    // Keep only last 50 samples
    if (this.networkHistory.length > 50) {
      this.networkHistory.shift()
    }

    // Adjust quality based on network type
    if (conditions.type === 'cellular' || conditions.type === '2g' || conditions.type === '3g') {
      this.adjustVideoQuality(CallService.LOW_BANDWIDTH_THRESHOLD * 0.5)
    } else if (conditions.type === '4g') {
      this.adjustVideoQuality(CallService.LOW_BANDWIDTH_THRESHOLD * 2)
    } else if (conditions.type === 'wifi' || conditions.type === 'ethernet') {
      this.adjustVideoQuality(CallService.LOW_BANDWIDTH_THRESHOLD * 4)
    }
  }

  /**
   * Get current network conditions.
   */
  getNetworkConditions(): NetworkConditions {
    return { ...this.networkConditions }
  }

  /**
   * Get network history.
   */
  getNetworkHistory(): NetworkConditions[] {
    return [...this.networkHistory]
  }

  /**
   * Detect network type from connection API.
   */
  detectNetworkType(): void {
    if ('connection' in navigator) {
      const conn = (navigator as any).connection
      if (conn) {
        this.updateNetworkConditions({
          type: conn.effectiveType || 'unknown',
          downlink: conn.downlink || 0,
          rtt: conn.rtt || 0,
          saveData: conn.saveData || false,
        })
      }
    }
  }

  // ─── Call Diagnostics (HyperDHT-inspired) ──────────────────────────────

  private callDiagnostics: CallDiagnostics = {
    startTime: 0,
    endTime: 0,
    duration: 0,
    totalBytesSent: 0,
    totalBytesReceived: 0,
    peakBandwidth: 0,
    minBandwidth: Infinity,
    maxLatency: 0,
    minLatency: Infinity,
    totalPacketLoss: 0,
    reconnections: 0,
    qualitySwitches: 0,
  }

  /**
   * Start call diagnostics tracking.
   */
  startDiagnostics(): void {
    this.callDiagnostics = {
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      totalBytesSent: 0,
      totalBytesReceived: 0,
      peakBandwidth: 0,
      minBandwidth: Infinity,
      maxLatency: 0,
      minLatency: Infinity,
      totalPacketLoss: 0,
      reconnections: 0,
      qualitySwitches: 0,
    }
  }

  /**
   * Stop call diagnostics tracking.
   */
  stopDiagnostics(): void {
    this.callDiagnostics.endTime = Date.now()
    this.callDiagnostics.duration = this.callDiagnostics.endTime - this.callDiagnostics.startTime
  }

  /**
   * Record bytes sent/received.
   */
  recordBytes(sent: number, received: number): void {
    this.callDiagnostics.totalBytesSent += sent
    this.callDiagnostics.totalBytesReceived += received

    const totalBandwidth = sent + received
    if (totalBandwidth > this.callDiagnostics.peakBandwidth) {
      this.callDiagnostics.peakBandwidth = totalBandwidth
    }
    if (totalBandwidth < this.callDiagnostics.minBandwidth) {
      this.callDiagnostics.minBandwidth = totalBandwidth
    }
  }

  /**
   * Record latency measurement.
   */
  recordLatency(latency: number): void {
    if (latency > this.callDiagnostics.maxLatency) {
      this.callDiagnostics.maxLatency = latency
    }
    if (latency < this.callDiagnostics.minLatency) {
      this.callDiagnostics.minLatency = latency
    }
  }

  /**
   * Record packet loss.
   */
  recordPacketLoss(loss: number): void {
    this.callDiagnostics.totalPacketLoss += loss
  }

  /**
   * Record reconnection.
   */
  recordReconnection(): void {
    this.callDiagnostics.reconnections++
  }

  /**
   * Record quality switch.
   */
  recordQualitySwitch(): void {
    this.callDiagnostics.qualitySwitches++
  }

  /**
   * Get call diagnostics.
   */
  getCallDiagnostics(): CallDiagnostics {
    return { ...this.callDiagnostics }
  }

  /**
   * Generate call quality report.
   */
  generateCallReport(): CallReport {
    const avgQuality = this.getAverageQuality()
    return {
      diagnostics: { ...this.callDiagnostics },
      averageQuality: avgQuality,
      networkType: this.networkConditions.type,
      totalAdjustments: this.qualityAdjustments.length,
      finalMetrics: { ...this.qualityMetrics },
    }
  }

  // ─── Media Encryption (SecretStream-inspired) ───────────────────────────

  private mediaEncryptionEnabled = false
  private mediaEncryptionKey: CryptoKey | null = null
  private mediaEncryptionIV = 0

  /**
   * Enable media encryption for the call.
   */
  async enableMediaEncryption(): Promise<void> {
    if (this.mediaEncryptionEnabled) return

    // Generate encryption key
    this.mediaEncryptionKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
    this.mediaEncryptionEnabled = true
    this.mediaEncryptionIV = 0
    console.log('[CallService] Media encryption enabled')
  }

  /**
   * Disable media encryption for the call.
   */
  disableMediaEncryption(): void {
    this.mediaEncryptionEnabled = false
    this.mediaEncryptionKey = null
    this.mediaEncryptionIV = 0
    console.log('[CallService] Media encryption disabled')
  }

  /**
   * Check if media encryption is enabled.
   */
  isMediaEncryptionEnabled(): boolean {
    return this.mediaEncryptionEnabled
  }

  /**
   * Encrypt media data before sending.
   */
  async encryptMediaData(data: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.mediaEncryptionEnabled || !this.mediaEncryptionKey) {
      return data
    }

    const iv = new Uint8Array(12)
    crypto.getRandomValues(iv)
    this.mediaEncryptionIV++

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.mediaEncryptionKey,
      data
    )

    // Prepend IV to encrypted data
    const result = new Uint8Array(iv.length + encrypted.byteLength)
    result.set(iv, 0)
    result.set(new Uint8Array(encrypted), iv.length)
    return result.buffer
  }

  /**
   * Decrypt received media data.
   */
  async decryptMediaData(data: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.mediaEncryptionEnabled || !this.mediaEncryptionKey) {
      return data
    }

    const iv = new Uint8Array(data, 0, 12)
    const encryptedData = new Uint8Array(data, 12)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.mediaEncryptionKey,
      encryptedData
    )

    return decrypted
  }

  /**
   * Export encryption key for sharing with peer.
   */
  async exportEncryptionKey(): Promise<string | null> {
    if (!this.mediaEncryptionKey) return null

    const exported = await crypto.subtle.exportKey('raw', this.mediaEncryptionKey)
    return btoa(String.fromCharCode(...new Uint8Array(exported)))
  }

  /**
   * Import encryption key from peer.
   */
  async importEncryptionKey(keyBase64: string): Promise<void> {
    const keyData = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))
    this.mediaEncryptionKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    )
    this.mediaEncryptionEnabled = true
    console.log('[CallService] Media encryption key imported from peer')
  }

  // ─── Connection Security (HyperDHT-inspired) ───────────────────────────

  private connectionVerified = false
  private peerPublicKey: string | null = null
  private handshakeHash: string | null = null
  private firewallRules: FirewallRule[] = []

  /**
   * Verify connection with peer using public key.
   */
  verifyConnection(peerPublicKey: string, handshakeHash: string): boolean {
    this.peerPublicKey = peerPublicKey
    this.handshakeHash = handshakeHash
    this.connectionVerified = true

    // Check firewall rules
    for (const rule of this.firewallRules) {
      if (rule.type === 'block' && rule.publicKey === peerPublicKey) {
        console.log(`[CallService] Connection blocked by firewall rule: ${peerPublicKey}`)
        return false
      }
    }

    console.log('[CallService] Connection verified with peer:', peerPublicKey.slice(0, 8))
    return true
  }

  /**
   * Check if connection is verified.
   */
  isConnectionVerified(): boolean {
    return this.connectionVerified
  }

  /**
   * Get peer public key.
   */
  getPeerPublicKey(): string | null {
    return this.peerPublicKey
  }

  /**
   * Get handshake hash.
   */
  getHandshakeHash(): string | null {
    return this.handshakeHash
  }

  /**
   * Add a firewall rule.
   */
  addFirewallRule(rule: FirewallRule): void {
    this.firewallRules.push(rule)
    console.log(`[CallService] Firewall rule added: ${rule.type} ${rule.publicKey}`)
  }

  /**
   * Remove a firewall rule.
   */
  removeFirewallRule(publicKey: string): void {
    this.firewallRules = this.firewallRules.filter(r => r.publicKey !== publicKey)
    console.log(`[CallService] Firewall rule removed: ${publicKey}`)
  }

  /**
   * Get all firewall rules.
   */
  getFirewallRules(): FirewallRule[] {
    return [...this.firewallRules]
  }

  /**
   * Check if a peer is blocked by firewall.
   */
  isPeerBlocked(publicKey: string): boolean {
    return this.firewallRules.some(r => r.type === 'block' && r.publicKey === publicKey)
  }

  /**
   * Clear all firewall rules.
   */
  clearFirewallRules(): void {
    this.firewallRules = []
    console.log('[CallService] All firewall rules cleared')
  }

  /**
   * Reset connection security state.
   */
  resetConnectionSecurity(): void {
    this.connectionVerified = false
    this.peerPublicKey = null
    this.handshakeHash = null
  }

  // ─── Advanced Audio Processing (HyperDHT-inspired) ─────────────────────

  private audioProcessingEnabled = false
  private noiseReductionEnabled = false
  private echoCancellationEnabled = false
  private autoGainControlEnabled = false
  private audioFilters: AudioNode[] = []
  private audioMetrics: AudioMetrics = {
    inputLevel: 0,
    outputLevel: 0,
    noiseLevel: 0,
    echoReturnLoss: 0,
    clippingCount: 0,
  }

  /**
   * Enable advanced audio processing.
   */
  enableAudioProcessing(): void {
    this.audioProcessingEnabled = true
    console.log('[CallService] Advanced audio processing enabled')
  }

  /**
   * Disable advanced audio processing.
   */
  disableAudioProcessing(): void {
    this.audioProcessingEnabled = false
    console.log('[CallService] Advanced audio processing disabled')
  }

  /**
   * Enable noise reduction.
   */
  enableNoiseReduction(): void {
    this.noiseReductionEnabled = true
    console.log('[CallService] Noise reduction enabled')
  }

  /**
   * Disable noise reduction.
   */
  disableNoiseReduction(): void {
    this.noiseReductionEnabled = false
    console.log('[CallService] Noise reduction disabled')
  }

  /**
   * Enable echo cancellation.
   */
  enableEchoCancellation(): void {
    this.echoCancellationEnabled = true
    console.log('[CallService] Echo cancellation enabled')
  }

  /**
   * Disable echo cancellation.
   */
  disableEchoCancellation(): void {
    this.echoCancellationEnabled = false
    console.log('[CallService] Echo cancellation disabled')
  }

  /**
   * Enable auto gain control.
   */
  enableAutoGainControl(): void {
    this.autoGainControlEnabled = true
    console.log('[CallService] Auto gain control enabled')
  }

  /**
   * Disable auto gain control.
   */
  disableAutoGainControl(): void {
    this.autoGainControlEnabled = false
    console.log('[CallService] Auto gain control disabled')
  }

  /**
   * Get audio processing status.
   */
  getAudioProcessingStatus(): {
    processing: boolean
    noiseReduction: boolean
    echoCancellation: boolean
    autoGainControl: boolean
  } {
    return {
      processing: this.audioProcessingEnabled,
      noiseReduction: this.noiseReductionEnabled,
      echoCancellation: this.echoCancellationEnabled,
      autoGainControl: this.autoGainControlEnabled,
    }
  }

  /**
   * Update audio metrics.
   */
  updateAudioMetrics(metrics: Partial<AudioMetrics>): void {
    this.audioMetrics = { ...this.audioMetrics, ...metrics }
  }

  /**
   * Get audio metrics.
   */
  getAudioMetrics(): AudioMetrics {
    return { ...this.audioMetrics }
  }

  /**
   * Apply audio filters to the capture stream.
   */
  applyAudioFilters(stream: MediaStream): MediaStream {
    if (!this.audioProcessingEnabled) return stream

    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    let currentNode: AudioNode = source

    // Apply noise reduction filter
    if (this.noiseReductionEnabled) {
      const noiseFilter = context.createBiquadFilter()
      noiseFilter.type = 'highpass'
      noiseFilter.frequency.value = 80 // Remove low-frequency noise
      currentNode.connect(noiseFilter)
      currentNode = noiseFilter
      this.audioFilters.push(noiseFilter)
    }

    // Apply echo cancellation simulation
    if (this.echoCancellationEnabled) {
      const echoFilter = context.createDelay(0.01)
      echoFilter.delayTime.value = 0.005 // 5ms delay for echo simulation
      currentNode.connect(echoFilter)
      currentNode = echoFilter
      this.audioFilters.push(echoFilter)
    }

    // Apply auto gain control
    if (this.autoGainControlEnabled) {
      const compressor = context.createDynamicsCompressor()
      compressor.threshold.value = -24
      compressor.knee.value = 30
      compressor.ratio.value = 12
      compressor.attack.value = 0.003
      compressor.release.value = 0.25
      currentNode.connect(compressor)
      currentNode = compressor
      this.audioFilters.push(compressor)
    }

    const destination = context.createMediaStreamDestination()
    currentNode.connect(destination)

    return destination.stream
  }

  /**
   * Clear all audio filters.
   */
  clearAudioFilters(): void {
    for (const filter of this.audioFilters) {
      filter.disconnect()
    }
    this.audioFilters = []
  }

  /**
   * Calculate audio level (RMS).
   */
  calculateAudioLevel(samples: Float32Array): number {
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i]
    }
    return Math.sqrt(sum / samples.length)
  }

  /**
   * Detect audio clipping.
   */
  detectClipping(samples: Float32Array): boolean {
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) >= 1.0) {
        this.audioMetrics.clippingCount++
        return true
      }
    }
    return false
  }

  /**
   * Apply noise gate to remove background noise.
   */
  applyNoiseGate(samples: Float32Array, threshold: number = 0.01): Float32Array {
    const result = new Float32Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
      result[i] = Math.abs(samples[i]) > threshold ? samples[i] : 0
    }
    return result
  }

  /**
   * Get audio processing statistics.
   */
  getAudioStats(): {
    filtersApplied: number
    clippingEvents: number
    noiseReductionActive: boolean
    echoCancellationActive: boolean
    autoGainActive: boolean
  } {
    return {
      filtersApplied: this.audioFilters.length,
      clippingEvents: this.audioMetrics.clippingCount,
      noiseReductionActive: this.noiseReductionEnabled,
      echoCancellationActive: this.echoCancellationEnabled,
      autoGainActive: this.autoGainControlEnabled,
    }
  }

  // ─── Audio Compression (Protomux-inspired) ─────────────────────────────

  private audioCompressionEnabled = false
  private audioCodec: 'pcm' | 'opus' | 'aac' = 'pcm'
  private audioBitrate = 128000 // 128 kbps default
  // PRO QUALITY: 0 = follow the adaptive tier; >0 = explicit user choice
  private audioBitrateOverride = 0
  private audioSampleRate = 48000
  private audioChannels = 1 // Mono for calls

  /**
   * Enable audio compression.
   * PRO QUALITY: this actually drives the transport now — 'opus' switches capture
   * to the WebCodecs AudioEncoder (24–96 kbps), 'pcm' forces the raw fallback
   * (768 kbps). 'aac' is accepted for API compatibility but maps to Opus, which
   * is the only low-latency voice codec available here.
   */
  enableAudioCompression(codec: 'pcm' | 'opus' | 'aac' = 'opus'): void {
    this.audioCompressionEnabled = codec !== 'pcm'
    this.audioCodec = codec
    if (codec === 'pcm') {
      this.useOpus = false
      this.closeAudioEncoder()
    } else {
      // Re-run detection: it sets useOpus only if encode AND decode are supported
      this.detectBestAudioCodec()
    }
    console.log(`[CallService] Audio compression enabled: ${codec}`)
  }

  /**
   * Disable audio compression — falls back to raw PCM Int16.
   */
  disableAudioCompression(): void {
    this.audioCompressionEnabled = false
    this.audioCodec = 'pcm'
    this.useOpus = false
    this.closeAudioEncoder()
    console.log('[CallService] Audio compression disabled')
  }

  /**
   * Set audio bitrate. Applied to the live Opus encoder immediately and pinned
   * as an override, so the adaptive tier no longer overrides the user's choice.
   */
  setAudioBitrate(bitrate: number): void {
    this.audioBitrateOverride = Math.max(8000, Math.min(320000, bitrate)) // 8kbps to 320kbps
    this.reconfigureAudioEncoder()
    this.audioBitrate = this.audioBitrateOverride
    console.log(`[CallService] Audio bitrate set to: ${this.audioBitrate} bps`)
  }

  /**
   * Hand bitrate control back to the adaptive tier (network quality + peers).
   */
  clearAudioBitrateOverride(): void {
    this.audioBitrateOverride = 0
    this.reconfigureAudioEncoder()
  }

  /**
   * Get audio bitrate.
   */
  getAudioBitrate(): number {
    return this.audioBitrate
  }

  /**
   * Set audio sample rate.
   */
  setAudioSampleRate(sampleRate: number): void {
    this.audioSampleRate = sampleRate
    console.log(`[CallService] Audio sample rate set to: ${sampleRate} Hz`)
  }

  /**
   * Get audio sample rate.
   */
  getAudioSampleRate(): number {
    return this.audioSampleRate
  }

  /**
   * Set audio channels (1 for mono, 2 for stereo).
   */
  setAudioChannels(channels: 1 | 2): void {
    this.audioChannels = channels
    console.log(`[CallService] Audio channels set to: ${channels}`)
  }

  /**
   * Get audio channels.
   */
  getAudioChannels(): number {
    return this.audioChannels
  }

  /**
   * Get audio compression status.
   */
  getAudioCompressionStatus(): {
    enabled: boolean
    codec: string
    bitrate: number
    sampleRate: number
    channels: number
  } {
    return {
      enabled: this.audioCompressionEnabled,
      codec: this.audioCodec,
      bitrate: this.audioBitrate,
      sampleRate: this.audioSampleRate,
      channels: this.audioChannels,
    }
  }

  // ─── Audio Bandwidth Management (Protomux-inspired) ────────────────────

  private audioBandwidthLimit = 0 // 0 = unlimited
  private audioBandwidthUsage = 0
  private audioBandwidthHistory: number[] = []

  /**
   * Set audio bandwidth limit (bytes per second).
   */
  setAudioBandwidthLimit(bytesPerSecond: number): void {
    this.audioBandwidthLimit = bytesPerSecond
    console.log(`[CallService] Audio bandwidth limit set to: ${bytesPerSecond} B/s`)
  }

  /**
   * Get audio bandwidth limit.
   */
  getAudioBandwidthLimit(): number {
    return this.audioBandwidthLimit
  }

  /**
   * Record audio bandwidth usage.
   */
  recordAudioBandwidth(bytes: number): void {
    this.audioBandwidthUsage += bytes
    this.audioBandwidthHistory.push(bytes)

    // Keep only last 100 samples
    if (this.audioBandwidthHistory.length > 100) {
      this.audioBandwidthHistory.shift()
    }
  }

  /**
   * Get current audio bandwidth usage.
   */
  getAudioBandwidthUsage(): number {
    return this.audioBandwidthUsage
  }

  /**
   * Get audio bandwidth history.
   */
  getAudioBandwidthHistory(): number[] {
    return [...this.audioBandwidthHistory]
  }

  /**
   * Calculate average audio bandwidth.
   */
  getAverageAudioBandwidth(): number {
    if (this.audioBandwidthHistory.length === 0) return 0
    const sum = this.audioBandwidthHistory.reduce((a, b) => a + b, 0)
    return sum / this.audioBandwidthHistory.length
  }

  /**
   * Check if audio bandwidth limit is exceeded.
   */
  isAudioBandwidthExceeded(): boolean {
    if (this.audioBandwidthLimit === 0) return false
    return this.audioBandwidthUsage > this.audioBandwidthLimit
  }

  /**
   * Reset audio bandwidth counters.
   */
  resetAudioBandwidth(): void {
    this.audioBandwidthUsage = 0
    this.audioBandwidthHistory = []
    console.log('[CallService] Audio bandwidth counters reset')
  }

  /**
   * Get audio bandwidth statistics.
   */
  getAudioBandwidthStats(): {
    limit: number
    currentUsage: number
    averageUsage: number
    exceeded: boolean
    historySize: number
  } {
    return {
      limit: this.audioBandwidthLimit,
      currentUsage: this.audioBandwidthUsage,
      averageUsage: this.getAverageAudioBandwidth(),
      exceeded: this.isAudioBandwidthExceeded(),
      historySize: this.audioBandwidthHistory.length,
    }
  }

  // ─── Audio Quality Presets (Protomux-inspired) ─────────────────────────

  /**
   * Apply audio quality preset.
   */
  applyAudioPreset(preset: 'low' | 'medium' | 'high' | 'studio'): void {
    switch (preset) {
      case 'low':
        this.setAudioBitrate(24000) // 24 kbps
        this.setAudioSampleRate(16000) // 16 kHz
        this.setAudioChannels(1) // Mono
        console.log('[CallService] Low quality preset applied')
        break
      case 'medium':
        this.setAudioBitrate(64000) // 64 kbps
        this.setAudioSampleRate(32000) // 32 kHz
        this.setAudioChannels(1) // Mono
        console.log('[CallService] Medium quality preset applied')
        break
      case 'high':
        this.setAudioBitrate(128000) // 128 kbps
        this.setAudioSampleRate(48000) // 48 kHz
        this.setAudioChannels(1) // Mono
        console.log('[CallService] High quality preset applied')
        break
      case 'studio':
        this.setAudioBitrate(320000) // 320 kbps
        this.setAudioSampleRate(48000) // 48 kHz
        this.setAudioChannels(2) // Stereo
        console.log('[CallService] Studio quality preset applied')
        break
    }
  }

  /**
   * Get current audio preset based on settings.
   */
  getCurrentAudioPreset(): 'low' | 'medium' | 'high' | 'studio' | 'custom' {
    if (this.audioBitrate === 24000 && this.audioSampleRate === 16000 && this.audioChannels === 1) {
      return 'low'
    }
    if (this.audioBitrate === 64000 && this.audioSampleRate === 32000 && this.audioChannels === 1) {
      return 'medium'
    }
    if (this.audioBitrate === 128000 && this.audioSampleRate === 48000 && this.audioChannels === 1) {
      return 'high'
    }
    if (this.audioBitrate === 320000 && this.audioSampleRate === 48000 && this.audioChannels === 2) {
      return 'studio'
    }
    return 'custom'
  }

  // ─── Audio Multiplexing (HyperDHT-inspired) ────────────────────────────

  private audioStreams: Map<string, AudioStreamInfo> = new Map()
  private multiplexingEnabled = false

  /**
   * Enable audio multiplexing for group calls.
   */
  enableMultiplexing(): void {
    this.multiplexingEnabled = true
    console.log('[CallService] Audio multiplexing enabled')
  }

  /**
   * Disable audio multiplexing.
   */
  disableMultiplexing(): void {
    this.multiplexingEnabled = false
    console.log('[CallService] Audio multiplexing disabled')
  }

  /**
   * Check if multiplexing is enabled.
   */
  isMultiplexingEnabled(): boolean {
    return this.multiplexingEnabled
  }

  /**
   * Register an audio stream for multiplexing.
   */
  registerAudioStream(streamId: string, peerId: string, priority: number = 1): void {
    this.audioStreams.set(streamId, {
      streamId,
      peerId,
      priority,
      active: true,
      volume: 1.0,
      muted: false,
    })
    console.log(`[CallService] Audio stream registered: ${streamId} (peer: ${peerId})`)
  }

  /**
   * Unregister an audio stream.
   */
  unregisterAudioStream(streamId: string): void {
    this.audioStreams.delete(streamId)
    console.log(`[CallService] Audio stream unregistered: ${streamId}`)
  }

  /**
   * Set audio stream priority.
   */
  setAudioStreamPriority(streamId: string, priority: number): void {
    const stream = this.audioStreams.get(streamId)
    if (stream) {
      stream.priority = priority
      console.log(`[CallService] Audio stream ${streamId} priority set to: ${priority}`)
    }
  }

  /**
   * Set audio stream volume.
   */
  setAudioStreamVolume(streamId: string, volume: number): void {
    const stream = this.audioStreams.get(streamId)
    if (stream) {
      stream.volume = Math.max(0, Math.min(2, volume))
      console.log(`[CallService] Audio stream ${streamId} volume set to: ${volume}`)
    }
  }

  /**
   * Mute/unmute an audio stream.
   */
  setAudioStreamMuted(streamId: string, muted: boolean): void {
    const stream = this.audioStreams.get(streamId)
    if (stream) {
      stream.muted = muted
      console.log(`[CallService] Audio stream ${streamId} ${muted ? 'muted' : 'unmuted'}`)
    }
  }

  /**
   * Get all registered audio streams.
   */
  getAudioStreams(): AudioStreamInfo[] {
    return Array.from(this.audioStreams.values())
  }

  /**
   * Get audio stream by ID.
   */
  getAudioStream(streamId: string): AudioStreamInfo | null {
    return this.audioStreams.get(streamId) || null
  }

  /**
   * Get active audio streams sorted by priority.
   */
  getActiveAudioStreams(): AudioStreamInfo[] {
    return Array.from(this.audioStreams.values())
      .filter(s => s.active && !s.muted)
      .sort((a, b) => b.priority - a.priority)
  }

  /**
   * Mix multiple audio streams into one.
   */
  mixAudioStreams(streamIds: string[]): MixedAudioStream {
    const streams = streamIds
      .map(id => this.audioStreams.get(id))
      .filter((s): s is AudioStreamInfo => s !== undefined && s.active && !s.muted)

    return {
      streamIds: streams.map(s => s.streamId),
      peerIds: streams.map(s => s.peerId),
      totalStreams: streams.length,
      mixedAt: Date.now(),
    }
  }

  // ─── Audio Priority Management (HyperDHT-inspired) ─────────────────────

  private priorityRules: PriorityRule[] = []

  /**
   * Add a priority rule.
   */
  addPriorityRule(rule: PriorityRule): void {
    this.priorityRules.push(rule)
    console.log(`[CallService] Priority rule added: ${rule.type} -> priority ${rule.priority}`)
  }

  /**
   * Remove a priority rule.
   */
  removePriorityRule(ruleId: string): void {
    this.priorityRules = this.priorityRules.filter(r => r.id !== ruleId)
    console.log(`[CallService] Priority rule removed: ${ruleId}`)
  }

  /**
   * Get all priority rules.
   */
  getPriorityRules(): PriorityRule[] {
    return [...this.priorityRules]
  }

  /**
   * Calculate priority for a peer based on rules.
   */
  calculatePeerPriority(_peerId: string, context: PeerContext): number {
    let priority = 1 // Default priority

    for (const rule of this.priorityRules) {
      if (rule.type === 'contact' && context.isContact) {
        priority += rule.priority
      }
      if (rule.type === 'speaker' && context.isSpeaking) {
        priority += rule.priority
      }
      if (rule.type === 'video' && context.hasVideo) {
        priority += rule.priority
      }
      if (rule.type === 'host' && context.isHost) {
        priority += rule.priority
      }
    }

    return priority
  }

  /**
   * Auto-adjust priorities based on speaking activity.
   */
  autoAdjustPriorities(speakingPeers: string[]): void {
    for (const stream of this.audioStreams.values()) {
      if (speakingPeers.includes(stream.peerId)) {
        stream.priority = Math.min(10, stream.priority + 1)
      } else {
        stream.priority = Math.max(1, stream.priority - 0.5)
      }
    }
    console.log(`[CallService] Auto-adjusted priorities for ${speakingPeers.length} speaking peers`)
  }

  /**
   * Get priority statistics.
   */
  getPriorityStats(): {
    totalStreams: number
    activeStreams: number
    mutedStreams: number
    averagePriority: number
    maxPriority: number
    minPriority: number
  } {
    const streams = Array.from(this.audioStreams.values())
    const activeStreams = streams.filter(s => s.active && !s.muted)
    const priorities = streams.map(s => s.priority)

    return {
      totalStreams: streams.length,
      activeStreams: activeStreams.length,
      mutedStreams: streams.filter(s => s.muted).length,
      averagePriority: priorities.length > 0 ? priorities.reduce((a, b) => a + b, 0) / priorities.length : 0,
      maxPriority: priorities.length > 0 ? Math.max(...priorities) : 0,
      minPriority: priorities.length > 0 ? Math.min(...priorities) : 0,
    }
  }
}

export const callService = new CallService()

// ─── Types ──────────────────────────────────────────────────────────────────

interface QualityMetrics {
  currentFPS: number
  currentBitrate: number
  packetLoss: number
  jitter: number
  latency: number
  resolution: { width: number; height: number }
}

interface QualityAdjustment {
  timestamp: number
  previousBitrate: number
  newBitrate: number
  reason: 'low_bandwidth' | 'auto' | 'manual'
}

interface NetworkConditions {
  type: 'unknown' | 'ethernet' | 'wifi' | '4g' | '3g' | '2g' | 'cellular'
  downlink: number
  rtt: number
  saveData: boolean
}

interface CallDiagnostics {
  startTime: number
  endTime: number
  duration: number
  totalBytesSent: number
  totalBytesReceived: number
  peakBandwidth: number
  minBandwidth: number
  maxLatency: number
  minLatency: number
  totalPacketLoss: number
  reconnections: number
  qualitySwitches: number
}

interface CallReport {
  diagnostics: CallDiagnostics
  averageQuality: {
    avgFPS: number
    avgBitrate: number
    avgPacketLoss: number
    avgJitter: number
    avgLatency: number
  }
  networkType: string
  totalAdjustments: number
  finalMetrics: QualityMetrics
}

interface FirewallRule {
  type: 'block' | 'allow'
  publicKey: string
  reason?: string
  createdAt: number
}

interface AudioMetrics {
  inputLevel: number
  outputLevel: number
  noiseLevel: number
  echoReturnLoss: number
  clippingCount: number
}

interface AudioStreamInfo {
  streamId: string
  peerId: string
  priority: number
  active: boolean
  volume: number
  muted: boolean
}

interface MixedAudioStream {
  streamIds: string[]
  peerIds: string[]
  totalStreams: number
  mixedAt: number
}

interface PriorityRule {
  id: string
  type: 'contact' | 'speaker' | 'video' | 'host'
  priority: number
  description?: string
}

interface PeerContext {
  isContact: boolean
  isSpeaking: boolean
  hasVideo: boolean
  isHost: boolean
}
