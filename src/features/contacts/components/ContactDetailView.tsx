import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { cryptoService } from '@/services/CryptoService'
import { chatService } from '@/services/ChatService'
import { formatPublicKey } from '@/utils/id'
import { formatLastSeen } from '@/utils/time'
import { fromNetworkStatus, presenceMeta, isLivePresence } from '@/utils/presence'
import type { Contact } from '@/types'
import { useTranslation } from 'react-i18next'
import { getCurrentLanguage } from '@/i18n/config'

interface ContactDetailViewProps {
  contact: Contact
  onClose?: () => void
}

/**
 * ContactDetailView — full profile view for a contact.
 * Shows avatar, name, public key, status, and action buttons.
 */
export const ContactDetailView: React.FC<ContactDetailViewProps> = ({ contact, onClose }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { updateContact, blockContact, unblockContact, favoriteContact } = useContactStore()
  const { getDirectConversation, addConversation, setActiveConversation } = useConversationStore()
  const addToast = useUIStore((s) => s.addToast)
  const [showKey, setShowKey] = useState(false)
  const [showActions, setShowActions] = useState(false)
  // DHT Profile state
  const [dhtProfile, setDhtProfile] = useState<{ displayName: string; avatar?: string; timestamp: number; status?: string; statusMessage?: string } | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileFetched, setProfileFetched] = useState(false)

  const isFavorite = contact.relation === 'favorite'
  const isBlocked = contact.relation === 'blocked'

  // Fetch profile from DHT
  const fetchDHTProfile = useCallback(async () => {
    if (!window.asgard?.network?.fetchProfile) return
    setProfileLoading(true)
    try {
      const profile = await window.asgard.network.fetchProfile(contact.publicKey)
      if (profile) {
        setDhtProfile(profile)
        // Update contact with DHT profile info if different
        const updates: Partial<Contact> = {}
        if (profile.displayName && profile.displayName !== contact.displayName) {
          updates.remoteName = profile.displayName
        }
        // CRITICAL: Never update contact status from DHT — DHT mutable records
        // have no TTL and can be stale long after a peer has gone offline.
        // Status must only be updated via real-time P2P events (presence:update,
        // peer:identified) which prove the peer is actually connected right now.
        // if (profile.status && profile.status !== contact.status) {
        //   updates.status = profile.status
        // }
        if (profile.lastSeen && profile.lastSeen !== contact.lastSeen) {
          updates.lastSeen = profile.lastSeen
        }
        if (Object.keys(updates).length > 0) {
          updateContact(contact.publicKey, updates)
        }
      } else {
        // No profile in DHT yet — keep current contact state, don't spam toasts
        console.log('[ContactDetailView] No DHT profile for', contact.publicKey.slice(0, 16))
      }
      setProfileFetched(true)
    } catch (err) {
      console.error('[ContactDetailView] Failed to fetch DHT profile:', err)
    } finally {
      setProfileLoading(false)
    }
  }, [contact.publicKey, contact.displayName, contact.status, contact.lastSeen, updateContact])

  // Auto-fetch profile on mount and refresh periodically
  useEffect(() => {
    if (isBlocked) return
    // Small delay to avoid blocking initial render
    const timer = setTimeout(() => fetchDHTProfile(), 500)
    // Refresh DHT profile every 60s while the detail view is open
    const interval = setInterval(() => fetchDHTProfile(), 60000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [isBlocked, fetchDHTProfile])

  const handleMessage = () => {
    const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
    if (!myPk) return

    // CRITICAL: Use deterministic conversationId so both peers compute the same ID
    const convId = cryptoService.deriveConversationId(myPk, contact.publicKey)

    // Check if a direct conversation already exists
    const existing = getDirectConversation(contact.publicKey)
    if (existing && existing.id !== convId) {
      // Migrate old non-deterministic ID to the correct one
      addConversation({
        id: convId,
        type: 'direct',
        participantId: contact.publicKey,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
        unreadCount: existing.unreadCount,
        pinned: existing.pinned,
        muted: existing.muted,
        archived: existing.archived,
        lastMessage: existing.lastMessage,
      })
    } else if (!existing) {
      // Create a new conversation with deterministic ID
      addConversation({
        id: convId,
        type: 'direct',
        participantId: contact.publicKey,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        unreadCount: 0,
        pinned: false,
        muted: false,
        archived: false,
      })
    }

    updateContact(contact.publicKey, { conversationId: convId })
    setActiveConversation(convId)
    navigate(`/conversations/${convId}`)
  }

  const handleToggleFavorite = () => {
    favoriteContact(contact.publicKey, !isFavorite)
    addToast({
      type: 'info',
      title: isFavorite ? t('contacts.removedFromFavorites') : t('contacts.addedToFavorites'),
      duration: 2000,
    })
  }

  const handleToggleBlock = () => {
    if (isBlocked) {
      unblockContact(contact.publicKey)
      addToast({ type: 'info', title: t('contacts.unblocked'), duration: 2000 })
    } else {
      blockContact(contact.publicKey)
      addToast({ type: 'warning', title: t('contacts.blocked'), duration: 2000 })
    }
  }

  const handleRemove = async () => {
    await chatService.removeContact(contact.publicKey)
    addToast({ type: 'info', title: t('contacts.removed'), duration: 2000 })
    onClose?.()
  }

  const handleToggleVerify = () => {
    updateContact(contact.publicKey, { verified: !contact.verified })
    addToast({
      type: contact.verified ? 'info' : 'success',
      title: contact.verified ? t('contacts.verificationRemoved') : t('contacts.contactVerified'),
      duration: 2000,
    })
  }

  const handleCopyKey = () => {
    navigator.clipboard.writeText(contact.publicKey)
    addToast({ type: 'success', title: t('contacts.publicKeyCopied'), duration: 2000 })
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header with avatar */}
      <div className="flex flex-col items-center pt-10 pb-6 px-6 border-b border-asgard-border/20">
        <Avatar
          src={contact.avatar}
          name={contact.displayName}
          publicKey={contact.publicKey}
          size="xl"
          status={contact.status}
          showStatus
        />
        <h2 className="text-xl font-bold text-asgard-text-primary mt-4">{contact.displayName}</h2>
        {contact.remoteName && (
          <p className="text-sm text-asgard-text-muted mt-0.5">@{contact.remoteName}</p>
        )}

        {/* Status badge — pastille ET libellé viennent de src/utils/presence.ts, la
            même source que l'avatar et les sélecteurs : plus de palette parallèle
            (bg-green-400 ici, .status-online ailleurs) ni de quatrième liste de
            libellés. */}
        <div className="flex flex-col items-center gap-1 mt-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${presenceMeta(contact.status).dot}`} />
            <span className="text-xs text-asgard-text-muted">
              {isLivePresence(contact.status)
                ? t(presenceMeta(contact.status).labelKey)
                : contact.lastSeen ? formatLastSeen(contact.lastSeen) : t('common.offline')}
            </span>
            {contact.verified && (
              <span className="ml-2 text-xs text-asgard-glacier bg-asgard-glacier/10 px-2 py-0.5 rounded-full">
                {t('contacts.verified')}
              </span>
            )}
          </div>
          {/* Custom status message */}
          {contact.customStatus && (
            <p className="text-xs text-asgard-text-secondary italic mt-1">« {contact.customStatus} »</p>
          )}
        </div>
      </div>

      {/* Public Key section */}
      <div className="px-6 py-4 border-b border-asgard-border/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-asgard-text-muted uppercase tracking-wider">{t('contacts.publicKey')}</span>
          <button
            onClick={() => setShowKey(!showKey)}
            className="text-xs text-asgard-glacier hover:underline"
          >
            {showKey ? t('common.hide') : t('common.show')}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs text-asgard-text-secondary bg-asgard-surface-alt rounded-lg px-3 py-2 font-mono truncate">
            {showKey ? contact.publicKey : formatPublicKey(contact.publicKey)}
          </code>
          <button
            onClick={handleCopyKey}
            className="p-2 rounded-lg hover:bg-asgard-surface-alt transition-colors"
            title={t('contacts.copyPublicKey')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Info section */}
      <div className="px-6 py-4 border-b border-asgard-border/20 space-y-3">
        {contact.note && (
          <div>
            <span className="text-xs font-medium text-asgard-text-muted uppercase tracking-wider">{t('common.note')}</span>
            <p className="text-sm text-asgard-text-secondary mt-1">{contact.note}</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-asgard-text-muted uppercase tracking-wider">{t('common.added')}</span>
          <span className="text-sm text-asgard-text-secondary">{new Date(contact.addedAt).toLocaleDateString(getCurrentLanguage())}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-asgard-text-muted uppercase tracking-wider">{t('common.relation')}</span>
          <span className="text-sm text-asgard-text-secondary capitalize">{contact.relation}</span>
        </div>
      </div>

      {/* DHT Profile section */}
      <div className="px-6 py-4 border-b border-asgard-border/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-asgard-text-muted uppercase tracking-wider">{t('contacts.dhtProfile')}</span>
          <button
            onClick={fetchDHTProfile}
            disabled={profileLoading}
            className="flex items-center gap-1 text-xs text-asgard-glacier hover:text-asgard-glacier/80 disabled:opacity-50 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className={profileLoading ? 'animate-spin' : ''}>
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
            {profileLoading ? t('contacts.fetching') : t('common.refresh')}
          </button>
        </div>
        {dhtProfile ? (() => {
          // CRITICAL FIX: Reconcile P2P connection status with DHT profile status.
          // Une liaison P2P vivante est l'autorité de présence : l'enregistrement
          // DHT, lui, peut avoir des minutes. Mais « vivante » ne veut pas dire « en
          // ligne » — un pair qui déclare « occupé » est connecté, et forcer
          // 'online' ici faisait mentir ce panneau alors que l'en-tête de la
          // conversation, lui, affichait le statut déclaré.
          const hasLivePresence = isLivePresence(contact.status)
          const STALE_THRESHOLD = 5 * 60 * 1000 // 5 minutes — older than this = stale
          const age = Date.now() - dhtProfile.timestamp
          const isStale = age > STALE_THRESHOLD
          // The DHT carries the NETWORK vocabulary ('dnd'), the UI the product one
          // (« occupé »). Normalize first — this panel used to print the raw token
          // and to invent "online" whenever the record had no status at all.
          const declared = fromNetworkStatus(dhtProfile.status)
          // En présence P2P, c'est le statut déclaré qui s'affiche ; sinon
          // l'enregistrement DHT, avec son contrôle de fraîcheur.
          const dhtStatus = hasLivePresence ? contact.status : (isStale ? 'offline' : declared)
          // La pastille vient de presenceMeta() : mêmes classes `status-*` que
          // l'avatar, au lieu d'une palette Tailwind parallèle (bg-green-400…).
          const { dot, labelKey } = presenceMeta(dhtStatus)
          const statusLabel = hasLivePresence
            ? `${t(presenceMeta(contact.status).labelKey)} (P2P)`
            : dhtStatus === 'online'
              ? t('common.available')
              : t(labelKey)
          return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${dot}`} />
              <span className="text-xs text-asgard-text-muted">{statusLabel}</span>
              {isStale && !hasLivePresence && (
                <span className="text-xs text-asgard-text-muted/60 inline-flex items-center gap-1" title={t('contacts.updatedAt', { time: formatLastSeen(dhtProfile.timestamp) })}>
                  <Icon name="clock" size={12} /> {formatLastSeen(dhtProfile.timestamp)}
                </span>
              )}
              <span className="text-xs text-asgard-text-muted ml-auto">
                {t('contacts.updatedAt', { time: formatLastSeen(dhtProfile.timestamp) })}
              </span>
            </div>
            {dhtProfile.displayName && dhtProfile.displayName !== contact.displayName && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-asgard-text-muted">{t('contacts.dhtName')}</span>
                <span className="text-sm text-asgard-text-secondary">{dhtProfile.displayName}</span>
              </div>
            )}
          </div>
          )
        })() : (
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${profileFetched ? 'bg-asgard-border' : 'bg-yellow-400 animate-pulse'}`} />
            <span className="text-xs text-asgard-text-muted">
              {profileFetched ? t('time.directProfileUnavailable') : t('time.searchingDHT')}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-4 space-y-2">
        <Button fullWidth onClick={handleMessage} disabled={isBlocked}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-2">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
          {t('contacts.sendMessage')}
        </Button>

        <div className="flex gap-2">
          <Button variant="ghost" fullWidth onClick={handleToggleFavorite}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={isFavorite ? '#FFD740' : 'currentColor'} className="mr-1.5">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
            {isFavorite ? t('contacts.unfavorite') : t('contacts.favorite')}
          </Button>
          <Button variant="ghost" fullWidth onClick={handleToggleVerify}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={contact.verified ? '#4FC3F7' : 'currentColor'} className="mr-1.5">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            {contact.verified ? t('contacts.unverify') : t('contacts.verify')}
          </Button>
        </div>

        {/* Danger zone */}
        <button
          onClick={() => setShowActions(!showActions)}
          className="w-full text-xs text-asgard-text-muted hover:text-asgard-text-secondary py-2 transition-colors"
        >
          {showActions ? t('contacts.hideActions') : t('contacts.moreActions')}
        </button>

        {showActions && (
          <div className="space-y-2 pt-2 border-t border-asgard-border/20">
            <Button variant="ghost" fullWidth onClick={handleToggleBlock} className={isBlocked ? 'text-green-400' : 'text-orange-400'}>
              {isBlocked ? t('contacts.unblock') : t('contacts.block')}
            </Button>
            <Button variant="ghost" fullWidth onClick={handleRemove} className="text-red-400">
              {t('contacts.removeContact')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
