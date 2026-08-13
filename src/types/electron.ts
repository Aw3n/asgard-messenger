/**
 * Electron bridge type declarations.
 * Extends the Window interface to include the asgard API exposed by preload.
 */

export interface AsgardElectronAPI {
  debugLog: (msg: string) => void
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void
  }
  identity: {
    create: () => Promise<IdentityAPIResult>
    load: () => Promise<IdentityAPIResult | null>
    save: (identity: SerializedIdentityAPI) => Promise<void>
    exists: () => Promise<boolean>
    exportSeedPhrase: () => Promise<string[]>
    importSeedPhrase: (words: string[]) => Promise<IdentityAPIResult>
  }
  network: {
    setIdentity: (publicKeyHex: string) => Promise<{ peerId: string }>
    deriveNoisePublicKey: (ed25519PublicKeyHex: string) => Promise<string>
    join: (topic: string) => Promise<void>
    leave: (topic: string) => Promise<void>
    send: (peerId: string, data: Uint8Array) => Promise<void>
    sendBatch: (peerId: string, dataArray: Uint8Array[]) => Promise<void>
    sendMedia: (peerId: string, data: Uint8Array) => Promise<void>
    sendMediaBatch: (peerId: string, chunks: Uint8Array[]) => Promise<void>
    sendFileData: (peerId: string, data: Uint8Array) => Promise<void>
    isPeerConnected: (peerId: string) => Promise<boolean>
    waitForPeer: (peerId: string, timeoutMs?: number) => Promise<boolean>
    cork: (peerId: string) => Promise<void>
    uncork: (peerId: string) => Promise<void>
    prioritize: (peerId: string, prioritized: boolean) => Promise<void>
    joinPeer: (noisePublicKeyHex: string) => Promise<void>
    connectToContact: (noisePublicKeyHex: string, prioritized?: boolean) => Promise<void>
    leavePeer: (noisePublicKeyHex: string) => Promise<void>
    suspend: () => Promise<void>
    resume: () => Promise<void>
    flush: () => Promise<void>
    updateConfig: (config: { maxPeers?: number; relayEnabled?: boolean }) => Promise<void>
    blockPeer: (noisePublicKeyHex: string, blocked: boolean) => Promise<void>
    getPeerScores: () => Promise<Record<string, { latency: number; score: number }>>
    publishProfile: (displayName: string, avatar?: string) => Promise<boolean>
    fetchProfile: (publicKeyHex: string) => Promise<DHTProfileData | null>
    clearProfileCache: (publicKeyHex?: string) => Promise<void>
    isChannelOpen: (peerId: string) => Promise<boolean>
    getActiveChannelPeers: () => Promise<string[]>
    isIdle: () => Promise<boolean>
    getHandshakeHash: (peerId: string) => Promise<string | null>
    getPeerBandwidth: (peerId: string) => Promise<{ written: number; read: number } | null>
    setPeerKeepAlive: (peerId: string, ms: number) => Promise<void>
    getConnectingCount: () => Promise<number>
    getConnectedPeersInfo: () => Promise<Map<string, { publicKey: string; topics: string[]; prioritized: boolean }>>
    setPeerPriorized: (peerPublicKey: string, prioritized: boolean) => Promise<boolean>
    banPeer: (peerPublicKey: string, banStatus: boolean) => Promise<boolean>
    getBlockedPeers: () => Promise<string[]>
    onPeerBan: () => void
    // STATUS: User online status management
    publishStatus: (status: 'online' | 'away' | 'offline' | 'dnd', statusMessage?: string) => Promise<boolean>
    getCurrentStatus: () => Promise<{ status: string; message?: string }>
    // IMMUTABLE RECORDS: Store and fetch public immutable data in DHT
    immutablePut: (valueHex: string) => Promise<string | null>
    immutableGet: (hash: string) => Promise<string | null>
    setFirewall: (firewallFn: (remotePublicKey: string, remoteHandshakePayload: unknown) => boolean) => Promise<boolean>
    getServerAddress: () => Promise<{ host: string; port: number; publicKey: string } | null>
    refreshServer: () => Promise<boolean>
    suspendSwarm: () => Promise<boolean>
    resumeSwarm: () => Promise<boolean>
    flushSwarm: () => Promise<boolean>
    dhtLookup: (topicHex: string) => Promise<Array<{ publicKey: string; nodes: Array<{ host: string; port: number }> }>>
    dhtAnnounce: (topicHex: string) => Promise<boolean>
    dhtUnannounce: (topicHex: string) => Promise<boolean>
    // CONNECTIVITY: Network status monitoring and reconnection
    handleNetworkChange: (online: boolean) => Promise<void>
    getConnectivityStatus: () => Promise<{ isOnline: boolean; lastChange: number; reconnectAttempts: number }>
    scheduleReconnect: (peerId: string) => Promise<number>
    resetReconnectAttempts: (peerId: string) => Promise<void>
    connectToPeer: (remotePublicKey: string) => Promise<boolean>
    destroyDht: (options?: { force?: boolean }) => Promise<boolean>
    generateKeyPair: (seedHex?: string) => Promise<{ publicKey: string; secretKey: string } | null>
    onPeer: (callback: (peer: PeerAPIInfo) => void) => () => void
    onMessage: (callback: (msg: NetworkAPIMessage) => void) => () => void
    onMedia: (callback: (msg: NetworkAPIMessage) => void) => () => void
    onFile: (callback: (msg: NetworkAPIMessage) => void) => () => void
    onPeerIdentified: (callback: (data: { peerId: string; publicKey: string }) => void) => () => void
    onPeerBanned: (callback: (data: { peerId: string; reason?: string }) => void) => () => void
    onStatusUpdate: (callback: (status: NetworkAPIStatus) => void) => () => void
    setLocalPublicKey: (publicKeyHex: string) => Promise<void>
    reidentifyAll: () => Promise<void>
    getStatus: () => Promise<NetworkAPIStatus>
  }
  storage: {
    getPath: () => Promise<string>
    getSize: () => Promise<number>
    saveMessage: (conversationId: string, message: unknown) => Promise<void>
    saveMessages: (conversationId: string, messages: unknown[]) => Promise<void>
    getMessages: (conversationId: string, options?: { limit?: number; before?: number; after?: number; reverse?: boolean }) => Promise<unknown[]>
    getLastMessages: (conversationId: string, count?: number) => Promise<unknown[]>
    getLatestMessage: (conversationId: string) => Promise<unknown | null>
    clearMessages: (conversationId: string) => Promise<void>
    countMessages: (conversationId: string) => Promise<number>
    searchMessages: (conversationId: string, query: string, limit?: number) => Promise<unknown[]>
    deleteMessage: (conversationId: string, messageId: string) => Promise<boolean>
    watchConversation: (conversationId: string) => Promise<() => void>
    unwatchConversation: (conversationId: string) => Promise<void>
    getConversationVersion: (conversationId: string) => Promise<number>
    getConversationDiff: (conversationId: string, fromVersion: number, toVersion?: number) => Promise<{ added: unknown[]; removed: string[] }>
    truncateConversation: (conversationId: string, maxMessages: number) => Promise<number>
    getConversationStorageInfo: (conversationId: string) => Promise<ConversationStorageInfo | null>
    onConversationChanged: (callback: (data: { conversationId: string; version: number }) => void) => () => void
    saveContact: (contact: unknown) => Promise<void>
    getContacts: () => Promise<unknown[]>
    getContact: (publicKey: string) => Promise<unknown | null>
    deleteContact: (publicKey: string) => Promise<boolean>
    saveGroup: (group: unknown) => Promise<void>
    getGroups: () => Promise<unknown[]>
    getGroup: (groupId: string) => Promise<unknown | null>
    deleteGroup: (groupId: string) => Promise<boolean>
    putBlob: (data: ArrayBuffer) => Promise<string>
    getBlob: (id: string) => Promise<ArrayBuffer | null>
    getBlobRange: (id: string, start: number, length: number) => Promise<ArrayBuffer | null>
    deleteBlob: (id: string) => Promise<boolean>
    getBlobInfo: (id: string) => Promise<BlobInfo | null>
    streamBlob: (id: string) => Promise<ArrayBuffer>
    writeBlobStream: (chunks: ArrayBuffer[]) => Promise<string | null>
    listConversations: () => Promise<string[]>
    getCoreCount: () => Promise<number>
    downloadConversationBlocks: (conversationId: string, blocks: number[]) => Promise<boolean>
    hasConversationBlocks: (conversationId: string, start: number, end?: number) => Promise<boolean>
    seekConversationOffset: (conversationId: string, byteOffset: number) => Promise<{ blockIndex: number; relativeOffset: number } | null>
    updateConversation: (conversationId: string) => Promise<boolean>
    getConversationHistory: (conversationId: string, options?: { live?: boolean; reverse?: boolean; limit?: number; gte?: number; lte?: number }) => Promise<Array<{ type: string; key: string; value?: unknown; seq: number }>>
    getConversationBySeq: (conversationId: string, seq: number) => Promise<{ key: string; value: unknown } | null>
    getConversationTreeHash: (conversationId: string, length?: number) => Promise<string | null>
    createConversationReadStream: (conversationId: string, options?: { start?: number; end?: number; live?: boolean }) => Promise<Buffer[] | null>
    batchConversationOperations: (conversationId: string, operations: Array<{ type: 'put' | 'del'; key: string; value?: unknown }>) => Promise<boolean>
    setConversationUserData: (conversationId: string, key: string, value: string | Buffer) => Promise<boolean>
    getConversationUserData: (conversationId: string, key: string) => Promise<string | Buffer | null>
    getConversationRemoteContiguousLength: (conversationId: string) => Promise<number | null>
    onConversationEvent: (conversationId: string, event: string, callbackId: string) => Promise<() => void>
    onConversationEventReceived: (callback: (data: { callbackId: string; data: unknown }) => void) => () => void
    cancelConversationDownload: (conversationId: string, range: unknown) => Promise<boolean>
    putConversationWithCas: (conversationId: string, key: string, value: unknown) => Promise<boolean>
    getConversationProof: (conversationId: string, opts?: { index?: number }) => Promise<unknown>
    verifyConversationProof: (conversationId: string, proof: unknown) => Promise<unknown>
    getConversationSignable: (conversationId: string, length?: number, fork?: number) => Promise<Buffer | null>
    createConversationWriteStream: (conversationId: string, chunks: unknown[]) => Promise<boolean>
    getConversationManifest: (conversationId: string) => Promise<{
      version?: number
      hash?: string
      allowPatch?: boolean
      quorum?: number
      signers?: Array<{ namespace: string; publicKey: string }>
    } | null>
    getConversationDiscoveryKey: (conversationId: string) => Promise<string | null>
    getConversationSignedLength: (conversationId: string) => Promise<number | null>
    isConversationWritable: (conversationId: string) => Promise<boolean | null>
    isConversationReadable: (conversationId: string) => Promise<boolean | null>
    getConversationByteLength: (conversationId: string) => Promise<number | null>
    getConversationContiguousLength: (conversationId: string) => Promise<number | null>
    getConversationFork: (conversationId: string) => Promise<number | null>
    getConversationLength: (conversationId: string) => Promise<number | null>
    getConversationCoreId: (conversationId: string) => Promise<string | null>
    getConversationCoreKey: (conversationId: string) => Promise<string | null>
    getConversationPeers: (conversationId: string) => Promise<Array<{ remotePublicKey: string }> | null>
    setConversationEncryption: (conversationId: string, encryption: unknown) => Promise<boolean>
    replicateConversation: (conversationId: string, isInitiator: boolean) => Promise<unknown>
    setConversationKeyPair: (conversationId: string, keyPair: { publicKey: string; secretKey: string }) => Promise<boolean>
    setConversationActive: (conversationId: string, active: boolean) => Promise<boolean>
    getMaxSuggestedBlockSize: () => number
    getDiscoveryKeyFromKey: (publicKey: string) => Promise<string | null>
    getBlockEncryptionKey: (key: string, encryptionKey: string) => Promise<string | null>
    getKeyFromManifest: (manifest: unknown, options?: { compat?: boolean; version?: number; namespace?: Buffer }) => Promise<string | null>
    createProtocolStream: (isInitiator: boolean, opts?: { ondiscoverykey?: (discoveryKey: Buffer) => void }) => Promise<unknown>
    getProtocolMuxer: (stream: unknown) => Promise<unknown>
    getDefaultStorage: (storagePath: string, opts?: Record<string, unknown>) => Promise<unknown>
    createCore: (storage: unknown, opts?: Record<string, unknown>) => Promise<unknown>
    closeConversation: (conversationId: string, error?: Error) => Promise<boolean>
    waitForConversationReady: (conversationId: string) => Promise<boolean>
    onConversationPeerAdd: (conversationId: string) => void
    onConversationPeerRemove: (conversationId: string) => void
    onConversationUpload: (conversationId: string) => void
    onConversationDownload: (conversationId: string) => void
    onConversationAppend: (conversationId: string) => void
    onConversationTruncate: (conversationId: string) => void
    onConversationRemoteContiguousLength: (conversationId: string) => void
    onConversationClose: (conversationId: string) => void
    onConversationReady: (conversationId: string) => void
    suspendStorage: () => Promise<boolean>
    resumeStorage: () => Promise<boolean>
    createDeterministicKeyPair: (name: string, namespace?: string) => Promise<{ publicKey: string; secretKey: string } | null>
    getSubBee: (conversationId: string, prefix: string) => Promise<boolean>
    watchKey: (conversationId: string, key: string, callbackId: string) => Promise<() => void>
    onKeyChanged: (callback: (data: { callbackId: string; value: unknown }) => void) => () => void
    createCorestoreSession: () => Promise<unknown>
    notifyGroup: (topic: string) => Promise<unknown>
    getGroupUpdates: (handle: unknown, opts?: { since?: number; reverse?: boolean }) => Promise<AsyncIterable<string> | null>
    destroyGroupHandle: (handle: unknown) => Promise<boolean>
    onGroupActive: () => void
    onGroupActiveEvent: (callback: (topic: string) => void) => () => void
    clearAll: () => Promise<void>
    exportData: () => Promise<unknown>
    importData: (data: unknown) => Promise<void>
  }
  notifications: {
    show: (title: string, body: string, options?: NotificationAPIOptions) => void
    requestPermission: () => Promise<boolean>
  }
  file: {
    saveAs: (blobId: string, suggestedName: string) => Promise<
      | { success: true; filePath: string }
      | { success: false; reason: 'not-found' | 'canceled' | 'error'; message?: string }
    >
  }
  app: {
    getVersion: () => Promise<string>
    getPlatform: () => string
    openExternal: (url: string) => void
    getTheme: () => Promise<'light' | 'dark' | 'system'>
    onThemeChange: (callback: (theme: 'light' | 'dark') => void) => () => void
  }
}

interface IdentityAPIResult {
  publicKey: string
  keyPair: { publicKey: Uint8Array; secretKey: Uint8Array }
}

interface SerializedIdentityAPI {
  publicKey: string
  secretKey: string
  profile: {
    displayName: string
    status: string
    avatar?: string
    about?: string
    customStatus?: string
  }
}

interface PeerAPIInfo {
  id: string
  publicKey: string
  remotePublicKey: string
  ed25519PublicKey?: string | null
  connected: boolean
}

interface NetworkAPIMessage {
  from: string
  data: Uint8Array
  timestamp: number
}

interface NetworkAPIStatus {
  connected: boolean
  peers: number
  topics: string[]
  bandwidth: { up: number; down: number }
  connecting: number
  peerLatency: Record<string, number>
  activeConnections: number
  maxPeers: number
  activeChannels: number
}

interface NotificationAPIOptions {
  icon?: string
  silent?: boolean
}

interface DHTProfileData {
  displayName: string
  avatar?: string
  timestamp: number
  version: number
  status?: 'online' | 'away' | 'offline' | 'dnd'
  lastSeen?: number
  statusMessage?: string
}

interface ConversationStorageInfo {
  length: number
  byteLength: number
  contiguousLength: number
  storage?: {
    oplog: number
    tree: number
    blocks: number
    bitfield: number
  }
}

interface BlobInfo {
  id: number
  byteOffset: number
  blockOffset: number
  blockLength: number
  byteLength: number
}

// Augment the global Window interface
declare global {
  interface Window {
    asgard: AsgardElectronAPI
  }
}
