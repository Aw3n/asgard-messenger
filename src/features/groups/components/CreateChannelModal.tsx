import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useGroupStore } from '@/stores/groupStore'
import { useUIStore } from '@/stores/uiStore'
import { groupService } from '@/services/GroupService'
import { channelPermissionsFor, normalizeChannelName } from '@/utils/groupPermissions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useDialogBehavior } from '@/hooks/useDialogBehavior'
import type { ChannelType, GroupChannel, MemberRole } from '@/types'

const CHANNEL_TYPES: ChannelType[] = ['text', 'announcement', 'readonly']

const NO_CHANNELS: GroupChannel[] = []

/** Un type sans explication sur qui pourra écrire n'est qu'un nom : le rappel
 *  reprend les libellés de rôles déjà employés dans la liste des membres. */
const TYPE_LABEL: Record<ChannelType, string> = {
  text: 'groups.channelTypeText',
  announcement: 'groups.channelTypeAnnouncement',
  readonly: 'groups.channelTypeReadonly',
  voice: 'groups.voiceChannels',
}

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: 'common.owner',
  admin: 'common.admin',
  moderator: 'common.moderator',
  member: 'common.member',
  guest: 'common.guest',
}

interface CreateChannelModalProps {
  groupId: string
  onClose: () => void
}

/**
 * CreateChannelModal — le service savait créer et diffuser un canal, mais
 * aucune vue ne le proposait : les canaux d'un groupe restaient figés à ceux de
 * la création. Le type est choisi ici parce qu'il décide de qui pourra publier
 * dans le canal (voir channelPermissionsFor).
 */
export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({ groupId, onClose }) => {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [type, setType] = useState<ChannelType>('text')
  const [isCreating, setIsCreating] = useState(false)
  const addToast = useUIStore((s) => s.addToast)
  const dialogRef = useDialogBehavior(onClose)

  // Référence stable : un sélecteur qui rend un tableau neuf à chaque rendu
  // ferait relire le composant par n'importe quel changement du store.
  const channels = useGroupStore((s) => s.groups[groupId]?.channels ?? NO_CHANNELS)
  const setActiveChannel = useGroupStore((s) => s.setActiveChannel)

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      addToast({ type: 'warning', title: t('groups.channelNameRequired') })
      return
    }
    const slug = normalizeChannelName(trimmed)
    // Les canaux créés avant la normalisation portent un nom brut : côté
    // comparé aussi, sinon « General Chat » et « general-chat » coexistent.
    if (channels.some((channel) => normalizeChannelName(channel.name) === slug)) {
      addToast({ type: 'warning', title: t('groups.channelNameExists') })
      return
    }

    setIsCreating(true)
    try {
      const channel = await groupService.addChannel(groupId, { name: trimmed, type })
      if (!channel) {
        addToast({ type: 'error', title: t('groups.channelCreateFailed') })
        return
      }
      setActiveChannel(channel.id)
      addToast({ type: 'success', title: t('groups.channelCreated') })
      onClose()
    } catch (err) {
      addToast({ type: 'error', title: t('groups.channelCreateFailed') })
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
        ref={dialogRef}
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        role="dialog"
        aria-modal="true"
        aria-label={t('groups.createChannel')}
        tabIndex={-1}
        className="mica-card border border-asgard-border rounded-3xl p-6 w-full max-w-md mx-4 shadow-modal focus:outline-none"
      >
        <h3 className="text-lg font-semibold text-asgard-text-primary mb-5">{t('groups.createChannel')}</h3>

        <div className="space-y-4">
          <Input
            label={t('groups.channelName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            autoFocus
          />

          <div role="radiogroup" aria-label={t('groups.channelType')} className="flex flex-col gap-1.5">
            {CHANNEL_TYPES.map((option) => (
              <label
                key={option}
                className="flex items-start gap-2 p-2 rounded-lg hover:bg-asgard-surface-alt cursor-pointer"
              >
                <input
                  type="radio"
                  name="channel-type"
                  value={option}
                  checked={type === option}
                  onChange={() => setType(option)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm text-asgard-text-primary">{t(TYPE_LABEL[option])}</span>
                  <span className="block text-xs text-asgard-text-muted">
                    {t('groups.channelTypeWhoWrites', {
                      roles: channelPermissionsFor(option)
                        .send.map((role) => t(ROLE_LABEL[role]))
                        .join(', '),
                    })}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="ghost" fullWidth onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button fullWidth onClick={handleCreate} disabled={!name.trim()} loading={isCreating}>
            {t('common.create')}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
