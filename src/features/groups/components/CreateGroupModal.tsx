import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useUIStore } from '@/stores/uiStore'
import { groupService } from '@/services/GroupService'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useTranslation } from 'react-i18next'

interface CreateGroupModalProps {
  onClose: () => void
}

/**
 * CreateGroupModal — modal for creating a new group.
 * Allows setting name, description, avatar, and privacy.
 */
export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const addToast = useUIStore((s) => s.addToast)

  const handleCreate = async () => {
    if (!name.trim()) {
      addToast({ type: 'warning', title: t('groups.enterGroupName') })
      return
    }

    setIsCreating(true)
    try {
      await groupService.createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        isPublic,
      })
      addToast({ type: 'success', title: t('groups.groupCreated') })
      onClose()
    } catch (err) {
      addToast({ type: 'error', title: t('groups.createGroupFailed') })
      console.error(err)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="mica-card border border-asgard-border rounded-3xl p-6 w-full max-w-md mx-4 shadow-modal"
      >
        <h3 className="text-lg font-semibold text-asgard-text-primary mb-1">{t('groups.createGroup')}</h3>
        <p className="text-sm text-asgard-text-muted mb-5">
          {t('groups.createGroupSubtitle')}
        </p>

        <div className="space-y-4">
          <Input
            label={t('groups.groupName')}
            placeholder={t('groups.groupNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            autoFocus
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-asgard-text-secondary">
              {t('groups.descriptionOptional')}
            </label>
            <textarea
              className="asgard-input w-full p-3 text-sm resize-none"
              placeholder={t('groups.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={200}
            />
          </div>

          {/* Privacy toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-asgard-text-primary">{t('groups.publicGroup')}</p>
              <p className="text-xs text-asgard-text-muted">
                {t('groups.publicGroupHint')}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={isPublic}
              onClick={() => setIsPublic(!isPublic)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isPublic ? 'bg-asgard-glacier' : 'bg-asgard-surface-alt'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isPublic ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="ghost" fullWidth onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button fullWidth onClick={handleCreate} disabled={!name.trim()} loading={isCreating}>
            {isCreating ? t('groups.creating') : t('groups.createGroup')}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
