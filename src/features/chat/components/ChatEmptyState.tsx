import React from 'react'
import { useTranslation } from 'react-i18next'

/**
 * ChatEmptyState — shown when no conversation is selected.
 */
export const ChatEmptyState: React.FC = () => {
  const { t } = useTranslation()
  return (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
    color: 'rgba(200,208,232,0.4)',
  }}>
    {/* Icon */}
    <div style={{
      width: '72px',
      height: '72px',
      borderRadius: '20px',
      background: 'rgba(79,195,247,0.08)',
      border: '1px solid rgba(79,195,247,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(79,195,247,0.5)">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
      </svg>
    </div>

    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(200,208,232,0.7)', marginBottom: '6px' }}>
        {t('chat.noConversation')}
      </p>
      <p style={{ fontSize: '13px', color: 'rgba(200,208,232,0.35)', maxWidth: '260px' }}>
        {t('chat.startConversation')}
      </p>
    </div>

    {/* E2E badge */}
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      borderRadius: '20px',
      background: 'rgba(79,195,247,0.06)',
      border: '1px solid rgba(79,195,247,0.12)',
      marginTop: '8px',
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(79,195,247,0.6)">
        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
      </svg>
      <span style={{ fontSize: '11px', color: 'rgba(79,195,247,0.6)', fontWeight: 500 }}>
        {t('chat.e2eEncryption')}
      </span>
    </div>
  </div>
  )
}
