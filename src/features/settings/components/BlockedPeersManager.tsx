import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'
import { useContactStore } from '@/stores/contactStore'

/**
 * BlockedPeersManager — manage blocked/banned peers.
 * Shows list of blocked peers with option to unblock.
 */
export const BlockedPeersManager: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { t } = useTranslation()
  const [blockedPeers, setBlockedPeers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const contacts = useContactStore((s) => s.contacts)

  useEffect(() => {
    loadBlockedPeers()
  }, [])

  const loadBlockedPeers = async () => {
    try {
      const peers = await window.asgard.network.getBlockedPeers()
      setBlockedPeers(peers)
    } catch (err) {
      console.error('[BlockedPeersManager] Failed to load blocked peers:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUnblock = async (peerKey: string) => {
    try {
      await window.asgard.network.blockPeer(peerKey, false)
      setBlockedPeers((prev) => prev.filter((p) => p !== peerKey))
    } catch (err) {
      console.error('[BlockedPeersManager] Failed to unblock peer:', err)
    }
  }

  // Find contact name for a peer key
  const getContactName = (peerKey: string): string => {
    const contact = Object.values(contacts).find(
      (c) => c.publicKey === peerKey || c.publicKey === peerKey.slice(0, 64)
    )
    return contact?.displayName || `Peer ${peerKey.slice(0, 12)}…`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="mica-card border border-asgard-border rounded-2xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-asgard-text-primary flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-red-400">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          {t('settings.blockedPeers')}
        </h3>
        {onClose && (
          <button onClick={onClose} className="text-asgard-text-muted hover:text-asgard-text-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-asgard-glacier border-t-transparent rounded-full animate-spin" />
        </div>
      ) : blockedPeers.length === 0 ? (
        <p className="text-sm text-asgard-text-muted text-center py-6">
          {t('settings.noBlockedPeers')}
        </p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <AnimatePresence>
            {blockedPeers.map((peerKey) => (
              <motion.div
                key={peerKey}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl',
                  'bg-asgard-surface-alt border border-asgard-border'
                )}
              >
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-red-400">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-asgard-text-primary truncate">
                    {getContactName(peerKey)}
                  </p>
                  <p className="text-xs text-asgard-text-muted truncate font-mono">
                    {peerKey.slice(0, 24)}…
                  </p>
                </div>
                <button
                  onClick={() => handleUnblock(peerKey)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg',
                    'bg-green-500/20 text-green-400 hover:bg-green-500/30',
                    'transition-colors'
                  )}
                >
                  {t('contacts.unblock')}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}
