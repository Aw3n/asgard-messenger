import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/stores/uiStore'
import { ConversationInfoPanel } from './ConversationInfoPanel'
import { MembersPanel } from './MembersPanel'
import { FilesPanel } from './FilesPanel'
import { LinksPanel } from './LinksPanel'
import { useTranslation } from 'react-i18next'
import type { RightPanelView } from '@/types'

/**
 * RightPanel — context-aware right sidebar with tabbed panels.
 * Shows info, members, files, or links depending on the active view.
 */
export const RightPanel: React.FC = () => {
  const { t } = useTranslation()
  const rightPanelView = useUIStore((s) => s.rightPanelView)
  const setRightPanelView = useUIStore((s) => s.setRightPanelView)

  if (!rightPanelView) return null

  const tabs: { view: RightPanelView; label: string; icon: React.ReactNode }[] = [
    {
      view: 'info',
      label: t('panels.info'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
      ),
    },
    {
      view: 'members',
      label: t('chat.members'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
        </svg>
      ),
    },
    {
      view: 'files',
      label: t('panels.files'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
        </svg>
      ),
    },
    {
      view: 'links',
      label: t('panels.links'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
        </svg>
      ),
    },
  ]

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="h-full border-l border-asgard-border/30 bg-asgard-bg-secondary/50 flex flex-col overflow-hidden flex-shrink-0"
    >
      {/* Tab bar */}
      <div className="flex items-center border-b border-asgard-border/20 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.view}
            onClick={() => setRightPanelView(tab.view)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors border-b-2 ${
              rightPanelView === tab.view
                ? 'text-asgard-glacier border-asgard-glacier'
                : 'text-asgard-text-muted border-transparent hover:text-asgard-text-secondary'
            }`}
          >
            {tab.icon}
            <span className="hidden xl:inline">{tab.label}</span>
          </button>
        ))}
        {/* Close button */}
        <button
          onClick={() => setRightPanelView(rightPanelView)}
          className="px-3 py-3 text-asgard-text-muted hover:text-asgard-text-primary transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {rightPanelView === 'info' && <ConversationInfoPanel key="info" />}
          {rightPanelView === 'members' && <MembersPanel key="members" />}
          {rightPanelView === 'files' && <FilesPanel key="files" />}
          {rightPanelView === 'links' && <LinksPanel key="links" />}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
