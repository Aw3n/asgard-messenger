import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Virtuoso } from 'react-virtuoso'
import { useContactStore } from '@/stores/contactStore'
import { useUIStore } from '@/stores/uiStore'
import { useIdentityStore } from '@/stores/identityStore'
import { Avatar } from '@/components/ui/Avatar'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { PageTransition } from '@/components/ui/PageTransition'
import { formatLastSeen } from '@/utils/time'
import { formatPublicKey } from '@/utils/id'
import { p2pService } from '@/services/P2PService'
import { cryptoService } from '@/services/CryptoService'
import { ContactDetailView } from './components/ContactDetailView'
import { QRCodeModal } from './components/QRCodeModal'
import { ContactInviteModal } from './components/ContactInviteModal'
import type { Contact } from '@/types'
import { useTranslation } from 'react-i18next'

type Tab = 'all' | 'online' | 'favorites' | 'blocked'
type UserStatus = 'online' | 'away' | 'offline' | 'dnd'

const STATUS_CONFIG: Record<UserStatus, { label: string; color: string; icon: string }> = {
  online: { label: 'Online', color: 'bg-green-500', icon: '🟢' },
  away: { label: 'Away', color: 'bg-yellow-500', icon: '🟡' },
  dnd: { label: 'Do Not Disturb', color: 'bg-red-500', icon: '🔴' },
  offline: { label: 'Offline', color: 'bg-gray-500', icon: '⚫' },
}

/**
 * ContactsPage — full contacts management interface.
 */
export const ContactsPage: React.FC = () => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [userStatus, setUserStatus] = useState<UserStatus>('online')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  // Load current status on mount
  useEffect(() => {
    window.asgard.network.getCurrentStatus().then((s) => {
      if (s?.status) setUserStatus(s.status as UserStatus)
      if (s?.message) setStatusMessage(s.message)
    }).catch(() => {})
  }, [])

  const handleStatusChange = async (newStatus: UserStatus) => {
    setUserStatus(newStatus)
    setShowStatusMenu(false)
    try {
      await window.asgard.network.publishStatus(newStatus, statusMessage || undefined)
    } catch {}
  }

  const { getFilteredContacts, getFavorites, getBlocked, searchQuery, setSearchQuery } =
    useContactStore()

  const getContacts = () => {
    const all = getFilteredContacts()
    switch (tab) {
      case 'online':
        return all.filter((c) => c.status === 'online')
      case 'favorites':
        return getFavorites()
      case 'blocked':
        return getBlocked()
      default:
        return all
    }
  }

  const contacts = getContacts()

  return (
    <PageTransition>
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-asgard-surface border-r border-asgard-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-asgard-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-asgard-text-primary">{t('contacts.title')}</h2>
            {/* Status selector */}
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={`w-3 h-3 rounded-full ${STATUS_CONFIG[userStatus].color} ring-2 ring-asgard-surface hover:ring-asgard-nordic/50 transition-all`}
                title={STATUS_CONFIG[userStatus].label}
              />
              <AnimatePresence>
                {showStatusMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute top-full left-0 mt-2 w-48 bg-asgard-surface border border-asgard-border rounded-lg shadow-lg z-50 py-1"
                  >
                    {(Object.keys(STATUS_CONFIG) as UserStatus[]).map((status) => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-asgard-surface-alt transition-colors ${
                          userStatus === status ? 'bg-asgard-nordic/10' : ''
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-full ${STATUS_CONFIG[status].color}`} />
                        <span className="text-asgard-text-primary">{STATUS_CONFIG[status].label}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                // Debug: Reload contacts from Hyperbee
                try {
                  const storedContacts = await window.asgard.storage.getContacts() as Array<{
                    publicKey: string
                    displayName: string
                    status?: string
                    relation?: string
                    verified?: boolean
                    addedAt?: number
                    lastSeen?: number
                    statusMessage?: string
                  }>
                  console.log('[ContactsPage] Found', storedContacts.length, 'contacts in Hyperbee')
                  if (storedContacts && storedContacts.length > 0) {
                    const addContact = useContactStore.getState().addContact
                    let restored = 0
                    for (const c of storedContacts) {
                      if (!useContactStore.getState().getContact(c.publicKey)) {
                        addContact({
                          publicKey: c.publicKey,
                          displayName: c.displayName,
                          status: (c.status as 'online' | 'away' | 'offline' | 'dnd') || 'offline',
                          relation: (c.relation as 'contact' | 'favorite' | 'blocked') || 'contact',
                          verified: c.verified ?? false,
                          addedAt: c.addedAt ?? Date.now(),
                          lastSeen: c.lastSeen,
                        })
                        restored++
                      }
                    }
                    console.log('[ContactsPage] Restored', restored, 'contacts from Hyperbee')
                    alert(`Found ${storedContacts.length} contacts in Hyperbee, restored ${restored} new ones`)
                  } else {
                    alert(t('contacts.error.noContactsFound'))
                  }
                } catch (err) {
                  console.error('[ContactsPage] Failed to reload contacts:', err)
                  alert(t('contacts.error.failedToReload') + ': ' + err)
                }
              }}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
              }
              title={t('contacts.reloadContacts')}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQRModal(true)}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM17 13h2v2h-2zM19 15h2v2h-2zM17 17h2v2h-2zM15 19h2v2h-2zM19 19h2v2h-2z"/>
                </svg>
              }
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInviteModal(true)}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
                </svg>
              }
            />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddModal(true)}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                  </svg>
                }
              >
                {t('contacts.add')}
              </Button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 flex-shrink-0">
          <Input
            placeholder={t('search.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={searchQuery ? () => setSearchQuery('') : undefined}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            }
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pb-2 flex-shrink-0">
          {(['all', 'online', 'favorites', 'blocked'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
                tab === t
                  ? 'bg-asgard-nordic/30 text-asgard-glacier border border-asgard-nordic/40'
                  : 'text-asgard-text-muted hover:text-asgard-text-secondary hover:bg-asgard-surface-alt border border-transparent'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-6">
              <p className="text-sm text-asgard-text-muted">
                {tab === 'blocked' ? t('contacts.noBlockedContacts') : t('contacts.noContacts')}
              </p>
            </div>
          ) : (
            <Virtuoso
              data={contacts}
              itemContent={(_: number, contact: Contact) => (
                <ContactItem
                  key={contact.publicKey}
                  contact={contact}
                  isSelected={selectedContact?.publicKey === contact.publicKey}
                  onClick={() => setSelectedContact(contact)}
                />
              )}
              increaseViewportBy={200}
            />
          )}
        </div>
      </div>

      {/* Right panel — contact detail or empty */}
      <div className="flex-1 flex flex-col bg-asgard-surface-alt overflow-hidden">
        {selectedContact ? (
          <ContactDetailView contact={selectedContact} onClose={() => setSelectedContact(null)} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-asgard-text-muted">{t('contacts.selectContact')}</p>
          </div>
        )}
      </div>

      {/* Add contact modal */}
      <AnimatePresence>
        {showAddModal && <AddContactModal onClose={() => setShowAddModal(false)} />}
      </AnimatePresence>

      {/* QR Code modal */}
      <AnimatePresence>
        {showQRModal && <QRCodeModal onClose={() => setShowQRModal(false)} />}
      </AnimatePresence>

      {/* Invite modal */}
      <AnimatePresence>
        {showInviteModal && <ContactInviteModal onClose={() => setShowInviteModal(false)} />}
      </AnimatePresence>
    </div>
    </PageTransition>
  )
}

// ─── Contact Item ─────────────────────────────────────────────────────────────

const ContactItem: React.FC<{ contact: Contact; isSelected: boolean; onClick: () => void }> = ({ contact, isSelected, onClick }) => (
  <motion.button
    layout
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${
      isSelected ? 'bg-asgard-nordic/15' : 'hover:bg-asgard-surface-alt'
    }`}
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
      <p className="text-xs text-asgard-text-muted">
        {contact.status === 'online'
          ? 'Online'
          : contact.lastSeen
          ? formatLastSeen(contact.lastSeen)
          : formatPublicKey(contact.publicKey)}
      </p>
    </div>
    {contact.relation === 'favorite' && (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-away">
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
      </svg>
    )}
  </motion.button>
)

// ─── Add Contact Modal ────────────────────────────────────────────────────────

const AddContactModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [publicKey, setPublicKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const addContact = useContactStore((s) => s.addContact)
  const addToast = useUIStore((s) => s.addToast)
  const identity = useIdentityStore((s) => s.identity)
  const { t } = useTranslation()

  const handleAdd = async () => {
    const trimmedKey = publicKey.trim()
    if (!trimmedKey) {
      setError(t('contacts.error.publicKeyRequired'))
      return
    }
    if (trimmedKey.length < 32) {
      setError(t('contacts.error.invalidPublicKey'))
      return
    }
    if (!identity) {
      setError(t('contacts.error.noIdentity'))
      return
    }

    setIsAdding(true)
    try {
      // Add contact to local store
      addContact({
        publicKey: trimmedKey,
        displayName: displayName.trim() || `User-${trimmedKey.slice(0, 8)}`,
        status: 'offline',
        relation: 'contact',
        verified: false,
        addedAt: Date.now(),
      })

      // CRITICAL: Derive and join the Hyperswarm conversation topic
      // so both peers can discover each other via Hyperswarm DHT.
      // Once connected, ChatService's peer:connected listener will
      // automatically send contact:request to the peer.
      const topic = await cryptoService.deriveConversationTopic(
        identity.keyPair.publicKey,
        trimmedKey
      )
      await p2pService.joinTopic(topic)

      addToast({ type: 'success', title: t('toast.contactAdded'), duration: 3000 })
      onClose()
    } catch (err) {
      console.error('[AddContact] Failed to add contact:', err)
      addToast({ type: 'error', title: t('toast.failedToAddContact'), duration: 4000 })
    } finally {
      setIsAdding(false)
    }
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
        <h3 className="text-lg font-semibold text-asgard-text-primary mb-1">{t('contacts.addContact')}</h3>
        <p className="text-sm text-asgard-text-muted mb-5">
          {t('contacts.enterPublicKey')}
        </p>

        <div className="space-y-4">
          <Input
            label={t('contacts.publicKey')}
            placeholder={t('contacts.publicKeyPlaceholder')}
            value={publicKey}
            onChange={(e) => { setPublicKey(e.target.value); setError('') }}
            error={error}
          />
          <Input
            label={t('contacts.displayNameOptional')}
            placeholder={t('contacts.displayNamePlaceholder')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="ghost" fullWidth onClick={onClose}>{t('common.cancel')}</Button>
          <Button fullWidth onClick={handleAdd} loading={isAdding}>{t('contacts.addContact')}</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
