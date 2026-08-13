import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore } from '@/stores/uiStore'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useIdentityStore } from '@/stores/identityStore'
import { cryptoService } from '@/services/CryptoService'
import { p2pService } from '@/services/P2PService'
import type { Contact } from '@/types'

/**
 * ModalContainer — renders modals based on uiStore modal state.
 */
export const ModalContainer: React.FC = () => {
  const modal = useUIStore((s) => s.modal)
  const closeModal = useUIStore((s) => s.closeModal)

  return (
    <AnimatePresence>
      {modal.type && (
        <ModalOverlay onClose={closeModal}>
          {modal.type === 'addContact' && <AddContactModal onClose={closeModal} />}
        </ModalOverlay>
      )}
    </AnimatePresence>
  )
}

// ─── Modal Overlay ────────────────────────────────────────────────────────────

const ModalOverlay: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({
  onClose,
  children,
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
    className="fixed inset-0 z-50 flex items-center justify-center bg-asgard-deep-black/70 backdrop-blur-sm"
    onClick={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-md mx-4"
    >
      {children}
    </motion.div>
  </motion.div>
)

// ─── Add Contact Modal ────────────────────────────────────────────────────────

const AddContactModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [publicKey, setPublicKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const addContact = useContactStore((s) => s.addContact)
  const getContact = useContactStore((s) => s.getContact)
  const addConversation = useConversationStore((s) => s.addConversation)
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation)

  const handleSubmit = async () => {
    const key = publicKey.trim()
    if (!key) {
      setError('Public key is required')
      return
    }
    if (key.length < 16) {
      setError('Public key is too short')
      return
    }

    // Check if contact already exists
    if (getContact(key)) {
      setError('Contact already exists')
      return
    }

    const name = displayName.trim() || `User-${key.slice(0, 8)}`

    // Create contact
    const contact: Contact = {
      publicKey: key,
      displayName: name,
      status: 'offline',
      relation: 'contact',
      verified: false,
      addedAt: Date.now(),
    }
    addContact(contact)

    // CRITICAL: Persist contact to Hyperbee storage for durability
    try {
      console.log('[ModalContainer] Saving contact to Hyperbee:', contact.publicKey.slice(0, 16) + '...')
      await window.asgard.storage.saveContact(contact)
      console.log('[ModalContainer] Contact saved successfully to Hyperbee')
      
      // Verify contact was saved
      const savedContact = await window.asgard.storage.getContact(contact.publicKey)
      if (savedContact) {
        console.log('[ModalContainer] Verified: contact found in Hyperbee')
      } else {
        console.warn('[ModalContainer] WARNING: contact NOT found in Hyperbee after save!')
      }
    } catch (err) {
      console.error('[ModalContainer] Failed to save contact to Hyperbee:', err)
    }

    // CRITICAL: Use deterministic conversationId so both peers compute the same ID
    const myPk = useIdentityStore.getState().identity?.keyPair.publicKey
    if (!myPk) return
    const convId = cryptoService.deriveConversationId(myPk, key)

    addConversation({
      id: convId,
      type: 'direct',
      participantId: key,
      unreadCount: 0,
      muted: false,
      pinned: false,
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    // CRITICAL: Join Hyperswarm topic for peer discovery
    try {
      const topic = await cryptoService.deriveConversationTopic(myPk, key)
      await p2pService.joinTopic(topic)
    } catch (err) {
      console.warn('[ModalContainer] Failed to join topic for new contact:', err)
    }

    // Navigate to conversation
    setActiveConversation(convId)
    navigate(`/conversations/${convId}`)
    onClose()
  }

  return (
    <div className="bg-asgard-surface border border-asgard-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-asgard-border">
        <h3 className="text-base font-semibold text-asgard-text-primary">Add Contact</h3>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-asgard-text-muted hover:bg-asgard-surface-alt hover:text-asgard-text-primary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-1.5">
            Public Key
          </label>
          <input
            className="asgard-input w-full px-3 py-2.5 text-sm rounded-lg"
            placeholder="Enter the contact's public key…"
            value={publicKey}
            onChange={(e) => {
              setPublicKey(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-1.5">
            Display Name <span className="text-asgard-text-muted">(optional)</span>
          </label>
          <input
            className="asgard-input w-full px-3 py-2.5 text-sm rounded-lg"
            placeholder="Give this contact a name…"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            maxLength={32}
          />
        </div>

        {error && (
          <p className="text-xs text-asgard-busy">{error}</p>
        )}

        <p className="text-xs text-asgard-text-muted leading-relaxed">
          Share your public key with your contact so they can add you as well. You can find it in Settings → Profile.
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-asgard-border bg-asgard-surface-alt">
        <button
          onClick={onClose}
          className="btn-ghost px-4 py-2 text-sm rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="btn-primary px-4 py-2 text-sm rounded-lg"
        >
          Add Contact
        </button>
      </div>
    </div>
  )
}
