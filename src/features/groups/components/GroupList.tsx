import React, { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useGroupStore } from '@/stores/groupStore'
import { GroupItem } from './GroupItem'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

interface GroupListProps {
  onCreateGroup: () => void
}

/**
 * GroupList — left panel listing all groups with search and create button.
 */
export const GroupList: React.FC<GroupListProps> = ({ onCreateGroup }) => {
  const {
    activeGroupId,
    setActiveGroup,
    getFilteredGroups,
    searchQuery,
  } = useGroupStore()

  const [localSearch, setLocalSearch] = useState(searchQuery)
  const groups = getFilteredGroups()

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalSearch(value)
    useGroupStore.setState((s) => ({ ...s, searchQuery: value }))
  }

  return (
    <div className="flex flex-col h-full bg-asgard-surface border-r border-asgard-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-asgard-border flex-shrink-0">
        <h2 className="text-base font-semibold text-asgard-text-primary">Groups</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreateGroup}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          }
        >
          Create
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 flex-shrink-0">
        <Input
          placeholder="Search groups..."
          value={localSearch}
          onChange={handleSearch}
          onClear={localSearch ? () => {
            setLocalSearch('')
            useGroupStore.setState((s) => ({ ...s, searchQuery: '' }))
          } : undefined}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
          }
        />
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        <AnimatePresence>
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-asgard-surface-alt flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-white/20">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              </div>
              {localSearch ? (
                <p className="text-sm text-asgard-text-muted">No groups found</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-asgard-text-secondary mb-1">No groups yet</p>
                  <p className="text-xs text-asgard-text-muted mb-3">Create a group to start collaborating</p>
                  <button
                    onClick={onCreateGroup}
                    className="text-xs text-asgard-glacier hover:underline"
                  >
                    Create your first group
                  </button>
                </>
              )}
            </div>
          ) : (
            groups.map((group) => (
              <GroupItem
                key={group.id}
                group={group}
                isActive={group.id === activeGroupId}
                onClick={() => setActiveGroup(group.id)}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
