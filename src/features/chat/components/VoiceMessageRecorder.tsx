import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'

interface VoiceMessageRecorderProps {
  onSend: (audioBlob: Blob, duration: number) => void
  onCancel: () => void
}

/**
 * VoiceMessageRecorder — records audio from microphone with visual waveform.
 */
export const VoiceMessageRecorder: React.FC<VoiceMessageRecorderProps> = ({ onSend, onCancel }) => {
  const { t } = useTranslation()
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const startTimeRef = useRef<number>(0)
  const pausedDurationRef = useRef<number>(0)

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.start(100) // Collect data every 100ms
      setIsRecording(true)
      setDuration(0)
      startTimeRef.current = Date.now()
      pausedDurationRef.current = 0

      timerRef.current = setInterval(() => {
        if (!isPaused) {
          setDuration(Math.floor((Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000))
        }
      }, 100)
    } catch {
      console.error('Microphone access denied')
      onCancel()
    }
  }, [onCancel, isPaused])

  // Stop recording and send
  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return
    mediaRecorderRef.current.stop()
    mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      if (blob.size > 0 && duration > 0) {
        onSend(blob, duration)
      } else {
        onCancel()
      }
    }

    cleanup()
  }, [duration, onSend, onCancel])

  // Cancel recording
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())
      mediaRecorderRef.current = null
    }
    cleanup()
    onCancel()
  }, [onCancel])

  const cleanup = () => {
    setIsRecording(false)
    setIsPaused(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  // Auto-start on mount
  useEffect(() => {
    startRecording()
    return cleanup
  }, [])

  // Format duration as mm:ss
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className={cn(
        'flex items-center gap-3 px-4 py-3',
        'bg-red-500/10 border-t border-red-500/20'
      )}
    >
      {/* Recording indicator */}
      <div className="flex items-center gap-2">
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="w-3 h-3 bg-red-500 rounded-full"
        />
        <span className="text-sm font-mono text-asgard-text-primary">
          {formatDuration(duration)}
        </span>
      </div>

      {/* Waveform placeholder */}
      <div className="flex-1 flex items-center justify-center gap-0.5 h-8">
        {Array.from({ length: 32 }).map((_, i) => (
          <motion.div
            key={i}
            animate={{
              height: isRecording && !isPaused
                ? [`${20 + Math.random() * 60}%`, `${20 + Math.random() * 60}%`]
                : '20%',
            }}
            transition={{
              duration: 0.3 + Math.random() * 0.4,
              repeat: Infinity,
              repeatType: 'reverse',
              delay: i * 0.03,
            }}
            className="w-1 bg-asgard-glacier/60 rounded-full"
            style={{ minHeight: 4 }}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Cancel */}
        <button
          onClick={cancelRecording}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-asgard-surface-alt hover:bg-asgard-border transition-colors"
          aria-label={t('chat.cancelRecording')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-secondary">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>

        {/* Send */}
        <button
          onClick={stopRecording}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-asgard-glacier hover:bg-asgard-glacier-dim transition-colors"
          aria-label={t('chat.sendVoiceMessage')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </motion.div>
  )
}
