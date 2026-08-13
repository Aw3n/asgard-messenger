import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/utils/cn'
import { useUIStore } from '@/stores/uiStore'
import { useTranslation } from 'react-i18next'
import type { ThemePreset } from '@/types'

/**
 * ThemeSelector — displays predefined themes with preview colors and custom color editor.
 */
export const ThemeSelector: React.FC = () => {
  const { t } = useTranslation()
  const getThemePresets = useUIStore((s) => s.getThemePresets)
  const applyThemePreset = useUIStore((s) => s.applyThemePreset)
  const settings = useUIStore((s) => s.settings)
  const updateSettings = useUIStore((s) => s.updateSettings)

  const presets = getThemePresets()
  const customTheme = settings.customTheme
  const [showCustomEditor, setShowCustomEditor] = useState(false)

  const handleSelect = (preset: ThemePreset) => {
    applyThemePreset(preset)
  }

  const handleToggleCustom = () => {
    updateSettings({
      customTheme: {
        ...customTheme,
        enabled: !customTheme.enabled,
      },
    })
  }

  const handleColorChange = (key: keyof typeof customTheme, value: string) => {
    if (key === 'accentColor' || key === 'secondaryColor' || key === 'backgroundColor' || 
        key === 'surfaceColor' || key === 'textPrimaryColor' || key === 'textSecondaryColor' || 
        key === 'borderColor') {
      updateSettings({
        customTheme: {
          ...customTheme,
          [key]: value,
        },
      })
    }
  }

  const handleBorderRadiusChange = (value: number) => {
    updateSettings({
      customTheme: {
        ...customTheme,
        borderRadius: value,
      },
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-asgard-text-primary mb-1">{t('settings.themePresets')}</h3>
        <p className="text-xs text-asgard-text-muted mb-3">
          {t('settings.themePresetsDescription')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {presets.map((preset) => {
          const isActive = customTheme.enabled && customTheme.accentColor === preset.settings.accentColor
          return (
            <motion.button
              key={preset.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSelect(preset)}
              className={cn(
                'relative p-3 rounded-xl border-2 transition-all text-left',
                isActive
                  ? 'border-asgard-glacier bg-asgard-glacier/5'
                  : 'border-asgard-border hover:border-asgard-text-muted bg-asgard-surface-alt'
              )}
            >
              {/* Preview colors */}
              <div className="flex gap-1.5 mb-2">
                <div
                  className="w-6 h-6 rounded-full border border-asgard-border"
                  style={{ backgroundColor: preset.preview.primary }}
                />
                <div
                  className="w-6 h-6 rounded-full border border-asgard-border"
                  style={{ backgroundColor: preset.preview.secondary }}
                />
                <div
                  className="w-6 h-6 rounded-full border border-asgard-border"
                  style={{ backgroundColor: preset.preview.background }}
                />
              </div>

              {/* Name and description */}
              <p className="text-sm font-medium text-asgard-text-primary">{preset.name}</p>
              {preset.description && (
                <p className="text-xs text-asgard-text-muted mt-0.5 line-clamp-1">
                  {preset.description}
                </p>
              )}

              {/* Active indicator */}
              {isActive && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-asgard-glacier flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Custom Theme Toggle */}
      <div className="pt-4 border-t border-asgard-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-asgard-text-primary">{t('settings.customColors')}</p>
            <p className="text-xs text-asgard-text-muted">
              {t('settings.customColorsDescription')}
            </p>
          </div>
          <button
            onClick={handleToggleCustom}
            className={cn(
              'relative w-12 h-6 rounded-full transition-colors',
              customTheme.enabled ? 'bg-asgard-glacier' : 'bg-asgard-border'
            )}
          >
            <motion.div
              animate={{ x: customTheme.enabled ? 24 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white"
            />
          </button>
        </div>

        {/* Custom Color Editor */}
        <AnimatePresence>
          {showCustomEditor && customTheme.enabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-4 space-y-4">
                {/* Accent Color */}
                <ColorPicker
                  label={t('settings.accentColor')}
                  value={customTheme.accentColor}
                  onChange={(v) => handleColorChange('accentColor', v)}
                />

                {/* Secondary Color */}
                <ColorPicker
                  label={t('settings.secondaryColor')}
                  value={customTheme.secondaryColor}
                  onChange={(v) => handleColorChange('secondaryColor', v)}
                />

                {/* Background Color */}
                <ColorPicker
                  label={t('settings.backgroundColor')}
                  value={customTheme.backgroundColor}
                  onChange={(v) => handleColorChange('backgroundColor', v)}
                />

                {/* Surface Color */}
                <ColorPicker
                  label={t('settings.surfaceColor')}
                  value={customTheme.surfaceColor}
                  onChange={(v) => handleColorChange('surfaceColor', v)}
                />

                {/* Text Primary Color */}
                <ColorPicker
                  label={t('settings.textPrimaryColor')}
                  value={customTheme.textPrimaryColor}
                  onChange={(v) => handleColorChange('textPrimaryColor', v)}
                />

                {/* Text Secondary Color */}
                <ColorPicker
                  label={t('settings.textSecondaryColor')}
                  value={customTheme.textSecondaryColor}
                  onChange={(v) => handleColorChange('textSecondaryColor', v)}
                />

                {/* Border Color */}
                <ColorPicker
                  label={t('settings.borderColor')}
                  value={customTheme.borderColor}
                  onChange={(v) => handleColorChange('borderColor', v)}
                />

                {/* Border Radius */}
                <div>
                  <label className="text-xs font-medium text-asgard-text-secondary block mb-2">
                    {t('settings.borderRadius')}: {customTheme.borderRadius}px
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    value={customTheme.borderRadius}
                    onChange={(e) => handleBorderRadiusChange(parseInt(e.target.value))}
                    className="w-full h-2 bg-asgard-border rounded-lg appearance-none cursor-pointer accent-asgard-glacier"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle Editor Button */}
        {customTheme.enabled && (
          <button
            onClick={() => setShowCustomEditor(!showCustomEditor)}
            className="mt-3 text-xs text-asgard-glacier hover:underline flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d={showCustomEditor 
                ? "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"
                : "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"
              }/>
            </svg>
             {showCustomEditor ? t('common.hide') : t('common.show')} {t('settings.colorEditor').toLowerCase()}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Color Picker Component ──────────────────────────────────────────────────

interface ColorPickerProps {
  label: string
  value: string
  onChange: (value: string) => void
}

const ColorPicker: React.FC<ColorPickerProps> = ({ label, value, onChange }) => {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs font-medium text-asgard-text-secondary">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded-lg border border-asgard-border cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 px-2 py-1 text-xs bg-asgard-surface border border-asgard-border rounded text-asgard-text-primary"
        />
      </div>
    </div>
  )
}
