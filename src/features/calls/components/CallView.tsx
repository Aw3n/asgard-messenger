import React, { useEffect, useState, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { useCallStore } from '@/stores/callStore'
import { useContactStore } from '@/stores/contactStore'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { callService } from '@/services/CallService'
import { CallControls } from './CallControls'
import { cn } from '@/utils/cn'

/**
 * CallView — Keet-inspired full-screen call interface.
 * Design principles from Holepunch/Keet:
 * - Minimal chrome, maximum content
 * - Dark immersive background for video
 * - Smooth enter/exit transitions
 * - Clear connection status feedback
 * - Accessible controls with visual feedback
 */
import { useTranslation } from 'react-i18next'

/**
 * PERFECT QUALITY GROUP: one grid tile = one remote participant.
 * Attaches that peer's dedicated decode canvas (CallService per-peer video
 * state) into the DOM as soon as it exists — group media never touches the
 * 1:1 receive canvas, so this tile is the only window onto that peer's video.
 * The canvas is OWNED by CallService: we only borrow it for display and
 * detach it on unmount, never destroy it.
 */
const PeerVideoTile: React.FC<{
  peerId: string
  name: string
  avatar?: string
}> = ({ peerId, name, avatar }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasVideo, setHasVideo] = useState(false)

  useEffect(() => {
    let lastCanvas: HTMLCanvasElement | null = null
    const attach = () => {
      const container = containerRef.current
      if (!container) return
      const canvas = callService.getPeerVideoCanvas(peerId)
      if (canvas && canvas !== lastCanvas) {
        while (container.firstChild) container.removeChild(container.firstChild)
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        canvas.style.objectFit = 'cover'
        canvas.style.display = 'block'
        container.appendChild(canvas)
        lastCanvas = canvas
        setHasVideo(true)
      }
    }
    attach()
    // The canvas is created lazily on the first decoded frame — poll for it
    const interval = setInterval(attach, 300)
    return () => {
      clearInterval(interval)
      // Detach only — the canvas belongs to CallService's per-peer decode state
      if (lastCanvas?.parentElement) {
        try { lastCanvas.parentElement.removeChild(lastCanvas) } catch {}
      }
      lastCanvas = null
    }
  }, [peerId])

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '12px',
      background: '#0D0F16',
    }}>
      {/* Peer video canvas (attached imperatively above) */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Placeholder until the first frame is decoded */}
      {!hasVideo && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Avatar src={avatar} name={name} publicKey={peerId} size="xl" status="online" showStatus />
        </div>
      )}

      {/* Name badge */}
      <div style={{
        position: 'absolute',
        left: '8px',
        bottom: '8px',
        padding: '3px 10px',
        borderRadius: '8px',
        background: 'rgba(0,0,0,0.55)',
        fontSize: '12px',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.9)',
        maxWidth: 'calc(100% - 16px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        zIndex: 2,
      }}>
        {name}
      </div>
    </div>
  )
}

export const CallView: React.FC = () => {
  const activeCall = useCallStore((s) => s.activeCall)
  const isMuted = useCallStore((s) => s.isMuted)
  const isCameraOff = useCallStore((s) => s.isCameraOff)
  // PERFECT QUALITY GROUP: resolve participant names/avatars for the video grid
  const contacts = useContactStore((s) => s.contacts)
  const groups = useGroupStore((s) => s.groups)
  const myPublicKey = useIdentityStore((s) => s.identity?.keyPair.publicKey)
  const { t } = useTranslation()
  const [duration, setDuration] = useState(0)
  const [bandwidthQuality, setBandwidthQuality] = useState<'good' | 'medium' | 'poor'>('good')
  const [peerVideoReady, setPeerVideoReady] = useState(false)
  const [localVideoReady, setLocalVideoReady] = useState(false)
  const [videoCodec, setVideoCodec] = useState('JPEG')
  // PRO QUALITY: real pipeline info — encoder resolution and audio codec are now
  // adaptive, so the badge reports what is actually running, not a constant.
  const [videoResolution, setVideoResolution] = useState('')
  const [audioCodec, setAudioCodec] = useState('PCM')
  // COHÉRENCE STATS: consomme getCallQualityMetrics() — compteurs réels du
  // pipeline (pertes audio/vidéo, underruns, gigue, tampon) qui restaient
  // invisibles faute de consommateur UI. Panneau togglable depuis la top bar.
  const [showStats, setShowStats] = useState(false)
  const [callStats, setCallStats] = useState<ReturnType<typeof callService.getCallQualityMetrics> | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const peerAudioRef = useRef<HTMLAudioElement>(null)
  const peerCanvasContainerRef = useRef<HTMLDivElement>(null)

  // PERFECT QUALITY GROUP: grid tiles for group video calls. Group media is
  // decoded into per-peer canvases (CallService.peerVideoState) — the 1:1
  // receive canvas is NOT used in mesh mode, so this grid is the only window
  // onto remote video. On the receiver side the participant list includes
  // ourselves (offer payload) — filter our own key out.
  const peerTiles = useMemo(() => {
    if (!activeCall?.isGroupCall || !activeCall.participants) return []
    const group = activeCall.groupId ? groups[activeCall.groupId] : undefined
    return activeCall.participants
      .filter((pk) => pk !== myPublicKey)
      .map((pk) => {
        const contact = contacts[pk]
        const member = group?.members.find((m) => m.publicKey === pk)
        return {
          peerId: pk,
          name: member?.displayName || contact?.displayName || `${pk.slice(0, 10)}…`,
          avatar: contact?.avatar || member?.avatar,
        }
      })
  }, [activeCall?.isGroupCall, activeCall?.participants, activeCall?.groupId, contacts, groups, myPublicKey])

  // Duration timer effect
  useEffect(() => {
    if (!activeCall) return
    const interval = setInterval(() => {
      const startTime = activeCall?.connectedAt ?? Date.now()
      setDuration(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [activeCall?.connectedAt])

  // Bandwidth quality polling + metrics
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'connected') return
    const interval = setInterval(() => {
      setBandwidthQuality(callService.getBandwidthQuality())
      const stats = callService.getVideoStats()
      setVideoCodec(stats.codec)
      setVideoResolution(stats.resolution)
      setAudioCodec(callService.getAudioPipelineStats().codec)
      if (showStats) {
        setCallStats(callService.getCallQualityMetrics())
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [activeCall?.status, showStats])

  // Attach local video stream
  useEffect(() => {
    if (!activeCall) return
    const attachLocal = () => {
      const localStream = callService.getLocalStream()
      if (localStream && localVideoRef.current && !localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject = localStream
        setLocalVideoReady(true)
      }
    }
    attachLocal()
    const interval = setInterval(attachLocal, 200)
    return () => clearInterval(interval)
  }, [activeCall?.status])

  // Attach peer video canvas
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'connected') return
    let lastCanvas: HTMLCanvasElement | null = null
    setPeerVideoReady(false)
  
    const attachPeer = () => {
      const receiveCanvas = callService.getReceiveCanvas()
      const peerStream = callService.getPeerStream()
  
      // Attach audio
      if (peerStream && peerAudioRef.current && !peerAudioRef.current.srcObject) {
        peerAudioRef.current.srcObject = peerStream
      }
  
      // Attach video canvas
      if (receiveCanvas && peerCanvasContainerRef.current) {
        const container = peerCanvasContainerRef.current
        if (receiveCanvas !== lastCanvas) {
          // Remove old canvas
          while (container.firstChild) container.removeChild(container.firstChild)
          // Style new canvas
          receiveCanvas.style.width = '100%'
          receiveCanvas.style.height = '100%'
          receiveCanvas.style.objectFit = 'cover'
          receiveCanvas.style.display = 'block'
          container.appendChild(receiveCanvas)
          lastCanvas = receiveCanvas
          setPeerVideoReady(true)
        }
      }
    }
    // Immediate attempt
    attachPeer()
    // Poll for late-arriving canvas
    const interval = setInterval(attachPeer, 150)
    return () => {
      clearInterval(interval)
      if (peerCanvasContainerRef.current) {
        const container = peerCanvasContainerRef.current
        while (container.firstChild) {
          container.removeChild(container.firstChild)
        }
      }
    }
  }, [activeCall?.status])

  if (!activeCall) return null

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const formatBandwidth = (bytesPerSec: number): string => {
    if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
    if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    return `${bytesPerSec} B/s`
  }

  const statsRows: Array<[string, string]> | null = callStats ? [
    [t('calls.statsDuration'), formatDuration(callStats.duration)],
    [t('calls.statsBandwidth'), formatBandwidth(callStats.bandwidth)],
    [t('calls.statsPacketLoss'), String(callStats.packetLoss)],
    [t('calls.statsChunksDropped'), String(callStats.audioChunksDropped)],
    [t('calls.statsUnderruns'), String(callStats.audioUnderruns)],
    [t('calls.statsFramesLost'), String(callStats.framesLost)],
    [t('calls.statsJitter'), `${callStats.jitter} ms`],
    [t('calls.statsBufferDepth'), `${callStats.bufferDepthMs} ms`],
  ] : null

  const isVideoCall = activeCall.type === 'video'
  const isConnected = activeCall.status === 'connected'
  const isOutgoing = activeCall.status === 'outgoing'
  const isConnecting = activeCall.status === 'connecting'
  // PERFECT QUALITY GROUP: mesh video grid replaces the fullscreen 1:1 canvas
  const isGroupVideoGrid = !!(activeCall.isGroupCall && isVideoCall && peerTiles.length > 0)
  const gridCols = peerTiles.length <= 1 ? 1 : peerTiles.length <= 4 ? 2 : peerTiles.length <= 9 ? 3 : 4
  const gridRows = Math.max(1, Math.ceil(peerTiles.length / gridCols))

  const statusText = isOutgoing ? t('calls.ringing') :
    isConnecting ? t('calls.connecting') :
    isConnected ? formatDuration(duration) : ''

  const qualityColor = bandwidthQuality === 'good' ? 'text-green-400' :
    bandwidthQuality === 'medium' ? 'text-yellow-400' : 'text-red-400'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        background: '#07080F',
        overflow: 'hidden',
      }}
    >
      {/* ── Hidden audio for peer ── */}
      <audio ref={peerAudioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* ── LAYER: Peer video (fullscreen background — 1:1 calls only) ── */}
      {isVideoCall && !isGroupVideoGrid && (
        <div
          ref={peerCanvasContainerRef}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: peerVideoReady ? 1 : 0,
            transition: 'opacity 0.5s ease',
          }}
        />
      )}

      {/* ── LAYER: Group video grid (per-peer canvases) ── */}
      {isGroupVideoGrid && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gridTemplateRows: `repeat(${gridRows}, 1fr)`,
            gap: '8px',
            // Keep tiles clear of the top bar / bottom controls overlays
            padding: '64px 14px 140px',
            boxSizing: 'border-box',
          }}
        >
          {peerTiles.map((tile) => (
            <PeerVideoTile key={tile.peerId} peerId={tile.peerId} name={tile.name} avatar={tile.avatar} />
          ))}
        </div>
      )}

      {/* ── TOP BAR ── */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.75) 0%, transparent 100%)',
        flexShrink: 0,
      }}>
        {/* Left: back button + peer info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => callService.endCall()}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
            {t('calls.openChat')}
          </button>

          <Avatar
            src={activeCall.peerAvatar}
            name={activeCall.peerName}
            publicKey={activeCall.peerId}
            size="sm"
            status="online"
            showStatus
          />

          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'white', lineHeight: 1.2 }}>
              {activeCall.peerName}
            </p>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              {statusText}
              {activeCall.isGroupCall && activeCall.participants && (
                <span className="ml-2 text-xs inline-flex items-center gap-1">
                  <Icon name="users" size={12} /> {t('calls.participantCount', { count: peerTiles.length + 1 })}
                </span>
              )}
              {isConnected && (
                <span className={cn('ml-2 text-xs', qualityColor)}>
                  ● {bandwidthQuality === 'good' ? t('calls.excellent') : bandwidthQuality === 'medium' ? t('calls.medium') : t('calls.low')}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right: badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* COHÉRENCE STATS: panneau de statistiques — compteurs réels du pipeline */}
          {isConnected && (
            <button
              onClick={() => {
                // Rendu immédiat — sinon le panneau attendrait le premier tick (≤ 2 s)
                if (!showStats) setCallStats(callService.getCallQualityMetrics())
                setShowStats((v) => !v)
              }}
              aria-label={t('calls.statsTitle')}
              title={t('calls.statsTitle')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px', borderRadius: '20px',
                background: showStats ? 'rgba(79,195,247,0.25)' : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: showStats ? 'rgba(79,195,247,0.9)' : 'rgba(255,255,255,0.6)',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
            </button>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '20px',
            background: 'rgba(79,195,247,0.1)', border: '1px solid rgba(79,195,247,0.2)',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(79,195,247,0.8)">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"/>
            </svg>
            <span style={{ fontSize: '11px', color: 'rgba(79,195,247,0.8)', fontWeight: 500 }}>{t('calls.e2e')}</span>
          </div>
          {isConnected && (
            <div style={{
              padding: '4px 10px', borderRadius: '20px',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 500,
            }}>
              {audioCodec}
            </div>
          )}
          {isVideoCall && (
            <div style={{
              padding: '4px 10px', borderRadius: '20px',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 500,
            }}>
              {videoCodec}{videoResolution ? ` · ${videoResolution}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* ── STATS PANEL: compteurs réels du pipeline média (togglable) ── */}
      {showStats && statsRows && (
        <div style={{
          position: 'absolute',
          top: '56px',
          right: '16px',
          zIndex: 20,
          minWidth: '240px',
          padding: '12px 14px',
          borderRadius: '12px',
          background: 'rgba(7,8,15,0.92)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
        }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.9)', margin: '0 0 8px' }}>
            {t('calls.statsTitle')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {statsRows.map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>{label}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CENTER: Avatar (audio call) or Video placeholder ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Audio call or no video yet: show avatar (group grid tiles have
            their own per-peer placeholders) */}
        {(!isVideoCall || (!peerVideoReady && !isGroupVideoGrid)) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            {/* Pulsing rings */}
            {(isOutgoing || isConnecting) && (
              <>
                <motion.div
                  animate={{ scale: [1, 1.8], opacity: [0.15, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                  style={{
                    position: 'absolute',
                    width: '200px', height: '200px',
                    borderRadius: '50%',
                    border: '1px solid rgba(79,195,247,0.3)',
                  }}
                />
                <motion.div
                  animate={{ scale: [1, 1.5], opacity: [0.25, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, delay: 0.4 }}
                  style={{
                    position: 'absolute',
                    width: '160px', height: '160px',
                    borderRadius: '50%',
                    border: '1px solid rgba(79,195,247,0.4)',
                  }}
                />
              </>
            )}
            <Avatar
              src={activeCall.peerAvatar}
              name={activeCall.peerName}
              publicKey={activeCall.peerId}
              size="2xl"
              status="online"
              showStatus
            />
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '22px', fontWeight: 700, color: 'white', marginBottom: '4px' }}>
                {activeCall.peerName}
              </p>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.55)' }}>
                {isOutgoing || isConnecting || isConnected ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name={isOutgoing ? 'phone' : isConnecting ? 'refresh' : 'clock'} size={14} />
                    {isOutgoing ? t('calls.ringing') : isConnecting ? t('calls.connecting') : formatDuration(duration)}
                  </span>
                ) : ''}
              </p>
            </div>
          </div>
        )}

        {/* Local PiP video (bottom-right corner) */}
        {isVideoCall && !isCameraOff && (
          <div style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            width: '180px',
            height: '120px',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.15)',
            background: '#000',
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
            zIndex: 5,
          }}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
            {!localVideoReady && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.8)',
              }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{t('calls.cameraLoading')}</span>
              </div>
            )}
            {/* Camera off label */}
            {isMuted && (
              <div style={{
                position: 'absolute', top: '6px', right: '6px',
                width: '18px', height: '18px', borderRadius: '50%',
                background: 'rgba(239,68,68,0.9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                  <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l6 6zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.76-.48 2.51-.98L19.73 21 21 19.73 4.27 3z"/>
                </svg>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM CONTROLS ── */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        flexShrink: 0,
        padding: '20px 24px 28px',
        background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
      }}>
        <CallControls />
      </div>

    </motion.div>
  )
}

