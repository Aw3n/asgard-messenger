import React, { useState, useEffect, useMemo } from 'react'
import { useCallStore } from '@/stores/callStore'
import { useContactStore } from '@/stores/contactStore'
import { callService } from '@/services/CallService'
import { Avatar } from '@/components/ui/Avatar'
import { Input } from '@/components/ui/Input'
import { formatPublicKey } from '@/utils/id'
import { PageTransition } from '@/components/ui/PageTransition'
import type { CallRecord } from '@/stores/callStore'
import { useTranslation } from 'react-i18next'
import { getCurrentLanguage } from '@/i18n/config'

/** Grouped call history entry: latest call per contact + count */
interface GroupedCallEntry {
  peerId: string
  peerName: string
  peerAvatar?: string
  latestCall: CallRecord
  totalCount: number
  allCalls: CallRecord[]
}

/**
 * CallsPage — call history + initiate new calls.
 * INTEGRATION: Uses Hyperswarm, HyperDHT, and Corestore for real-time call management.
 */
export const CallsPage: React.FC = () => {
  const history = useCallStore((s) => s.history)
  const clearHistory = useCallStore((s) => s.clearHistory)
  const contacts = useContactStore((s) => Object.values(s.contacts).filter((c) => c.relation !== 'blocked'))
  const [search, setSearch] = useState('')
  const [expandedPeer, setExpandedPeer] = useState<string | null>(null)

  // Group call history by contact (peerId) — shows unique contacts with call count
  const groupedHistory = useMemo<GroupedCallEntry[]>(() => {
    const groups = new Map<string, GroupedCallEntry>()
    for (const call of history) {
      const existing = groups.get(call.peerId)
      if (existing) {
        existing.totalCount++
        existing.allCalls.push(call)
        // Keep the latest call (history is already sorted newest-first)
      } else {
        groups.set(call.peerId, {
          peerId: call.peerId,
          peerName: call.peerName,
          peerAvatar: call.peerAvatar,
          latestCall: call,
          totalCount: 1,
          allCalls: [call],
        })
      }
    }
    return Array.from(groups.values())
  }, [history])
  
  // INTEGRATION: Hyperswarm connection status
  const [connectingCount, setConnectingCount] = useState(0)
  const [connectedPeers, setConnectedPeers] = useState<Map<string, { publicKey: string; topics: string[]; prioritized: boolean; ed25519PublicKey: string | null }>>(new Map())
  
  // INTEGRATION: HyperDHT server diagnostics
  const [serverAddress, setServerAddress] = useState<{ host: string; port: number; publicKey: string } | null>(null)
  
  // INTEGRATION: Corestore group activity
  const [activeGroupTopics, setActiveGroupTopics] = useState<string[]>([])
  const { t } = useTranslation()

  // Nombre de CONTACTS réellement connectés (clé Ed25519 identifiée, dédupliquée).
  // Les connexions swarm brutes peuvent inclure des pairs non identifiés ou des
  // doublons (ex : zombie d'une ancienne build de la même personne) — le badge
  // doit refléter la liste de contacts affichée ci-dessous, pas le nombre de
  // sockets ouverts.
  const connectedContactIds = useMemo(() => {
    const ids = new Set<string>()
    const contactKeys = new Set(contacts.map((c) => c.publicKey))
    for (const info of connectedPeers.values()) {
      if (info.ed25519PublicKey && contactKeys.has(info.ed25519PublicKey)) {
        ids.add(info.ed25519PublicKey)
      }
    }
    return ids
  }, [connectedPeers, contacts])

  // Fetch connection status periodically
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const count = await window.asgard.network.getConnectingCount()
        setConnectingCount(count)
        
        const peers = await window.asgard.network.getConnectedPeersInfo()
        setConnectedPeers(peers)
        
        const address = await window.asgard.network.getServerAddress()
        setServerAddress(address)
      } catch (err) {
        console.error('[CallsPage] Failed to fetch status:', err)
      }
    }
    
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000) // Update every 5 seconds
    return () => clearInterval(interval)
  }, [])

  // Listen for group activity events
  useEffect(() => {
    window.asgard.storage.onGroupActive()
    const cleanup = window.asgard.storage.onGroupActiveEvent((topic) => {
      setActiveGroupTopics((prev) => prev.includes(topic) ? prev : [...prev, topic])
    })
    return cleanup
  }, [])

  // Listen for peer ban events — forwarded by the main process as
  // 'network:peerBanned' (no subscription call is needed)
  useEffect(() => {
    const cleanup = window.asgard.network.onPeerBanned((data) => {
      console.warn('[CallsPage] Peer banned:', data)
    })
    return cleanup
  }, [])

  const filteredContacts = contacts.filter((c) =>
    c.displayName.toLowerCase().includes(search.toLowerCase()) ||
    c.publicKey.toLowerCase().includes(search.toLowerCase())
  )

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatDate = (timestamp: number): string => {
    const now = Date.now()
    const diff = now - timestamp
    const locale = getCurrentLanguage()
    if (diff < 86400000) {
      return new Date(timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    }
    return new Date(timestamp).toLocaleDateString(locale)
  }

  const getCallIcon = (call: CallRecord) => {
    if (call.missed) {
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-red-400"><path d="M3.27 3L2 4.27l8.73 8.73V21h2v-8l8.73 8.73L22.73 20.27 3.27 3z"/></svg>
    }
    // Direction arrow
    const dirIcon = call.direction === 'incoming' ? (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-green-400"><path d="M20 5.41L18.59 4 7 15.59V9H5v10h10v-2H8.41z"/></svg>
    ) : (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier"><path d="M9 5v2h6.59L4 18.59 5.41 20 17 8.41V14h2V5z"/></svg>
    )
    return dirIcon
  }

  // INTEGRATION: Helper function to prioritize a peer (reserved for future use)
  // const handlePrioritizePeer = async (peerPublicKey: string) => { ... }

  // INTEGRATION: Helper function to ban a peer (reserved for future use)
  // const handleBanPeer = async (peerPublicKey: string) => { ... }

  // INTEGRATION: Helper function to refresh server (reconnection)
  const handleRefreshServer = async () => {
    try {
      await window.asgard.network.refreshServer()
      console.log('[CallsPage] Server refreshed')
    } catch (err) {
      console.error('[CallsPage] Failed to refresh server:', err)
    }
  }

  return (
    <PageTransition>
    <div className="flex h-full">
      {/* Left panel — contacts to call */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-asgard-surface border-r border-asgard-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-asgard-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-asgard-text-primary">{t('calls.callHistory')}</h2>
            {/* INTEGRATION: Connection status indicator */}
            {connectingCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-asgard-glacier/20 border border-asgard-glacier/30">
                <div className="w-1.5 h-1.5 rounded-full bg-asgard-glacier animate-pulse" />
                <span className="text-xs text-asgard-glacier">{connectingCount}</span>
              </div>
            )}
            {/* INTEGRATION: Connected contacts count — clé Ed25519 identifiée,
                dédupliquée par contact (cohérent avec la liste ci-dessous) */}
            {connectedContactIds.size > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-asgard-cyan/20 border border-asgard-cyan/30">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-cyan">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
                <span className="text-xs text-asgard-cyan">{connectedContactIds.size}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* INTEGRATION: Server refresh button */}
            {serverAddress && (
              <button
                onClick={handleRefreshServer}
                className="text-xs text-asgard-text-muted hover:text-asgard-glacier transition-colors"
                title={t('calls.refreshServer')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
              </button>
            )}
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-red-400/80 hover:text-red-400 hover:bg-red-400/10 border border-red-400/20 hover:border-red-400/40 transition-all"
                title={t('calls.clearHistory')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
                <span>{t('calls.clearHistory')}</span>
              </button>
            )}
          </div>
        </div>

        {/* PRIVACY: le panneau de diagnostics serveur (IP publique host:port)
            n'est plus affiché — l'adresse reste récupérée en arrière-plan pour
            activer le bouton de refresh ci-dessus. */}

        {/* INTEGRATION: Active group topics */}
        {activeGroupTopics.length > 0 && (
          <div className="px-3 py-2 border-b border-asgard-border bg-asgard-cyan/5">
            <div className="flex items-center gap-2 text-xs text-asgard-cyan">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
              </svg>
              <span>{activeGroupTopics.length} active group{activeGroupTopics.length > 1 ? 's' : ''}</span>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-3 py-2 flex-shrink-0">
          <Input
            placeholder={t('search.placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={search ? () => setSearch('') : undefined}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            }
          />
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-6">
              <p className="text-sm text-asgard-text-muted">{t('calls.noContactsFound')}</p>
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <div
                key={contact.publicKey}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-asgard-surface-alt transition-colors"
              >
                <Avatar
                  src={contact.avatar}
                  name={contact.displayName}
                  publicKey={contact.publicKey}
                  size="md"
                  status={contact.status}
                  showStatus
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-asgard-text-primary truncate">{contact.displayName}</p>
                  <p className="text-xs text-asgard-text-muted">{formatPublicKey(contact.publicKey)}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => callService.startCall(contact.publicKey, contact.displayName, 'audio', contact.avatar)}
                    className="w-8 h-8 rounded-lg hover:bg-asgard-nordic/20 flex items-center justify-center transition-colors"
                    title={t('calls.audioCall')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted hover:text-asgard-glacier">
                      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => callService.startCall(contact.publicKey, contact.displayName, 'video', contact.avatar)}
                    className="w-8 h-8 rounded-lg hover:bg-asgard-nordic/20 flex items-center justify-center transition-colors"
                    title={t('calls.videoCall')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted hover:text-asgard-glacier">
                      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel — call history */}
      <div className="flex-1 flex flex-col bg-asgard-surface-alt border-l border-asgard-border">
        <div className="px-4 py-3 border-b border-asgard-border flex-shrink-0">
          <h3 className="text-sm font-semibold text-asgard-text-primary">{t('calls.callHistory')}</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {groupedHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-asgard-nordic/10 border border-asgard-nordic/20 flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier/50">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
              </div>
              <p className="text-sm text-asgard-text-muted">{t('calls.noRecentCalls')}</p>
              <p className="text-xs text-asgard-text-muted mt-1">{t('calls.startCallHint')}</p>
            </div>
          ) : (
            <div className="divide-y divide-asgard-border">
              {groupedHistory.map((group) => (
                <div key={group.peerId}>
                  {/* Main entry: latest call for this contact */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-asgard-surface transition-colors cursor-pointer"
                    onClick={() => setExpandedPeer(expandedPeer === group.peerId ? null : group.peerId)}
                  >
                    <Avatar
                      src={group.peerAvatar}
                      name={group.peerName}
                      publicKey={group.peerId}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${group.latestCall.missed ? 'text-red-400 font-medium' : 'text-asgard-text-primary'}`}>
                        {group.peerName}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {getCallIcon(group.latestCall)}
                        <span className="text-xs text-asgard-text-muted">
                          {group.latestCall.missed ? t('calls.missedCall') : group.latestCall.direction === 'incoming' ? t('calls.incomingCall') : t('calls.outgoingCall')}
                        </span>
                        <span className="text-xs text-asgard-text-muted">•</span>
                        <span className="text-xs text-asgard-text-muted capitalize">{group.latestCall.type}</span>
                        {group.latestCall.duration !== undefined && group.latestCall.duration > 0 && (
                          <>
                            <span className="text-xs text-asgard-text-muted">•</span>
                            <span className="text-xs text-asgard-text-muted">{formatDuration(group.latestCall.duration)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Call count badge */}
                    {group.totalCount > 1 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-asgard-glacier/15 text-asgard-glacier font-medium">
                        {group.totalCount}
                      </span>
                    )}
                    <span className="text-xs text-asgard-text-muted">{formatDate(group.latestCall.startedAt)}</span>
                    {/* Expand indicator */}
                    {group.totalCount > 1 && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className={`text-asgard-text-muted transition-transform ${expandedPeer === group.peerId ? 'rotate-180' : ''}`}>
                        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                      </svg>
                    )}
                    {/* Quick re-call button */}
                    {!group.latestCall.missed && !group.latestCall.isGroupCall && (
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => callService.startCall(group.peerId, group.peerName, 'audio', group.peerAvatar)}
                          className="w-7 h-7 rounded-lg hover:bg-asgard-nordic/20 flex items-center justify-center transition-colors"
                          title={t('calls.audioCall')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted hover:text-asgard-glacier">
                            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => callService.startCall(group.peerId, group.peerName, 'video', group.peerAvatar)}
                          className="w-7 h-7 rounded-lg hover:bg-asgard-nordic/20 flex items-center justify-center transition-colors"
                          title={t('calls.videoCall')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-text-muted hover:text-asgard-glacier">
                            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Expanded: show all calls for this contact */}
                  {expandedPeer === group.peerId && group.totalCount > 1 && (
                    <div className="bg-asgard-deep-black/30 px-4 pb-2">
                      {group.allCalls.slice(1).map((call) => (
                        <div key={call.id} className="flex items-center gap-3 py-2 border-t border-asgard-border/50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {getCallIcon(call)}
                              <span className="text-xs text-asgard-text-muted">
                                {call.missed ? t('calls.missedCall') : call.direction === 'incoming' ? t('calls.incomingCall') : t('calls.outgoingCall')}
                              </span>
                              <span className="text-xs text-asgard-text-muted">•</span>
                              <span className="text-xs text-asgard-text-muted capitalize">{call.type}</span>
                              {call.duration !== undefined && call.duration > 0 && (
                                <>
                                  <span className="text-xs text-asgard-text-muted">•</span>
                                  <span className="text-xs text-asgard-text-muted">{formatDuration(call.duration)}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-asgard-text-muted">{formatDate(call.startedAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </PageTransition>
  )
}
