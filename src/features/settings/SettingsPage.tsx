import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { useNetworkStore } from '@/stores/networkStore'
import { Avatar, compressAvatarToWebP } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { QRCodeModal } from '@/features/contacts/components/QRCodeModal'
import { mediaDeviceService, type MediaDeviceInfo } from '@/services/MediaDeviceService'
import { SUPPORTED_LANGUAGES, changeLanguage, getCurrentLanguage } from '@/i18n/config'
import { TrashManager } from './components/TrashManager'
import { ThemeSelector } from './components/ThemeSelector'
import { DownloadHistory } from './components/DownloadHistory'
import { ShareLinksManager } from './components/ShareLinksManager'
import { FavoritesManager } from './components/FavoritesManager'
import { BlockedPeersManager } from './components/BlockedPeersManager'
import { PageTransition } from '@/components/ui/PageTransition'
import { secretKeyToSeedPhrase } from '@/services/SeedPhraseService'
import type { Theme, UserStatus } from '@/types'

type SettingsSection = 'profile' | 'appearance' | 'language' | 'notifications' | 'privacy' | 'security' | 'network' | 'devices' | 'storage' | 'chat' | 'media' | 'accessibility' | 'about'

/**
 * SettingsPage — full settings panel with multiple sections.
 */
export const SettingsPage: React.FC = () => {
  const [section, setSection] = useState<SettingsSection>('profile')
  const { t } = useTranslation()

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: t('settings.profile'), icon: <ProfileIcon /> },
    { id: 'appearance', label: t('settings.appearance'), icon: <AppearanceIcon /> },
    { id: 'language', label: t('settings.language'), icon: <LanguageIcon /> },
    { id: 'chat', label: t('settings.chat'), icon: <ChatIcon /> },
    { id: 'media', label: t('settings.media'), icon: <MediaIcon /> },
    { id: 'notifications', label: t('settings.notifications'), icon: <NotifIcon /> },
    { id: 'privacy', label: t('settings.privacy'), icon: <PrivacyIcon /> },
    { id: 'security', label: t('settings.security'), icon: <SecurityIcon /> },
    { id: 'accessibility', label: t('settings.accessibility'), icon: <AccessibilityIcon /> },
    { id: 'network', label: t('settings.network'), icon: <NetworkIcon /> },
    { id: 'devices', label: t('settings.devices'), icon: <DevicesIcon /> },
    { id: 'storage', label: t('settings.storage'), icon: <StorageIcon /> },
    { id: 'about', label: t('settings.aboutApp'), icon: <AboutIcon /> },
  ]

  return (
    <PageTransition>
    <div className="flex h-full">
      {/* Settings sidebar */}
      <div className="w-56 flex-shrink-0 bg-asgard-surface border-r border-asgard-border">
        <div className="px-4 py-4 border-b border-asgard-border">
          <h2 className="text-base font-semibold text-asgard-text-primary">{t('settings.title')}</h2>
        </div>
        <nav className="p-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                section === s.id
                  ? 'bg-asgard-nordic/30 text-asgard-glacier'
                  : 'text-asgard-text-secondary hover:bg-asgard-surface-alt hover:text-asgard-text-primary'
              }`}
            >
              <span className="text-current opacity-70">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className="p-6 max-w-2xl"
          >
            {section === 'profile' && <ProfileSection />}
            {section === 'appearance' && <AppearanceSection />}
            {section === 'language' && <LanguageSection />}
            {section === 'chat' && <ChatSection />}
            {section === 'media' && <MediaSection />}
            {section === 'notifications' && <NotificationsSection />}
            {section === 'privacy' && <PrivacySection />}
            {section === 'security' && <SecuritySection />}
            {section === 'accessibility' && <AccessibilitySection />}
            {section === 'network' && <NetworkSection />}
            {section === 'devices' && <DevicesSection />}
            {section === 'storage' && <StorageSection />}
            {section === 'about' && <AboutSection />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
    </PageTransition>
  )
}

// ─── Profile Section ──────────────────────────────────────────────────────────

const ProfileSection: React.FC = () => {
  const { identity, updateProfile, setStatus: storeSetStatus } = useIdentityStore()
  const addToast = useUIStore((s) => s.addToast)
  const { t } = useTranslation()
  const [name, setName] = useState(identity?.profile.displayName ?? '')
  const [about, setAbout] = useState(identity?.profile.about ?? '')
  const [customStatus, setCustomStatus] = useState(identity?.profile.customStatus ?? '')
  // Status from store (live, not local state)
  const currentStatus = identity?.profile.status ?? 'online'
  const [showQR, setShowQR] = useState(false)

  const handleSave = async () => {
    await updateProfile({ 
      displayName: name.trim(), 
      about: about.trim() || undefined,
      customStatus: customStatus.trim() || undefined,
    })
    addToast({ type: 'success', title: t('settings.profileSaved') })
  }

  // CRITICAL FIX: Status change is instant — no need to click Save
  const handleStatusChange = async (newStatus: UserStatus) => {
    await storeSetStatus(newStatus)
    addToast({ type: 'success', title: `${t('settings.status')}: ${statusOptions.find(o => o.value === newStatus)?.label ?? newStatus}`, duration: 2000 })
  }

  const handleAvatarChange = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      // Validate size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        addToast({ type: 'error', title: t('settings.fileTooLarge'), message: t('settings.max10MB') })
        return
      }
      try {
        // OPTIMIZATION: Compress to WebP for ~30% smaller P2P transmission
        const compressedDataUrl = await compressAvatarToWebP(file)
        await updateProfile({ avatar: compressedDataUrl })
        addToast({ type: 'success', title: t('settings.avatarUpdated') })
      } catch {
        addToast({ type: 'error', title: t('settings.uploadFailed'), message: t('settings.couldNotProcess') })
      }
    }
    input.click()
  }

  const handleAvatarRemove = async () => {
    await updateProfile({ avatar: undefined })
    addToast({ type: 'success', title: t('settings.avatarRemoved') })
  }

  const statusOptions: { value: UserStatus; label: string; color: string }[] = [
    { value: 'online', label: t('common.online'), color: 'bg-green-500' },
    { value: 'away', label: t('common.away'), color: 'bg-yellow-500' },
    { value: 'busy', label: t('common.busy'), color: 'bg-red-500' },
    { value: 'invisible', label: t('common.invisible'), color: 'bg-gray-500' },
  ]

  return (
    <div>
      <SectionHeader title={t('settings.profile')} subtitle={t('settings.profileSubtitle')} />
      <div className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <Avatar
            src={identity?.profile.avatar}
            name={identity?.profile.displayName}
            publicKey={identity?.keyPair.publicKey}
            size="xl"
          />
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleAvatarChange}>{t('settings.changePhoto')}</Button>
              {identity?.profile.avatar && (
                <Button variant="danger" size="sm" onClick={handleAvatarRemove}>{t('settings.remove')}</Button>
              )}
            </div>
            <p className="text-xs text-asgard-text-muted">{t('settings.avatarHint')}</p>
          </div>
        </div>

        {/* Status selector */}
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-2">{t('settings.status')}</label>
          <div className="flex gap-2 flex-wrap">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
                  currentStatus === opt.value
                    ? 'border-asgard-glacier bg-asgard-nordic/20 text-asgard-glacier'
                    : 'border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${opt.color}`} />
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-asgard-text-muted mt-1.5">{t('settings.statusUpdated')}</p>
        </div>

        {/* Custom status message */}
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-1.5">{t('settings.customStatus')}</label>
          <input
            type="text"
            className="asgard-input w-full p-3 text-sm"
            value={customStatus}
            onChange={(e) => setCustomStatus(e.target.value)}
            maxLength={50}
            placeholder={t('settings.customStatusPlaceholder')}
          />
          <p className="text-xs text-asgard-text-muted mt-1">{t('settings.customStatusHint')}</p>
        </div>

        <Input
          label={t('settings.displayName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
        />

        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-1.5">{t('settings.about')}</label>
          <textarea
            className="asgard-input w-full p-3 text-sm resize-none"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={3}
            maxLength={160}
            placeholder={t('settings.aboutPlaceholder')}
          />
        </div>

        {/* Public key display */}
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-semibold text-asgard-text-muted uppercase tracking-wider mb-2">{t('settings.publicKey')}</p>
          <p className="font-mono text-xs text-asgard-glacier break-all">
            {identity?.keyPair.publicKey}
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(identity?.keyPair.publicKey ?? '')
              }}
            >
              {t('common.copy')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowQR(true)}>{t('settings.showQRCode')}</Button>
          </div>
        </div>

        <Button onClick={handleSave}>{t('settings.saveChanges')}</Button>
      </div>

      <AnimatePresence>
        {showQR && <QRCodeModal onClose={() => setShowQR(false)} />}
      </AnimatePresence>
    </div>
  )
}

// ─── Language Section ────────────────────────────────────────────────────────

const LanguageSection: React.FC = () => {
  const { t } = useTranslation()
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage())
  const addToast = useUIStore((s) => s.addToast)

  const handleLanguageChange = (lang: string) => {
    changeLanguage(lang)
    setCurrentLang(lang)
    addToast({ type: 'success', title: t('settings.languageChanged'), duration: 2000 })
  }

  return (
    <div>
      <SectionHeader title={t('settings.language')} subtitle={t('settings.languageSubtitle')} />
      <div className="space-y-2">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-colors ${
              currentLang === lang.code
                ? 'border-asgard-glacier bg-asgard-nordic/20 text-asgard-glacier'
                : 'border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt'
            }`}
          >
            <span className="text-xl">{lang.flag}</span>
            <span className="flex-1 text-left font-medium">{lang.name}</span>
            {currentLang === lang.code && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Appearance Section ───────────────────────────────────────────────────────

const AppearanceSection: React.FC = () => {
  const { theme, setTheme, settings, updateSettings } = useUIStore()
  const { t } = useTranslation()

  return (
    <div>
      <SectionHeader title={t('settings.appearance')} subtitle={t('settings.appearanceSubtitle')} />
      <div className="space-y-6">
        {/* Theme */}
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-3">Theme</label>
          <div className="flex gap-3">
            {(['dark', 'light', 'system'] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 py-3 rounded-xl border text-sm font-medium capitalize transition-colors ${
                  theme === t
                    ? 'border-asgard-glacier bg-asgard-nordic/20 text-asgard-glacier'
                    : 'border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Theme Presets */}
        <ThemeSelector />

        {/* Font size */}
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-3">Font Size</label>
          <div className="flex gap-3">
            {(['small', 'medium', 'large'] as const).map((s) => (
              <button
                key={s}
                onClick={() => updateSettings({ fontSize: s })}
                className={`flex-1 py-2 rounded-xl border text-sm capitalize transition-colors ${
                  settings.fontSize === s
                    ? 'border-asgard-glacier bg-asgard-nordic/20 text-asgard-glacier'
                    : 'border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Notifications Section ────────────────────────────────────────────────────

const NotificationsSection: React.FC = () => {
  const { settings, updateSettings } = useUIStore()
  const { t } = useTranslation()
  const notif = settings.notifications

return (
      <div>
        <SectionHeader title={t('settings.notifications')} subtitle={t('settings.notificationsSubtitle')} />
        <div className="space-y-4">
          <ToggleRow
            label={t('settings.enableNotifications')}
            description={t('settings.enableNotificationsDesc')}
            checked={notif.enabled}
            onChange={(v) => updateSettings({ notifications: { ...notif, enabled: v } })}
          />
          <ToggleRow
            label={t('settings.notificationSound')}
            description={t('settings.notificationSoundDesc')}
            checked={notif.sound}
            onChange={(v) => updateSettings({ notifications: { ...notif, sound: v } })}
            disabled={!notif.enabled}
          />
          <ToggleRow
            label={t('settings.messagePreview')}
            description={t('settings.messagePreviewDesc')}
            checked={notif.showPreview}
            onChange={(v) => updateSettings({ notifications: { ...notif, showPreview: v } })}
            disabled={!notif.enabled}
          />
          <ToggleRow
            label={t('settings.mentionsOnly')}
            description={t('settings.mentionsOnlyDesc')}
            checked={notif.mentionsOnly}
            onChange={(v) => updateSettings({ notifications: { ...notif, mentionsOnly: v } })}
          />
          <ToggleRow
            label={t('settings.doNotDisturb')}
            description={t('settings.doNotDisturbDesc')}
            checked={notif.dndMode}
            onChange={(v) => updateSettings({ notifications: { ...notif, dndMode: v } })}
          />
        </div>
      </div>
    )
}

// ─── Privacy Section ──────────────────────────────────────────────────────────

const PrivacySection: React.FC = () => {
  const { settings, updateSettings } = useUIStore()
  const { t } = useTranslation()
  const priv = settings.privacy

return (
      <div>
        <SectionHeader title={t('settings.privacy')} subtitle={t('settings.privacySubtitle')} />
        <div className="space-y-4">
          <ToggleRow
            label={t('settings.readReceipts')}
            description={t('settings.readReceiptsDesc')}
            checked={priv.readReceipts}
            onChange={(v) => updateSettings({ privacy: { ...priv, readReceipts: v } })}
          />
          <ToggleRow
            label={t('settings.typingIndicators')}
            description={t('settings.typingIndicatorsDesc')}
            checked={priv.typingIndicators}
            onChange={(v) => updateSettings({ privacy: { ...priv, typingIndicators: v } })}
          />
          <ToggleRow
            label={t('settings.onlineStatus')}
            description={t('settings.onlineStatusDesc')}
            checked={priv.onlineStatus}
            onChange={(v) => updateSettings({ privacy: { ...priv, onlineStatus: v } })}
          />
          <ToggleRow
            label={t('settings.linkPreviews')}
            description={t('settings.linkPreviewsDesc')}
            checked={priv.linkPreviews ?? true}
            onChange={(v) => updateSettings({ privacy: { ...priv, linkPreviews: v } })}
          />

          <div className="pt-4 border-t border-asgard-border">
            <BlockedPeersManager />
          </div>
        </div>
      </div>
    )
}

// ─── Security Section ─────────────────────────────────────────────────────────

const SecuritySection: React.FC = () => {
  const identity = useIdentityStore((s) => s.identity)
  const { t } = useTranslation()
  const [showSeed, setShowSeed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [seedPhrase, setSeedPhrase] = useState<string>('')

  const handleShowSeed = () => {
    if (!identity) return
    try {
      const phrase = secretKeyToSeedPhrase(identity.keyPair.secretKey)
      setSeedPhrase(phrase)
      setShowSeed(true)
    } catch (err) {
      console.error('Failed to generate seed phrase:', err)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(seedPhrase)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

return (
      <div>
        <SectionHeader title={t('settings.security')} subtitle={t('settings.securitySubtitle')} />
        <div className="space-y-4">
          <div className="glass rounded-2xl p-5 border border-asgard-border">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-asgard-nordic/20 border border-asgard-glacier/20 flex items-center justify-center flex-shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-asgard-glacier" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-asgard-text-primary mb-1">{t('settings.recoveryPhrase')}</h3>
                <p className="text-sm text-asgard-text-secondary leading-relaxed">
                  {t('settings.recoveryPhraseDesc')}
                </p>
              </div>
            </div>

            {!showSeed ? (
              <button
                onClick={handleShowSeed}
                className="w-full py-3 px-4 rounded-xl border border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt transition-colors text-sm flex items-center justify-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
                {t('settings.showRecoveryPhrase')}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <p className="text-xs text-red-400 text-center">
                    <strong>{t('settings.neverShareRecoveryPhrase')}</strong>
                    <br />{t('settings.recoveryPhraseWarning')}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 p-4 bg-asgard-surface-alt rounded-xl border border-asgard-border">
                  {seedPhrase.split(' ').map((word, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <span className="text-xs text-asgard-text-muted w-5 text-right">{index + 1}.</span>
                      <span className="text-sm font-mono text-asgard-text-primary">{word}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleCopy}
                  className="w-full py-2 px-4 rounded-xl border border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt transition-colors text-sm flex items-center justify-center gap-2"
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
                      {t('settings.copyToClipboard')}
                    </>
                  )}
                </button>

                <button
                  onClick={() => { setShowSeed(false); setSeedPhrase('') }}
                  className="w-full py-2 px-4 rounded-xl text-asgard-text-muted hover:text-asgard-text-secondary transition-colors text-xs"
                >
                  {t('settings.hideRecoveryPhrase')}
                </button>
              </div>
            )}
          </div>

          <div className="glass rounded-2xl p-5 border border-asgard-border">
            <h3 className="text-sm font-semibold text-asgard-text-primary mb-3">{t('settings.yourIdentity')}</h3>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-asgard-text-muted mb-1">{t('settings.publicKey')}</p>
                <p className="font-mono text-xs text-asgard-glacier break-all bg-asgard-surface-alt rounded-lg p-2">
                  {identity?.keyPair.publicKey || t('settings.notAvailable')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
}

// ─── Chat Section ─────────────────────────────────────────────────────────────

const ChatSection: React.FC = () => {
  const { settings, updateSettings } = useUIStore()
  const { t } = useTranslation()
  const chat = settings.chat

return (
      <div>
        <SectionHeader title={t('settings.chat')} subtitle={t('settings.chatSubtitle')} />
        <div className="space-y-4">
          <ToggleRow
            label={t('settings.sendOnEnter')}
            description={t('settings.sendOnEnterDesc')}
            checked={chat.sendOnEnter}
            onChange={(v) => updateSettings({ chat: { ...chat, sendOnEnter: v } })}
          />
          <ToggleRow
            label={t('settings.showTimestamps')}
            description={t('settings.showTimestampsDesc')}
            checked={chat.showTimestamps}
            onChange={(v) => updateSettings({ chat: { ...chat, showTimestamps: v } })}
          />
          <ToggleRow
            label={t('settings.showSeconds')}
            description={t('settings.showSecondsDesc')}
            checked={chat.showSeconds}
            onChange={(v) => updateSettings({ chat: { ...chat, showSeconds: v } })}
            disabled={!chat.showTimestamps}
          />
          <ToggleRow
            label={t('settings.autoEmoji')}
            description={t('settings.autoEmojiDesc')}
            checked={chat.autoEmoji}
            onChange={(v) => updateSettings({ chat: { ...chat, autoEmoji: v } })}
          />
          <ToggleRow
            label={t('settings.inlinePreviews')}
            description={t('settings.inlinePreviewsDesc')}
            checked={chat.inlinePreviews}
            onChange={(v) => updateSettings({ chat: { ...chat, inlinePreviews: v } })}
          />
          <ToggleRow
            label={t('settings.collapseMessages')}
            description={t('settings.collapseMessagesDesc')}
            checked={chat.collapseMessages}
            onChange={(v) => updateSettings({ chat: { ...chat, collapseMessages: v } })}
          />
          <ToggleRow
            label={t('settings.showReadStatus')}
            description={t('settings.showReadStatusDesc')}
            checked={chat.showReadStatus}
            onChange={(v) => updateSettings({ chat: { ...chat, showReadStatus: v } })}
          />

          <div>
            <label className="text-sm font-medium text-asgard-text-secondary block mb-3">
              {t('settings.messageDensity')}
            </label>
            <div className="flex gap-3">
              {(['comfortable', 'compact', 'cozy'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => updateSettings({ chat: { ...chat, density: d } })}
                  className={`flex-1 py-2 rounded-xl border text-sm capitalize transition-colors ${
                    chat.density === d
                      ? 'border-asgard-glacier bg-asgard-nordic/20 text-asgard-glacier'
                      : 'border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt'
                  }`}
                >
                  {t(`settings.chatDensity_${d}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
}

// ─── Media Section ────────────────────────────────────────────────────────────

const MediaSection: React.FC = () => {
  const { settings, updateSettings } = useUIStore()
  const { t } = useTranslation()
  const media = settings.media

return (
      <div>
        <SectionHeader title={t('settings.media')} subtitle={t('settings.mediaSubtitle')} />
        <div className="space-y-4">
          <ToggleRow
            label={t('settings.autoPlayVideos')}
            description={t('settings.autoPlayVideosDesc')}
            checked={media.autoPlayVideos}
            onChange={(v) => updateSettings({ media: { ...media, autoPlayVideos: v } })}
          />
          <ToggleRow
            label={t('settings.autoPlayGifs')}
            description={t('settings.autoPlayGifsDesc')}
            checked={media.autoPlayGifs}
            onChange={(v) => updateSettings({ media: { ...media, autoPlayGifs: v } })}
          />
          <ToggleRow
            label={t('settings.muteByDefault')}
            description={t('settings.muteByDefaultDesc')}
            checked={media.muteByDefault}
            onChange={(v) => updateSettings({ media: { ...media, muteByDefault: v } })}
          />
          <ToggleRow
            label={t('settings.showVideoControls')}
            description={t('settings.showVideoControlsDesc')}
            checked={media.showVideoControls}
            onChange={(v) => updateSettings({ media: { ...media, showVideoControls: v } })}
          />
          <ToggleRow
            label={t('settings.compressVideos')}
            description={t('settings.compressVideosDesc')}
            checked={media.compressVideos}
            onChange={(v) => updateSettings({ media: { ...media, compressVideos: v } })}
          />
          <ToggleRow
            label={t('settings.compressImages')}
            description={t('settings.compressImagesDesc')}
            checked={media.compressImages}
            onChange={(v) => updateSettings({ media: { ...media, compressImages: v } })}
          />

          <div>
            <label className="text-sm font-medium text-asgard-text-secondary block mb-3">
              {t('settings.defaultVideoQuality')}
            </label>
            <div className="flex gap-3">
              {(['auto', 'low', 'medium', 'high'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => updateSettings({ media: { ...media, videoQuality: q } })}
                  className={`flex-1 py-2 rounded-xl border text-sm capitalize transition-colors ${
                    media.videoQuality === q
                      ? 'border-asgard-glacier bg-asgard-nordic/20 text-asgard-glacier'
                      : 'border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt'
                  }`}
                >
                  {t(`settings.videoQuality_${q}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-asgard-text-secondary block mb-3">
              {t('settings.defaultAudioQuality')}
            </label>
            <div className="flex gap-3">
              {(['low', 'medium', 'high'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => updateSettings({ media: { ...media, audioQuality: q } })}
                  className={`flex-1 py-2 rounded-xl border text-sm capitalize transition-colors ${
                    media.audioQuality === q
                      ? 'border-asgard-glacier bg-asgard-nordic/20 text-asgard-glacier'
                      : 'border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt'
                  }`}
                >
                  {t(`settings.audioQuality_${q}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
}

// ─── Accessibility Section ────────────────────────────────────────────────────

const AccessibilitySection: React.FC = () => {
  const { settings, updateSettings } = useUIStore()
  const { t } = useTranslation()
  const a11y = settings.accessibility

return (
      <div>
        <SectionHeader title={t('settings.accessibility')} subtitle={t('settings.accessibilitySubtitle')} />
        <div className="space-y-4">
          <ToggleRow
            label={t('settings.reducedMotion')}
            description={t('settings.reducedMotionDesc')}
            checked={a11y.reducedMotion}
            onChange={(v) => updateSettings({ accessibility: { ...a11y, reducedMotion: v } })}
          />
          <ToggleRow
            label={t('settings.highContrast')}
            description={t('settings.highContrastDesc')}
            checked={a11y.highContrast}
            onChange={(v) => updateSettings({ accessibility: { ...a11y, highContrast: v } })}
          />
          <ToggleRow
            label={t('settings.screenReaderOptimizations')}
            description={t('settings.screenReaderOptimizationsDesc')}
            checked={a11y.screenReader}
            onChange={(v) => updateSettings({ accessibility: { ...a11y, screenReader: v } })}
          />
          <ToggleRow
            label={t('settings.keyboardNavigation')}
            description={t('settings.keyboardNavigationDesc')}
            checked={a11y.keyboardNav}
            onChange={(v) => updateSettings({ accessibility: { ...a11y, keyboardNav: v } })}
          />
          <ToggleRow
            label={t('settings.textToSpeech')}
            description={t('settings.textToSpeechDesc')}
            checked={a11y.ttsEnabled}
            onChange={(v) => updateSettings({ accessibility: { ...a11y, ttsEnabled: v } })}
          />
          <ToggleRow
            label={t('settings.largerTouchTargets')}
            description={t('settings.largerTouchTargetsDesc')}
            checked={a11y.largerTouchTargets}
            onChange={(v) => updateSettings({ accessibility: { ...a11y, largerTouchTargets: v } })}
          />
        </div>
      </div>
    )
}

// ─── Network Section ──────────────────────────────────────────────────────────

const NetworkSection: React.FC = () => {
  const { settings, updateSettings } = useUIStore()
  const { t } = useTranslation()
  const net = settings.network
  const [isSuspending, setIsSuspending] = useState(false)
  const swarmSuspended = useNetworkStore((s) => s.swarmSuspended)
  const setSwarmSuspended = useNetworkStore((s) => s.setSwarmSuspended)
  const status = useNetworkStore((s) => s.status)
  const [peerScores, setPeerScores] = useState<Record<string, { latency: number; score: number }>>({})

  // Fetch peer scores periodically
  useEffect(() => {
    const fetchScores = () => {
      window.asgard.network.getPeerScores().then(setPeerScores).catch(() => {})
    }
    fetchScores()
    const interval = setInterval(fetchScores, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleMaxPeersChange = (value: number) => {
    updateSettings({ network: { ...net, maxPeers: value } })
    // Apply to the running Hyperswarm instance
    window.asgard.network.updateConfig({ maxPeers: value }).catch(console.error)
  }

  const handleRelayToggle = (value: boolean) => {
    updateSettings({ network: { ...net, relayEnabled: value } })
    // Apply to the running Hyperswarm instance
    window.asgard.network.updateConfig({ relayEnabled: value }).catch(console.error)
  }

  const handleSuspendToggle = async () => {
    setIsSuspending(true)
    try {
      if (swarmSuspended) {
        await window.asgard.network.resume()
        setSwarmSuspended(false)
      } else {
        await window.asgard.network.suspend()
        setSwarmSuspended(true)
      }
    } catch (err) {
      console.error('[NetworkSection] Failed to toggle swarm:', err)
    }
    setIsSuspending(false)
  }

  const handleFlush = async () => {
    try {
      await window.asgard.network.flush()
    } catch (err) {
      console.error('[NetworkSection] Failed to flush:', err)
    }
  }

return (
      <div>
        <SectionHeader title={t('settings.network')} subtitle={t('settings.networkSubtitle')} />
        <div className="space-y-4">
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-asgard-text-primary">{t('settings.connectionStatus')}</p>
              <span className={`text-xs px-2 py-1 rounded-full ${
                status.state === 'connected'
                  ? 'bg-green-500/20 text-green-400'
                  : swarmSuspended
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {status.state === 'connected' ? t('settings.connected') : swarmSuspended ? t('settings.suspended') : t('settings.disconnected')}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="bg-asgard-surface-alt rounded-lg p-2">
                <p className="text-lg font-bold text-asgard-glacier">{status.peers}</p>
                <p className="text-xs text-asgard-text-muted">{t('settings.peers')}</p>
              </div>
              <div className="bg-asgard-surface-alt rounded-lg p-2">
                <p className="text-lg font-bold text-asgard-glacier">{status.topics.length}</p>
                <p className="text-xs text-asgard-text-muted">{t('settings.topics')}</p>
              </div>
              <div className="bg-asgard-surface-alt rounded-lg p-2">
                <p className="text-lg font-bold text-asgard-glacier">
                  {((status.bandwidth.up + status.bandwidth.down) / 1024).toFixed(1)}KB
                </p>
                <p className="text-xs text-asgard-text-muted">{t('settings.bandwidth')}</p>
              </div>
              <div className="bg-asgard-surface-alt rounded-lg p-2">
                <p className="text-lg font-bold text-asgard-glacier">{status.connecting ?? 0}</p>
                <p className="text-xs text-asgard-text-muted">{t('settings.connecting')}</p>
              </div>
            </div>
            <div className="flex gap-4 mt-3 text-xs text-asgard-text-muted">
              <span>↑ {(status.bandwidth.up / 1024).toFixed(1)} {t('settings.kbPerSecond')}</span>
              <span>↓ {(status.bandwidth.down / 1024).toFixed(1)} {t('settings.kbPerSecond')}</span>
            </div>
            {status.peerLatency && Object.keys(status.peerLatency).length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-asgard-text-muted mb-1">{t('settings.peerLatency')}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(status.peerLatency).map(([peerId, latency]) => (
                    <span key={peerId} className="text-xs bg-asgard-surface-alt rounded px-2 py-0.5 text-asgard-text-secondary">
                      {peerId.slice(0, 8)}… {latency === 0 ? t('settings.new') : `${latency}ms`}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {Object.keys(peerScores).length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-asgard-text-muted mb-1">{t('settings.peerQuality')}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(peerScores).map(([peerId, { latency, score }]) => {
                    const color = score >= 80 ? 'text-green-400 bg-green-500/15' : score >= 50 ? 'text-yellow-400 bg-yellow-500/15' : 'text-red-400 bg-red-500/15'
                    return (
                      <span key={peerId} className={`text-xs rounded px-2 py-0.5 ${color}`}>
                        {peerId.slice(0, 8)}… {score}% · {latency}ms
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <Button variant="secondary" size="sm" onClick={handleFlush}>
                {t('settings.flushDht')}
              </Button>
            </div>
          </div>

          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-asgard-text-primary">{t('settings.batterySaver')}</p>
                <p className="text-xs text-asgard-text-muted">{t('settings.batterySaverDesc')}</p>
              </div>
              <button
                onClick={handleSuspendToggle}
                disabled={isSuspending}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  swarmSuspended
                    ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                }`}
              >
                {isSuspending ? '...' : swarmSuspended ? t('settings.resume') : t('settings.suspend')}
              </button>
            </div>
          </div>

          <ToggleRow
            label={t('settings.enableRelay')}
            description={t('settings.enableRelayDesc')}
            checked={net.relayEnabled}
            onChange={handleRelayToggle}
          />
          <div>
            <label className="text-sm font-medium text-asgard-text-secondary block mb-2">{t('settings.maxPeers')}</label>
            <input
              type="range"
              min={4}
              max={128}
              step={4}
              value={net.maxPeers}
              onChange={(e) => handleMaxPeersChange(parseInt(e.target.value))}
              className="w-full accent-asgard-glacier"
            />
            <div className="flex justify-between text-xs text-asgard-text-muted mt-1">
              <span>4</span>
              <span className="text-asgard-glacier font-medium">{net.maxPeers} {t('settings.peers')}</span>
              <span>128</span>
            </div>
          </div>
        </div>
      </div>
    )
}

// ─── Storage Section ──────────────────────────────────────────────────────────

const StorageSection: React.FC = () => {
  const { settings, updateSettings } = useUIStore()
  const { t } = useTranslation()
  const addToast = useUIStore((s) => s.addToast)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [realStorageSize, setRealStorageSize] = useState<number | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [showShareLinks, setShowShareLinks] = useState(false)
  const [showDownloads, setShowDownloads] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)

  // Fetch real storage size on mount
  useEffect(() => {
    window.asgard.storage.getSize().then((size) => {
      setRealStorageSize(size)
    }).catch(() => {})
  }, [])

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const usedBytes = realStorageSize ?? 0
  const maxBytes = settings.storage.cacheSize * 1024 * 1024
  const usedPercent = Math.min(100, Math.round((usedBytes / maxBytes) * 100))

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const data = await window.asgard.storage.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `asgard-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      addToast({ type: 'success', title: t('settings.dataExported') })
    } catch {
      addToast({ type: 'error', title: t('settings.exportFailed'), message: t('settings.exportFailedMessage') })
    }
    setIsExporting(false)
  }

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setIsImporting(true)
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        await window.asgard.storage.importData(data)
        addToast({ type: 'success', title: t('toast.dataImported') })
      } catch {
        addToast({ type: 'error', title: t('toast.importFailed'), message: t('toast.invalidBackupFile') })
      }
      setIsImporting(false)
    }
    input.click()
  }

  const handleClearCache = async () => {
    try {
      await window.asgard.storage.clearAll()
      addToast({ type: 'success', title: t('toast.cacheCleared') })
    } catch {
      addToast({ type: 'error', title: t('toast.failedToClearCache') })
    }
  }

return (
      <div>
        <SectionHeader title={t('settings.storage')} subtitle={t('settings.storageSubtitle')} />
        <div className="space-y-6">
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-asgard-text-primary">{t('settings.localCache')}</p>
              <span className="text-xs text-asgard-text-muted bg-asgard-surface-alt px-2 py-1 rounded-full">
                {settings.storage.cacheSize} {t('settings.mbLimit')}
              </span>
            </div>
            <div className="w-full bg-asgard-surface-alt rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all ${usedPercent > 80 ? 'bg-red-500' : 'bg-asgard-glacier'}`}
                style={{ width: `${usedPercent}%` }}
              />
            </div>
            <p className="text-xs text-asgard-text-muted">
              {realStorageSize !== null ? formatBytes(usedBytes) : '...'} {t('settings.usedOf')} {settings.storage.cacheSize} MB ({usedPercent}%)
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-asgard-text-primary mb-3">{t('settings.autoDownload')}</p>
            <div className="space-y-2">
              <ToggleRow
                label={t('settings.images')}
                description={t('settings.autoDownloadImagesDesc')}
                checked={settings.storage.autoDownload.images}
                onChange={(v) =>
                  updateSettings({
                    storage: {
                      ...settings.storage,
                      autoDownload: { ...settings.storage.autoDownload, images: v },
                    },
                  })
                }
              />
              <ToggleRow
                label={t('settings.audio')}
                description={t('settings.autoDownloadAudioDesc')}
                checked={settings.storage.autoDownload.audio}
                onChange={(v) =>
                  updateSettings({
                    storage: {
                      ...settings.storage,
                      autoDownload: { ...settings.storage.autoDownload, audio: v },
                    },
                  })
                }
              />
              <ToggleRow
                label={t('settings.videos')}
                description={t('settings.autoDownloadVideosDesc')}
                checked={settings.storage.autoDownload.videos}
                onChange={(v) =>
                  updateSettings({
                    storage: {
                      ...settings.storage,
                      autoDownload: { ...settings.storage.autoDownload, videos: v },
                    },
                  })
                }
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowTrash(true)}
              className="w-full"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-2">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
              {t('settings.manageTrash')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowShareLinks(true)}
              className="w-full"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-2">
                <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
              </svg>
              {t('settings.shareLinks')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDownloads(true)}
              className="w-full"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-2">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
              {t('settings.downloadHistory')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowFavorites(true)}
              className="w-full"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-2">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
              {t('settings.favoriteFiles')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              loading={isExporting}
              className="w-full"
            >
              {t('settings.exportData')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleImport}
              loading={isImporting}
              className="w-full"
            >
              {t('settings.importData')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleClearCache}
              className="w-full"
            >
              {t('settings.clearCache')}
            </Button>
          </div>
        </div>

        {showTrash && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl h-[80vh] bg-asgard-surface border border-asgard-border rounded-2xl overflow-hidden shadow-modal">
              <TrashManager onClose={() => setShowTrash(false)} />
            </div>
          </div>
        )}

        {showShareLinks && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl h-[80vh] bg-asgard-surface border border-asgard-border rounded-2xl overflow-hidden shadow-modal">
              <ShareLinksManager onClose={() => setShowShareLinks(false)} />
            </div>
          </div>
        )}

        {showDownloads && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl h-[80vh] bg-asgard-surface border border-asgard-border rounded-2xl overflow-hidden shadow-modal">
              <DownloadHistory onClose={() => setShowDownloads(false)} />
            </div>
          </div>
        )}

        {showFavorites && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl h-[80vh] bg-asgard-surface border border-asgard-border rounded-2xl overflow-hidden shadow-modal">
              <FavoritesManager onClose={() => setShowFavorites(false)} />
            </div>
          </div>
        )}
      </div>
    )
}

// ─── Devices Section ─────────────────────────────────────────────────────────

const DevicesSection: React.FC = () => {
  const addToast = useUIStore((s) => s.addToast)
  const { t } = useTranslation()
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([])
  const [selectedMic, setSelectedMic] = useState<string>('')
  const [selectedCam, setSelectedCam] = useState<string>('')
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('')
  const [hasPermission, setHasPermission] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const micTestRef = useRef<(() => void) | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraTestRef = useRef<(() => void) | null>(null)

  const refreshDeviceList = async () => {
    const prefs = mediaDeviceService.getPreferences()
    setMicrophones(mediaDeviceService.getMicrophones())
    setCameras(mediaDeviceService.getCameras())
    setSpeakers(mediaDeviceService.getSpeakers())
    setSelectedMic(prefs.audioInput ?? '')
    setSelectedCam(prefs.videoInput ?? '')
    setSelectedSpeaker(prefs.audioOutput ?? '')
    setHasPermission(mediaDeviceService.hasPermission())
  }

  useEffect(() => {
    refreshDeviceList()
    // Listen for device changes
    mediaDeviceService.on('devices:changed', refreshDeviceList)
    return () => {
      mediaDeviceService.off('devices:changed', refreshDeviceList)
      // Stop any active tests
      micTestRef.current?.()
      cameraTestRef.current?.()
    }
  }, [])

  const handleRequestPermission = async () => {
    const granted = await mediaDeviceService.requestPermission('both')
    if (granted) {
      addToast({ type: 'success', title: t('toast.permissionGranted') })
      await refreshDeviceList()
    } else {
      addToast({ type: 'error', title: t('toast.permissionDenied') })
    }
  }

  const handleMicChange = async (deviceId: string) => {
    setSelectedMic(deviceId)
    mediaDeviceService.setPreferredDevice('audioinput', deviceId)
    addToast({ type: 'success', title: t('toast.microphoneUpdated') })
    // Restart mic test with new device
    micTestRef.current?.()
    const stop = await mediaDeviceService.testMicrophone(deviceId, setMicLevel).catch(() => null)
    micTestRef.current = stop ?? null
  }

  const handleCamChange = async (deviceId: string) => {
    setSelectedCam(deviceId)
    mediaDeviceService.setPreferredDevice('videoinput', deviceId)
    addToast({ type: 'success', title: t('toast.cameraUpdated') })
  }

  const handleSpeakerChange = (deviceId: string) => {
    setSelectedSpeaker(deviceId)
    mediaDeviceService.setPreferredDevice('audiooutput', deviceId)
    addToast({ type: 'success', title: t('toast.speakerUpdated') })
  }

  const handleTestMic = async () => {
    if (micTestRef.current) {
      micTestRef.current()
      micTestRef.current = null
      setMicLevel(0)
      return
    }
    if (!selectedMic) return
    const stop = await mediaDeviceService.testMicrophone(selectedMic, setMicLevel).catch(() => null)
    micTestRef.current = stop ?? null
  }

  const handleTestCamera = async () => {
    if (cameraTestRef.current) {
      cameraTestRef.current()
      cameraTestRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      return
    }
    if (!selectedCam) return
    try {
      const { stream, stop } = await mediaDeviceService.testCamera(selectedCam)
      if (videoRef.current) videoRef.current.srcObject = stream
      cameraTestRef.current = stop
    } catch {
      addToast({ type: 'error', title: t('toast.cameraTestFailed') })
    }
  }

return (
      <div>
        <SectionHeader title={t('settings.devices')} subtitle={t('settings.devicesSubtitle')} />
        <div className="space-y-6">
          {!hasPermission && (
            <div className="glass rounded-xl p-4 border border-asgard-glacier/20">
              <p className="text-sm text-asgard-text-primary mb-2">{t('settings.microphoneCameraAccess')}</p>
              <p className="text-xs text-asgard-text-muted mb-3">
                {t('settings.grantPermissionDesc')}
              </p>
              <Button variant="secondary" size="sm" onClick={handleRequestPermission}>
                {t('settings.grantPermission')}
              </Button>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-asgard-text-secondary block mb-2">
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                  <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                </svg>
                {t('settings.microphone')}
              </span>
            </label>
            <select
              value={selectedMic}
              onChange={(e) => handleMicChange(e.target.value)}
              className="asgard-input w-full text-sm"
            >
              {microphones.length === 0 && <option value="">{t('settings.noMicrophoneDetected')}</option>}
              {microphones.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>{mic.label}</option>
              ))}
            </select>

            {selectedMic && (
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={handleTestMic}
                  className="text-xs text-asgard-glacier hover:underline"
                >
                  {micTestRef.current ? t('settings.stopTest') : t('settings.testMic')}
                </button>
                <div className="flex-1 h-2 bg-asgard-surface-alt rounded-full overflow-hidden">
                  <div
                    className="h-full bg-asgard-glacier rounded-full transition-all duration-75"
                    style={{ width: `${micLevel * 100}%` }}
                  />
                </div>
                <span className="text-xs text-asgard-text-muted w-8 text-right">
                  {Math.round(micLevel * 100)}%
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-asgard-text-secondary block mb-2">
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                  <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                </svg>
                {t('settings.camera')}
              </span>
            </label>
            <select
              value={selectedCam}
              onChange={(e) => handleCamChange(e.target.value)}
              className="asgard-input w-full text-sm"
            >
              {cameras.length === 0 && <option value="">{t('settings.noCameraDetected')}</option>}
              {cameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>{cam.label}</option>
              ))}
            </select>

            {selectedCam && (
              <div className="mt-2">
                <button
                  onClick={handleTestCamera}
                  className="text-xs text-asgard-glacier hover:underline mb-2"
                >
                  {cameraTestRef.current ? t('settings.stopPreview') : t('settings.testCamera')}
                </button>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-w-xs rounded-xl border border-asgard-border bg-black"
                  style={{ display: cameraTestRef.current ? 'block' : 'none' }}
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-asgard-text-secondary block mb-2">
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                  <path d="M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM7 4h10v8H7V4zm0 14v-4h10v4H7z"/>
                </svg>
                {t('settings.speaker')}
              </span>
            </label>
            <select
              value={selectedSpeaker}
              onChange={(e) => handleSpeakerChange(e.target.value)}
              className="asgard-input w-full text-sm"
            >
              {speakers.length === 0 && <option value="">{t('settings.defaultSpeaker')}</option>}
              {speakers.map((spk) => (
                <option key={spk.deviceId} value={spk.deviceId}>{spk.label}</option>
              ))}
            </select>
          </div>

          <div className="glass rounded-xl p-4">
            <p className="text-xs font-semibold text-asgard-text-muted uppercase tracking-wider mb-2">
              {t('settings.detectedHardware')}
            </p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-semibold text-asgard-glacier">{microphones.length}</p>
                <p className="text-xs text-asgard-text-muted">{t('settings.microphones')}</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-asgard-glacier">{cameras.length}</p>
                <p className="text-xs text-asgard-text-muted">{t('settings.cameras')}</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-asgard-glacier">{speakers.length}</p>
                <p className="text-xs text-asgard-text-muted">{t('settings.speakers')}</p>
              </div>
            </div>
            <p className="text-xs text-asgard-text-muted mt-3 text-center">
              {t('settings.devicesAreAutoDetected')}
            </p>
          </div>
        </div>
      </div>
    )
}

// ─── About Section ────────────────────────────────────────────────────────────

const XELIS_ADDRESS = 'xel:fzete660pp676sez3cvfpjmma00xe3q5lz4f8wcm9z5kf2p6guvsqdevkpq'

const AboutSection: React.FC = () => {
  const { t } = useTranslation()
  const addToast = useUIStore((s) => s.addToast)
  const [appVersion, setAppVersion] = useState('1.0.0')

  useEffect(() => {
    window.asgard?.app?.getVersion?.().then((v: string) => {
      if (v) setAppVersion(v)
    }).catch(() => {})
  }, [])

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(XELIS_ADDRESS)
      addToast({ type: 'success', title: t('toast.addressCopied'), duration: 3000 })
    } catch {
      addToast({ type: 'error', title: t('toast.failedToCopyAddress'), duration: 3000 })
    }
  }

  const handleOpenXelis = () => {
    window.asgard.app.openExternal('https://xelis.io/')
  }

  const handleOpenTrocador = () => {
    window.asgard.app.openExternal('https://trocador.app/?ref=BLbjXxTsoK')
  }

return (
      <div>
        <SectionHeader title={t('settings.aboutApp')} subtitle={t('settings.aboutAppSubtitle')} />
        <div className="space-y-4">
          <div className="glass rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center">
                <img src="./asgard-icon.svg" alt={t('settings.altAsgardIcon')} className="w-full h-full" />
              </div>
              <div>
                <p className="font-semibold text-asgard-text-primary">{t('settings.appName')}</p>
                <p className="text-sm text-asgard-text-muted">{t('settings.appVersion', { version: appVersion })}</p>
              </div>
            </div>
            <p className="text-xs text-asgard-text-muted leading-relaxed mb-4">
              {t('settings.aboutDescription')}
            </p>

            {/* Donation section */}
            <div className="border-t border-asgard-border pt-4 mt-2">
              <p className="text-sm text-asgard-text-primary font-medium mb-1">
                {t('settings.doYouLikeAsgard')}
              </p>
              <p className="text-xs text-asgard-text-secondary leading-relaxed mb-3">
                {t('settings.makeDonationIn', { currency: 'XEL' })} {' '}
                <button
                  onClick={handleOpenXelis}
                  className="text-asgard-glacier hover:underline font-medium cursor-pointer"
                >
                  XELIS
                </button>{' '}
                {t('settings.atTheFollowingAddress')}
              </p>
              <button
                onClick={handleCopyAddress}
                className="w-full glass rounded-lg px-3 py-2.5 text-left group hover:border-asgard-glacier/40 transition-colors cursor-pointer"
              >
                <p className="font-mono text-[11px] text-asgard-glacier break-all leading-relaxed select-all">
                  {XELIS_ADDRESS}
                </p>
                <p className="text-[10px] text-asgard-text-muted mt-1.5 group-hover:text-asgard-glacier transition-colors">
                  {t('settings.clickToCopy')}
                </p>
              </button>
            </div>

            {/* Trocador link */}
            <div className="border-t border-asgard-border pt-4 mt-2">
              <button
                onClick={handleOpenTrocador}
                className="text-sm text-asgard-glacier hover:underline font-medium cursor-pointer"
              >
                {t('settings.tradeCryptocurrencyPrivately')}
              </button>
            </div>
          </div>
          <div className="space-y-2 text-xs text-asgard-text-muted">
            <p>{t('settings.builtWith')}</p>
            <p>© 2026 Asgard. {t('settings.openSourceLicense')} MIT License.</p>
          </div>
        </div>
      </div>
    )
}

// ─── Reusable components ──────────────────────────────────────────────────────

const SectionHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div className="mb-6">
    <h3 className="text-xl font-semibold text-asgard-text-primary">{title}</h3>
    <p className="text-sm text-asgard-text-muted mt-0.5">{subtitle}</p>
    <div className="h-px bg-asgard-border mt-4" />
  </div>
)

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, checked, onChange, disabled }) => (
  <div className={`flex items-center justify-between py-3 ${disabled ? 'opacity-50' : ''}`}>
    <div>
      <p className="text-sm font-medium text-asgard-text-primary">{label}</p>
      <p className="text-xs text-asgard-text-muted">{description}</p>
    </div>
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? 'bg-asgard-glacier' : 'bg-asgard-border'
      } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
)

// ─── Icons ────────────────────────────────────────────────────────────────────
const ProfileIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
const AppearanceIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
const NotifIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
const PrivacyIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
const SecurityIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
const NetworkIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
const DevicesIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3h-2v-3H6v-2h3V8h2v3h3v2z"/></svg>
const StorageIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-2.18c.07-.44.18-.88.18-1.38C18 2.51 15.49 0 12 0S6 2.51 6 4.62c0 .5.11.94.18 1.38H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2z"/></svg>
const AboutIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
const ChatIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>
const MediaIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
const AccessibilityIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 6c-2.61.7-5.67 1-8.5 1s-5.89-.3-8.5-1L3 8c1.86.5 4 .83 6 1v13h2v-6h2v6h2V9c2-.17 4.14-.5 6-1l-.5-2zM12 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>
const LanguageIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>
