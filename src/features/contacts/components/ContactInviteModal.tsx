import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { useTranslation } from 'react-i18next'

interface ContactInviteModalProps {
  onClose: () => void
}

/**
 * ContactInviteModal — generates and shares an invitation link/key.
 */
export const ContactInviteModal: React.FC<ContactInviteModalProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const identity = useIdentityStore((s) => s.identity)
  const addToast = useUIStore((s) => s.addToast)
  const [copied, setCopied] = useState(false)

  // Generate invite link from public key
  const inviteKey = identity?.keyPair.publicKey
    ? `asgard://invite/${identity.keyPair.publicKey}?name=${encodeURIComponent(identity.profile?.displayName || '')}`
    : ''

  const handleCopy = () => {
    if (!inviteKey) return
    navigator.clipboard.writeText(inviteKey)
    setCopied(true)
    addToast({ type: 'success', title: t('contacts.inviteLinkCopied'), duration: 2000 })
    setTimeout(() => setCopied(false), 3000)
  }

  const handleShareKey = () => {
    if (!identity?.keyPair.publicKey) return
    navigator.clipboard.writeText(identity.keyPair.publicKey)
    addToast({ type: 'success', title: t('contacts.publicKeyCopied'), duration: 2000 })
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
        <h3 className="text-lg font-semibold text-asgard-text-primary mb-1">{t('contacts.inviteTitle')}</h3>
        <p className="text-sm text-asgard-text-muted mb-5">
          {t('contacts.inviteSubtitle')}
        </p>

        {/* Invite link */}
        <div className="mb-4">
          <label className="text-xs font-medium text-asgard-text-muted uppercase tracking-wider mb-2 block">
            {t('contacts.inviteLink')}
          </label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={inviteKey}
              className="flex-1 bg-asgard-black/30 border border-asgard-border/30 rounded-xl px-3 py-2.5 text-xs text-asgard-text-secondary font-mono truncate focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                copied
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-asgard-nordic/20 text-asgard-glacier hover:bg-asgard-nordic/30'
              }`}
            >
              {copied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
        </div>

        {/* Public key */}
        <div className="mb-4">
          <label className="text-xs font-medium text-asgard-text-muted uppercase tracking-wider mb-2 block">
            {t('contacts.publicKey')}
          </label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={identity?.keyPair.publicKey || ''}
              className="flex-1 bg-asgard-black/30 border border-asgard-border/30 rounded-xl px-3 py-2.5 text-xs text-asgard-text-secondary font-mono truncate focus:outline-none"
            />
            <button
              onClick={handleShareKey}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-asgard-nordic/20 text-asgard-glacier hover:bg-asgard-nordic/30 transition-colors"
            >
              {t('common.copy')}
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="bg-asgard-nordic/5 border border-asgard-nordic/10 rounded-xl p-3 mb-4">
          <p className="text-xs text-asgard-text-muted">
            {t('contacts.inviteInfo')}
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 text-sm text-asgard-text-muted hover:text-asgard-text-secondary transition-colors"
        >
          {t('common.close')}
        </button>
      </motion.div>
    </motion.div>
  )
}
