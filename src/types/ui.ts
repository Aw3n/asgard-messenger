/**
 * UI types — theme, layout, notifications
 */

export type Theme = 'dark' | 'light' | 'system'
export type Language = 'en' | 'fr' | 'de' | 'es' | 'ja' | 'zh'
export type FontSize = 'small' | 'medium' | 'large'
export type CompactMode = 'comfortable' | 'compact' | 'cozy'

export interface AppSettings {
  theme: Theme
  language: Language
  fontSize: FontSize
  compactMode: CompactMode
  notifications: NotificationSettings
  privacy: PrivacySettings
  storage: StorageSettings
  network: NetworkSettings
  accessibility: AccessibilitySettings
  chat: ChatSettings
  media: MediaSettings
  keyboardShortcuts: KeyboardShortcuts
  customTheme: CustomThemeSettings
  /** Appearance sub-section (mirrors theme + fontSize for hydration compat) */
  appearance: {
    theme: Theme
    fontSize: FontSize
    compactMode: CompactMode
    accentColor?: string
  }
}

export interface NotificationSettings {
  enabled: boolean
  sound: boolean
  dndMode: boolean
  dndFrom?: string // HH:MM
  dndTo?: string   // HH:MM
  showPreview: boolean
  mentionsOnly: boolean
}

export interface PrivacySettings {
  readReceipts: boolean
  typingIndicators: boolean
  onlineStatus: boolean
  lastSeen: 'everyone' | 'contacts' | 'nobody'
  linkPreviews?: boolean
}

export interface StorageSettings {
  autoDownload: {
    images: boolean
    videos: boolean
    documents: boolean
    audio: boolean
    maxSize: number // MB
  }
  downloadPath: string
  cacheSize: number // MB
}

export interface NetworkSettings {
  relayEnabled: boolean
  maxPeers: number
  bandwidthLimit?: number // KB/s
}

export interface AccessibilitySettings {
  /** Reduce motion/animations */
  reducedMotion: boolean
  /** High contrast mode */
  highContrast: boolean
  /** Screen reader optimizations */
  screenReader: boolean
  /** Keyboard navigation hints */
  keyboardNav: boolean
  /** Text-to-speech for messages */
  ttsEnabled: boolean
  /** Larger touch targets */
  largerTouchTargets: boolean
}

export interface ChatSettings {
  /** Send message on Enter (vs Shift+Enter for newline) */
  sendOnEnter: boolean
  /** Show timestamps in messages */
  showTimestamps: boolean
  /** Show seconds in timestamps */
  showSeconds: boolean
  /** Message density: comfortable, compact, cozy */
  density: 'comfortable' | 'compact' | 'cozy'
  /** Auto-emoji conversion (e.g., :) → 🙂) */
  autoEmoji: boolean
  /** Inline image previews */
  inlinePreviews: boolean
  /** Collapse consecutive messages from same sender */
  collapseMessages: boolean
  /** Show read status on sent messages */
  showReadStatus: boolean
}

export interface MediaSettings {
  /** Auto-play videos in chat */
  autoPlayVideos: boolean
  /** Auto-play GIFs */
  autoPlayGifs: boolean
  /** Default video quality */
  videoQuality: 'auto' | 'low' | 'medium' | 'high'
  /** Default audio quality */
  audioQuality: 'low' | 'medium' | 'high'
  /** Mute videos by default */
  muteByDefault: boolean
  /** Show video controls */
  showVideoControls: boolean
  /** Image zoom level */
  imageZoom: number
  /** Enable video compression before sending */
  compressVideos: boolean
  /** Enable image compression before sending */
  compressImages: boolean
}

export interface KeyboardShortcuts {
  /** Send message */
  sendMessage: string
  /** New line in message */
  newLine: string
  /** Open search */
  openSearch: string
  /** Close modal */
  closeModal: string
  /** Toggle sidebar */
  toggleSidebar: string
  /** Next conversation */
  nextConversation: string
  /** Previous conversation */
  prevConversation: string
  /** Open settings */
  openSettings: string
  /** Open profile */
  openProfile: string
  /** Focus message input */
  focusInput: string
  /** Delete selected message */
  deleteMessage: string
  /** Edit last message */
  editLastMessage: string
  /** Reply to message */
  replyToMessage: string
  /** Forward message */
  forwardMessage: string
  /** Copy message */
  copyMessage: string
}

export interface CustomThemeSettings {
  /** Enable custom theme (overrides default theme colors) */
  enabled: boolean
  /** Primary accent color (hex) */
  accentColor: string
  /** Secondary accent color (hex) */
  secondaryColor: string
  /** Background color (hex) */
  backgroundColor: string
  /** Surface color (hex) */
  surfaceColor: string
  /** Text primary color (hex) */
  textPrimaryColor: string
  /** Text secondary color (hex) */
  textSecondaryColor: string
  /** Border color (hex) */
  borderColor: string
  /** Use gradient for accents */
  useGradient: boolean
  /** Border radius (px) */
  borderRadius: number
}

/**
 * Predefined theme preset
 */
export interface ThemePreset {
  /** Unique theme ID */
  id: string
  /** Display name */
  name: string
  /** Theme description */
  description?: string
  /** Preview colors for theme selector */
  preview: {
    primary: string
    secondary: string
    background: string
  }
  /** Custom theme settings */
  settings: Omit<CustomThemeSettings, 'enabled'>
}

/** Panel displayed in the right sidebar */
export type RightPanelView = 'info' | 'members' | 'files' | 'links' | 'search' | null

/** Modal types */
export type ModalType =
  | 'addContact'
  | 'createGroup'
  | 'profile'
  | 'settings'
  | 'imageViewer'
  | 'qrCode'
  | 'confirmDelete'
  | null

export interface ModalState {
  type: ModalType
  props?: Record<string, unknown>
}

/** Toast notification */
export interface Toast {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}
