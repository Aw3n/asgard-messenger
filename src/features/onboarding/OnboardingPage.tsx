import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'

type Step = 'welcome' | 'create' | 'seed' | 'profile' | 'done' | 'restore'

/**
 * OnboardingPage — first-run experience.
 * Creates a new cryptographic identity without any account, email, or server.
 */
export const OnboardingPage: React.FC = () => {
  const [step, setStep] = useState<Step>('welcome')
  const [displayName, setDisplayName] = useState('')
  const [about, setAbout] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [seedPhrase, setSeedPhrase] = useState<string>('')

  const { createIdentity, updateProfile, identity } = useIdentityStore()
  const addToast = useUIStore((s) => s.addToast)
  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleCreateIdentity = async () => {
    setIsCreating(true)
    try {
      await createIdentity()
      // COHÉRENCE ARCHI : la seed phrase vient de l'IPC identity:exportSeedPhrase
      // (source de vérité disque, exactement le code inverse de
      // importSeedPhrase → round-trip garanti) plutôt que d'une reconstitution
      // renderer depuis le store, dont le persist écrase secretKey à ''.
      const words = await window.asgard.identity.exportSeedPhrase()
      setSeedPhrase(words.join(' '))
      setStep('seed')
    } catch {
      addToast({ type: 'error', title: t('onboarding.createFailed'), duration: 4000 })
    } finally {
      setIsCreating(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      addToast({ type: 'warning', title: t('onboarding.enterDisplayName') })
      return
    }
    await updateProfile({ displayName: displayName.trim(), about: about.trim() || undefined })
    setStep('done')
  }

  const handleFinish = () => {
    navigate('/conversations')
  }

  return (
    <div className="flex items-center justify-center h-screen bg-asgard-black overflow-hidden">
      {/* Aurora background effect */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-asgard-nordic/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-asgard-cyan/5 rounded-full blur-3xl" />
      </div>

      <AnimatePresence mode="wait">
        {step === 'welcome' && (
          <WelcomeStep key="welcome" onNext={() => setStep('create')} onRestore={() => setStep('restore')} />
        )}
        {step === 'create' && (
          <CreateStep key="create" onCreate={handleCreateIdentity} isCreating={isCreating} />
        )}
        {step === 'seed' && (
          <SeedStep key="seed" seedPhrase={seedPhrase} onNext={() => setStep('profile')} />
        )}
        {step === 'profile' && (
          <ProfileStep
            key="profile"
            displayName={displayName}
            about={about}
            identity={identity}
            onDisplayNameChange={setDisplayName}
            onAboutChange={setAbout}
            onSave={handleSaveProfile}
          />
        )}
        {step === 'done' && (
          <DoneStep key="done" identity={identity} onFinish={handleFinish} />
        )}
        {step === 'restore' && (
          <RestoreStep
            key="restore"
            onRestored={() => {
              // COHÉRENCE RESTAURATION : importSeedPhrase sauvegarde l'identité
              // restaurée avec un displayName par défaut (User-xxxx) et
              // RestoreStep vient de recharger le store (loadIdentity).
              // Pré-remplir l'étape profile depuis l'identité restaurée pour
              // refléter l'état réel du disque, au lieu d'un champ vide qui
              // laisse croire que le profil a été perdu.
              const restored = useIdentityStore.getState().identity
              setDisplayName(restored?.profile.displayName ?? '')
              setAbout(restored?.profile.about ?? '')
              setStep('profile')
            }}
            onBack={() => setStep('welcome')}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Steps ────────────────────────────────────────────────────────────────────

const stepVariants = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -20, scale: 0.98 },
}

const WelcomeStep: React.FC<{ onNext: () => void; onRestore: () => void }> = ({ onNext, onRestore }) => {
  const { t } = useTranslation()
  return (
  <motion.div
    variants={stepVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={{ duration: 0.3 }}
    className="text-center max-w-lg mx-4 relative z-10"
  >
    {/* Logo */}
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
      className="flex justify-center mb-8"
    >
      <AsgardLogo size={80} alt={t('onboarding.appName')} />
    </motion.div>

    <motion.h1
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="text-5xl font-bold text-asgard-text-primary mb-3 tracking-tight"
    >
      {t('onboarding.welcome')}
    </motion.h1>

    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="text-xl text-asgard-text-secondary mb-2"
    >
      {t('onboarding.welcomeDesc')}
    </motion.p>

    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="text-asgard-text-muted mb-10 leading-relaxed"
    >
      {t('onboarding.noServersLine')}
      <br />
      {t('onboarding.p2pSecuredLine')}
    </motion.p>

    {/* Feature list */}
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="grid grid-cols-3 gap-4 mb-10"
    >
      {([
        { icon: 'lock', label: t('onboarding.feature.e2e') },
        { icon: 'globe', label: t('onboarding.feature.noServer') },
        { icon: 'shield', label: t('onboarding.feature.zeroData') },
      ] as const).map((f) => (
        <div key={f.label} className="glass rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center h-8 mb-2 text-asgard-glacier">
            <Icon name={f.icon} size={28} />
          </div>
          <div className="text-xs text-asgard-text-secondary font-medium">{f.label}</div>
        </div>
      ))}
    </motion.div>

    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6 }}
      className="space-y-3"
    >
      <Button size="lg" fullWidth onClick={onNext}>
        {t('onboarding.enterRealm')}
      </Button>
      <Button size="lg" fullWidth onClick={onRestore} variant="ghost">
        {t('onboarding.restoreIdentity')}
      </Button>
    </motion.div>
  </motion.div>
  )
}

const CreateStep: React.FC<{ onCreate: () => void; isCreating: boolean }> = ({
  onCreate,
  isCreating,
}) => {
  const { t } = useTranslation()
  return (
  <motion.div
    variants={stepVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={{ duration: 0.3 }}
    className="max-w-md mx-4 relative z-10"
  >
    <div className="glass rounded-3xl p-8 border border-asgard-border">
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-asgard-nordic/20 border border-asgard-glacier/20 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-asgard-glacier" strokeWidth="1.5">
            <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-asgard-text-primary text-center mb-2">
        {t('onboarding.createIdentity')}
      </h2>
      <p className="text-asgard-text-secondary text-center text-sm mb-6 leading-relaxed">
        {t('onboarding.createIdentityDesc')}
      </p>

      <div className="space-y-3 mb-6">
        {[
          t('onboarding.feature.ed25519'),
          t('onboarding.feature.privateKey'),
          t('onboarding.feature.publicKeyId'),
          t('onboarding.feature.noRegistration'),
        ].map((item) => (
          <div key={item} className="flex items-center gap-3 text-sm text-asgard-text-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-online">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            {item}
          </div>
        ))}
      </div>

      <Button size="lg" fullWidth onClick={onCreate} loading={isCreating}>
        {isCreating ? t('onboarding.generatingKeys') : t('onboarding.createAccount')}
      </Button>
    </div>
  </motion.div>
  )
}

interface ProfileStepProps {
  displayName: string
  about: string
  identity: import('@/types').LocalIdentity | null
  onDisplayNameChange: (v: string) => void
  onAboutChange: (v: string) => void
  onSave: () => void
}

const ProfileStep: React.FC<ProfileStepProps> = ({
  displayName,
  about,
  identity,
  onDisplayNameChange,
  onAboutChange,
  onSave,
}) => {
  const { t } = useTranslation()
  return (
  <motion.div
    variants={stepVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={{ duration: 0.3 }}
    className="max-w-md mx-4 relative z-10"
  >
    <div className="glass rounded-3xl p-8 border border-asgard-border">
      <h2 className="text-2xl font-bold text-asgard-text-primary text-center mb-6">
        {t('onboarding.setUpProfile')}
      </h2>

      {/* Avatar preview */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <Avatar
            name={displayName || t('onboarding.you')}
            publicKey={identity?.keyPair.publicKey}
            size="xl"
            status="online"
            showStatus
          />
          <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-asgard-nordic border-2 border-asgard-surface flex items-center justify-center hover:bg-asgard-nordic-light transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <Input
          label={t('onboarding.displayName')}
          placeholder={t('onboarding.displayNamePlaceholder')}
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          maxLength={32}
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-asgard-text-secondary">{t('onboarding.about')}</label>
          <textarea
            className="asgard-input w-full p-3 text-sm resize-none"
            placeholder={t('onboarding.aboutPlaceholder')}
            value={about}
            onChange={(e) => onAboutChange(e.target.value)}
            rows={3}
            maxLength={160}
          />
        </div>
      </div>

      <Button size="lg" fullWidth onClick={onSave} disabled={!displayName.trim()}>
        {t('onboarding.continue')}
      </Button>
    </div>
  </motion.div>
  )
}

// ─── Seed Phrase Step ─────────────────────────────────────────────────────────

const SeedStep: React.FC<{ seedPhrase: string; onNext: () => void }> = ({ seedPhrase, onNext }) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(seedPhrase)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const words = seedPhrase.split(' ')

  return (
    <motion.div
      variants={stepVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="max-w-lg mx-4 relative z-10"
    >
      <div className="glass rounded-3xl p-8 border border-asgard-border">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-asgard-nordic/20 border border-asgard-glacier/20 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-asgard-glacier" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-asgard-text-primary text-center mb-2">
          {t('onboarding.recoveryPhrase')}
        </h2>
        <p className="text-asgard-text-secondary text-center text-sm mb-6 leading-relaxed">
          {t('onboarding.recoveryPhraseDesc')}
        </p>

        {/* Warning */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
          <p className="text-xs text-red-400 text-center">
            <strong>{t('onboarding.neverShare')}</strong>
            <br />{t('settings.recoveryPhraseWarning')}
          </p>
        </div>

        {/* Seed phrase grid */}
        <div className="grid grid-cols-3 gap-2 mb-4 p-4 bg-asgard-surface-alt rounded-xl border border-asgard-border">
          {words.map((word, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <span className="text-xs text-asgard-text-muted w-5 text-right">{index + 1}.</span>
              <span className="text-sm font-mono text-asgard-text-primary">{word}</span>
            </div>
          ))}
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="w-full py-2 px-4 rounded-xl border border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt transition-colors text-sm mb-4 flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-online">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              {t('settings.copied')}
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
              {t('onboarding.copyPhrase')}
            </>
          )}
        </button>

        {/* Confirmation checkbox */}
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 rounded border-asgard-border text-asgard-glacier focus:ring-asgard-glacier"
          />
          <span className="text-sm text-asgard-text-secondary">
            {t('onboarding.iSaved')}
          </span>
        </label>

        <Button size="lg" fullWidth onClick={onNext} disabled={!confirmed}>
          {t('onboarding.continue')}
        </Button>
      </div>
    </motion.div>
  )
}

const DoneStep: React.FC<{
  identity: import('@/types').LocalIdentity | null
  onFinish: () => void
}> = ({ identity, onFinish }) => {
  const { t } = useTranslation()
  return (
  <motion.div
    variants={stepVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={{ duration: 0.3 }}
    className="max-w-md mx-4 relative z-10 text-center"
  >
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
      className="flex justify-center mb-6"
    >
      <div className="w-20 h-20 rounded-full bg-asgard-online/20 border-2 border-asgard-online/50 flex items-center justify-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-online">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
    </motion.div>

    <h2 className="text-3xl font-bold text-asgard-text-primary mb-2">{t('onboarding.youReady')}</h2>
    <p className="text-asgard-text-secondary mb-6">
      {t('onboarding.youReadyDesc')}
    </p>

    {identity && (
      <div className="glass rounded-2xl p-4 mb-6 text-left">
        <p className="text-xs text-asgard-text-muted mb-1 font-medium uppercase tracking-wider">{t('onboarding.yourPublicKey')}</p>
        <p className="font-mono text-xs text-asgard-glacier break-all">
          {identity.keyPair.publicKey}
        </p>
      </div>
    )}

    <Button size="lg" fullWidth onClick={onFinish}>
      {t('onboarding.finish')}
    </Button>
  </motion.div>
  )
}

// RestoreStep — restore identity from seed phrase
const RestoreStep: React.FC<{ onRestored: () => void; onBack: () => void }> = ({ onRestored, onBack }) => {
  const { t } = useTranslation()
  const addToast = useUIStore((s) => s.addToast)
  const [seedInput, setSeedInput] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)

  const handleRestore = async () => {
    const words = seedInput.trim().split(/\s+/).filter(w => w.length > 0)
    if (words.length !== 24) {
      addToast({ type: 'error', title: t('onboarding.seedPhraseInvalid'), duration: 4000 })
      return
    }
    setIsRestoring(true)
    try {
      const result = await window.asgard.identity.importSeedPhrase(words)
      if (result) {
        // Reload identity into store
        await useIdentityStore.getState().loadIdentity()
        addToast({ type: 'success', title: t('onboarding.identityRestored'), duration: 4000 })
        onRestored()
      } else {
        addToast({ type: 'error', title: t('onboarding.restoreFailed'), duration: 4000 })
      }
    } catch (err) {
      console.error('[Onboarding] Restore failed:', err)
      addToast({ type: 'error', title: t('onboarding.restoreFailed'), duration: 4000 })
    } finally {
      setIsRestoring(false)
    }
  }

  return (
  <motion.div
    variants={stepVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={{ duration: 0.3 }}
    className="max-w-md mx-4 relative z-10"
  >
    <div className="glass rounded-3xl p-8 border border-asgard-border">
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-asgard-glacier/20 border border-asgard-glacier/20 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-asgard-glacier" strokeWidth="1.5">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-asgard-text-primary text-center mb-2">
        {t('onboarding.restoreIdentity')}
      </h2>
      <p className="text-asgard-text-secondary text-center text-sm mb-6 leading-relaxed">
        {t('onboarding.restoreDesc')}
      </p>

      <div className="mb-6">
        <textarea
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value)}
          placeholder={t('onboarding.seedPhrasePlaceholder')}
          className="w-full h-32 px-4 py-3 rounded-xl bg-asgard-surface border border-asgard-border text-asgard-text-primary placeholder-asgard-text-muted text-sm resize-none focus:outline-none focus:ring-2 focus:ring-asgard-glacier/50"
          disabled={isRestoring}
        />
        <p className="text-xs text-asgard-text-muted mt-2">
          {seedInput.trim().split(/\s+/).filter(w => w.length > 0).length} / 24 {t('onboarding.words')}
        </p>
      </div>

      <div className="space-y-3">
        <Button size="lg" fullWidth onClick={handleRestore} loading={isRestoring}>
          {isRestoring ? t('onboarding.restoring') : t('onboarding.restoreIdentity')}
        </Button>
        <Button size="lg" fullWidth onClick={onBack} variant="ghost">
          {t('onboarding.back')}
        </Button>
      </div>
    </div>
  </motion.div>
  )
}

// Logo component — uses the new asgard-icon.svg from public/
const AsgardLogo: React.FC<{ size?: number; alt?: string }> = ({ size = 60, alt = 'Asgard' }) => (
  <img
    src="./asgard-icon.svg"
    alt={alt}
    className="rounded-3xl shadow-glow"
    style={{ width: size, height: size }}
  />
)
