import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useGroupStore } from '@/stores/groupStore'
import { useContactStore } from '@/stores/contactStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { groupService } from '@/services/GroupService'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useDialogBehavior } from '@/hooks/useDialogBehavior'
import { useGestureHint } from '@/hooks/useGestureHint'
import { copyToClipboard } from '@/utils/clipboard'
import type { MemberRole } from '@/types'
import { useTranslation } from 'react-i18next'
import { getCurrentLanguage } from '@/i18n/config'

/**
 * GroupSettings — panel for managing group settings.
 * Includes invite management, member roles, and group metadata editing.
 */
export const GroupSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation()
  const activeGroup = useGroupStore((s) => s.getActiveGroup())
  const identity = useIdentityStore((s) => s.identity)
  const isAdmin = useGroupStore((s) =>
    identity ? s.isAdmin(s.activeGroupId!, identity.keyPair.publicKey) : false
  )
  const dialogRef = useDialogBehavior(onClose)
  const closeGesture = useGestureHint('closeModal', t('common.close'))

  if (!activeGroup) return null

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
        role="dialog"
        aria-modal="true"
        aria-label={t('groups.groupSettingsTitle')}
        tabIndex={-1}
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="mica-card border border-asgard-border rounded-3xl p-6 w-full max-w-lg mx-4 shadow-modal max-h-[80vh] overflow-y-auto focus:outline-none"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-asgard-text-primary">{t('groups.groupSettingsTitle')}</h3>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            title={closeGesture.title}
            aria-keyshortcuts={closeGesture.ariaKeyShortcuts}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-asgard-surface-alt text-asgard-text-muted transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Group info */}
        <div className="flex items-center gap-4 mb-6">
          <Avatar
            src={activeGroup.avatar}
            name={activeGroup.name}
            publicKey={activeGroup.id}
            size="lg"
          />
          <div>
            <h4 className="text-base font-semibold text-asgard-text-primary">{activeGroup.name}</h4>
            <p className="text-xs text-asgard-text-muted">
              {t('groups.memberCount', { count: activeGroup.members.length })} · {t('groups.createdAt')}{' '}
              {new Date(activeGroup.createdAt).toLocaleDateString(getCurrentLanguage())}
            </p>
          </div>
        </div>

        {/* Invite section */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-asgard-text-secondary mb-2">{t('groups.inviteKey')}</h4>
          <InviteSection groupId={activeGroup.id} inviteKey={activeGroup.inviteKey} />
        </div>

        {/* Invite a contact - admin only */}
        {isAdmin && (
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-asgard-text-secondary mb-2">
              {t('groups.inviteMembers')}
            </h4>
            <InviteContactsSection groupId={activeGroup.id} />
          </div>
        )}

        {/* Broadcast mode - admin only */}
        {isAdmin && (
          <BroadcastToggle groupId={activeGroup.id} />
        )}

        {/* Members list with admin actions */}
        {isAdmin && (
          <div>
            <h4 className="text-sm font-semibold text-asgard-text-secondary mb-2">
              {t('groups.memberCount', { count: activeGroup.members.length })}
            </h4>
            <MemberManagement groupId={activeGroup.id} />
          </div>
        )}

        {/* Leave group section */}
        <LeaveGroupSection groupId={activeGroup.id} onClose={onClose} />
      </motion.div>
    </motion.div>
  )
}

// ─── Invite Section ────────────────────────────────────────────────────────────

const InviteSection: React.FC<{ groupId: string; inviteKey?: string }> = ({
  groupId,
  inviteKey,
}) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const addToast = useUIStore((s) => s.addToast)

  const handleCopy = async () => {
    if (!inviteKey) return
    if (!(await copyToClipboard(inviteKey))) {
      addToast({ type: 'error', title: t('common.copyFailed') })
      return
    }
    setCopied(true)
    addToast({ type: 'success', title: t('groups.inviteKeyCopied') })
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGenerate = () => {
    useGroupStore.getState().generateInviteKey(groupId)
    addToast({ type: 'success', title: t('groups.inviteKeyGenerated') })
  }

  if (!inviteKey) {
    return (
      <Button variant="secondary" size="sm" onClick={handleGenerate}>
        {t('groups.generateInviteKey')}
      </Button>
    )
  }

  return (
    <div className="glass rounded-xl p-3">
      <p className="font-mono text-xs text-asgard-glacier break-all mb-2">{inviteKey}</p>
      <Button variant="secondary" size="sm" onClick={handleCopy}>
        {copied ? t('common.copied') : t('groups.copyInviteKey')}
      </Button>
    </div>
  )
}

// ─── Invite Contacts ───────────────────────────────────────────────────────────

const InviteContactsSection: React.FC<{ groupId: string }> = ({ groupId }) => {
  const { t } = useTranslation()
  const contacts = useContactStore((s) => s.contacts)
  const group = useGroupStore((s) => s.getGroup(groupId))
  const addToast = useUIStore((s) => s.addToast)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [invited, setInvited] = useState<string[]>([])

  const memberKeys = new Set(group?.members.map((member) => member.publicKey) ?? [])
  const kickedKeys = new Set(group?.kickedMembers ?? [])
  const candidates = Object.values(contacts)
    .filter((contact) => contact.relation === 'contact' || contact.relation === 'favorite')
    .filter((contact) => !memberKeys.has(contact.publicKey) && !kickedKeys.has(contact.publicKey))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  const handleInvite = async (publicKey: string, displayName: string) => {
    setPendingKey(publicKey)
    try {
      await groupService.inviteMember(groupId, publicKey)
      setInvited((current) => [...current, publicKey])
      addToast({ type: 'success', title: t('groups.inviteSent', { name: displayName }) })
    } catch {
      addToast({ type: 'error', title: t('groups.inviteFailed') })
    } finally {
      setPendingKey(null)
    }
  }

  if (candidates.length === 0) {
    return <p className="text-xs text-asgard-text-muted">{t('groups.noContactsToInvite')}</p>
  }

  return (
    <div className="space-y-1 max-h-56 overflow-y-auto">
      {candidates.map((contact) => {
        const isInvited = invited.includes(contact.publicKey)
        const isPending = pendingKey === contact.publicKey

        return (
          <div
            key={contact.publicKey}
            className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-asgard-surface-alt transition-colors"
          >
            <Avatar
              src={contact.avatar}
              name={contact.displayName}
              publicKey={contact.publicKey}
              size="sm"
            />
            <p className="flex-1 min-w-0 text-sm font-medium text-asgard-text-primary truncate">
              {contact.displayName}
            </p>
            <Button
              variant="secondary"
              size="sm"
              disabled={isPending || isInvited}
              onClick={() => handleInvite(contact.publicKey, contact.displayName)}
            >
              {isInvited
                ? t('groups.invitationSent')
                : isPending
                  ? t('groups.inviting')
                  : t('groups.inviteAction')}
            </Button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Member Management ─────────────────────────────────────────────────────────

/** Le rôle s'affiche traduit : rendu brut, « admin » ou « guest » restait
 *  anglais dans les 25 langues. */
const ROLE_LABEL_KEYS: Record<MemberRole, string> = {
  owner: 'common.owner',
  admin: 'common.admin',
  moderator: 'common.moderator',
  member: 'common.member',
  guest: 'common.guest',
}

const MemberManagement: React.FC<{ groupId: string }> = ({ groupId }) => {
  const { t } = useTranslation()
  const getMembers = useGroupStore((s) => s.getMembers)
  const identity = useIdentityStore((s) => s.identity)
  const members = getMembers(groupId)
  const addToast = useUIStore((s) => s.addToast)
  const [kickTarget, setKickTarget] = useState<{ publicKey: string; displayName: string } | null>(null)

  const handleRoleChange = async (publicKey: string, newRole: MemberRole) => {
    try {
      await groupService.setMemberRole(groupId, publicKey, newRole)
      addToast({ type: 'success', title: t('groups.roleUpdated') })
    } catch (err) {
      addToast({ type: 'error', title: t('groups.roleUpdateFailed') })
    }
  }

  const handleKick = async (publicKey: string) => {
    try {
      await groupService.kickMember(groupId, publicKey)
      addToast({ type: 'success', title: t('groups.memberRemoved') })
    } catch (err) {
      addToast({ type: 'error', title: t('groups.memberRemoveFailed') })
    }
  }

  const handleMute = async (publicKey: string, muted: boolean) => {
    try {
      if (muted) await groupService.unmuteMember(groupId, publicKey)
      else await groupService.muteMember(groupId, publicKey)
      addToast({ type: 'success', title: muted ? t('groups.memberUnmuted') : t('groups.memberMuted') })
    } catch (err) {
      addToast({ type: 'error', title: t('groups.muteFailed') })
    }
  }

  return (
    <div className="space-y-1">
      {members.map((member) => {
        const isSelf = member.publicKey === identity?.keyPair.publicKey
        const isOwner = member.role === 'owner'
        const isMuted = member.canPost === false
        const muteLabel = isMuted ? t('groups.unmuteMember') : t('groups.muteMember')

        return (
          <div
            key={member.publicKey}
            className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-asgard-surface-alt transition-colors"
          >
            <Avatar
              src={member.avatar}
              name={member.displayName}
              publicKey={member.publicKey}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-asgard-text-primary truncate">
                {member.displayName}
                {isSelf && (
                  <span className="text-xs text-asgard-text-muted ml-1">({t('contacts.you')})</span>
                )}
              </p>
              <p className="text-xs text-asgard-text-muted">{t(ROLE_LABEL_KEYS[member.role])}</p>
            </div>

            {/* Admin actions */}
            {!isSelf && !isOwner && (
              <div className="flex items-center gap-1">
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.publicKey, e.target.value as MemberRole)}
                  aria-label={t('groups.memberRole', { name: member.displayName })}
                  className="text-xs bg-transparent border border-asgard-border rounded-lg px-2 py-1 text-asgard-text-secondary"
                >
                  <option value="member">{t('common.member')}</option>
                  <option value="moderator">{t('common.moderator')}</option>
                  <option value="admin">{t('common.admin')}</option>
                </select>
                <button
                  onClick={() => handleMute(member.publicKey, isMuted)}
                  aria-label={muteLabel}
                  title={muteLabel}
                  aria-pressed={isMuted}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-asgard-text-muted hover:bg-asgard-surface-alt transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d={isMuted
                      ? 'M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.31 6-6.72h-1.7z'
                      : 'M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l6 6zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.76-.48 2.51-.98L19.73 21 21 19.73 4.27 3z'} />
                  </svg>
                </button>
                <button
                  onClick={() => setKickTarget({ publicKey: member.publicKey, displayName: member.displayName })}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                  aria-label={t('groups.removeMember')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )
      })}

      {kickTarget && (
        <ConfirmDialog
          title="groups.removeMember"
          warning="groups.removeMemberWarning"
          confirmLabel="groups.removeMember"
          name={kickTarget.displayName}
          onCancel={() => setKickTarget(null)}
          onConfirm={() => {
            const target = kickTarget
            setKickTarget(null)
            void handleKick(target.publicKey)
          }}
        />
      )}
    </div>
  )
}

// ─── Broadcast Toggle ─────────────────────────────────────────────────────────

const BroadcastToggle: React.FC<{ groupId: string }> = ({ groupId }) => {
  const { t } = useTranslation()
  const group = useGroupStore((s) => s.getGroup(groupId))
  const addToast = useUIStore((s) => s.addToast)
  const [busy, setBusy] = useState(false)

  const isBroadcast = group?.broadcastMode === true

  const handleToggle = async () => {
    if (busy) return
    const newMode = !isBroadcast
    setBusy(true)
    try {
      await groupService.setBroadcastMode(groupId, newMode)
      addToast({
        type: 'success',
        title: newMode ? t('groups.broadcastModeEnabled') : t('groups.broadcastModeDisabled'),
        message: newMode
          ? t('groups.broadcastModeEnabledMessage')
          : t('groups.broadcastModeDisabledMessage')
      })
    } catch {
      addToast({ type: 'error', title: t('groups.broadcastModeFailed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6 p-4 bg-asgard-surface-alt border border-asgard-border rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-asgard-nordic/20 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-asgard-nordic">
              <path d="M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39-.4-.34-.95-.8-1.41-1.21-.27-.24-.49-.46-.65-.63-.43-.46-.84-.91-1.14-1.25-.16-.18-.28-.32-.36-.42-.08-.1-.1-.13-.1-.13H4V4h16v12.17h-2V6H6v10h7.54c.14.17.32.39.53.61z"/>
              <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm0 16.17l-1.17-1.17H4V4h16v14.17z"/>
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-asgard-text-primary">{t('groups.broadcastMode')}</h4>
            <p className="text-xs text-asgard-text-muted">
              {isBroadcast ? t('groups.broadcastModeHint') : t('groups.broadcastModeAllCanPost')}
            </p>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={isBroadcast}
          aria-label={t('groups.broadcastMode')}
          onClick={handleToggle}
          disabled={busy}
          className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-60 ${
            isBroadcast ? 'bg-asgard-nordic' : 'bg-asgard-border'
          }`}
        >
          <motion.div
            animate={{ x: isBroadcast ? 24 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
          />
        </button>
      </div>
    </div>
  )
}

// ─── Leave Group Section ──────────────────────────────────────────────────────

const LeaveGroupSection: React.FC<{ groupId: string; onClose: () => void }> = ({ groupId, onClose }) => {
  const { t } = useTranslation()
  const [showConfirm, setShowConfirm] = useState(false)
  const identity = useIdentityStore((s) => s.identity)
  const group = useGroupStore((s) => s.getGroup(groupId))
  const isOwner = group?.ownerId === identity?.keyPair.publicKey
  const addToast = useUIStore((s) => s.addToast)

  const handleLeave = async () => {
    try {
      await groupService.leaveGroup(groupId)
      addToast({ type: 'success', title: t('groups.leftGroup') })
      onClose()
    } catch (err) {
      addToast({ type: 'error', title: t('groups.leaveGroupFailed') })
    }
  }

  // Owners cannot leave their own group (they must delete it or transfer ownership)
  if (isOwner) {
    return (
      <div className="mt-6 p-4 bg-asgard-surface-alt border border-asgard-border rounded-2xl">
        <p className="text-xs text-asgard-text-muted text-center">
          {t('groups.ownerLeaveMessage')}
        </p>
      </div>
    )
  }

  if (showConfirm) {
    return (
      <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
        <p className="text-sm text-asgard-text-primary mb-3 text-center">
          {t('groups.leaveConfirm')}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowConfirm(false)}
            className="flex-1"
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleLeave}
            className="flex-1"
          >
            {t('groups.leaveGroup')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setShowConfirm(true)}
        className="w-full py-3 px-4 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition-colors text-sm font-medium"
      >
        {t('groups.leaveGroup')}
      </button>
    </div>
  )
}
