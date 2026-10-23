import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/uiStore'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { chatService } from '@/services/ChatService'
import { parseInviteInput, normalizeAsgardPublicKey } from '@/utils/invite'

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

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

const ModalOverlay: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({
  onClose,
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Échap qui annule une composition IME reste au champ ; le fermer
      // couperait la saisie en cours.
      if (e.isComposing || e.keyCode === 229) return
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      // Un dialogue modal ne laisse pas Tab filer vers la page derrière lui :
      // au dernier contrôle on revient au premier, et inversement.
      const root = dialogRef.current
      if (!root) return
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
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
        ref={dialogRef}
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
}

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

  const getContact = useContactStore((s) => s.getContact)
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

    // Une demande encore en attente peut être relancée (le pair ne l'a peut-être
    // jamais reçue) ; un contact déjà confirmé reste un doublon.
    const existing = getContact(normalizedKey)
    if (existing && existing.relation !== 'pending') {
      setError(t('modal.error.contactExists'))
      return
    }

    try {
      const convId = await chatService.registerContact(normalizedKey, displayName.trim())
      // Ouvrir la conversation : c'est là que la demande se confirme (réponse).
      setActiveConversation(convId)
      navigate(`/conversations/${convId}`)
      onClose()
    } catch (err) {
      console.error('[ModalContainer] Failed to add contact:', err)
      setError(t('toast.failedToAddContact'))
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-contact-title"
      className="bg-asgard-surface border border-asgard-border rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-asgard-border">
        <h3 id="add-contact-title" className="text-base font-semibold text-asgard-text-primary">{t('modal.addContact')}</h3>
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
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
            <label htmlFor="add-contact-public-key" className="text-sm font-medium text-asgard-text-secondary">
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
            id="add-contact-public-key"
            aria-describedby={error ? 'add-contact-error' : undefined}
            aria-invalid={error ? true : undefined}
            className="asgard-input w-full px-3 py-2.5 text-sm rounded-lg"
            placeholder={t('modal.publicKeyPlaceholder')}
            value={publicKey}
            onChange={(e) => handlePublicKeyChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') handleSubmit()
            }}
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="add-contact-display-name" className="text-sm font-medium text-asgard-text-secondary block mb-1.5">
            {t('modal.displayName')}
          </label>
          <input
            id="add-contact-display-name"
            className="asgard-input w-full px-3 py-2.5 text-sm rounded-lg"
            placeholder={t('modal.displayNamePlaceholder')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') handleSubmit()
            }}
            maxLength={32}
          />
        </div>

        {error && (
          <p id="add-contact-error" role="alert" className="text-xs text-asgard-busy">{error}</p>
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
