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
  const notif = settings.notifications

  return (
    <div>
      <SectionHeader title="Notifications" subtitle="Configure how you get notified" />
      <div className="space-y-4">
        <ToggleRow
          label="Enable Notifications"
          description="Show Windows notifications for new messages"
          checked={notif.enabled}
          onChange={(v) => updateSettings({ notifications: { ...notif, enabled: v } })}
        />
        <ToggleRow
          label="Sound"
          description="Play a sound for new messages"
          checked={notif.sound}
          onChange={(v) => updateSettings({ notifications: { ...notif, sound: v } })}
          disabled={!notif.enabled}
        />
        <ToggleRow
          label="Message Preview"
          description="Show message content in notifications"
          checked={notif.showPreview}
          onChange={(v) => updateSettings({ notifications: { ...notif, showPreview: v } })}
          disabled={!notif.enabled}
        />
        <ToggleRow
          label="Mentions Only"
          description="Only notify for mentions and direct messages"
          checked={notif.mentionsOnly}
          onChange={(v) => updateSettings({ notifications: { ...notif, mentionsOnly: v } })}
          disabled={!notif.enabled}
        />
        <ToggleRow
          label="Do Not Disturb"
          description="Suppress all notifications"
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
  const priv = settings.privacy

  return (
    <div>
      <SectionHeader title="Privacy" subtitle="Control what others can see" />
      <div className="space-y-4">
        <ToggleRow
          label="Read Receipts"
          description="Let others know when you've read their messages"
          checked={priv.readReceipts}
          onChange={(v) => updateSettings({ privacy: { ...priv, readReceipts: v } })}
        />
        <ToggleRow
          label="Typing Indicators"
          description="Let others see when you're typing"
          checked={priv.typingIndicators}
          onChange={(v) => updateSettings({ privacy: { ...priv, typingIndicators: v } })}
        />
        <ToggleRow
          label="Online Status"
          description="Let your contacts see your online status"
          checked={priv.onlineStatus}
          onChange={(v) => updateSettings({ privacy: { ...priv, onlineStatus: v } })}
        />
        {/* OPTIMIZATION: Link preview toggle prevents automatic URL fetching */}
        <ToggleRow
          label="Link Previews"
          description="Automatically fetch and display link previews (may leak browsing activity)"
          checked={priv.linkPreviews ?? true}
          onChange={(v) => updateSettings({ privacy: { ...priv, linkPreviews: v } })}
        />

        {/* Blocked Peers Manager */}
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
      <SectionHeader title="Security" subtitle="Manage your identity and recovery phrase" />
      <div className="space-y-4">
        {/* Recovery Phrase Card */}
        <div className="glass rounded-2xl p-5 border border-asgard-border">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-asgard-nordic/20 border border-asgard-glacier/20 flex items-center justify-center flex-shrink-0">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-asgard-glacier" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-asgard-text-primary mb-1">Recovery Phrase</h3>
              <p className="text-sm text-asgard-text-secondary leading-relaxed">
                Your 24-word recovery phrase can be used to restore your identity on another device.
                Keep it safe and never share it with anyone.
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
              Show Recovery Phrase
            </button>
          ) : (
            <div className="space-y-3">
              {/* Warning */}
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-xs text-red-400 text-center">
                  <strong>Never share your recovery phrase!</strong>
                  <br />Anyone with these words can access your account.
                </p>
              </div>

              {/* Seed phrase grid */}
              <div className="grid grid-cols-3 gap-2 p-4 bg-asgard-surface-alt rounded-xl border border-asgard-border">
                {seedPhrase.split(' ').map((word, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <span className="text-xs text-asgard-text-muted w-5 text-right">{index + 1}.</span>
                    <span className="text-sm font-mono text-asgard-text-primary">{word}</span>
                  </div>
                ))}
              </div>

              {/* Copy button */}
              <button
                onClick={handleCopy}
                className="w-full py-2 px-4 rounded-xl border border-asgard-border text-asgard-text-secondary hover:bg-asgard-surface-alt transition-colors text-sm flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-online">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                    Copy to Clipboard
                  </>
                )}
              </button>

              {/* Hide button */}
              <button
                onClick={() => { setShowSeed(false); setSeedPhrase('') }}
                className="w-full py-2 px-4 rounded-xl text-asgard-text-muted hover:text-asgard-text-secondary transition-colors text-xs"
              >
                Hide Recovery Phrase
              </button>
            </div>
          )}
        </div>

        {/* Identity Info */}
        <div className="glass rounded-2xl p-5 border border-asgard-border">
          <h3 className="text-sm font-semibold text-asgard-text-primary mb-3">Your Identity</h3>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-asgard-text-muted mb-1">Public Key</p>
              <p className="font-mono text-xs text-asgard-glacier break-all bg-asgard-surface-alt rounded-lg p-2">
                {identity?.keyPair.publicKey || 'Not available'}
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
  const chat = settings.chat

  return (
    <div>
      <SectionHeader title="Chat" subtitle="Configure your messaging experience" />
      <div className="space-y-4">
        <ToggleRow
          label="Send on Enter"
          description="Press Enter to send, Shift+Enter for new line"
          checked={chat.sendOnEnter}
          onChange={(v) => updateSettings({ chat: { ...chat, sendOnEnter: v } })}
        />
        <ToggleRow
          label="Show Timestamps"
          description="Display time next to each message"
          checked={chat.showTimestamps}
          onChange={(v) => updateSettings({ chat: { ...chat, showTimestamps: v } })}
        />
        <ToggleRow
          label="Show Seconds"
          description="Include seconds in timestamps"
          checked={chat.showSeconds}
          onChange={(v) => updateSettings({ chat: { ...chat, showSeconds: v } })}
          disabled={!chat.showTimestamps}
        />
        <ToggleRow
          label="Auto Emoji"
          description="Convert text shortcuts like :) to emojis"
          checked={chat.autoEmoji}
          onChange={(v) => updateSettings({ chat: { ...chat, autoEmoji: v } })}
        />
        <ToggleRow
          label="Inline Previews"
          description="Show image previews directly in the chat"
          checked={chat.inlinePreviews}
          onChange={(v) => updateSettings({ chat: { ...chat, inlinePreviews: v } })}
        />
        <ToggleRow
          label="Collapse Messages"
          description="Group consecutive messages from the same sender"
          checked={chat.collapseMessages}
          onChange={(v) => updateSettings({ chat: { ...chat, collapseMessages: v } })}
        />
        <ToggleRow
          label="Show Read Status"
          description="Display read receipts on sent messages"
          checked={chat.showReadStatus}
          onChange={(v) => updateSettings({ chat: { ...chat, showReadStatus: v } })}
        />

        {/* Message density */}
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-3">
            Message Density
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
                {d}
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
  const media = settings.media

  return (
    <div>
      <SectionHeader title="Media" subtitle="Configure media playback and compression" />
      <div className="space-y-4">
        <ToggleRow
          label="Auto-play Videos"
          description="Automatically play videos when visible"
          checked={media.autoPlayVideos}
          onChange={(v) => updateSettings({ media: { ...media, autoPlayVideos: v } })}
        />
        <ToggleRow
          label="Auto-play GIFs"
          description="Automatically animate GIF images"
          checked={media.autoPlayGifs}
          onChange={(v) => updateSettings({ media: { ...media, autoPlayGifs: v } })}
        />
        <ToggleRow
          label="Mute by Default"
          description="Start videos muted"
          checked={media.muteByDefault}
          onChange={(v) => updateSettings({ media: { ...media, muteByDefault: v } })}
        />
        <ToggleRow
          label="Show Video Controls"
          description="Display playback controls on videos"
          checked={media.showVideoControls}
          onChange={(v) => updateSettings({ media: { ...media, showVideoControls: v } })}
        />
        <ToggleRow
          label="Compress Videos"
          description="Compress videos before sending to reduce data usage"
          checked={media.compressVideos}
          onChange={(v) => updateSettings({ media: { ...media, compressVideos: v } })}
        />
        <ToggleRow
          label="Compress Images"
          description="Compress images before sending"
          checked={media.compressImages}
          onChange={(v) => updateSettings({ media: { ...media, compressImages: v } })}
        />

        {/* Video quality */}
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-3">
            Default Video Quality
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
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Audio quality */}
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-3">
            Default Audio Quality
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
                {q}
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
  const a11y = settings.accessibility

  return (
    <div>
      <SectionHeader title="Accessibility" subtitle="Make Asgard work better for you" />
      <div className="space-y-4">
        <ToggleRow
          label="Reduced Motion"
          description="Minimize animations and transitions"
          checked={a11y.reducedMotion}
          onChange={(v) => updateSettings({ accessibility: { ...a11y, reducedMotion: v } })}
        />
        <ToggleRow
          label="High Contrast"
          description="Increase contrast for better visibility"
          checked={a11y.highContrast}
          onChange={(v) => updateSettings({ accessibility: { ...a11y, highContrast: v } })}
        />
        <ToggleRow
          label="Screen Reader Optimizations"
          description="Enhanced support for screen readers"
          checked={a11y.screenReader}
          onChange={(v) => updateSettings({ accessibility: { ...a11y, screenReader: v } })}
        />
        <ToggleRow
          label="Keyboard Navigation"
          description="Show keyboard shortcuts and focus indicators"
          checked={a11y.keyboardNav}
          onChange={(v) => updateSettings({ accessibility: { ...a11y, keyboardNav: v } })}
        />
        <ToggleRow
          label="Text-to-Speech"
          description="Read messages aloud"
          checked={a11y.ttsEnabled}
          onChange={(v) => updateSettings({ accessibility: { ...a11y, ttsEnabled: v } })}
        />
        <ToggleRow
          label="Larger Touch Targets"
          description="Make buttons and interactive elements easier to tap"
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
      <SectionHeader title="Network" subtitle="P2P connection settings" />
      <div className="space-y-4">
        {/* Connection Status */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-asgard-text-primary">Connection Status</p>
            <span className={`text-xs px-2 py-1 rounded-full ${
              status.state === 'connected'
                ? 'bg-green-500/20 text-green-400'
                : swarmSuspended
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {status.state === 'connected' ? 'Connected' : swarmSuspended ? 'Suspended' : 'Disconnected'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="bg-asgard-surface-alt rounded-lg p-2">
              <p className="text-lg font-bold text-asgard-glacier">{status.peers}</p>
              <p className="text-xs text-asgard-text-muted">Peers</p>
            </div>
            <div className="bg-asgard-surface-alt rounded-lg p-2">
              <p className="text-lg font-bold text-asgard-glacier">{status.topics.length}</p>
              <p className="text-xs text-asgard-text-muted">Topics</p>
            </div>
            <div className="bg-asgard-surface-alt rounded-lg p-2">
              <p className="text-lg font-bold text-asgard-glacier">
                {((status.bandwidth.up + status.bandwidth.down) / 1024).toFixed(1)}KB
              </p>
              <p className="text-xs text-asgard-text-muted">Bandwidth</p>
            </div>
            <div className="bg-asgard-surface-alt rounded-lg p-2">
              <p className="text-lg font-bold text-asgard-glacier">{status.connecting ?? 0}</p>
              <p className="text-xs text-asgard-text-muted">Connecting</p>
            </div>
          </div>
          {/* Bandwidth details */}
          <div className="flex gap-4 mt-3 text-xs text-asgard-text-muted">
            <span>↑ {(status.bandwidth.up / 1024).toFixed(1)} KB/s</span>
            <span>↓ {(status.bandwidth.down / 1024).toFixed(1)} KB/s</span>
          </div>
          {/* Peer latency */}
          {status.peerLatency && Object.keys(status.peerLatency).length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-asgard-text-muted mb-1">Peer Latency</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(status.peerLatency).map(([peerId, latency]) => (
                  <span key={peerId} className="text-xs bg-asgard-surface-alt rounded px-2 py-0.5 text-asgard-text-secondary">
                    {peerId.slice(0, 8)}… {latency === 0 ? 'new' : `${latency}ms`}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Peer scores / quality */}
          {Object.keys(peerScores).length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-asgard-text-muted mb-1">Peer Quality</p>
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
              Flush DHT
            </Button>
          </div>
        </div>

        {/* Battery Saver */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-asgard-text-primary">Battery Saver</p>
              <p className="text-xs text-asgard-text-muted">Suspend P2P when in background</p>
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
              {isSuspending ? '...' : swarmSuspended ? 'Resume' : 'Suspend'}
            </button>
          </div>
        </div>

        <ToggleRow
          label="Enable Relay"
          description="Use blind relays when direct connections are unavailable"
          checked={net.relayEnabled}
          onChange={handleRelayToggle}
        />
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-2">Max Peers</label>
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
            <span className="text-asgard-glacier font-medium">{net.maxPeers} peers</span>
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
      addToast({ type: 'success', title: 'Data exported successfully' })
    } catch {
      addToast({ type: 'error', title: 'Export failed', message: 'Could not export data' })
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
        addToast({ type: 'success', title: 'Data imported successfully' })
      } catch {
        addToast({ type: 'error', title: 'Import failed', message: 'Invalid backup file' })
      }
      setIsImporting(false)
    }
    input.click()
  }

  const handleClearCache = async () => {
    try {
      await window.asgard.storage.clearAll()
      addToast({ type: 'success', title: 'Cache cleared' })
    } catch {
      addToast({ type: 'error', title: 'Failed to clear cache' })
    }
  }

  return (
    <div>
      <SectionHeader title="Storage" subtitle="Manage local data and downloads" />
      <div className="space-y-6">
        {/* Cache info */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-asgard-text-primary">Local Cache</p>
            <span className="text-xs text-asgard-text-muted bg-asgard-surface-alt px-2 py-1 rounded-full">
              {settings.storage.cacheSize} MB limit
            </span>
          </div>
          <div className="w-full bg-asgard-surface-alt rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full transition-all ${usedPercent > 80 ? 'bg-red-500' : 'bg-asgard-glacier'}`}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          <p className="text-xs text-asgard-text-muted">
            {realStorageSize !== null ? formatBytes(usedBytes) : '...'} used of {settings.storage.cacheSize} MB ({usedPercent}%)
          </p>
        </div>

        {/* Auto-download settings */}
        <div>
          <p className="text-sm font-medium text-asgard-text-primary mb-3">Auto-Download</p>
          <div className="space-y-2">
            <ToggleRow
              label="Images"
              description="Automatically download images"
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
              label="Audio"
              description="Automatically download audio messages"
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
              label="Videos"
              description="Automatically download videos"
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

        {/* Actions */}
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
            Manage Trash
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
            Share Links
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
            Download History
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
            Favorite Files
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={isExporting}
            className="w-full"
          >
            Export Data
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImport}
            loading={isImporting}
            className="w-full"
          >
            Import Data
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleClearCache}
            className="w-full"
          >
            Clear Cache
          </Button>
        </div>
      </div>

      {/* Trash Manager Modal */}
      {showTrash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl h-[80vh] bg-asgard-surface border border-asgard-border rounded-2xl overflow-hidden shadow-modal">
            <TrashManager onClose={() => setShowTrash(false)} />
          </div>
        </div>
      )}

      {/* Share Links Modal */}
      {showShareLinks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl h-[80vh] bg-asgard-surface border border-asgard-border rounded-2xl overflow-hidden shadow-modal">
            <ShareLinksManager onClose={() => setShowShareLinks(false)} />
          </div>
        </div>
      )}

      {/* Download History Modal */}
      {showDownloads && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl h-[80vh] bg-asgard-surface border border-asgard-border rounded-2xl overflow-hidden shadow-modal">
            <DownloadHistory onClose={() => setShowDownloads(false)} />
          </div>
        </div>
      )}

      {/* Favorites Modal */}
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
      addToast({ type: 'success', title: 'Permission granted' })
      await refreshDeviceList()
    } else {
      addToast({ type: 'error', title: 'Permission denied' })
    }
  }

  const handleMicChange = async (deviceId: string) => {
    setSelectedMic(deviceId)
    mediaDeviceService.setPreferredDevice('audioinput', deviceId)
    addToast({ type: 'success', title: 'Microphone updated' })
    // Restart mic test with new device
    micTestRef.current?.()
    const stop = await mediaDeviceService.testMicrophone(deviceId, setMicLevel).catch(() => null)
    micTestRef.current = stop ?? null
  }

  const handleCamChange = async (deviceId: string) => {
    setSelectedCam(deviceId)
    mediaDeviceService.setPreferredDevice('videoinput', deviceId)
    addToast({ type: 'success', title: 'Camera updated' })
  }

  const handleSpeakerChange = (deviceId: string) => {
    setSelectedSpeaker(deviceId)
    mediaDeviceService.setPreferredDevice('audiooutput', deviceId)
    addToast({ type: 'success', title: 'Speaker updated' })
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
      addToast({ type: 'error', title: 'Camera test failed' })
    }
  }

  return (
    <div>
      <SectionHeader title="Devices" subtitle="Configure your audio and video hardware" />
      <div className="space-y-6">
        {/* Permission prompt */}
        {!hasPermission && (
          <div className="glass rounded-xl p-4 border border-asgard-glacier/20">
            <p className="text-sm text-asgard-text-primary mb-2">Microphone & Camera Access</p>
            <p className="text-xs text-asgard-text-muted mb-3">
              Grant permission to see device names and configure your hardware.
            </p>
            <Button variant="secondary" size="sm" onClick={handleRequestPermission}>
              Grant Permission
            </Button>
          </div>
        )}

        {/* Microphone selection */}
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-2">
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
              </svg>
              Microphone
            </span>
          </label>
          <select
            value={selectedMic}
            onChange={(e) => handleMicChange(e.target.value)}
            className="asgard-input w-full text-sm"
          >
            {microphones.length === 0 && <option value="">No microphone detected</option>}
            {microphones.map((mic) => (
              <option key={mic.deviceId} value={mic.deviceId}>{mic.label}</option>
            ))}
          </select>

          {/* Mic level indicator */}
          {selectedMic && (
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={handleTestMic}
                className="text-xs text-asgard-glacier hover:underline"
              >
                {micTestRef.current ? 'Stop test' : 'Test mic'}
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

        {/* Camera selection */}
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-2">
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
              Camera
            </span>
          </label>
          <select
            value={selectedCam}
            onChange={(e) => handleCamChange(e.target.value)}
            className="asgard-input w-full text-sm"
          >
            {cameras.length === 0 && <option value="">No camera detected</option>}
            {cameras.map((cam) => (
              <option key={cam.deviceId} value={cam.deviceId}>{cam.label}</option>
            ))}
          </select>

          {/* Camera preview */}
          {selectedCam && (
            <div className="mt-2">
              <button
                onClick={handleTestCamera}
                className="text-xs text-asgard-glacier hover:underline mb-2"
              >
                {cameraTestRef.current ? 'Stop preview' : 'Test camera'}
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

        {/* Speaker selection */}
        <div>
          <label className="text-sm font-medium text-asgard-text-secondary block mb-2">
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier">
                <path d="M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM7 4h10v8H7V4zm0 14v-4h10v4H7z"/>
              </svg>
              Speaker
            </span>
          </label>
          <select
            value={selectedSpeaker}
            onChange={(e) => handleSpeakerChange(e.target.value)}
            className="asgard-input w-full text-sm"
          >
            {speakers.length === 0 && <option value="">Default speaker</option>}
            {speakers.map((spk) => (
              <option key={spk.deviceId} value={spk.deviceId}>{spk.label}</option>
            ))}
          </select>
        </div>

        {/* Device count info */}
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-semibold text-asgard-text-muted uppercase tracking-wider mb-2">
            Detected Hardware
          </p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-lg font-semibold text-asgard-glacier">{microphones.length}</p>
              <p className="text-xs text-asgard-text-muted">Microphones</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-asgard-glacier">{cameras.length}</p>
              <p className="text-xs text-asgard-text-muted">Cameras</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-asgard-glacier">{speakers.length}</p>
              <p className="text-xs text-asgard-text-muted">Speakers</p>
            </div>
          </div>
          <p className="text-xs text-asgard-text-muted mt-3 text-center">
            Devices are auto-detected. Changes are applied in real-time.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── About Section ────────────────────────────────────────────────────────────

const XELIS_ADDRESS = 'xel:fzete660pp676sez3cvfpjmma00xe3q5lz4f8wcm9z5kf2p6guvsqdevkpq'

const AboutSection: React.FC = () => {
  const addToast = useUIStore((s) => s.addToast)

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(XELIS_ADDRESS)
      addToast({ type: 'success', title: 'Address copied to clipboard', duration: 3000 })
    } catch {
      addToast({ type: 'error', title: 'Failed to copy address', duration: 3000 })
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
      <SectionHeader title="About Asgard" subtitle="Version and legal information" />
      <div className="space-y-4">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center">
              <img src="./asgard-icon.svg" alt="Asgard" className="w-full h-full" />
            </div>
            <div>
              <p className="font-semibold text-asgard-text-primary">Asgard</p>
              <p className="text-sm text-asgard-text-muted">Asgard 2026</p>
            </div>
          </div>
          <p className="text-xs text-asgard-text-muted leading-relaxed mb-4">
            Decentralized P2P messenger powered by Pear Runtime and Hypercore Protocol.
            No servers. No surveillance. No compromise.
          </p>

          {/* Donation section */}
          <div className="border-t border-asgard-border pt-4 mt-2">
            <p className="text-sm text-asgard-text-primary font-medium mb-1">
              Do you like the Asgard app?
            </p>
            <p className="text-xs text-asgard-text-secondary leading-relaxed mb-3">
              Make a donation to us in{' '}
              <button
                onClick={handleOpenXelis}
                className="text-asgard-glacier hover:underline font-medium cursor-pointer"
              >
                XELIS
              </button>{' '}
              at the following address:
            </p>
            <button
              onClick={handleCopyAddress}
              className="w-full glass rounded-lg px-3 py-2.5 text-left group hover:border-asgard-glacier/40 transition-colors cursor-pointer"
            >
              <p className="font-mono text-[11px] text-asgard-glacier break-all leading-relaxed select-all">
                {XELIS_ADDRESS}
              </p>
              <p className="text-[10px] text-asgard-text-muted mt-1.5 group-hover:text-asgard-glacier transition-colors">
                Click to copy
              </p>
            </button>
          </div>

          {/* Trocador link */}
          <div className="border-t border-asgard-border pt-4 mt-2">
            <button
              onClick={handleOpenTrocador}
              className="text-sm text-asgard-glacier hover:underline font-medium cursor-pointer"
            >
              Trade Cryptocurrency Privately
            </button>
          </div>
        </div>
        <div className="space-y-2 text-xs text-asgard-text-muted">
          <p>Built with: Electron, React, TypeScript, Hyperswarm</p>
          <p>© 2026 Asgard. Open source, MIT License.</p>
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
