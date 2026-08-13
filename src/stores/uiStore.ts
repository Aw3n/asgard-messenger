import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Theme, RightPanelView, ModalState, Toast, AppSettings, ThemePreset } from '@/types'
import { generateId } from '@/utils/id'
import { hexToCssRgb, lightenColor, darkenColor, isColorDark, invertColorForLight } from '@/utils/color'

interface UIState {
  theme: Theme
  sidebarCollapsed: boolean
  rightPanelView: RightPanelView
  modal: ModalState
  toasts: Toast[]
  settings: AppSettings
  isMaximized: boolean
  isSearchOpen: boolean

  // Actions
  setTheme: (theme: Theme) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setRightPanelView: (view: RightPanelView) => void
  openModal: (type: ModalState['type'], props?: Record<string, unknown>) => void
  closeModal: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  updateSettings: (updates: Partial<AppSettings>) => void
  setMaximized: (maximized: boolean) => void
  toggleSearch: () => void
  setSearchOpen: (open: boolean) => void
  exportSettings: () => string
  importSettings: (json: string) => boolean
  resetSettings: () => void
  applyThemePreset: (preset: ThemePreset) => void
  getThemePresets: () => ThemePreset[]
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  language: 'en',
  fontSize: 'medium',
  compactMode: 'comfortable',
  notifications: {
    enabled: true,
    sound: true,
    dndMode: false,
    showPreview: true,
    mentionsOnly: false,
  },
  privacy: {
    readReceipts: true,
    typingIndicators: true,
    onlineStatus: true,
    lastSeen: 'contacts',
  },
  storage: {
    autoDownload: {
      images: true,
      videos: false,
      documents: false,
      audio: true,
      maxSize: 50,
    },
    downloadPath: '',
    cacheSize: 500,
  },
  network: {
    relayEnabled: true,
    maxPeers: 64,
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    screenReader: false,
    keyboardNav: true,
    ttsEnabled: false,
    largerTouchTargets: false,
  },
  chat: {
    sendOnEnter: true,
    showTimestamps: true,
    showSeconds: false,
    density: 'comfortable',
    autoEmoji: true,
    inlinePreviews: true,
    collapseMessages: false,
    showReadStatus: true,
  },
  media: {
    autoPlayVideos: true,
    autoPlayGifs: true,
    videoQuality: 'auto',
    audioQuality: 'medium',
    muteByDefault: true,
    showVideoControls: true,
    imageZoom: 1,
    compressVideos: true,
    compressImages: true,
  },
  keyboardShortcuts: {
    sendMessage: 'Enter',
    newLine: 'Shift+Enter',
    openSearch: 'Ctrl+K',
    closeModal: 'Escape',
    toggleSidebar: 'Ctrl+B',
    nextConversation: 'Ctrl+ArrowDown',
    prevConversation: 'Ctrl+ArrowUp',
    openSettings: 'Ctrl+,',
    openProfile: 'Ctrl+P',
    focusInput: 'Ctrl+I',
    deleteMessage: 'Delete',
    editLastMessage: 'Ctrl+E',
    replyToMessage: 'Ctrl+R',
    forwardMessage: 'Ctrl+F',
    copyMessage: 'Ctrl+C',
  },
  customTheme: {
    enabled: false,
    accentColor: '#4A90E2',
    secondaryColor: '#7B68EE',
    backgroundColor: '#1a1b23',
    surfaceColor: '#252630',
    textPrimaryColor: '#ffffff',
    textSecondaryColor: '#a0a0a0',
    borderColor: '#3a3b45',
    useGradient: true,
    borderRadius: 12,
  },
  appearance: {
    theme: 'dark',
    fontSize: 'medium',
    compactMode: 'comfortable',
  },
}

// ─── Predefined Theme Presets ────────────────────────────────────────────────

const themePresets: ThemePreset[] = [
  {
    id: 'nordic',
    name: 'Nordic',
    description: 'Default Asgard theme with glacier blue accents',
    preview: { primary: '#4FC3F7', secondary: '#7B68EE', background: '#1a1b23' },
    settings: {
      accentColor: '#4FC3F7',
      secondaryColor: '#7B68EE',
      backgroundColor: '#1a1b23',
      surfaceColor: '#252630',
      textPrimaryColor: '#ffffff',
      textSecondaryColor: '#a0a0a0',
      borderColor: '#3a3b45',
      useGradient: true,
      borderRadius: 12,
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep blue ocean theme',
    preview: { primary: '#00BCD4', secondary: '#0097A7', background: '#0d1b2a' },
    settings: {
      accentColor: '#00BCD4',
      secondaryColor: '#0097A7',
      backgroundColor: '#0d1b2a',
      surfaceColor: '#1b263b',
      textPrimaryColor: '#e0e1dd',
      textSecondaryColor: '#778da9',
      borderColor: '#415a77',
      useGradient: true,
      borderRadius: 12,
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Natural green forest theme',
    preview: { primary: '#4CAF50', secondary: '#2E7D32', background: '#1a2e1a' },
    settings: {
      accentColor: '#4CAF50',
      secondaryColor: '#2E7D32',
      backgroundColor: '#1a2e1a',
      surfaceColor: '#2d4a2d',
      textPrimaryColor: '#e8f5e9',
      textSecondaryColor: '#a5d6a7',
      borderColor: '#4a7c4a',
      useGradient: true,
      borderRadius: 10,
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange and pink sunset theme',
    preview: { primary: '#FF5722', secondary: '#E91E63', background: '#2d1b2e' },
    settings: {
      accentColor: '#FF5722',
      secondaryColor: '#E91E63',
      backgroundColor: '#2d1b2e',
      surfaceColor: '#3d2b3e',
      textPrimaryColor: '#fce4ec',
      textSecondaryColor: '#f48fb1',
      borderColor: '#6d3b4e',
      useGradient: true,
      borderRadius: 14,
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Dark purple midnight theme',
    preview: { primary: '#9C27B0', secondary: '#673AB7', background: '#121212' },
    settings: {
      accentColor: '#9C27B0',
      secondaryColor: '#673AB7',
      backgroundColor: '#121212',
      surfaceColor: '#1e1e1e',
      textPrimaryColor: '#e0e0e0',
      textSecondaryColor: '#a0a0a0',
      borderColor: '#333333',
      useGradient: true,
      borderRadius: 8,
    },
  },
  {
    id: 'arctic',
    name: 'Arctic',
    description: 'Light arctic ice theme',
    preview: { primary: '#29B6F6', secondary: '#0288D1', background: '#f5f9ff' },
    settings: {
      accentColor: '#29B6F6',
      secondaryColor: '#0288D1',
      backgroundColor: '#f5f9ff',
      surfaceColor: '#ffffff',
      textPrimaryColor: '#1a237e',
      textSecondaryColor: '#5c6bc0',
      borderColor: '#c5cae9',
      useGradient: false,
      borderRadius: 12,
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Vibrant aurora borealis with cyan, green and purple',
    preview: { primary: '#00E5FF', secondary: '#76FF03', background: '#0a0e1a' },
    settings: {
      accentColor: '#00E5FF',
      secondaryColor: '#76FF03',
      backgroundColor: '#0a0e1a',
      surfaceColor: '#141824',
      textPrimaryColor: '#e0f7fa',
      textSecondaryColor: '#80cbc4',
      borderColor: '#1e3a5f',
      useGradient: true,
      borderRadius: 14,
    },
  },
  {
    id: 'nebula',
    name: 'Nebula',
    description: 'Cosmic nebula with deep purple and pink',
    preview: { primary: '#E040FB', secondary: '#7C4DFF', background: '#0d0221' },
    settings: {
      accentColor: '#E040FB',
      secondaryColor: '#7C4DFF',
      backgroundColor: '#0d0221',
      surfaceColor: '#1a0a3e',
      textPrimaryColor: '#f3e5f5',
      textSecondaryColor: '#ce93d8',
      borderColor: '#4a148c',
      useGradient: true,
      borderRadius: 16,
    },
  },
]

/**
 * Apply custom theme colors to CSS variables.
 * Uses a dynamic <style> element to respect dark/light mode.
 */
function applyCustomThemeToCSS(customTheme: AppSettings['customTheme']) {
  if (!customTheme?.enabled) return

  // Remove existing dynamic style
  const existingStyle = document.getElementById('asgard-custom-theme')
  if (existingStyle) existingStyle.remove()

  // Create new dynamic style element
  const styleEl = document.createElement('style')
  styleEl.id = 'asgard-custom-theme'

  // Helper to convert hex to CSS RGB
  const toRgb = (hex: string | undefined, fallback: string): string => {
    const rgb = hexToCssRgb(hex || fallback)
    return rgb || hexToCssRgb(fallback)!
  }

  // Dark mode variables - match globals.css hierarchy:
  // deep-black(5) < black(10) < surface(15) < surface-alt(20)
  const darkBg = customTheme.backgroundColor || '#1a1b23'
  const darkVars = `
    --asgard-accent: ${toRgb(customTheme.accentColor, '#4FC3F7')};
    --asgard-glacier: ${toRgb(customTheme.accentColor, '#4FC3F7')};
    --asgard-nordic: ${toRgb(customTheme.accentColor, '#4FC3F7')};
    --asgard-nordic-light: ${toRgb(lightenColor(customTheme.accentColor || '#4FC3F7', 10), '#7B68EE')};
    --asgard-nordic-deep: ${toRgb(darkenColor(customTheme.accentColor || '#4FC3F7', 15), '#1565C0')};
    --asgard-accent-hover: ${toRgb(lightenColor(customTheme.accentColor || '#4FC3F7', 15), '#7B68EE')};
    --asgard-accent-dim: ${toRgb(darkenColor(customTheme.accentColor || '#4FC3F7', 20), '#1565C0')};
    --asgard-cyan: ${toRgb(customTheme.secondaryColor, '#7B68EE')};
    --asgard-cyan-dim: ${toRgb(darkenColor(customTheme.secondaryColor || '#7B68EE', 15), '#5C4BC4')};
    --asgard-cyan-glow: ${toRgb(lightenColor(customTheme.secondaryColor || '#7B68EE', 20), '#9B8BFF')};
    --asgard-deep-black: ${toRgb(darkenColor(darkBg, 10), '#0a0a0f')};
    --asgard-black: ${toRgb(darkenColor(darkBg, 5), '#0f1015')};
    --asgard-surface: ${toRgb(darkBg, '#1a1b23')};
    --asgard-surface-alt: ${toRgb(lightenColor(darkBg, 5), '#252630')};
    --asgard-text-primary: ${toRgb(customTheme.textPrimaryColor, '#ffffff')};
    --asgard-text-secondary: ${toRgb(customTheme.textSecondaryColor, '#a0a0a0')};
    --asgard-text-muted: ${toRgb(darkenColor(customTheme.textSecondaryColor || '#a0a0a0', 20), '#707070')};
    --asgard-text-dim: ${toRgb(darkenColor(customTheme.textSecondaryColor || '#a0a0a0', 40), '#404040')};
    --asgard-border: ${toRgb(customTheme.borderColor, '#3a3b45')};
    --asgard-border-alt: ${toRgb(lightenColor(customTheme.borderColor || '#3a3b45', 10), '#4a4b55')};
  `

  // Light mode variables - match globals.css hierarchy:
  // deep-black(235) < black(245) < surface-alt(248) < surface(255)
  const isDarkTheme = isColorDark(customTheme.backgroundColor || '#1a1b23')
  
  // For dark themes, invert colors for light mode
  const lightAccent = isDarkTheme 
    ? darkenColor(customTheme.accentColor || '#4FC3F7', 10)
    : (customTheme.accentColor || '#29B6F6')
  const lightSecondary = isDarkTheme 
    ? darkenColor(customTheme.secondaryColor || '#7B68EE', 10)
    : (customTheme.secondaryColor || '#0288D1')
  const lightBg = isDarkTheme 
    ? invertColorForLight(customTheme.backgroundColor || '#1a1b23')
    : (customTheme.backgroundColor || '#f5f9ff')
  const lightTextPrimary = isDarkTheme 
    ? darkenColor(customTheme.textPrimaryColor || '#ffffff', 85)
    : (customTheme.textPrimaryColor || '#1a237e')
  const lightTextSecondary = isDarkTheme 
    ? darkenColor(customTheme.textSecondaryColor || '#a0a0a0', 55)
    : (customTheme.textSecondaryColor || '#5c6bc0')
  const lightBorder = isDarkTheme 
    ? darkenColor(lightBg, 12)
    : (customTheme.borderColor || '#c5cae9')

  const lightVars = `
    --asgard-accent: ${toRgb(lightAccent, '#29B6F6')};
    --asgard-glacier: ${toRgb(lightAccent, '#29B6F6')};
    --asgard-nordic: ${toRgb(lightAccent, '#29B6F6')};
    --asgard-nordic-light: ${toRgb(lightenColor(lightAccent, 10), '#4FC3F7')};
    --asgard-nordic-deep: ${toRgb(darkenColor(lightAccent, 15), '#0277BD')};
    --asgard-accent-hover: ${toRgb(lightenColor(lightAccent, 15), '#4FC3F7')};
    --asgard-accent-dim: ${toRgb(darkenColor(lightAccent, 20), '#01579B')};
    --asgard-cyan: ${toRgb(lightSecondary, '#0288D1')};
    --asgard-cyan-dim: ${toRgb(darkenColor(lightSecondary, 15), '#01579B')};
    --asgard-cyan-glow: ${toRgb(lightenColor(lightSecondary, 20), '#4FC3F7')};
    --asgard-deep-black: ${toRgb(darkenColor(lightBg, 8), '#e8f0f8')};
    --asgard-black: ${toRgb(lightBg, '#f5f9ff')};
    --asgard-surface-alt: ${toRgb(lightenColor(lightBg, 2), '#f8f9fc')};
    --asgard-surface: ${toRgb(lightenColor(lightBg, 5), '#ffffff')};
    --asgard-text-primary: ${toRgb(lightTextPrimary, '#1a237e')};
    --asgard-text-secondary: ${toRgb(lightTextSecondary, '#5c6bc0')};
    --asgard-text-muted: ${toRgb(lightenColor(lightTextSecondary, 25), '#9fa8da')};
    --asgard-text-dim: ${toRgb(lightenColor(lightTextSecondary, 45), '#c5cae9')};
    --asgard-border: ${toRgb(lightBorder, '#c5cae9')};
    --asgard-border-alt: ${toRgb(darkenColor(lightBorder, 10), '#9fa8da')};
  `

  styleEl.textContent = `
    html.dark {
      ${darkVars}
    }
    html.light {
      ${lightVars}
    }
    :root {
      --asgard-border-radius: ${customTheme.borderRadius}px;
    }
  `

  document.head.appendChild(styleEl)
}

/**
 * Remove custom theme colors from CSS variables (revert to defaults).
 */
function removeCustomThemeFromCSS() {
  const styleEl = document.getElementById('asgard-custom-theme')
  if (styleEl) {
    styleEl.remove()
  }
}

/**
 * UI store — manages global UI state: theme, modals, toasts, layout.
 */
export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      rightPanelView: null,
      modal: { type: null },
      toasts: [],
      settings: defaultSettings,
      isMaximized: false,
      isSearchOpen: false,

      setTheme: (theme) => {
        set({ theme })
        const root = document.documentElement
        root.classList.remove('dark', 'light')
        if (theme === 'system') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
          root.classList.add(prefersDark ? 'dark' : 'light')
        } else {
          root.classList.add(theme)
        }
        // Reapply custom theme CSS if enabled (to ensure variables are correct for new mode)
        const currentSettings = get().settings
        if (currentSettings.customTheme?.enabled) {
          applyCustomThemeToCSS(currentSettings.customTheme)
        }
      },

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setRightPanelView: (view) => {
        const current = get().rightPanelView
        set({ rightPanelView: current === view ? null : view })
      },

      openModal: (type, props) => set({ modal: { type, props } }),

      closeModal: () => set({ modal: { type: null } }),

      addToast: (toast) => {
        const id = generateId()
        const newToast: Toast = { ...toast, id }
        set((s) => ({ toasts: [...s.toasts, newToast] }))

        // Auto-remove after duration
        const duration = toast.duration ?? 4000
        if (duration > 0) {
          setTimeout(() => get().removeToast(id), duration)
        }
      },

      removeToast: (id) => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      },

      updateSettings: (updates) => {
        const current = get().settings
        const newSettings = { ...current, ...updates }
        set({ settings: newSettings })
        
        // If customTheme was updated, apply or remove it
        if (updates.customTheme !== undefined) {
          if (updates.customTheme.enabled) {
            applyCustomThemeToCSS(newSettings.customTheme)
          } else {
            removeCustomThemeFromCSS()
          }
        }
      },

      setMaximized: (maximized) => set({ isMaximized: maximized }),

      toggleSearch: () => set((s) => ({ isSearchOpen: !s.isSearchOpen })),

      setSearchOpen: (open) => set({ isSearchOpen: open }),

      exportSettings: () => {
        const settings = get().settings
        return JSON.stringify(settings, null, 2)
      },

      importSettings: (json: string) => {
        try {
          const parsed = JSON.parse(json) as Partial<AppSettings>
          const current = get().settings
          // Merge with current settings to preserve any missing keys
          const merged = { ...current, ...parsed }
          set({ settings: merged })
          return true
        } catch {
          return false
        }
      },

      resetSettings: () => {
        set({ settings: defaultSettings })
      },

      applyThemePreset: (preset) => {
        const current = get().settings
        const newSettings = {
          ...current,
          customTheme: {
            ...preset.settings,
            enabled: true,
          },
        }
        set({ settings: newSettings })
        // Apply the custom theme to CSS
        applyCustomThemeToCSS(newSettings.customTheme)
      },

      getThemePresets: () => {
        return themePresets
      },
    }),
    {
      name: 'asgard-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        settings: state.settings,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            // Migrate settings: merge with defaults to ensure all properties exist
            state.settings = {
              ...defaultSettings,
              ...state.settings,
              chat: { ...defaultSettings.chat, ...state.settings.chat },
              media: { ...defaultSettings.media, ...state.settings.media },
              accessibility: { ...defaultSettings.accessibility, ...state.settings.accessibility },
              notifications: { ...defaultSettings.notifications, ...state.settings.notifications },
              privacy: { ...defaultSettings.privacy, ...state.settings.privacy },
              appearance: { ...defaultSettings.appearance, ...state.settings.appearance },
              network: { ...defaultSettings.network, ...state.settings.network },
              keyboardShortcuts: { ...defaultSettings.keyboardShortcuts, ...state.settings.keyboardShortcuts },
              customTheme: { ...defaultSettings.customTheme, ...state.settings.customTheme },
            }
          }
          if (state?.settings?.customTheme?.enabled) {
            // Apply custom theme after hydration
            setTimeout(() => applyCustomThemeToCSS(state.settings.customTheme), 0)
          }
          // Apply theme class
          if (state?.theme) {
            const root = document.documentElement
            root.classList.remove('dark', 'light')
            if (state.theme === 'system') {
              const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
              root.classList.add(prefersDark ? 'dark' : 'light')
            } else {
              root.classList.add(state.theme)
            }
          }
        }
      },
    }
  )
)
