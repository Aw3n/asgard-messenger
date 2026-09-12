import React from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { useCallStore } from '@/stores/callStore'
import { callService } from '@/services/CallService'

/**
 * CallControls — bottom control bar for calls.
 * Prominent red end-call button, clear labels, proper spacing.
 */
export const CallControls: React.FC = () => {
  const { t } = useTranslation()
  const { isMuted, isCameraOff, isScreenSharing } = useCallStore()
  const endCall = useCallStore((s) => s.endCall)

  const handleEndCall = () => {
    callService.endCall()
    endCall()
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '20px',
    }}>

      {/* Microphone */}
      <CallButton
        onClick={() => callService.toggleMute()}
        active={isMuted}
        activeColor="rgba(239,68,68,0.2)"
        activeBorder="rgba(239,68,68,0.5)"
        activeTextColor="#f87171"
        label={isMuted ? t('calls.microphoneOffLabel') : t('calls.microphoneLabel')}
        icon={isMuted ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l6 6zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.76-.48 2.51-.98L19.73 21 21 19.73 4.27 3z"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
          </svg>
        )}
      />

      {/* Camera */}
      <CallButton
        onClick={() => callService.toggleCamera()}
        active={isCameraOff}
        activeColor="rgba(239,68,68,0.2)"
        activeBorder="rgba(239,68,68,0.5)"
        activeTextColor="#f87171"
        label={isCameraOff ? t('calls.cameraOffLabel') : t('calls.cameraLabel')}
        icon={isCameraOff ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 6.5l-4-4-15 15 1.41 1.41 1.62-1.62C5.38 17.73 6.14 18 7 18h10c1.1 0 2-.9 2-2V8.83l2 2V6.5zm-2 9.5H9.83l7.07-7.07L19 10.5V16zM3.27 3.27L2 4.54v9.96C2 15.65 2.94 17 4 17h.83L7 14.83V14H4V8h3.17l2-2H3.27z"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
          </svg>
        )}
      />

      {/* Screen share */}
      <CallButton
        onClick={() => callService.toggleScreenShare()}
        active={isScreenSharing}
        activeColor="rgba(79,195,247,0.15)"
        activeBorder="rgba(79,195,247,0.4)"
        activeTextColor="#4FC3F7"
        label={t('calls.screenShareLabel')}
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
          </svg>
        }
      />

      {/* ── END CALL — big red button ── */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={handleEndCall}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          background: 'none',
          border: 'none',
        }}
        aria-label={t('calls.mute')}
      >
        <div style={{
          width: '64px', height: '64px',
          borderRadius: '50%',
          background: '#ef4444',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(239,68,68,0.5)',
          transition: 'background 0.15s',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="white" style={{ transform: 'rotate(135deg)' }}>
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
          </svg>
        </div>
        <span style={{ fontSize: '12px', color: '#f87171', fontWeight: 500 }}>Raccrocher</span>
      </motion.button>

    </div>
  )
}

// ─── Reusable control button ──────────────────────────────────────────────────

interface CallButtonProps {
  onClick: () => void
  active?: boolean
  activeColor?: string
  activeBorder?: string
  activeTextColor?: string
  label: string
  icon: React.ReactNode
}

const CallButton: React.FC<CallButtonProps> = ({
  onClick, active = false,
  activeColor = 'rgba(255,255,255,0.05)',
  activeBorder = 'rgba(255,255,255,0.2)',
  activeTextColor = '#fff',
  label, icon,
}) => (
  <motion.button
    whileTap={{ scale: 0.92 }}
    onClick={onClick}
    style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: '6px',
      background: 'none', border: 'none', cursor: 'pointer',
    }}
    aria-label={label}
  >
    <div style={{
      width: '56px', height: '56px',
      borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? activeColor : 'rgba(255,255,255,0.12)',
      border: `1px solid ${active ? activeBorder : 'rgba(255,255,255,0.18)'}`,
      color: active ? activeTextColor : 'white',
      transition: 'all 0.15s ease',
    }}>
      {icon}
    </div>
    <span style={{
      fontSize: '11px',
      color: active ? activeTextColor : 'rgba(255,255,255,0.65)',
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  </motion.button>
)
