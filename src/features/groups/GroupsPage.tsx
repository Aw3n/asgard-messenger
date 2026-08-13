import React, { useState } from 'react'
import { GroupList } from './components/GroupList'
import { GroupView } from './components/GroupView'
import { CreateGroupModal } from './components/CreateGroupModal'
import { useGroupStore } from '@/stores/groupStore'
import { PageTransition } from '@/components/ui/PageTransition'
import { useTranslation } from 'react-i18next'

/**
 * GroupsPage — two-panel layout: group list on the left, group view on the right.
 */
export const GroupsPage: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { t } = useTranslation()

  return (
    <PageTransition>
    <div className="flex h-full overflow-hidden">
      {/* Left panel — Group list */}
      <div className="w-72 min-w-[280px] border-r border-asgard-border/30 flex flex-col bg-asgard-bg-secondary/50">
        <div className="p-4 border-b border-asgard-border/20">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-asgard-text-primary">{t('groups.title')}</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-8 h-8 rounded-lg bg-asgard-nordic/10 hover:bg-asgard-nordic/20 border border-asgard-nordic/20 flex items-center justify-center transition-colors"
              title={t('groups.createGroup')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier/80">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </button>
          </div>
        </div>
        <GroupList onCreateGroup={() => setShowCreateModal(true)} />
      </div>

      {/* Right panel — Group view */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeGroupId ? (
          <GroupView />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-3xl bg-asgard-nordic/10 border border-asgard-nordic/20 flex items-center justify-center mx-auto mb-4">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-glacier/40">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-asgard-text-primary mb-2">{t('groups.title')}</h3>
              <p className="text-sm text-asgard-text-muted max-w-xs">
                Select a group to start chatting, or create a new one.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Create group modal */}
      {showCreateModal && (
        <CreateGroupModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
    </PageTransition>
  )
}
