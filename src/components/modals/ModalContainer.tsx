import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/uiStore'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useIdentityStore } from '@/stores/identityStore'
import { cryptoService } from '@/services/CryptoService'
import { p2pService } from '@/services/P2PService'
import { parseInviteInput, normalizeAsgardPublicKey } from '@/utils/invite'
import type { Contact } from '@/types'

/**
 * ModalContainer — renders modals based on uiStore modal state.
 */
export const ModalContainer: React.FC = () => {
  const modal = useUIStore((s) => s.modal)
  const closeModal = useUIStore((s) => s.closeModal)
  const openModal = useUIStore((s) => s.openModal)
  const [invite, setInvite] = useState<{ publicKey: string; name?: string } | null>(null)

  // DEEP LINK: asgard://invite/<publicKey>?name=<displayName> — lien
  // d'invitation partagé par un pair et ouvert via l'OS. Au démarrage à froid
  // l'URL est tirée par app:getPendingDeepLink (pull, insensible à la course
  // d'enregistrement du listener) ; ensuite les liens arrivent par
  // l'événement app:deepLink. Ouvre l'AddContactModal pré-rempli.
  useEffect(() => {
    const handleInviteUrl = (url: string) => {
      // Seuls les liens d'invitation complets sont routés vers le modal —
      // les clés brutes n'arrivent jamais par deep link.
      if (!url.trim().toLowerCase().startsWith('asgard://')) return
      const parsed = parseInviteInput(url)
      if (!parsed) return
      setInvite({ publicKey: parsed.publicKey, name: parsed.name })
      openModal('addContact')
    }
    window.asgard.app.getPendingDeepLink()
      .then((url) => { if (url) handleInviteUrl(url) })
      .catch(() => {})
    return window.asgard.app.onDeepLink((url) => handleInviteUrl(url))
  }, [openModal])

  return (
    <AnimatePresence>
      {modal.type && (
        <ModalOverlay onClose={closeModal}>
          {modal.type === 'addContact' && (
            <AddContactModal
              onClose={closeModal}
              initialPublicKey={invite?.publicKey}
              initialDisplayName={invite?.name}
            />
          )}
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

const AddContactModal: React.FC<{
  onClose: () => void
  initialPublicKey?: string
  initialDisplayName?: string
}> = ({ onClose, initialPublicKey, initialDisplayName }) => {
  const { t } = useTranslation()
  const [publicKey, setPublicKey] = useState(initialPublicKey ?? '')
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const addContact = useContactStore((s) => s.addContact)
  const getContact = useContactStore((s) => s.getContact)
  const addConversation = useConversationStore((s) => s.addConversation)
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation)

  // UX COPY/PASTE : un lien d'invitation complet (asgard://invite/<key>?name=)
  // collé dans le champ remplit automatiquement la clé ET le nom
  // d'affichage — même parsing que les deep links (parseInviteInput).
  const handlePublicKeyChange = (value: string) => {
    if (value.toLowerCase().includes('asgard://')) {
      const parsed = parseInviteInput(value)
      if (parsed) {
        setPublicKey(parsed.publicKey)
        if (parsed.name && !displayName.trim()) setDisplayName(parsed.name)
        setError('')
        return
      }
    }
    setPublicKey(value)
    setError('')
  }

  // UX COPY/PASTE : colle depuis le presse-papiers et accepte indifféremment
  // une clé publique brute ou un lien d'invitation complet.
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = parseInviteInput(text)
      if (!parsed) return
      setPublicKey(parsed.publicKey)
      if (parsed.name) setDisplayName(parsed.name)
      setError('')
    } catch {
      setError(t('common.clipboardError'))
    }
  }

  const handleSubmit = async () => {
    const key = publicKey.trim()
    if (!key) {
      setError(t('modal.error.publicKeyRequired'))
      return
    }
    // COMPATIBILITÉ KEET + VALIDATION STRICTE : normalise les trois formats
    // d'identifiant (DER hex 88 Asgard, hex 64 Hypercore, z32 52 Keet/Pear,
    // liens pear:// keet://) en clé canonique. L'ancienne garde `length < 16`
    // laissait passer n'importe quel texte assez long — contact fantôme.
    const normalizedKey = normalizeAsgardPublicKey(key)
    if (!normalizedKey) {
      setError(t('modal.error.invalidPublicKey'))
      return
    }

    // Check if contact already exists — la clé étant canonique, les doublons
    // inter-formats (hex 64 vs DER 88) sont désormais détectés.
    if (getContact(normalizedKey)) {
      setError(t('modal.error.contactExists'))
      return
    }

    // COHÉRENCE : User-<8 chars de la clé BRUTE> — les 8 premiers chars du DER
    // sont le préfixe SPKI constant (302a3005) : tous les contacts par défaut
    // s'appelaient identiquement. slice(24,32) prend la partie variable.
    const name = displayName.trim() || `User-${normalizedKey.slice(24, 32)}`

    // Create contact
    const contact: Contact = {
      publicKey: normalizedKey,
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
    const convId = cryptoService.deriveConversationId(myPk, normalizedKey)

    addConversation({
      id: convId,
      type: 'direct',
      participantId: normalizedKey,
      unreadCount: 0,
      muted: false,
      pinned: false,
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    // CRITICAL: Join Hyperswarm topic for peer discovery
    try {
      const topic = await cryptoService.deriveConversationTopic(myPk, normalizedKey)
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
        <h3 className="text-base font-semibold text-asgard-text-primary">{t('modal.addContact')}</h3>
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
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-asgard-text-secondary">
              {t('modal.publicKey')}
            </label>
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="flex items-center gap-1.5 text-xs text-asgard-text-muted hover:text-asgard-glacier transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
              {t('common.paste')}
            </button>
          </div>
          <input
            className="asgard-input w-full px-3 py-2.5 text-sm rounded-lg"
            placeholder={t('modal.publicKeyPlaceholder')}
            value={publicKey}
            onChange={(e) => handlePublicKeyChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-1.5">
            {t('modal.displayName')}
          </label>
          <input
            className="asgard-input w-full px-3 py-2.5 text-sm rounded-lg"
            placeholder={t('modal.displayNamePlaceholder')}
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
          {t('modal.sharePublicKeyHint')}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-asgard-border bg-asgard-surface-alt">
        <button
          onClick={onClose}
          className="btn-ghost px-4 py-2 text-sm rounded-lg"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSubmit}
          className="btn-primary px-4 py-2 text-sm rounded-lg"
        >
          {t('modal.add')}
        </button>
      </div>
    </div>
  )
}
