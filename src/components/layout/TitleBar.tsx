import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * TitleBar — React component occupying the title bar region (38px).
 * Platform-specific behavior:
 * - Windows: native controls (−□×) are on the right via Electron titleBarOverlay.
 * - macOS: traffic lights are on the left via hiddenInset; we add left padding.
 * - Linux: frameless window, so we render custom controls (−□×) on the right.
 */
export const TitleBar: React.FC = () => {
  const { t } = useTranslation()
  const [platform, setPlatform] = useState<string>('win32')
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.asgard?.app?.getPlatform) {
      setPlatform(window.asgard.app.getPlatform())
    }
    if (typeof window !== 'undefined' && window.asgard?.window?.onMaximizeChange) {
      const cleanup = window.asgard.window.onMaximizeChange(setIsMaximized)
      return cleanup
    }
  }, [])

  const minimize = () => window.asgard?.window?.minimize()
  const maximize = () => window.asgard?.window?.maximize()
  const close = () => window.asgard?.window?.close()

  const isMac = platform === 'darwin'
  const isLinux = platform === 'linux'
  const needsCustomControls = isLinux

  const controlButtonStyle = {
    width: '46px',
    height: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    color: '#9BABC8',
    fontSize: '14px',
    cursor: 'pointer',
    WebkitAppRegion: 'no-drag',
    transition: 'background 0.15s ease',
  } as React.CSSProperties

  return (
    <div
      style={{
        height: '38px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: isMac ? '80px' : '14px',
        paddingRight: needsCustomControls ? '0px' : '14px',
        gap: '8px',
        flexShrink: 0,
        // Make entire bar draggable
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        background: 'transparent',
      } as React.CSSProperties}
    >
      {/* Left: Logo + App name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <img src="./asgard-icon.svg" alt={t('titlebar.appName')} width={20} height={20} />
        </div>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#9BABC8',
            letterSpacing: '0.03em',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          {t('titlebar.appName')}
        </span>
      </div>

      {/* Linux: custom window controls */}
      {needsCustomControls && (
        <div style={{ display: 'flex', alignItems: 'center', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            type="button"
            aria-label={t('titlebar.minimize')}
            style={controlButtonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={minimize}
          >
            −
          </button>
          <button
            type="button"
            aria-label={t('titlebar.maximize')}
            style={controlButtonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={maximize}
          >
            {isMaximized ? '❐' : '□'}
          </button>
          <button
            type="button"
            aria-label={t('titlebar.close')}
            style={{ ...controlButtonStyle, color: '#E57474' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(229,116,116,0.2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={close}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
