import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'
import { fileService } from '@/services/FileService'
import { getCurrentLanguage } from '@/i18n/config'

interface ShareLink {
  token: string
  blobKey: string
  createdAt: number
  expiresAt: number
  accessCount: number
  maxAccess: number
}

/**
 * ShareLinksManager — manages permanent and temporary share links for files.
 */
export const ShareLinksManager: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { t } = useTranslation()
  const [links, setLinks] = useState<ShareLink[]>([])
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  useEffect(() => {
    loadLinks()
  }, [])

  const loadLinks = () => {
    const activeLinks = fileService.getActiveShareLinks()
    setLinks(activeLinks)
  }

  const handleCopyLink = (token: string) => {
    const link = `${window.location.origin}/share/${token}`
    navigator.clipboard.writeText(link)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const handleRevoke = (token: string) => {
    fileService.revokeShareLink(token)
    loadLinks()
  }

  const handleRevokeAll = () => {
    links.forEach((link) => fileService.revokeShareLink(link.token))
    loadLinks()
  }

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    const locale = getCurrentLanguage()
    return date.toLocaleDateString(locale) + ' ' + date.toLocaleTimeString(locale)
  }

  const formatTimeRemaining = (expiresAt: number): string => {
    const now = Date.now()
    const remaining = expiresAt - now
    if (remaining <= 0) return t('settings.expired')
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    if (days > 0) return t('time.remainingDaysHours', { days, hours })
    return t('time.remainingHours', { hours })
  }

  return (
    <div className="flex flex-col h-full bg-asgard-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-asgard-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-purple-400">
              <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-asgard-text-primary">{t('settings.shareLinks')}</h2>
            <p className="text-xs text-asgard-text-muted">
              {t('settings.activeLinks', { count: links.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {links.length > 0 && (
            <button
              onClick={handleRevokeAll}
              className="px-3 py-1.5 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              {t('settings.revokeAll')}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-asgard-surface-alt transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-secondary">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {links.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-asgard-surface-alt flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted">
                <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
              </svg>
            </div>
            <p className="text-sm text-asgard-text-secondary mb-1">{t('settings.noShareLinks')}</p>
            <p className="text-xs text-asgard-text-muted">
              {t('settings.shareLinksDescription')}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <AnimatePresence>
              {links.map((link) => (
                <motion.div
                  key={link.token}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-4 rounded-xl bg-asgard-surface-alt border border-asgard-border"
                >
                  {/* Link info */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-asgard-text-primary truncate mb-1">
                        {link.blobKey.slice(0, 24)}...
                      </p>
                      <div className="flex items-center gap-3 text-xs text-asgard-text-muted">
                        <span>{t('settings.created')}: {formatDate(link.createdAt)}</span>
                        <span>·</span>
                        <span>{formatTimeRemaining(link.expiresAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                      </svg>
                      <span className="text-xs text-asgard-text-secondary">
                        {t('settings.views', { count: link.accessCount, max: link.maxAccess })}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyLink(link.token)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                        copiedToken === link.token
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-asgard-glacier/10 text-asgard-glacier hover:bg-asgard-glacier/20'
                      )}
                    >
                      {copiedToken === link.token ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                          {t('common.copied')}
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                          </svg>
                          {t('settings.copyLink')}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleRevoke(link.token)}
                      className="px-3 py-2 rounded-lg text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                    >
                      {t('settings.revoke')}
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer */}
      {links.length > 0 && (
        <div className="px-6 py-3 border-t border-asgard-border bg-asgard-surface-alt">
          <p className="text-xs text-asgard-text-muted">
            {t('settings.shareLinksExpiry')}
          </p>
        </div>
      )}
    </div>
  )
}
