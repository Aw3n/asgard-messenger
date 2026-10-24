/**
 * Le panneau de la corbeille doit nommer ce qu'il contient et son bouton
 * « Restaurer » doit rendre la pièce au fil, pas seulement vider une ligne.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TrashManager } from '@/features/settings/components/TrashManager'
import { fileService } from '@/services/FileService'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'
import type { Message, MessageAttachment } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr', changeLanguage: vi.fn() } }),
}))

const CONVERSATION_ID = 'conv-trash-ui'
const MESSAGE_ID = 'msg-trash-ui'
const BLOB_KEY = 'blob-trash-ui'

const attachment: MessageAttachment = {
  id: 'att-trash-ui',
  type: 'image',
  name: 'photo vacances.png',
  size: 2048,
  mimeType: 'image/png',
  blobKey: BLOB_KEY,
  localUrl: 'blob:session/photo-ui',
}

function message(): Message {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: 'a'.repeat(64),
    type: 'image',
    content: '',
    timestamp: 1_700_000_000_000,
    status: 'sent',
    attachments: [{ ...attachment }],
  }
}

const storedAttachment = () =>
  useMessageStore.getState().messages[CONVERSATION_ID]?.[0]?.attachments?.[0]

beforeEach(async () => {
  await fileService.emptyTrash()
  useUIStore.setState({ toasts: [] })
  useMessageStore.setState({ messages: { [CONVERSATION_ID]: [message()] } })
  vi.spyOn(fileService, 'resolveLocalUrl').mockResolvedValue('blob:restored/photo-ui')
  vi.mocked(window.asgard.storage.deleteBlob).mockReset()
  vi.mocked(window.asgard.storage.deleteBlob).mockResolvedValue(true)
  await useMessageStore.getState().deleteFileAttachment(MESSAGE_ID, CONVERSATION_ID, attachment.id)
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await fileService.emptyTrash()
  useMessageStore.setState({ messages: {} })
})

describe('panneau de la corbeille', () => {
  it('montre le nom du fichier et restaure la pièce au clic', async () => {
    render(<TrashManager onClose={() => {}} />)

    expect(screen.getByText('photo vacances.png')).toBeInTheDocument()
    expect(screen.queryByText(`${BLOB_KEY.slice(0, 16)}...`)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle('settings.restore'))

    await waitFor(() => expect(screen.getByText('settings.noTrash')).toBeInTheDocument())
    expect(storedAttachment()?.deleted).toBe(false)
    expect(fileService.getTrashBin()).toEqual([])
  })

  it('annonce une suppression définitive que le stockage refuse', async () => {
    vi.mocked(window.asgard.storage.deleteBlob).mockRejectedValueOnce(new Error('Storage not initialized'))

    render(<TrashManager onClose={() => {}} />)
    fireEvent.click(screen.getByTitle('settings.deletePermanently'))

    await waitFor(() => expect(useUIStore.getState().toasts[0]?.title).toBe('chat.deleteFileFailed'))
    // L'entrée reste : rien ne doit laisser croire que les octets sont partis.
    expect(screen.getByText('photo vacances.png')).toBeInTheDocument()
    expect(fileService.getTrashBin()).toHaveLength(1)
  })

  it('affiche la taille et nomme la case de sélection', () => {
    render(<TrashManager onClose={() => {}} />)

    // La taille apparaît sur la ligne et dans le total du pied de panneau.
    expect(screen.getAllByText(/2\.0 KB/)).toHaveLength(2)

    const checkbox = screen.getByRole('button', { name: 'photo vacances.png' })
    expect(checkbox).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(checkbox)
    expect(checkbox).toHaveAttribute('aria-pressed', 'true')
  })
})
