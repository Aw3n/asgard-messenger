/**
 * Autorisation et bornes des transferts de fichiers entrants.
 *
 * Une metadata de fichier est une déclaration du pair : elle ne doit ni choisir
 * sa conversation, ni dépasser des bornes de taille, ni clôturer ou annuler un
 * transfert dont l'émetteur n'est pas propriétaire. Ces tests fixent ces règles
 * sur le chemin de réception (metadata, chunks, complétion, annulation).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fileService, TransferCancelledError } from '@/services/FileService'
import { p2pService } from '@/services/P2PService'
import { storageService } from '@/services/StorageService'
import { useContactStore } from '@/stores/contactStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useGroupStore } from '@/stores/groupStore'
import { useIdentityStore } from '@/stores/identityStore'
import { useMessageStore } from '@/stores/messageStore'
import { useUIStore } from '@/stores/uiStore'
import type { GroupMember, MessageAttachment, ProtocolMessage } from '@/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)
const CHUNK = 256 * 1024

interface PrivateFileService {
  handleIncomingFile(msg: ProtocolMessage): Promise<void>
  handleBinaryChunk(from: string, data: Uint8Array, expectMarker: boolean): Promise<void>
  handleFileComplete(msg: ProtocolMessage): Promise<void>
  handleRemoteCancel(msg: ProtocolMessage): void
  receiveBuffers: Map<string, {
    from: string
    attachment: MessageAttachment
    conversationId: string
    totalChunks: number
    receivedChunks: number
    receivedBytes: number
    groupTransferId?: string
    groupId?: string
  }>
  orphanChunks: Map<string, unknown[]>
  completedTransferIds: Set<string>
  transfers: Map<string, { peerId?: string }>
  groupTransfers: Map<string, {
    groupId?: string
    peerProgress?: Map<string, number>
    cancelledPeers?: Set<string>
  }>
  sendFramedChunks(
    peerId: string,
    bytes: Uint8Array,
    transferId: string,
    totalChunks: number,
    onProgress: (percent: number) => void,
    cancelKey?: string,
  ): Promise<void>
  cancelledTransfers: Set<string>
}

const service = fileService as unknown as PrivateFileService

function member(publicKey: string, displayName: string): GroupMember {
  return { publicKey, displayName, role: 'member', joinedAt: 1_700_000_000_000, canPost: true }
}

function attachment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'att-1',
    type: 'document',
    name: 'contrat.pdf',
    size: 100,
    mimeType: 'application/pdf',
    ...overrides,
  }
}

function incoming(
  from: string,
  transferId: string,
  payload: Record<string, unknown> = {},
  attachmentOverrides: Record<string, unknown> = {},
): Promise<void> {
  return service.handleIncomingFile({
    id: `envelope-${transferId}`,
    from,
    to: A,
    type: 'file:transfer',
    timestamp: Date.now(),
    payload: {
      attachment: attachment(attachmentOverrides),
      conversationId: 'conversation-x',
      transferId,
      ...payload,
    },
  } as unknown as ProtocolMessage)
}

async function chunk(from: string, transferId: string, data: Uint8Array): Promise<void> {
  const id = new TextEncoder().encode(transferId)
  const frame = new Uint8Array(1 + id.length + data.length)
  frame[0] = id.length
  frame.set(id, 1)
  frame.set(data, 1 + id.length)
  await service.handleBinaryChunk(from, frame, false)
}

function complete(from: string, transferId: string): Promise<void> {
  return service.handleFileComplete({
    id: `complete-${transferId}`,
    from,
    to: A,
    type: 'file:complete',
    timestamp: Date.now(),
    payload: { transferId },
  } as unknown as ProtocolMessage)
}

function cancel(from: string, payload: Record<string, unknown>): void {
  service.handleRemoteCancel({
    id: 'cancel-envelope',
    from,
    to: A,
    type: 'file:cancel',
    timestamp: Date.now(),
    payload,
  } as unknown as ProtocolMessage)
}

const messages = () => Object.values(useMessageStore.getState().messages).flat()

let groupId = ''
let channelId = ''
let groupTransferId = ''

beforeEach(() => {
  useIdentityStore.setState({
    identity: {
      keyPair: { publicKey: A, secretKey: 'f'.repeat(128) },
      profile: { publicKey: A, displayName: 'Alice', status: 'online', createdAt: 0, updatedAt: 0 },
    },
    isSetup: true,
  })
  useContactStore.setState({ contacts: {} })
  useConversationStore.setState({ conversations: {}, activeConversationId: null })
  useMessageStore.setState({
    messages: {},
    loading: {},
    hasMore: {},
    pending: {},
    drafts: {},
    scheduledMessages: [],
    templates: [],
  })
  useUIStore.setState({ toasts: [] })
  useGroupStore.setState({
    groups: {},
    activeGroupId: null,
    activeChannelId: null,
    searchQuery: '',
    groupPresence: {},
    channelTyping: {},
  })

  service.receiveBuffers.clear()
  service.orphanChunks.clear()
  service.completedTransferIds.clear()
  service.transfers.clear()
  service.groupTransfers.clear()
  service.cancelledTransfers.clear()

  const created = useGroupStore.getState().createGroup({
    name: 'Équipe',
    ownerId: A,
    ownerDisplayName: 'Alice',
  })
  groupId = created.id
  channelId = created.channels[0].id
  useGroupStore.getState().addMember(groupId, member(B, 'Bob'))
  useGroupStore.getState().addMember(groupId, member(C, 'Carol'))
  groupTransferId = 'groupe-transfert-0001'

  vi.spyOn(storageService, 'putBlob').mockResolvedValue('blob-test')
  vi.spyOn(storageService, 'saveMessage').mockResolvedValue(undefined)
  vi.spyOn(p2pService, 'sendMessage').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('métadonnées entrantes', () => {
  it.each([
    ['un id de transfert trop court', 'abc'],
    ['un id de transfert avec chemin', '../receive'],
    ['un id de transfert trop long', 't'.repeat(65)],
  ])('ignore %s', async (_label, transferId) => {
    await incoming(B, transferId, { binary: true, totalChunks: 1 }, { size: CHUNK })
    expect(service.receiveBuffers.size).toBe(0)
    expect(messages()).toEqual([])
  })

  it('ignore une pièce jointe sans nom, de type inconnu, de taille aberrante', async () => {
    await incoming(B, 'transfer-0001', { binary: true, totalChunks: 1 }, { name: '', size: CHUNK })
    await incoming(B, 'transfer-0002', { binary: true, totalChunks: 1 }, { type: 'executable', size: CHUNK })
    await incoming(B, 'transfer-0003', { binary: true, totalChunks: 1 }, { size: -1 })
    await incoming(B, 'transfer-0004', { binary: true, totalChunks: 1 }, { size: 2 * 1024 * 1024 * 1024 + 1 })
    expect(service.receiveBuffers.size).toBe(0)
    expect(messages()).toEqual([])
  })

  it('nettoie le nom et ignore les références de stockage et l’état du pair', async () => {
    await incoming(B, 'transfer-0005', { binary: true, totalChunks: 1 }, {
      name: 'dossier\\secret/\u0000photo.png',
      size: CHUNK,
      blobKey: 'blob-arbitraire',
      localUrl: 'blob:perimee',
      failed: true,
      deleted: true,
      deletedAt: 1,
      downloadProgress: 99,
    })

    const buf = service.receiveBuffers.get('transfer-0005')!
    expect(buf).toBeDefined()
    expect(buf.attachment.name).toBe('dossiersecretphoto.png')
    // L'URL locale est créée par le récepteur : celle du pair ne doit jamais
    // désigner un blob ou une session qui n'existent pas ici.
    expect(buf.attachment.blobKey).toBeUndefined()
    expect(buf.attachment.localUrl).toBeUndefined()
    expect(buf.attachment.failed).toBeUndefined()
    expect(buf.attachment.deleted).toBeUndefined()
    expect(buf.attachment.downloadProgress).toBeUndefined()
  })

  it('ne garde une miniature que si c’est une image data URL bornée', async () => {
    await incoming(B, 'transfer-0006', { binary: true, totalChunks: 1 }, {
      size: CHUNK,
      thumbnail: 'data:text/html;base64,PHNjcmlwdD4=',
    })
    await incoming(B, 'transfer-0007', { binary: true, totalChunks: 1 }, {
      size: CHUNK,
      thumbnail: `data:image/png;base64,${'A'.repeat(600 * 1024)}`,
    })
    await incoming(B, 'transfer-0008', { binary: true, totalChunks: 1 }, {
      size: CHUNK,
      thumbnail: 'data:image/png;base64,AAAA',
    })

    expect(service.receiveBuffers.get('transfer-0006')?.attachment.thumbnail).toBeUndefined()
    expect(service.receiveBuffers.get('transfer-0007')?.attachment.thumbnail).toBeUndefined()
    expect(service.receiveBuffers.get('transfer-0008')?.attachment.thumbnail).toBe('data:image/png;base64,AAAA')
  })
})

describe('bornes des transferts binaires', () => {
  it.each([
    ['zéro chunk', { size: CHUNK, totalChunks: 0 }],
    ['trop de chunks', { size: CHUNK, totalChunks: 8193 }],
    ['moins de chunks que la taille annoncée', { size: 2 * CHUNK, totalChunks: 1 }],
  ])('refuse %s', async (_label, overrides) => {
    await incoming(B, 'transfer-1001', { binary: true, totalChunks: overrides.totalChunks }, { size: overrides.size })
    expect(service.receiveBuffers.size).toBe(0)
  })

  it('refuse un chunk plus gros qu’un bloc et un cumul au-delà de la taille annoncée', async () => {
    await incoming(B, 'transfer-1002', { binary: true, totalChunks: 2 }, { size: 2 * CHUNK })
    await chunk(B, 'transfer-1002', new Uint8Array(CHUNK + 1))
    expect(service.receiveBuffers.get('transfer-1002')?.receivedChunks).toBe(0)

    await incoming(B, 'transfer-1003', { binary: true, totalChunks: 2 }, { size: 100 })
    await chunk(B, 'transfer-1003', new Uint8Array(60))
    await chunk(B, 'transfer-1003', new Uint8Array(60))
    const buf = service.receiveBuffers.get('transfer-1003')!
    expect(buf.receivedChunks).toBe(1)
    expect(buf.receivedBytes).toBe(60)
  })

  it('plafonne les réceptions simultanées d’un même pair', async () => {
    for (let index = 0; index < 8; index++) {
      await incoming(B, `transfer-200${index}`, { binary: true, totalChunks: 1 }, { size: CHUNK })
    }
    expect(service.receiveBuffers.size).toBe(8)

    await incoming(B, 'transfer-2999', { binary: true, totalChunks: 1 }, { size: CHUNK })
    expect(service.receiveBuffers.has('transfer-2999')).toBe(false)
  })

  it('borne les chunks orphelins rejoués à l’arrivée de la metadata', async () => {
    const transferId = 'transfer-3001'
    for (let index = 0; index < 40; index++) {
      await chunk(B, transferId, new Uint8Array([index]))
    }
    expect(service.orphanChunks.get(transferId)).toHaveLength(32)

    await incoming(B, transferId, { binary: true, totalChunks: 40 }, { size: 40 * CHUNK })
    expect(service.receiveBuffers.get(transferId)?.receivedChunks).toBe(32)
  })
})

describe('transferts de groupe', () => {
  it('refuse un canal inconnu ou un expéditeur hors du groupe', async () => {
    await incoming('d'.repeat(64), 'transfer-4001', {
      binary: true,
      totalChunks: 1,
      conversationId: channelId,
      groupTransferId,
    }, { size: CHUNK })
    await incoming(B, 'transfer-4002', {
      binary: true,
      totalChunks: 1,
      conversationId: 'canal-inconnu',
      groupTransferId,
    }, { size: CHUNK })

    expect(service.receiveBuffers.size).toBe(0)
    expect(messages()).toEqual([])
  })

  it('écarte la pièce jointe d’un membre mis en sourdine', async () => {
    useGroupStore.getState().muteMember(groupId, B, A)

    await incoming(B, 'transfer-4005', {
      binary: true,
      totalChunks: 1,
      conversationId: channelId,
      groupTransferId,
    }, { size: CHUNK })

    expect(service.receiveBuffers.size).toBe(0)
    expect(messages()).toEqual([])
  })

  it('écarte la pièce jointe d’un rôle que le canal n’admet pas', async () => {
    // Une jointure de fichier est une publication au même titre qu'un message.
    useGroupStore.getState().updateChannel(groupId, channelId, {
      permissions: { send: ['owner', 'admin'], read: ['owner'], manage: ['owner'] },
    })

    await incoming(B, 'transfer-4006', {
      binary: true,
      totalChunks: 1,
      conversationId: channelId,
      groupTransferId,
    }, { size: CHUNK })

    expect(service.receiveBuffers.size).toBe(0)
    expect(messages()).toEqual([])
  })

  it('accepte un membre et rattache le fichier au canal, puis accuse avec le vrai groupId', async () => {
    await incoming(B, 'transfer-4003', {
      binary: true,
      totalChunks: 1,
      conversationId: channelId,
      groupTransferId,
      senderMessageId: 'message-source',
    }, { size: CHUNK })
    const buf = service.receiveBuffers.get('transfer-4003')!
    expect(buf.conversationId).toBe(channelId)
    expect(buf.groupId).toBe(groupId)

    await chunk(B, 'transfer-4003', new Uint8Array(CHUNK))
    await complete(B, 'transfer-4003')

    expect(storageService.putBlob).toHaveBeenCalledTimes(1)
    expect(p2pService.sendMessage).toHaveBeenCalledWith(B, 'group:receipt', expect.objectContaining({
      groupId,
      channelId,
      messageIds: ['message-source'],
    }))
  })

  it('accuse aussi les petits fichiers inline avec le vrai groupId', async () => {
    await incoming(B, 'transfer-4004', {
      conversationId: channelId,
      groupTransferId,
      senderMessageId: 'message-inline',
      fileData: btoa('bonjour'),
    }, { size: 7 })

    expect(messages()).toHaveLength(1)
    expect(p2pService.sendMessage).toHaveBeenCalledWith(B, 'group:receipt', expect.objectContaining({
      groupId,
      channelId,
      messageIds: ['message-inline'],
    }))
  })
})

describe('complétion et annulation', () => {
  it('seul l’expéditeur peut clôturer un transfert', async () => {
    await incoming(B, 'transfer-5001', { binary: true, totalChunks: 1 }, { size: CHUNK })
    await chunk(B, 'transfer-5001', new Uint8Array(CHUNK))

    await complete(C, 'transfer-5001')
    expect(storageService.putBlob).not.toHaveBeenCalled()
    expect(service.receiveBuffers.has('transfer-5001')).toBe(true)

    await complete(B, 'transfer-5001')
    expect(storageService.putBlob).toHaveBeenCalledTimes(1)
    expect(service.receiveBuffers.has('transfer-5001')).toBe(false)
  })

  it('seul le destinataire peut annuler un envoi 1:1', () => {
    service.transfers.set('transfer-6001', { peerId: B })

    cancel(C, { transferId: 'transfer-6001' })
    expect(service.transfers.has('transfer-6001')).toBe(true)
    expect(service.cancelledTransfers.has('transfer-6001')).toBe(false)

    cancel(B, { transferId: 'transfer-6001' })
    expect(service.transfers.has('transfer-6001')).toBe(false)
    expect(service.cancelledTransfers.has('transfer-6001')).toBe(true)
  })

  it('ignore une annulation d’envoi de groupe visant l’id partagé', () => {
    service.transfers.set('transfer-6002', {})
    service.groupTransfers.set('transfer-6002', { groupId })

    cancel(B, { transferId: 'transfer-6002' })
    expect(service.transfers.has('transfer-6002')).toBe(true)
  })

  it('seul l’expéditeur peut retirer notre réception', async () => {
    await incoming(B, 'transfer-6003', { binary: true, totalChunks: 1 }, { size: CHUNK })

    cancel(C, { transferId: 'transfer-6003' })
    expect(service.receiveBuffers.has('transfer-6003')).toBe(true)

    cancel(B, { transferId: 'transfer-6003' })
    expect(service.receiveBuffers.has('transfer-6003')).toBe(false)
  })

  it('une annulation de groupe ne retire que les buffers de son émetteur', async () => {
    await incoming(B, 'transfer-6004', {
      binary: true,
      totalChunks: 1,
      conversationId: channelId,
      groupTransferId,
    }, { size: CHUNK })
    await incoming(C, 'transfer-6005', {
      binary: true,
      totalChunks: 1,
      conversationId: channelId,
      groupTransferId,
    }, { size: CHUNK })

    cancel(B, { transferId: 'fil-inconnu', groupTransferId })
    expect(service.receiveBuffers.has('transfer-6004')).toBe(false)
    expect(service.receiveBuffers.has('transfer-6005')).toBe(true)
  })

  it('ne matérialise pas deux fois une metadata inline rejouée', async () => {
    const payload = {
      conversationId: 'conversation-x',
      fileData: btoa('contenu'),
    }
    await incoming(B, 'transfer-6006', payload, { size: 7 })
    await incoming(B, 'transfer-6006', payload, { size: 7 })

    expect(messages()).toHaveLength(1)
    expect(storageService.putBlob).toHaveBeenCalledTimes(1)
  })

  it('ignore une metadata inline dont le base64 est invalide', async () => {
    await incoming(B, 'transfer-6007', {
      conversationId: 'conversation-x',
      fileData: '!!!pas-du-base64!!!',
    }, { size: 7 })

    expect(messages()).toEqual([])
  })
})

describe('annulation d’un envoi groupé par un destinataire', () => {
  it('retient le pair qui abandonne et cesse de lui envoyer des lots', async () => {
    const sendBatch = vi.spyOn(p2pService, 'sendFileDataBatch').mockResolvedValue(undefined)
    service.groupTransfers.set(groupTransferId, { peerProgress: new Map([[B, 0], [C, 0]]) })

    cancel(B, { transferId: 'fil-de-b', groupTransferId })

    expect(service.groupTransfers.get(groupTransferId)?.cancelledPeers?.has(B)).toBe(true)
    await expect(service.sendFramedChunks(
      B, new Uint8Array(16), 'fil-de-b', 1, () => {}, groupTransferId,
    )).rejects.toBeInstanceOf(TransferCancelledError)
    expect(sendBatch).not.toHaveBeenCalled()

    // Les autres destinataires continuent de recevoir leur copie.
    await service.sendFramedChunks(C, new Uint8Array(16), 'fil-de-c', 1, () => {}, groupTransferId)
    expect(sendBatch).toHaveBeenCalledTimes(1)
    sendBatch.mockRestore()
  })

  it('ignore l’annulation d’un pair qui ne reçoit pas ce transfert', () => {
    service.groupTransfers.set(groupTransferId, { peerProgress: new Map([[B, 0]]) })

    cancel(C, { transferId: 'fil-de-c', groupTransferId })

    expect(service.groupTransfers.get(groupTransferId)?.cancelledPeers).toBeUndefined()
  })
})
