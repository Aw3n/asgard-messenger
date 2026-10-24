/**
 * ConversationConfirm — le dialogue qui sépare la demande de l'effacement.
 *
 * Supprimer une conversation efface ses messages et ses fichiers ; effacer les
 * messages vide le fil sans retirer la conversation. Les deux partagent le même
 * panneau, avec le nom de l'interlocuteur.
 */
import React from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export type ConversationConfirmVariant = 'delete' | 'clear'

const LABELS: Record<ConversationConfirmVariant, {
  title: string
  warning: string
  confirm: string
}> = {
  delete: {
    title: 'chat.deleteConversation',
    warning: 'chat.deleteWarning',
    confirm: 'chat.deletePermanently',
  },
  clear: {
    title: 'chat.clearMessages',
    warning: 'chat.clearWarning',
    confirm: 'chat.clearMessages',
  },
}

interface ConversationConfirmProps {
  variant: ConversationConfirmVariant
  name: string
  onCancel: () => void
  onConfirm: () => void
}

export const ConversationConfirm: React.FC<ConversationConfirmProps> = ({
  variant,
  name,
  onCancel,
  onConfirm,
}) => {
  const labels = LABELS[variant]
  return (
    <ConfirmDialog
      title={labels.title}
      warning={labels.warning}
      confirmLabel={labels.confirm}
      name={name}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
