import React from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ConversationList } from './components/ConversationList'
import { useUIStore } from '@/stores/uiStore'
import { ChatEmptyState } from './components/ChatEmptyState'

const LIST_PANE_ID = 'conversation-list-pane'

/**
 * ConversationsPage — two-pane layout.
 * Left: conversation list (280px, escamotable)
 * Right: active chat view or empty state
 */
export const ConversationsPage: React.FC = () => {
  const openModal = useUIStore((s) => s.openModal)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const { conversationId } = useParams()
  const { t } = useTranslation()

  // La combinaison `toggleSidebar` (Ctrl+B par défaut) n'avait aucun lecteur :
  // `sidebarCollapsed` était écrit dans le store et persisté sans que l'écran
  // ne le consulte jamais. Le geste doit aussi rester annulable à la souris,
  // sinon le clavier devient la seule sortie d'un panneau refermé par erreur.
  const toggleLabel = `${collapsed ? t('common.show') : t('common.hide')} — ${t('nav.messages')}`

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>

      {/* ── Left panel: conversation list ── */}
      {!collapsed && (
        <div
          id={LIST_PANE_ID}
          style={{
            width: '280px',
            flexShrink: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(11,14,26,0.98)',
          }}
        >
          <ConversationList onNewChat={() => openModal('addContact')} />
        </div>
      )}

      {/* Garde du panneau de liste */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={toggleLabel}
        title={toggleLabel}
        aria-expanded={!collapsed}
        aria-controls={collapsed ? undefined : LIST_PANE_ID}
        style={{
          width: 28,
          flexShrink: 0,
          padding: '12px 0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          background: 'rgba(11,14,26,0.98)',
          color: '#8A93B5',
          border: 'none',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          cursor: 'pointer',
        }}
      >
        <Chevron collapsed={collapsed} />
      </button>

      {/* ── Right panel: active chat ── */}
      <div style={{
        flex: 1,
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(13,16,28,0.95)',
      }}>
        {conversationId ? <Outlet /> : <ChatEmptyState />}
      </div>

    </div>
  )
}

const Chevron: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ transform: collapsed ? 'rotate(180deg)' : undefined }}
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
)
