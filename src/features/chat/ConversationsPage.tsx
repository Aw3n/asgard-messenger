import React from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { ConversationList } from './components/ConversationList'
import { useUIStore } from '@/stores/uiStore'
import { ChatEmptyState } from './components/ChatEmptyState'

/**
 * ConversationsPage — two-pane layout.
 * Left: conversation list (280px fixed)
 * Right: active chat view or empty state
 */
export const ConversationsPage: React.FC = () => {
  const openModal = useUIStore((s) => s.openModal)
  const { conversationId } = useParams()

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>

      {/* ── Left panel: conversation list ── */}
      <div style={{
        width: '280px',
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(11,14,26,0.98)',
      }}>
        <ConversationList onNewChat={() => openModal('addContact')} />
      </div>

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
