/**
 * Corbeille : la restauration doit rendre la pièce au fil, pas seulement
 * effacer une ligne de la liste.
 *
 * Le panneau promettait « restaurer » alors que rien ne repassait le drapeau
 * `deleted` de la pièce jointe à faux : le fichier restait « supprimé » dans la
 * conversation. La liste affichait aussi un préfixe de blob illisible, sans le
 * nom du fichier que l'utilisateur venait de retirer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fileService } from '@/services/FileService'
import { useMessageStore } from '@/stores/messageStore'
import type { Message, MessageAttachment } from '@/types'

const CONVERSATION_ID = 'conv-trash'
const MESSAGE_ID = 'msg-trash'
const BLOB_KEY = 'blob-trash-1'

const attachment: MessageAttachment = {
  id: 'att-trash',
  type: 'image',
  name: 'photo vacances.png',
  size: 2048,
  mimeType: 'image/png',
  blobKey: BLOB_KEY,
  localUrl: 'blob:session/photo',
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
  fileService.clearFavorites()
  useMessageStore.setState({ messages: { [CONVERSATION_ID]: [message()] } })
  vi.spyOn(fileService, 'resolveLocalUrl').mockResolvedValue('blob:restored/photo')
  vi.mocked(window.asgard.storage.deleteBlob).mockReset()
  vi.mocked(window.asgard.storage.deleteBlob).mockResolvedValue(true)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fileService.emptyTrash()
  useMessageStore.setState({ messages: {} })
})

describe('corbeille', () => {
  it('garde le nom, le type et la taille du fichier supprimé', async () => {
    await expect(useMessageStore.getState().deleteFileAttachment(MESSAGE_ID, CONVERSATION_ID, attachment.id))
      .resolves.toBe(true)

    const [entry] = fileService.getTrashBin()
    expect(entry).toMatchObject({
      blobKey: BLOB_KEY,
      fileName: 'photo vacances.png',
      mimeType: 'image/png',
      fileSize: 2048,
    })
  })

  it('ne crée pas deux lignes pour un même blob supprimé deux fois', async () => {
    const deleteAttachment = useMessageStore.getState().deleteFileAttachment
    await deleteAttachment(MESSAGE_ID, CONVERSATION_ID, attachment.id)
    await deleteAttachment(MESSAGE_ID, CONVERSATION_ID, attachment.id)

    expect(fileService.getTrashBin()).toHaveLength(1)
  })

  it('restaure la pièce dans le fil et republie son aperçu', async () => {
    await useMessageStore.getState().deleteFileAttachment(MESSAGE_ID, CONVERSATION_ID, attachment.id)
    expect(storedAttachment()?.deleted).toBe(true)

    fileService.restoreFromTrash(BLOB_KEY)
    expect(useMessageStore.getState().restoreFileAttachment(BLOB_KEY)).toBe(1)

    expect(fileService.getTrashBin()).toEqual([])
    expect(storedAttachment()?.deleted).toBe(false)
    await vi.waitFor(() => expect(storedAttachment()?.localUrl).toBe('blob:restored/photo'))
  })

  it('efface les octets à la suppression définitive', async () => {
    await useMessageStore.getState().deleteFileAttachment(MESSAGE_ID, CONVERSATION_ID, attachment.id)
    fileService.addFavorite(BLOB_KEY, 'photo vacances.png', CONVERSATION_ID, 'image/png', 2048)

    await expect(fileService.permanentDelete(BLOB_KEY)).resolves.toBe(true)

    expect(window.asgard.storage.deleteBlob).toHaveBeenCalledWith(BLOB_KEY)
    expect(fileService.getTrashBin()).toEqual([])
    // Le favori ne peut plus rien rouvrir : il disparaît avec les octets.
    expect(fileService.isFavorite(BLOB_KEY)).toBe(false)
  })

  it('garde les octets d’un blob qu’une autre pièce vivante lit encore', async () => {
    await useMessageStore.getState().deleteFileAttachment(MESSAGE_ID, CONVERSATION_ID, attachment.id)
    useMessageStore.setState({
      messages: {
        [CONVERSATION_ID]: [message()],
        'conv-autre': [{
          ...message(),
          id: 'msg-autre',
          conversationId: 'conv-autre',
          attachments: [{ ...attachment, id: 'att-autre', localUrl: '' }],
        }],
      },
    })

    await expect(fileService.permanentDelete(BLOB_KEY)).resolves.toBe(true)

    expect(window.asgard.storage.deleteBlob).not.toHaveBeenCalled()
    expect(fileService.getTrashBin()).toEqual([])
  })

  it('garde l’entrée en corbeille quand le stockage refuse d’effacer', async () => {
    await useMessageStore.getState().deleteFileAttachment(MESSAGE_ID, CONVERSATION_ID, attachment.id)
    vi.mocked(window.asgard.storage.deleteBlob).mockRejectedValueOnce(new Error('Storage not initialized'))

    await expect(fileService.permanentDelete(BLOB_KEY)).resolves.toBe(false)

    expect(fileService.getTrashBin()).toHaveLength(1)
  })

  it('signale une entrée orpheline dont le message a disparu', () => {
    useMessageStore.setState({ messages: {} })

    expect(useMessageStore.getState().restoreFileAttachment(BLOB_KEY)).toBe(0)
  })
})
