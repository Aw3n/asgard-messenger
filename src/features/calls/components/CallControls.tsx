import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { useCallStore } from '@/stores/callStore'
import { callService } from '@/services/CallService'

/**
 * CallControls — bottom control bar for calls.
 * Prominent red end-call button, clear labels, proper spacing.
 * PRO QUALITY: Tooltips, hold call, settings panel, better feedback.
 */
export const CallControls: React.FC = () => {
  const { t } = useTranslation()
  const { isMuted, isCameraOff, isScreenSharing } = useCallStore()
  const endCall = useCallStore((s) => s.endCall)
  const [showSettings, setShowSettings] = useState(false)
  const [isOnHold, setIsOnHold] = useState(false)

  const handleEndCall = () => {
    callService.endCall()
    endCall()
  }

  const handleHold = () => {
    const newState = !isOnHold
    setIsOnHold(newState)
    // Mute mic and disable camera when on hold
    if (newState) {
      if (!isMuted) callService.toggleMute()
      if (!isCameraOff) callService.toggleCamera()
    }
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
        tooltip={isMuted ? t('calls.unmute') : t('calls.mute')}
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
        tooltip={isCameraOff ? t('calls.videoOn') : t('calls.videoOff')}
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
        tooltip={isScreenSharing ? t('calls.stopScreenShare') : t('calls.screenShareLabel')}
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
          </svg>
        }
      />

      {/* Hold call */}
      <CallButton
        onClick={handleHold}
        active={isOnHold}
        activeColor="rgba(251,191,36,0.2)"
        activeBorder="rgba(251,191,36,0.5)"
        activeTextColor="#fbbf24"
        label={t('calls.holdLabel')}
        tooltip={isOnHold ? t('calls.resumeCall') : t('calls.holdCall')}
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            {isOnHold ? (
              <path d="M8 19c0 1.1-.9 2-2 2s-2-.9-2-2V5c0-1.1.9-2 2-2s2 .9 2 2v14zm8 0c0 1.1-.9 2-2 2s-2-.9-2-2V5c0-1.1.9-2 2-2s2 .9 2 2v14z"/>
            ) : (
              <path d="M6 19c0 1.1-.9 2-2 2s-2-.9-2-2V7c0-1.1.9-2 2-2s2 .9 2 2v12zm8 0c0 1.1-.9 2-2 2s-2-.9-2-2V7c0-1.1.9-2 2-2s2 .9 2 2v12z"/>
            )}
          </svg>
        }
      />

      {/* Settings */}
      <CallButton
        onClick={() => setShowSettings(!showSettings)}
        active={showSettings}
        activeColor="rgba(255,255,255,0.1)"
        activeBorder="rgba(255,255,255,0.3)"
        activeTextColor="#fff"
        label={t('calls.settingsLabel')}
        tooltip={t('calls.callSettings')}
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
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
        aria-label={t('calls.endCall')}
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
        <span style={{ fontSize: '12px', color: '#f87171', fontWeight: 500 }}>{t('calls.endCall')}</span>
      </motion.button>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <CallSettingsPanel onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>
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
  tooltip?: string
  icon: React.ReactNode
}

const CallButton: React.FC<CallButtonProps> = ({
  onClick, active = false,
  activeColor = 'rgba(255,255,255,0.05)',
  activeBorder = 'rgba(255,255,255,0.2)',
  activeTextColor = '#fff',
  label, tooltip, icon,
}) => {
  const [showTooltip, setShowTooltip] = useState(false)
  
  return (
  <motion.button
    whileTap={{ scale: 0.92 }}
    onClick={onClick}
    onMouseEnter={() => setShowTooltip(true)}
    onMouseLeave={() => setShowTooltip(false)}
    style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: '6px',
      background: 'none', border: 'none', cursor: 'pointer',
      position: 'relative',
    }}
    aria-label={tooltip || label}
  >
    {/* Tooltip */}
    <AnimatePresence>
      {showTooltip && tooltip && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
            padding: '6px 12px',
            borderRadius: '8px',
            background: 'rgba(0,0,0,0.9)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: '12px',
            color: 'white',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        >
          {tooltip}
        </motion.div>
      )}
    </AnimatePresence>
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
}

// ─── Call Settings Panel ───────────────────────────────────────────────────────

interface CallSettingsPanelProps {
  onClose: () => void
}

const CallSettingsPanel: React.FC<CallSettingsPanelProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const [videoQuality, setVideoQuality] = useState<'high' | 'medium' | 'low'>('high')
  const [noiseSuppression, setNoiseSuppression] = useState(true)
  const [echoCancellation, setEchoCancellation] = useState(true)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: '16px',
        padding: '20px',
        borderRadius: '16px',
        background: 'rgba(20,22,35,0.98)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(20px)',
        minWidth: '320px',
        maxWidth: '400px',
        zIndex: 50,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <h3 style={{
          fontSize: '16px',
          fontWeight: 600,
          color: 'white',
          margin: 0,
        }}>
          {t('calls.callSettings')}
        </h3>
        <button
          onClick={onClose}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {/* Video Quality */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          fontSize: '13px',
          fontWeight: 500,
          color: 'rgba(255,255,255,0.8)',
          marginBottom: '8px',
          display: 'block',
        }}>
          {t('calls.videoQuality')}
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['high', 'medium', 'low'] as const).map((quality) => (
            <button
              key={quality}
              onClick={() => setVideoQuality(quality)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                background: videoQuality === quality ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${videoQuality === quality ? 'rgba(79,195,247,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: videoQuality === quality ? '#4FC3F7' : 'rgba(255,255,255,0.6)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {quality === 'high' ? t('calls.qualityHigh') : quality === 'medium' ? t('calls.qualityMedium') : t('calls.qualityLow')}
            </button>
          ))}
        </div>
      </div>

      {/* Noise Suppression */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <div>
          <div style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.8)',
          }}>
            {t('calls.noiseSuppression')}
          </div>
          <div style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.4)',
          }}>
            {t('calls.noiseSuppressionDesc')}
          </div>
        </div>
        <ToggleSwitch
          enabled={noiseSuppression}
          onChange={setNoiseSuppression}
        />
      </div>

      {/* Echo Cancellation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.8)',
          }}>
            {t('calls.echoCancellation')}
          </div>
          <div style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.4)',
          }}>
            {t('calls.echoCancellationDesc')}
          </div>
        </div>
        <ToggleSwitch
          enabled={echoCancellation}
          onChange={setEchoCancellation}
        />
      </div>
    </motion.div>
  )
}

// ─── Toggle Switch ─────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ enabled, onChange }) => (
  <button
    onClick={() => onChange(!enabled)}
    style={{
      width: '44px',
      height: '24px',
      borderRadius: '12px',
      background: enabled ? 'rgba(79,195,247,0.3)' : 'rgba(255,255,255,0.1)',
      border: `1px solid ${enabled ? 'rgba(79,195,247,0.5)' : 'rgba(255,255,255,0.2)'}`,
      cursor: 'pointer',
      position: 'relative',
      transition: 'all 0.2s ease',
    }}
  >
    <div style={{
      position: 'absolute',
      top: '2px',
      left: enabled ? '22px' : '2px',
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      background: enabled ? '#4FC3F7' : 'rgba(255,255,255,0.4)',
      transition: 'all 0.2s ease',
    }} />
  </button>
)
