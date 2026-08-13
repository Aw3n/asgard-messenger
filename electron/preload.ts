import { contextBridge, ipcRenderer } from 'electron'

/**
 * Asgard Electron Preload
 * Exposes a secure, typed API to the renderer process via contextBridge.
 * No Node.js APIs are exposed directly — only explicit whitelisted channels.
 */

// Type definitions for the exposed API
export interface AsgardAPI {
  // Debug logging
  debugLog: (msg: string) => void
  // Window controls
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void
  }
  // Identity & Crypto
  identity: {
    create: () => Promise<IdentityResult>
    load: () => Promise<IdentityResult | null>
    save: (identity: SerializedIdentity) => Promise<void>
    exists: () => Promise<boolean>
    exportSeedPhrase: () => Promise<string[]>
    importSeedPhrase: (words: string[]) => Promise<IdentityResult>
  }
  // Network (Hyperswarm / P2P)
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
    getConnectedPeersInfo: () => Promise<unknown[]>
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
    handleNetworkChange: (online: boolean) => Promise<void>
    getConnectivityStatus: () => Promise<{ isOnline: boolean; lastChange: number; reconnectAttempts: number }>
    scheduleReconnect: (peerId: string) => Promise<number>
    resetReconnectAttempts: (peerId: string) => Promise<void>
    connectToPeer: (remotePublicKey: string) => Promise<boolean>
    destroyDht: (options?: { force?: boolean }) => Promise<boolean>
    generateKeyPair: (seedHex?: string) => Promise<{ publicKey: string; secretKey: string } | null>
    onPeer: (callback: (peer: PeerInfo) => void) => () => void
    onMessage: (callback: (msg: NetworkMessage) => void) => () => void
    onMedia: (callback: (msg: NetworkMessage) => void) => () => void
    onFile: (callback: (msg: NetworkMessage) => void) => () => void
    onPeerIdentified: (callback: (data: { peerId: string; publicKey: string }) => void) => () => void
    onPeerBanned: (callback: (data: { peerId: string; reason?: string }) => void) => () => void
    onStatusUpdate: (callback: (status: NetworkStatusInfo) => void) => () => void
    setLocalPublicKey: (publicKeyHex: string) => Promise<void>
    reidentifyAll: () => Promise<void>
    getStatus: () => Promise<NetworkStatusInfo>
  }
  // Storage
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
    watchConversation: (conversationId: string) => Promise<void>
    unwatchConversation: (conversationId: string) => Promise<void>
    getConversationVersion: (conversationId: string) => Promise<number>
    getConversationDiff: (conversationId: string, fromVersion: number, toVersion?: number) => Promise<unknown>
    truncateConversation: (conversationId: string, maxMessages: number) => Promise<void>
    getConversationStorageInfo: (conversationId: string) => Promise<unknown>
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
    getBlobInfo: (id: string) => Promise<unknown>
    streamBlob: (id: string) => Promise<ArrayBuffer>
    writeBlobStream: (chunks: ArrayBuffer[]) => Promise<string | null>
    listConversations: () => Promise<string[]>
    getCoreCount: () => Promise<number>
    downloadConversationBlocks: (conversationId: string, blocks: number[]) => Promise<void>
    hasConversationBlocks: (conversationId: string, start: number, end?: number) => Promise<boolean>
    seekConversationOffset: (conversationId: string, byteOffset: number) => Promise<unknown>
    updateConversation: (conversationId: string) => Promise<void>
    getConversationHistory: (conversationId: string, options?: { live?: boolean; reverse?: boolean; limit?: number; gte?: number; lte?: number }) => Promise<unknown>
    getConversationBySeq: (conversationId: string, seq: number) => Promise<unknown>
    getConversationTreeHash: (conversationId: string, length?: number) => Promise<string | null>
    createConversationReadStream: (conversationId: string, options?: { start?: number; end?: number; live?: boolean }) => Promise<unknown>
    batchConversationOperations: (conversationId: string, operations: Array<{ type: 'put' | 'del'; key: string; value?: unknown }>) => Promise<void>
    setConversationUserData: (conversationId: string, key: string, value: string | Buffer) => Promise<void>
    getConversationUserData: (conversationId: string, key: string) => Promise<string | Buffer | null>
    getConversationRemoteContiguousLength: (conversationId: string) => Promise<number>
    onConversationEvent: (conversationId: string, event: string, callbackId: string) => Promise<void>
    onConversationEventReceived: (callback: (data: { callbackId: string; data: unknown }) => void) => () => void
    cancelConversationDownload: (conversationId: string, range: unknown) => Promise<void>
    putConversationWithCas: (conversationId: string, key: string, value: unknown) => Promise<boolean>
    getConversationProof: (conversationId: string, opts?: { index?: number }) => Promise<unknown>
    verifyConversationProof: (conversationId: string, proof: unknown) => Promise<boolean>
    getConversationSignable: (conversationId: string, length?: number, fork?: number) => Promise<unknown>
    createConversationWriteStream: (conversationId: string, chunks: unknown[]) => Promise<number>
    getConversationManifest: (conversationId: string) => Promise<unknown>
    getConversationDiscoveryKey: (conversationId: string) => Promise<string | null>
    getConversationSignedLength: (conversationId: string) => Promise<number>
    isConversationWritable: (conversationId: string) => Promise<boolean>
    isConversationReadable: (conversationId: string) => Promise<boolean>
    getConversationByteLength: (conversationId: string) => Promise<number>
    getConversationContiguousLength: (conversationId: string) => Promise<number>
    getConversationFork: (conversationId: string) => Promise<number>
    getConversationLength: (conversationId: string) => Promise<number>
    getConversationCoreId: (conversationId: string) => Promise<string | null>
    getConversationCoreKey: (conversationId: string) => Promise<string | null>
    getConversationPeers: (conversationId: string) => Promise<unknown[]>
    setConversationEncryption: (conversationId: string, encryption: unknown) => Promise<void>
    replicateConversation: (conversationId: string, isInitiator: boolean) => Promise<void>
    setConversationKeyPair: (conversationId: string, keyPair: { publicKey: string; secretKey: string }) => Promise<void>
    setConversationActive: (conversationId: string, active: boolean) => Promise<void>
    getMaxSuggestedBlockSize: () => Promise<number>
    getDiscoveryKeyFromKey: (publicKey: string) => Promise<string | null>
    getBlockEncryptionKey: (key: string, encryptionKey: string) => Promise<string | null>
    getKeyFromManifest: (manifest: unknown, options?: { compat?: boolean; version?: number; namespace?: Buffer }) => Promise<string | null>
    createProtocolStream: (isInitiator: boolean, opts?: { ondiscoverykey?: (discoveryKey: Buffer) => void }) => Promise<unknown>
    getProtocolMuxer: (stream: unknown) => Promise<unknown>
    getDefaultStorage: (storagePath: string, opts?: Record<string, unknown>) => Promise<unknown>
    createCore: (storage: unknown, opts?: Record<string, unknown>) => Promise<unknown>
    closeConversation: (conversationId: string, error?: Error) => Promise<void>
    waitForConversationReady: (conversationId: string) => Promise<void>
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
    getSubBee: (conversationId: string, prefix: string) => Promise<unknown>
    watchKey: (conversationId: string, key: string, callbackId: string) => Promise<void>
    onKeyChanged: (callback: (data: { callbackId: string; value: unknown }) => void) => () => void
    createCorestoreSession: () => Promise<unknown>
    notifyGroup: (topic: string) => Promise<void>
    getGroupUpdates: (handle: unknown, opts?: { since?: number; reverse?: boolean }) => Promise<unknown[]>
    destroyGroupHandle: (handle: unknown) => Promise<void>
    onGroupActive: () => void
    onGroupActiveEvent: (callback: (topic: string) => void) => () => void
    clearAll: () => Promise<void>
    exportData: () => Promise<unknown>
    importData: (data: unknown) => Promise<void>
  }
  // Notifications
  notifications: {
    show: (title: string, body: string, options?: NotificationOptions) => void
    requestPermission: () => Promise<boolean>
  }
  // File operations
  file: {
    saveAs: (blobId: string, suggestedName: string) => Promise<
      | { success: true; filePath: string }
      | { success: false; reason: 'not-found' | 'canceled' | 'error'; message?: string }
    >
  }
  // App info
  app: {
    getVersion: () => Promise<string>
    getPlatform: () => string
    openExternal: (url: string) => void
    getTheme: () => Promise<'light' | 'dark' | 'system'>
    onThemeChange: (callback: (theme: 'light' | 'dark') => void) => () => void
  }
}

// Helper to create an IPC listener that returns a cleanup function
function createListener<T = unknown>(channel: string, callback: (arg: T) => void) {
  ipcRenderer.on(channel, (_event, ...args) => callback(args[0] as T))
  return () => ipcRenderer.removeAllListeners(channel)
}

// Expose the Asgard API to the renderer
contextBridge.exposeInMainWorld('asgard', {
  // Debug: send renderer logs to main process log file
  debugLog: (msg: string) => ipcRenderer.send('debug:log', msg),
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback: (isMaximized: boolean) => void) =>
      createListener('window:maximizeChange', callback),
  },
  identity: {
    create: () => ipcRenderer.invoke('identity:create'),
    load: () => ipcRenderer.invoke('identity:load'),
    save: (identity: SerializedIdentity) => ipcRenderer.invoke('identity:save', identity),
    exists: () => ipcRenderer.invoke('identity:exists'),
    exportSeedPhrase: () => ipcRenderer.invoke('identity:exportSeedPhrase'),
    importSeedPhrase: (words: string[]) => ipcRenderer.invoke('identity:importSeedPhrase', words),
  },
  network: {
    setIdentity: (publicKeyHex: string) => ipcRenderer.invoke('network:setIdentity', publicKeyHex),
    deriveNoisePublicKey: (ed25519PublicKeyHex: string) => ipcRenderer.invoke('network:deriveNoisePublicKey', ed25519PublicKeyHex),
    join: (topic: string) => ipcRenderer.invoke('network:join', topic),
    leave: (topic: string) => ipcRenderer.invoke('network:leave', topic),
    send: (peerId: string, data: Uint8Array) => ipcRenderer.invoke('network:send', peerId, data),
    sendBatch: (peerId: string, dataArray: Uint8Array[]) => ipcRenderer.invoke('network:sendBatch', peerId, dataArray),
    sendMedia: (peerId: string, data: Uint8Array) => ipcRenderer.invoke('network:sendMedia', peerId, data),
    sendMediaBatch: (peerId: string, chunks: Uint8Array[]) => ipcRenderer.invoke('network:sendMediaBatch', peerId, chunks),
    sendFileData: (peerId: string, data: Uint8Array) => ipcRenderer.invoke('network:sendFileData', peerId, data),
    isPeerConnected: (peerId: string) => ipcRenderer.invoke('network:isPeerConnected', peerId),
    waitForPeer: (peerId: string, timeoutMs?: number) => ipcRenderer.invoke('network:waitForPeer', peerId, timeoutMs),
    cork: (peerId: string) => ipcRenderer.invoke('network:cork', peerId),
    uncork: (peerId: string) => ipcRenderer.invoke('network:uncork', peerId),
    prioritize: (peerId: string, prioritized: boolean) => ipcRenderer.invoke('network:prioritize', peerId, prioritized),
    joinPeer: (noisePublicKeyHex: string) => ipcRenderer.invoke('network:joinPeer', noisePublicKeyHex),
    connectToContact: (noisePublicKeyHex: string, prioritized?: boolean) => ipcRenderer.invoke('network:connectToContact', noisePublicKeyHex, prioritized ?? false),
    leavePeer: (noisePublicKeyHex: string) => ipcRenderer.invoke('network:leavePeer', noisePublicKeyHex),
    suspend: () => ipcRenderer.invoke('network:suspend'),
    resume: () => ipcRenderer.invoke('network:resume'),
    flush: () => ipcRenderer.invoke('network:flush'),
    updateConfig: (config: { maxPeers?: number; relayEnabled?: boolean }) =>
      ipcRenderer.invoke('network:updateConfig', config),
    blockPeer: (noisePublicKeyHex: string, blocked: boolean) =>
      ipcRenderer.invoke('network:blockPeer', noisePublicKeyHex, blocked),
    getPeerScores: () => ipcRenderer.invoke('network:getPeerScores'),
    publishProfile: (displayName: string, avatar?: string) =>
      ipcRenderer.invoke('network:publishProfile', displayName, avatar),
    fetchProfile: (publicKeyHex: string) =>
      ipcRenderer.invoke('network:fetchProfile', publicKeyHex),
    clearProfileCache: (publicKeyHex?: string) =>
      ipcRenderer.invoke('network:clearProfileCache', publicKeyHex),
    isChannelOpen: (peerId: string) => ipcRenderer.invoke('network:isChannelOpen', peerId),
    getActiveChannelPeers: () => ipcRenderer.invoke('network:getActiveChannelPeers'),
    isIdle: () => ipcRenderer.invoke('network:isIdle'),
    getHandshakeHash: (peerId: string) => ipcRenderer.invoke('network:getHandshakeHash', peerId),
    getPeerBandwidth: (peerId: string) => ipcRenderer.invoke('network:getPeerBandwidth', peerId),
    setPeerKeepAlive: (peerId: string, ms: number) => ipcRenderer.invoke('network:setPeerKeepAlive', peerId, ms),
    getConnectingCount: () => ipcRenderer.invoke('network:getConnectingCount'),
    getConnectedPeersInfo: () => ipcRenderer.invoke('network:getConnectedPeersInfo'),
    setPeerPriorized: (peerPublicKey: string, prioritized: boolean) => ipcRenderer.invoke('network:setPeerPriorized', peerPublicKey, prioritized),
    banPeer: (peerPublicKey: string, banStatus: boolean) => ipcRenderer.invoke('network:banPeer', peerPublicKey, banStatus),
    getBlockedPeers: () => ipcRenderer.invoke('network:getBlockedPeers'),
    onPeerBan: () => ipcRenderer.send('network:onPeerBan'),
    // STATUS: User online status management
    publishStatus: (status: 'online' | 'away' | 'offline' | 'dnd', statusMessage?: string) =>
      ipcRenderer.invoke('network:publishStatus', status, statusMessage),
    getCurrentStatus: () => ipcRenderer.invoke('network:getCurrentStatus'),
    // IMMUTABLE RECORDS: Store and fetch public immutable data in DHT
    immutablePut: (valueHex: string) => ipcRenderer.invoke('network:immutablePut', valueHex),
    immutableGet: (hash: string) => ipcRenderer.invoke('network:immutableGet', hash),
    setFirewall: (firewallFn: (remotePublicKey: string, remoteHandshakePayload: unknown) => boolean) =>
      ipcRenderer.invoke('network:setFirewall', firewallFn),
    getServerAddress: () => ipcRenderer.invoke('network:getServerAddress'),
    refreshServer: () => ipcRenderer.invoke('network:refreshServer'),
    suspendSwarm: () => ipcRenderer.invoke('network:suspendSwarm'),
    resumeSwarm: () => ipcRenderer.invoke('network:resumeSwarm'),
    flushSwarm: () => ipcRenderer.invoke('network:flushSwarm'),
    dhtLookup: (topicHex: string) => ipcRenderer.invoke('network:dhtLookup', topicHex),
    dhtAnnounce: (topicHex: string) => ipcRenderer.invoke('network:dhtAnnounce', topicHex),
    dhtUnannounce: (topicHex: string) => ipcRenderer.invoke('network:dhtUnannounce', topicHex),
    // CONNECTIVITY: Network status monitoring and reconnection
    handleNetworkChange: (online: boolean) => ipcRenderer.invoke('network:handleNetworkChange', online),
    getConnectivityStatus: () => ipcRenderer.invoke('network:getConnectivityStatus'),
    scheduleReconnect: (peerId: string) => ipcRenderer.invoke('network:scheduleReconnect', peerId),
    resetReconnectAttempts: (peerId: string) => ipcRenderer.invoke('network:resetReconnectAttempts', peerId),
    connectToPeer: (remotePublicKey: string) => ipcRenderer.invoke('network:connectToPeer', remotePublicKey),
    destroyDht: (options?: { force?: boolean }) => ipcRenderer.invoke('network:destroyDht', options),
    generateKeyPair: (seedHex?: string) => ipcRenderer.invoke('network:generateKeyPair', seedHex),
    onPeer: (callback: (peer: PeerInfo) => void) =>
      createListener('network:peer', callback),
    onMessage: (callback: (msg: NetworkMessage) => void) =>
      createListener('network:message', callback),
    onMedia: (callback: (msg: NetworkMessage) => void) =>
      createListener('network:media', callback),
    onFile: (callback: (msg: NetworkMessage) => void) =>
      createListener('network:file', callback),
    onPeerIdentified: (callback: (data: { peerId: string; publicKey: string }) => void) =>
      createListener('network:peerIdentified', callback),
    onPeerBanned: (callback: (data: { peerId: string; reason?: string }) => void) =>
      createListener('network:peerBanned', callback),
    onStatusUpdate: (callback: (status: NetworkStatusInfo) => void) =>
      createListener('network:statusUpdate', callback),
    setLocalPublicKey: (publicKeyHex: string) =>
      ipcRenderer.invoke('network:setLocalPublicKey', publicKeyHex),
    reidentifyAll: () => ipcRenderer.invoke('network:reidentifyAll'),
    getStatus: () => ipcRenderer.invoke('network:status'),
  },
  storage: {
    getPath: () => ipcRenderer.invoke('storage:getPath'),
    getSize: () => ipcRenderer.invoke('storage:getSize'),
    saveMessage: (conversationId: string, message: unknown) =>
      ipcRenderer.invoke('storage:saveMessage', conversationId, message),
    saveMessages: (conversationId: string, messages: unknown[]) =>
      ipcRenderer.invoke('storage:saveMessages', conversationId, messages),
    getMessages: (conversationId: string, options?: { limit?: number; before?: number; after?: number; reverse?: boolean }) =>
      ipcRenderer.invoke('storage:getMessages', conversationId, options),
    getLastMessages: (conversationId: string, count?: number) =>
      ipcRenderer.invoke('storage:getLastMessages', conversationId, count),
    getLatestMessage: (conversationId: string) =>
      ipcRenderer.invoke('storage:getLatestMessage', conversationId),
    clearMessages: (conversationId: string) =>
      ipcRenderer.invoke('storage:clearMessages', conversationId),
    countMessages: (conversationId: string) =>
      ipcRenderer.invoke('storage:countMessages', conversationId),
    searchMessages: (conversationId: string, query: string, limit?: number) =>
      ipcRenderer.invoke('storage:searchMessages', conversationId, query, limit),
    deleteMessage: (conversationId: string, messageId: string) =>
      ipcRenderer.invoke('storage:deleteMessage', conversationId, messageId),
    watchConversation: (conversationId: string) =>
      ipcRenderer.invoke('storage:watchConversation', conversationId),
    unwatchConversation: (conversationId: string) =>
      ipcRenderer.invoke('storage:unwatchConversation', conversationId),
    getConversationVersion: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationVersion', conversationId),
    getConversationDiff: (conversationId: string, fromVersion: number, toVersion?: number) =>
      ipcRenderer.invoke('storage:getConversationDiff', conversationId, fromVersion, toVersion),
    truncateConversation: (conversationId: string, maxMessages: number) =>
      ipcRenderer.invoke('storage:truncateConversation', conversationId, maxMessages),
    getConversationStorageInfo: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationStorageInfo', conversationId),
    onConversationChanged: (callback: (data: { conversationId: string; version: number }) => void) =>
      createListener('storage:conversationChanged', callback),
    saveContact: (contact: unknown) =>
      ipcRenderer.invoke('storage:saveContact', contact),
    getContacts: () => ipcRenderer.invoke('storage:getContacts'),
    getContact: (publicKey: string) => ipcRenderer.invoke('storage:getContact', publicKey),
    deleteContact: (publicKey: string) => ipcRenderer.invoke('storage:deleteContact', publicKey),
    saveGroup: (group: unknown) => ipcRenderer.invoke('storage:saveGroup', group),
    getGroups: () => ipcRenderer.invoke('storage:getGroups'),
    getGroup: (groupId: string) => ipcRenderer.invoke('storage:getGroup', groupId),
    deleteGroup: (groupId: string) => ipcRenderer.invoke('storage:deleteGroup', groupId),
    putBlob: (data: ArrayBuffer) => ipcRenderer.invoke('storage:putBlob', Buffer.from(data)),
    getBlob: (id: string) => ipcRenderer.invoke('storage:getBlob', id),
    getBlobRange: (id: string, start: number, length: number) =>
      ipcRenderer.invoke('storage:getBlobRange', id, start, length),
    deleteBlob: (id: string) => ipcRenderer.invoke('storage:deleteBlob', id),
    getBlobInfo: (id: string) => ipcRenderer.invoke('storage:getBlobInfo', id),
    streamBlob: (id: string) => ipcRenderer.invoke('storage:streamBlob', id),
    writeBlobStream: (chunks: ArrayBuffer[]) =>
      ipcRenderer.invoke('storage:writeBlobStream', chunks),
    listConversations: () => ipcRenderer.invoke('storage:listConversations'),
    getCoreCount: () => ipcRenderer.invoke('storage:getCoreCount'),
    downloadConversationBlocks: (conversationId: string, blocks: number[]) =>
      ipcRenderer.invoke('storage:downloadConversationBlocks', conversationId, blocks),
    hasConversationBlocks: (conversationId: string, start: number, end?: number) =>
      ipcRenderer.invoke('storage:hasConversationBlocks', conversationId, start, end),
    seekConversationOffset: (conversationId: string, byteOffset: number) =>
      ipcRenderer.invoke('storage:seekConversationOffset', conversationId, byteOffset),
    updateConversation: (conversationId: string) =>
      ipcRenderer.invoke('storage:updateConversation', conversationId),
    getConversationHistory: (conversationId: string, options?: { live?: boolean; reverse?: boolean; limit?: number; gte?: number; lte?: number }) =>
      ipcRenderer.invoke('storage:getConversationHistory', conversationId, options),
    getConversationBySeq: (conversationId: string, seq: number) =>
      ipcRenderer.invoke('storage:getConversationBySeq', conversationId, seq),
    getConversationTreeHash: (conversationId: string, length?: number) =>
      ipcRenderer.invoke('storage:getConversationTreeHash', conversationId, length),
    createConversationReadStream: (conversationId: string, options?: { start?: number; end?: number; live?: boolean }) =>
      ipcRenderer.invoke('storage:createConversationReadStream', conversationId, options),
    batchConversationOperations: (conversationId: string, operations: Array<{ type: 'put' | 'del'; key: string; value?: unknown }>) =>
      ipcRenderer.invoke('storage:batchConversationOperations', conversationId, operations),
    setConversationUserData: (conversationId: string, key: string, value: string | Buffer) =>
      ipcRenderer.invoke('storage:setConversationUserData', conversationId, key, value),
    getConversationUserData: (conversationId: string, key: string) =>
      ipcRenderer.invoke('storage:getConversationUserData', conversationId, key),
    getConversationRemoteContiguousLength: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationRemoteContiguousLength', conversationId),
    onConversationEvent: (conversationId: string, event: string, callbackId: string) =>
      ipcRenderer.invoke('storage:onConversationEvent', conversationId, event, callbackId),
    onConversationEventReceived: (callback: (data: { callbackId: string; data: unknown }) => void) => {
      const handler = (_event: unknown, payload: { callbackId: string; data: unknown }) => callback(payload)
      ipcRenderer.on('storage:conversationEvent', handler)
      return () => ipcRenderer.removeListener('storage:conversationEvent', handler)
    },
    cancelConversationDownload: (conversationId: string, range: unknown) =>
      ipcRenderer.invoke('storage:cancelConversationDownload', conversationId, range),
    putConversationWithCas: (conversationId: string, key: string, value: unknown) =>
      ipcRenderer.invoke('storage:putConversationWithCas', conversationId, key, value),
    getConversationProof: (conversationId: string, opts?: { index?: number }) =>
      ipcRenderer.invoke('storage:getConversationProof', conversationId, opts),
    verifyConversationProof: (conversationId: string, proof: unknown) =>
      ipcRenderer.invoke('storage:verifyConversationProof', conversationId, proof),
    getConversationSignable: (conversationId: string, length?: number, fork?: number) =>
      ipcRenderer.invoke('storage:getConversationSignable', conversationId, length, fork),
    createConversationWriteStream: (conversationId: string, chunks: unknown[]) =>
      ipcRenderer.invoke('storage:createConversationWriteStream', conversationId, chunks),
    getConversationManifest: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationManifest', conversationId),
    getConversationDiscoveryKey: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationDiscoveryKey', conversationId),
    getConversationSignedLength: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationSignedLength', conversationId),
    isConversationWritable: (conversationId: string) =>
      ipcRenderer.invoke('storage:isConversationWritable', conversationId),
    isConversationReadable: (conversationId: string) =>
      ipcRenderer.invoke('storage:isConversationReadable', conversationId),
    getConversationByteLength: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationByteLength', conversationId),
    getConversationContiguousLength: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationContiguousLength', conversationId),
    getConversationFork: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationFork', conversationId),
    getConversationLength: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationLength', conversationId),
    getConversationCoreId: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationCoreId', conversationId),
    getConversationCoreKey: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationCoreKey', conversationId),
    getConversationPeers: (conversationId: string) =>
      ipcRenderer.invoke('storage:getConversationPeers', conversationId),
    setConversationEncryption: (conversationId: string, encryption: unknown) =>
      ipcRenderer.invoke('storage:setConversationEncryption', conversationId, encryption),
    replicateConversation: (conversationId: string, isInitiator: boolean) =>
      ipcRenderer.invoke('storage:replicateConversation', conversationId, isInitiator),
    setConversationKeyPair: (conversationId: string, keyPair: { publicKey: string; secretKey: string }) =>
      ipcRenderer.invoke('storage:setConversationKeyPair', conversationId, keyPair),
    setConversationActive: (conversationId: string, active: boolean) =>
      ipcRenderer.invoke('storage:setConversationActive', conversationId, active),
    getMaxSuggestedBlockSize: () =>
      ipcRenderer.invoke('storage:getMaxSuggestedBlockSize'),
    getDiscoveryKeyFromKey: (publicKey: string) =>
      ipcRenderer.invoke('storage:getDiscoveryKeyFromKey', publicKey),
    getBlockEncryptionKey: (key: string, encryptionKey: string) =>
      ipcRenderer.invoke('storage:getBlockEncryptionKey', key, encryptionKey),
    getKeyFromManifest: (manifest: unknown, options?: { compat?: boolean; version?: number; namespace?: Buffer }) =>
      ipcRenderer.invoke('storage:getKeyFromManifest', manifest, options),
    createProtocolStream: (isInitiator: boolean, opts?: { ondiscoverykey?: (discoveryKey: Buffer) => void }) =>
      ipcRenderer.invoke('storage:createProtocolStream', isInitiator, opts),
    getProtocolMuxer: (stream: unknown) =>
      ipcRenderer.invoke('storage:getProtocolMuxer', stream),
    getDefaultStorage: (storagePath: string, opts?: Record<string, unknown>) =>
      ipcRenderer.invoke('storage:getDefaultStorage', storagePath, opts),
    createCore: (storage: unknown, opts?: Record<string, unknown>) =>
      ipcRenderer.invoke('storage:createCore', storage, opts),
    closeConversation: (conversationId: string, error?: Error) =>
      ipcRenderer.invoke('storage:closeConversation', conversationId, error),
    waitForConversationReady: (conversationId: string) =>
      ipcRenderer.invoke('storage:waitForConversationReady', conversationId),
    onConversationPeerAdd: (conversationId: string) =>
      ipcRenderer.send('storage:onConversationPeerAdd', conversationId),
    onConversationPeerRemove: (conversationId: string) =>
      ipcRenderer.send('storage:onConversationPeerRemove', conversationId),
    onConversationUpload: (conversationId: string) =>
      ipcRenderer.send('storage:onConversationUpload', conversationId),
    onConversationDownload: (conversationId: string) =>
      ipcRenderer.send('storage:onConversationDownload', conversationId),
    onConversationAppend: (conversationId: string) =>
      ipcRenderer.send('storage:onConversationAppend', conversationId),
    onConversationTruncate: (conversationId: string) =>
      ipcRenderer.send('storage:onConversationTruncate', conversationId),
    onConversationRemoteContiguousLength: (conversationId: string) =>
      ipcRenderer.send('storage:onConversationRemoteContiguousLength', conversationId),
    onConversationClose: (conversationId: string) =>
      ipcRenderer.send('storage:onConversationClose', conversationId),
    onConversationReady: (conversationId: string) =>
      ipcRenderer.send('storage:onConversationReady', conversationId),
    suspendStorage: () => ipcRenderer.invoke('storage:suspendStorage'),
    resumeStorage: () => ipcRenderer.invoke('storage:resumeStorage'),
    createDeterministicKeyPair: (name: string, namespace?: string) =>
      ipcRenderer.invoke('storage:createDeterministicKeyPair', name, namespace),
    getSubBee: (conversationId: string, prefix: string) =>
      ipcRenderer.invoke('storage:getSubBee', conversationId, prefix),
    watchKey: (conversationId: string, key: string, callbackId: string) =>
      ipcRenderer.invoke('storage:watchKey', conversationId, key, callbackId),
    onKeyChanged: (callback: (data: { callbackId: string; value: unknown }) => void) =>
      createListener('storage:keyChanged', callback),
    createCorestoreSession: () => ipcRenderer.invoke('storage:createCorestoreSession'),
    notifyGroup: (topic: string) => ipcRenderer.invoke('storage:notifyGroup', topic),
    getGroupUpdates: (handle: unknown, opts?: { since?: number; reverse?: boolean }) =>
      ipcRenderer.invoke('storage:getGroupUpdates', handle, opts),
    destroyGroupHandle: (handle: unknown) => ipcRenderer.invoke('storage:destroyGroupHandle', handle),
    onGroupActive: () => ipcRenderer.send('storage:onGroupActive'),
    onGroupActiveEvent: (callback: (topic: string) => void) =>
      createListener('storage:groupActive', callback),
    clearAll: () => ipcRenderer.invoke('storage:clearAll'),
    exportData: () => ipcRenderer.invoke('storage:exportData'),
    importData: (data: unknown) => ipcRenderer.invoke('storage:importData', data),
  },
  notifications: {
    show: (title: string, body: string, options?: NotificationOptions) =>
      ipcRenderer.send('notifications:show', title, body, options),
    requestPermission: () => ipcRenderer.invoke('notifications:requestPermission'),
  },
  file: {
    saveAs: (blobId: string, suggestedName: string) => ipcRenderer.invoke('file:save-as', blobId, suggestedName),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => process.platform,
    openExternal: (url: string) => ipcRenderer.send('app:openExternal', url),
    getTheme: () => ipcRenderer.invoke('app:getTheme'),
    onThemeChange: (callback: (theme: 'light' | 'dark') => void) =>
      createListener('app:themeChange', callback),
  },
} satisfies AsgardAPI)

// Type declarations for renderer usage
interface IdentityResult {
  publicKey: string
  keyPair: { publicKey: Uint8Array; secretKey: Uint8Array }
}

interface SerializedIdentity {
  publicKey: string
  secretKey: string
  profile: {
    displayName: string
    status: string
    avatar?: string
    about?: string
  }
}

interface PeerInfo {
  id: string
  publicKey: string
  remotePublicKey: string
  ed25519PublicKey?: string | null
  connected: boolean
}

interface NetworkMessage {
  from: string
  data: Uint8Array
  timestamp: number
}

interface NetworkStatusInfo {
  connected: boolean
  peers: number
  topics: string[]
  bandwidth: { up: number; down: number }
  connecting: number
  peerLatency: Record<string, number>
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

interface NotificationOptions {
  icon?: string
  silent?: boolean
  urgency?: 'normal' | 'critical' | 'low'
}
