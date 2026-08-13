import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCallStore } from '@/stores/callStore'
import { callService } from '@/services/CallService'
import { Avatar } from '@/components/ui/Avatar'
import { useTranslation } from 'react-i18next'

/**
 * IncomingCallOverlay — Keet-inspired full-screen incoming call UI.
 * Design:
 * - Dark immersive background with subtle gradient
 * - Animated pulsing rings around avatar (concentric)
 * - Clean caller info with call type
 * - Large, accessible Accept/Reject buttons
 * - E2E encryption notice
 */
export const IncomingCallOverlay: React.FC = () => {
  const { t } = useTranslation()
  const incomingCall = useCallStore((s) => s.incomingCall)

  const handleAccept = async () => {
    await callService.acceptCall()
  }

  const handleReject = async () => {
    await callService.rejectCall()
  }

  return (
    <AnimatePresence>
      {incomingCall && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'linear-gradient(180deg, #06060c 0%, #0a0a16 40%, #080812 100%)' }}
        >
          {/* ═══ Animated background rings ═══ */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {[
              { size: 'w-80 h-80', delay: 0, opacity: 0.12 },
              { size: 'w-64 h-64', delay: 0.5, opacity: 0.18 },
              { size: 'w-48 h-48', delay: 1, opacity: 0.25 },
            ].map((ring, i) => (
              <motion.div
                key={i}
                animate={{
                  scale: [1, 1.4, 1],
                  opacity: [ring.opacity, 0, ring.opacity],
                }}
                transition={{ duration: 2.8, repeat: Infinity, delay: ring.delay }}
                className={`absolute ${ring.size} rounded-full border border-asgard-glacier/20`}
              />
            ))}
            {/* Subtle radial glow */}
            <div
              className="absolute w-96 h-96 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(79,195,247,0.05) 0%, transparent 70%)' }}
            />
          </div>

          {/* ═══ Main content ═══ */}
          <motion.div
            initial={{ y: -15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -15, opacity: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="relative flex flex-col items-center gap-7 px-8"
          >
            {/* Avatar with call type badge */}
            <motion.div
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 250, damping: 20, delay: 0.1 }}
              className="relative"
            >
              <Avatar
                src={incomingCall.peerAvatar}
                name={incomingCall.peerName}
                publicKey={incomingCall.peerId}
                size="2xl"
              />
              {/* Call type badge */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, delay: 0.3 }}
                className="absolute -bottom-1 -right-1 w-11 h-11 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(79,195,247,0.25) 0%, rgba(79,195,247,0.1) 100%)',
                  border: '1.5px solid rgba(79,195,247,0.4)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {incomingCall.type === 'video' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                  </svg>
                )}
              </motion.div>
            </motion.div>

            {/* Caller info */}
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-center"
            >
              <h2 className="text-2xl font-bold text-white/95 tracking-tight">
                {incomingCall.peerName}
              </h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="text-sm text-white/45 mt-2 font-medium"
              >
                {incomingCall.type === 'video' ? t('calls.incomingVideoCall') : t('calls.incomingAudioCall')}
                {incomingCall.isGroupCall && incomingCall.groupName && (
                  <span className="text-asgard-glacier/60"> · {incomingCall.groupName}</span>
                )}
              </motion.p>
              {incomingCall.isGroupCall && incomingCall.participants && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="text-xs text-white/30 mt-1.5 flex items-center justify-center gap-1.5"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier/40">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                  </svg>
                  {t('calls.participantCount', { count: incomingCall.participants.length })}
                </motion.p>
              )}
            </motion.div>

            {/* ═══ Action buttons ═══ */}
            <motion.div
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-14 mt-4"
            >
              {/* Reject */}
              <div className="relative flex flex-col items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleReject}
                  className="w-16 h-16 rounded-full flex items-center justify-center transition-colors"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '2px solid rgba(239,68,68,0.4)',
                  }}
                  aria-label={t('calls.decline')}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" className="text-red-400">
                    <path d="M12 9c-1.6 0-3.07.27-4.44.76L5.03 7.23C7.03 5.86 9.42 5 12 5c2.58 0 4.97.86 6.97 2.23l-2.53 2.53C15.07 9.27 13.6 9 12 9zm0 6c-1.12 0-2.16-.29-3.08-.79l-2.56 2.56C8.12 17.82 10 18.5 12 18.5s3.88-.68 5.64-1.73l-2.56-2.56c-.92.5-1.96.79-3.08.79zM1 21l8.49-8.49L12 15.01l-8.49 8.49L1 21zm22-1.5l-2.5-2.5-1.5 1.5 2.5 2.5 1.5-1.5z"/>
                  </svg>
                </motion.button>
                <span className="text-xs text-red-400/70 font-medium">{t('calls.decline')}</span>
              </div>

              {/* Accept */}
              <div className="relative flex flex-col items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleAccept}
                  className="w-16 h-16 rounded-full flex items-center justify-center transition-colors"
                  style={{
                    background: 'rgba(34,197,94,0.08)',
                    border: '2px solid rgba(34,197,94,0.4)',
                  }}
                  aria-label={t('calls.answer')}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" className="text-green-400">
                    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
                  </svg>
                </motion.button>
                <span className="text-xs text-green-400/70 font-medium">{t('calls.answer')}</span>
              </div>
            </motion.div>

            {/* E2E encryption notice */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-2 mt-4"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier/35">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
              <span className="text-[11px] text-white/25 font-medium">{t('calls.encrypted')}</span>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
