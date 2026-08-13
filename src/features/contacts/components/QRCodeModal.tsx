import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { formatPublicKey } from '@/utils/id'
import { useTranslation } from 'react-i18next'

interface QRCodeModalProps {
  onClose: () => void
}

/**
 * QRCodeModal — displays the user's own public key as a QR code,
 * and provides an input to scan/paste a key to add a contact.
 */
export const QRCodeModal: React.FC<QRCodeModalProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const identity = useIdentityStore((s) => s.identity)
  const addToast = useUIStore((s) => s.addToast)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<'show' | 'scan'>('show')
  const [pasteKey, setPasteKey] = useState('')

  // Generate QR code on mount
  useEffect(() => {
    if (!identity?.keyPair.publicKey || !canvasRef.current) return

    const generateQR = async () => {
      try {
        const QRCode = (await import('qrcode')).default
        await QRCode.toCanvas(canvasRef.current!, identity.keyPair.publicKey, {
          width: 256,
          margin: 2,
          color: {
            dark: '#E8EAF6',
            light: '#0A0A0F',
          },
        })
      } catch (err) {
        console.error('QR generation failed:', err)
      }
    }

    generateQR()
  }, [identity?.keyPair.publicKey])

  const handleCopyKey = () => {
    if (identity?.keyPair.publicKey) {
      navigator.clipboard.writeText(identity.keyPair.publicKey)
      addToast({ type: 'success', title: t('contacts.publicKeyCopied'), duration: 2000 })
    }
  }

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      setPasteKey(text)
    }).catch(() => {
      addToast({ type: 'error', title: t('common.clipboardError'), duration: 2000 })
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="mica-card border border-asgard-border rounded-3xl p-6 w-full max-w-md mx-4 shadow-modal"
      >
        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setMode('show')}
            className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${
              mode === 'show' ? 'bg-asgard-nordic/20 text-asgard-glacier' : 'text-asgard-text-muted hover:text-asgard-text-secondary'
            }`}
          >
            {t('contacts.myQRCode')}
          </button>
          <button
            onClick={() => setMode('scan')}
            className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${
              mode === 'scan' ? 'bg-asgard-nordic/20 text-asgard-glacier' : 'text-asgard-text-muted hover:text-asgard-text-secondary'
            }`}
          >
            {t('contacts.addFromKey')}
          </button>
        </div>

        {mode === 'show' ? (
          <>
            <div className="flex flex-col items-center">
              <div className="bg-asgard-black/50 rounded-2xl p-4 border border-asgard-border/20">
                <canvas ref={canvasRef} className="rounded-lg" />
              </div>
              <p className="text-sm text-asgard-text-primary font-medium mt-4">
                {identity?.profile?.displayName || t('contacts.you')}
              </p>
              <p className="text-xs text-asgard-text-muted mt-1 font-mono">
                {identity?.keyPair.publicKey ? formatPublicKey(identity.keyPair.publicKey) : t('contacts.noIdentity')}
              </p>
            </div>
            <button
              onClick={handleCopyKey}
              className="w-full mt-4 py-2.5 text-sm text-asgard-glacier hover:bg-asgard-nordic/10 rounded-xl transition-colors"
            >
              {t('contacts.copyPublicKey')}
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-asgard-text-muted uppercase tracking-wider mb-2 block">
                {t('contacts.pastePublicKey')}
              </label>
              <textarea
                value={pasteKey}
                onChange={(e) => setPasteKey(e.target.value)}
                placeholder={t('contacts.pastePlaceholder')}
                className="w-full h-24 bg-asgard-black/30 border border-asgard-border/30 rounded-xl px-3 py-2 text-sm text-asgard-text-primary placeholder:text-asgard-text-muted/50 resize-none focus:outline-none focus:border-asgard-nordic/50"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePaste}
                className="flex-1 py-2 text-sm text-asgard-text-secondary hover:bg-asgard-surface-alt rounded-xl transition-colors"
              >
                {t('contacts.pasteFromClipboard')}
              </button>
            </div>
            <button
              disabled={!pasteKey.trim()}
              className="w-full py-2.5 text-sm font-medium text-asgard-glacier bg-asgard-nordic/20 hover:bg-asgard-nordic/30 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('contacts.addContact')}
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-3 py-2 text-sm text-asgard-text-muted hover:text-asgard-text-secondary transition-colors"
        >
          {t('common.close')}
        </button>
      </motion.div>
    </motion.div>
  )
}
