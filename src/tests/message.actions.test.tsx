/**
 * Actions d'un message : accessibilité du menu, édition depuis le composer et
 * renvoi d'un échec définitif.
 *
 * Ces tests fixent trois contrats : le menu s'ouvre au clic droit, au clavier
 * (Maj+F10) et par le bouton « Plus », se ferme au clic extérieur et à Échap ;
 * l'édition préremplit le composer et ne l'écrase pas pendant la frappe ; un
 * renvoi réutilise l'identifiant du message, sans créer de doublon chez le pair.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { MessageInput } from '@/features/chat/components/MessageInput'
import { chatService } from '@/services/ChatService'
import { cryptoService } from '@/services/CryptoService'
import { p2pService } from '@/services/P2PService'
import { storageService } from '@/services/StorageService'
import { useIdentityStore } from '@/stores/identityStore'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'
import type { Message } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const ME = 'a'.repeat(64)

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderId: ME,
    type: 'text',
    content: 'bonjour',
    timestamp: 1_700_000_000_000,
    status: 'sent',
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('menu des actions de message', () => {
  it('s’ouvre au clic droit et appelle l’action choisie', async () => {
    const onReply = vi.fn()
    const message = makeMessage()
    render(<MessageBubble message={message} isOwn onReply={onReply} />)
    const row = screen.getByRole('group', { name: 'chat.messageActions' })

    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 })
    fireEvent.click(screen.getByText('chat.reply'))

    expect(onReply).toHaveBeenCalledWith(message)
    await waitFor(() => expect(screen.queryByText('chat.reply')).not.toBeInTheDocument())
  })

  it('s’ouvre au clavier (Maj+F10) et se ferme avec Échap', async () => {
    render(<MessageBubble message={makeMessage()} isOwn />)
    const row = screen.getByRole('group', { name: 'chat.messageActions' })

    fireEvent.focus(row)
    fireEvent.keyDown(row, { key: 'F10', shiftKey: true })
    expect(screen.getByText('common.copy')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('common.copy')).not.toBeInTheDocument())
  })

  it('se ferme au clic extérieur', async () => {
    render(<MessageBubble message={makeMessage()} isOwn />)
    const row = screen.getByRole('group', { name: 'chat.messageActions' })

    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 })
    expect(screen.getByText('common.copy')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByText('common.copy')).not.toBeInTheDocument())
  })

  it('ne propose l’édition que pour un message à soi avec du texte', () => {
    const onEdit = vi.fn()
    const message = makeMessage({ status: 'sent' })
    const { rerender } = render(<MessageBubble message={message} isOwn />)
    const row = screen.getByRole('group', { name: 'chat.messageActions' })

    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 })
    expect(screen.queryByText('chat.editMessage')).not.toBeInTheDocument()

    rerender(<MessageBubble message={message} isOwn onEdit={onEdit} />)
    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 })
    fireEvent.click(screen.getByText('chat.editMessage'))
    expect(onEdit).toHaveBeenCalledWith(message)

    // Un message reçu ne s'édite jamais, même avec le gestionnaire fourni.
    cleanup()
    render(<MessageBubble message={{ ...message, senderId: 'b'.repeat(64) }} isOwn={false} onEdit={onEdit} />)
    fireEvent.contextMenu(screen.getByRole('group', { name: 'chat.messageActions' }), { clientX: 120, clientY: 80 })
    expect(screen.queryByText('chat.editMessage')).not.toBeInTheDocument()
  })

  it('expose le renvoi d’un échec sur l’icône et dans le menu', () => {
    const onRetry = vi.fn()
    const message = makeMessage({ status: 'failed' })
    render(<MessageBubble message={message} isOwn onRetry={onRetry} />)

    fireEvent.click(screen.getByRole('button', { name: 'chat.retrySend' }))
    expect(onRetry).toHaveBeenCalledWith(message)

    fireEvent.contextMenu(screen.getByRole('group', { name: 'chat.messageActions' }), { clientX: 120, clientY: 80 })
    fireEvent.click(screen.getByText('chat.retrySend'))
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('garde l’échec visible sans action quand le renvoi n’est pas câblé', () => {
    render(<MessageBubble message={makeMessage({ status: 'failed' })} isOwn />)
    expect(screen.getByRole('img', { name: 'chat.messageNotDelivered' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chat.retrySend' })).not.toBeInTheDocument()
  })
})

describe('composer en mode édition', () => {
  const editTarget = makeMessage({ content: 'ancien texte', status: 'sent' })

  it('préremplit le texte, valide par le bouton Enregistrer et vide le champ', () => {
    const onSend = vi.fn()
    const onEditSubmit = vi.fn()
    render(
      <MessageInput
        conversationId="conversation-1"
        editingMessage={editTarget}
        onSend={onSend}
        onEditSubmit={onEditSubmit}
      />
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('ancien texte')
    expect(screen.getByText('chat.editMessage')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'messageInput.attachFile' })).not.toBeInTheDocument()

    fireEvent.change(textarea, { target: { value: 'texte corrigé' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(onEditSubmit).toHaveBeenCalledWith('texte corrigé')
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea.value).toBe('')
  })

  it('n’écrase pas la frappe quand le message édité change d’objet', () => {
    const { rerender } = render(
      <MessageInput conversationId="conversation-1" editingMessage={editTarget} onSend={vi.fn()} onEditSubmit={vi.fn()} />
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'brouillon en cours' } })

    rerender(
      <MessageInput
        conversationId="conversation-1"
        editingMessage={{ ...editTarget, content: 'ancien texte' }}
        onSend={vi.fn()}
        onEditSubmit={vi.fn()}
      />
    )
    expect(textarea.value).toBe('brouillon en cours')
  })

  it('Échap annule l’édition et vide le champ', () => {
    const onCancelEdit = vi.fn()
    render(
      <MessageInput
        conversationId="conversation-1"
        editingMessage={editTarget}
        onSend={vi.fn()}
        onEditSubmit={vi.fn()}
        onCancelEdit={onCancelEdit}
      />
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement

    fireEvent.keyDown(textarea, { key: 'Escape' })

    expect(onCancelEdit).toHaveBeenCalledOnce()
    expect(textarea.value).toBe('')
  })

  it('vide le texte édité quand le fil change sans validation', () => {
    const { rerender } = render(
      <MessageInput conversationId="conversation-1" editingMessage={editTarget} onSend={vi.fn()} onEditSubmit={vi.fn()} />
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'édition abandonnée' } })

    rerender(<MessageInput conversationId="conversation-2" onSend={vi.fn()} onEditSubmit={vi.fn()} />)

    expect(textarea.value).toBe('')
  })
})

describe('ChatService — renvoi d’un message en échec', () => {
  const peer = 'c'.repeat(64)

  function seed(message: Message): void {
    useIdentityStore.setState({
      identity: {
        keyPair: { publicKey: ME, secretKey: 'b'.repeat(128) },
        profile: { publicKey: ME, displayName: 'Moi', status: 'online', createdAt: 0, updatedAt: 0 },
      },
      isSetup: true,
    })
    useMessageStore.setState({
      messages: { [message.conversationId]: [message] },
      loading: {},
      hasMore: {},
      pending: {},
      drafts: {},
      scheduledMessages: [],
      templates: [],
    })
    vi.spyOn(cryptoService, 'sign').mockResolvedValue('signature')
    vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
  }

  it('réutilise l’identifiant, marque « sent » et signe de nouveau le message', async () => {
    const message = makeMessage({ status: 'failed' })
    seed(message)
    const sendSpy = vi.spyOn(p2pService, 'sendRawMessage').mockResolvedValue(undefined)

    const outcome = await chatService.retryMessage(message.id, message.conversationId, peer)

    expect(outcome).toBe('sent')
    expect(sendSpy).toHaveBeenCalledWith(peer, 'chat:message', expect.objectContaining({ id: message.id, signature: 'signature' }))
    const stored = useMessageStore.getState().messages[message.conversationId]
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe(message.id)
    expect(stored[0].status).toBe('sent')
    expect(storageService.saveMessage).toHaveBeenCalledOnce()
  })

  it('remet le même message en file quand le pair est hors ligne, sans doublon', async () => {
    const message = makeMessage({ status: 'failed' })
    seed(message)
    vi.spyOn(p2pService, 'sendRawMessage').mockRejectedValue(new Error('offline'))

    const outcome = await chatService.retryMessage(message.id, message.conversationId, peer)

    expect(outcome).toBe('queued')
    const stored = useMessageStore.getState().messages[message.conversationId]
    expect(stored).toHaveLength(1)
    expect(stored[0].status).toBe('sending')
    expect(chatService.getPendingCount(peer)).toBe(1)

    // Le renvoi suivant repart du message déjà stocké : aucun nouveau message.
    vi.mocked(p2pService.sendRawMessage).mockResolvedValue(undefined)
    await chatService.flushPendingMessages(peer)
    expect(useMessageStore.getState().messages[message.conversationId]).toHaveLength(1)
    expect(useMessageStore.getState().messages[message.conversationId][0].status).toBe('sent')
    expect(chatService.getPendingCount(peer)).toBe(0)
  })

  it('refuse un message supprimé ou inconnu', async () => {
    const message = makeMessage({ status: 'failed', deleted: true })
    seed(message)
    const sendSpy = vi.spyOn(p2pService, 'sendRawMessage').mockResolvedValue(undefined)

    await expect(chatService.retryMessage(message.id, message.conversationId, peer)).rejects.toThrow('Message not found')
    expect(sendSpy).not.toHaveBeenCalled()
  })
})

describe('enregistrer sous depuis le menu du message', () => {
  const saveAs = () => vi.mocked(window.asgard.file.saveAs)
  const titles = () => useUIStore.getState().toasts.map((toast) => toast.title)

  function renderFileMessage() {
    useUIStore.setState({ toasts: [] })
    saveAs().mockReset()
    const message = makeMessage({
      type: 'file',
      attachments: [{
        id: 'att-1', type: 'document', name: 'note.txt', size: 12,
        mimeType: 'text/plain', blobKey: 'blob-1',
      }],
    })
    render(<MessageBubble message={message} isOwn />)
    return {
      row: screen.getByRole('group', { name: 'chat.messageActions' }),
      message,
    }
  }

  it('annonce l’échec de l’enregistrement', async () => {
    const { row } = renderFileMessage()
    saveAs().mockResolvedValue({ success: false, reason: 'not-found' })

    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 })
    fireEvent.click(screen.getByText('chat.downloadNamedFile'))

    // Le menu téléchargeait sans rien dire : la panne doit se voir ici comme
    // dans le widget de pièce jointe.
    await waitFor(() => expect(titles()).toEqual(['chat.downloadFailed']))
    expect(saveAs()).toHaveBeenCalledWith('blob-1', 'note.txt')
  })

  it('annonce le chemin écrit', async () => {
    const { row } = renderFileMessage()
    saveAs().mockResolvedValue({ success: true, filePath: 'C:/users/note.txt' })

    fireEvent.contextMenu(row, { clientX: 120, clientY: 80 })
    fireEvent.click(screen.getByText('chat.downloadNamedFile'))

    await waitFor(() => expect(titles()).toEqual(['chat.fileSaved']))
    expect(useUIStore.getState().toasts[0].message).toBe('C:/users/note.txt')
  })
})
