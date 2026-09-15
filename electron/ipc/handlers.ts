import { BrowserWindow, ipcMain, app, nativeTheme, shell, Notification, dialog } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { IdentityService } from '../services/IdentityService'
import { NetworkService } from '../services/NetworkService'
import { StorageService } from '../services/StorageService'
import { configureFirewall, checkFirewallRule, runFirewallHelperAsAdmin, getFirewallStatus } from '../services/FirewallService'
import { AsgardTray } from '../tray'

/**
 * Registers all IPC handlers for the main process.
 * Separates concerns: window management, identity, network, storage, notifications, app.
 */
let storageService: StorageService | null = null
let networkServiceRef: NetworkService | null = null

// ── Quit cleanup coordination (pattern officiel Electron) ─────────────────────
// ELECTRON/HOLEPUNCH CONFORMANCE : Electron n'attend PAS les promesses des
// listeners 'before-quit'. Un listener `async () => { await service.destroy() }`
// s'interrompt au premier await — le statut 'offline' DHT
// (NetworkService.destroy → publishStatus) et la fermeture propre du corestore
// (StorageService.destroy) ne s'exécutaient donc JAMAIS jusqu'au bout, et les
// contacts voyaient l'utilisateur « online » jusqu'à l'expiration du TTL DHT.
// Pattern requis : event.preventDefault() + flag + cleanup SÉQUENTIEL + re-quit.
// L'ordre d'enregistrement est critique : le swarm DOIT être détruit AVANT le
// corestore (swarm.destroy() ferme les streams de réplication corestore).
const quitCleanups: Array<{ name: string; fn: () => Promise<void> }> = []
let quitCleanupStarted = false

function registerQuitCleanup(name: string, fn: () => Promise<void>): void {
  quitCleanups.push({ name, fn })
}

app.on('before-quit', (event) => {
  if (quitCleanupStarted) return // re-quit après cleanup — laisser le quit procéder
  quitCleanupStarted = true
  event.preventDefault()

  // Filet de sécurité : ne jamais bloquer la fermeture au-delà de 5s
  // (DHT injoignable, corestore verrouillé, etc.)
  const forceQuitTimer = setTimeout(() => {
    console.error('[Quit] Cleanup timeout after 5s — forcing exit')
    app.exit(0)
  }, 5000)

  void (async () => {
    // Exécution SÉQUENTIELLE dans l'ordre d'enregistrement (network → storage)
    for (const { name, fn } of quitCleanups) {
      try {
        await fn()
        console.log(`[Quit] ${name} cleanup complete`)
      } catch (err) {
        console.error(`[Quit] ${name} cleanup failed:`, err)
      }
    }
    clearTimeout(forceQuitTimer)
    app.quit() // re-quit : quitCleanupStarted=true → quit réel
  })()
})

function getStorage(): StorageService {
  if (!storageService) {
    storageService = new StorageService()
  }
  return storageService
}

/**
 * FERMETURE PROPRE : tout envoi vers le renderer passe par ici.
 *
 * La `BrowserWindow` est détruite dès que l'utilisateur ferme la fenêtre, alors
 * que le réseau, lui, continue d'émettre pendant tout le shutdown (les timers
 * Hyperswarm ne sont arrêtés qu'après `publishStatus('offline')`, lui-même
 * séquentiel dans `quitCleanups`). `webContents.send()` sur un objet détruit
 * lève `TypeError: Object has been destroyed` ; non rattrapée dans le process
 * principal, cette exception affichait la boîte « A JavaScript error occurred in
 * the main process » à chaque fermeture de l'application (stack : updatePeerScores
 * → emit('status:update') → listener → webContents.send).
 *
 * Une exception en fermeture n'est jamais une erreur utilisateur : on perd la
 * trame, on journalise une seule fois, et la fermeture se poursuit normalement.
 */
let destroyedSendLogged = false
function safeSend(win: BrowserWindow | null | undefined, channel: string, payload?: unknown): boolean {
  if (!win || win.isDestroyed()) return false
  const contents = win.webContents
  if (!contents || contents.isDestroyed()) return false
  try {
    contents.send(channel, payload)
    return true
  } catch (err) {
    if (!destroyedSendLogged) {
      destroyedSendLogged = true
      console.warn(`[IPC] envoi '${channel}' ignoré (renderer indisponible):`, err instanceof Error ? err.message : err)
    }
    return false
  }
}

export async function setupIpcHandlers(mainWindow: BrowserWindow, tray?: AsgardTray): Promise<void> {
  // Guard: remove all existing handlers to prevent double registration on reload
  const channels = [
    'window:isMaximized',
    'ui:setLanguage',
    'identity:create', 'identity:load', 'identity:save', 'identity:exists',
    'network:join', 'network:leave', 'network:send', 'network:status',
    'network:getLivePeers',
    'network:getStoredPeers', 'network:blockPeer', 'network:unblockPeer',
    'network:setPeerPriorized', 'network:banPeer', 'network:refreshServer',
    'network:getPeerCount', 'network:getTopics', 'network:getBandwidth',
    'storage:getPath', 'storage:getSize', 'storage:putBlob', 'storage:getBlob',
    'storage:deleteBlob', 'storage:listBlobs',
    'storage:contacts:save', 'storage:contacts:load',
    'storage:messages:save', 'storage:messages:load',
    'storage:conversations:save', 'storage:conversations:load',
    'storage:settings:save', 'storage:settings:load',
    'notifications:requestPermission',
    'app:getVersion', 'app:getTheme', 'app:getPendingDeepLink',
  ]
  for (const ch of channels) {
    try { ipcMain.removeHandler(ch) } catch { /* ignore */ }
  }

  // Debug logging from renderer → main process log file
  ipcMain.removeAllListeners('debug:log')
  ipcMain.on('debug:log', (_event, msg: string) => {
    console.log('[Renderer]', msg)
  })

  // ── CRITICAL: Register ALL handlers SYNCHRONOUSLY first ──
  // This ensures IPC handlers are available before the renderer starts executing.
  // The async storage initialization (corestore) happens AFTER all handlers are registered.
  setupWindowHandlers(mainWindow, tray)
  setupIdentityHandlers()
  setupNetworkHandlers(mainWindow)
  setupNotificationHandlers()
  setupAppHandlers()

  // ── Now do async storage initialization ──
  await setupStorageHandlers()

  // Wire Corestore to NetworkService after storage is ready
  const corestore = getStorage().getCorestore()
  if (corestore && networkServiceRef) {
    networkServiceRef.setCorestore(corestore as unknown as { replicate: (stream: unknown) => unknown })
    console.log('[Handlers] Corestore wired to NetworkService after storage init')
  }
}

// ─── Window Handlers ────────────────────────────────────────────────────────

function setupWindowHandlers(win: BrowserWindow, tray?: AsgardTray): void {
  ipcMain.on('window:minimize', () => win.minimize())

  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on('window:close', () => {
    app.isQuitting = true
    win.close()
  })

  ipcMain.handle('window:isMaximized', () => win.isMaximized())

  // Language sync: renderer → main. Localizes the native tray menu
  // (the main process has no access to i18next, see electron/tray.ts).
  ipcMain.handle('ui:setLanguage', (_event, lang: string) => {
    tray?.setLanguage(lang)
    return true
  })

  // Notify renderer of maximize state changes
  win.on('maximize', () => safeSend(win, 'window:maximizeChange', true))
  win.on('unmaximize', () => safeSend(win, 'window:maximizeChange', false))
}

// ─── Identity Handlers ───────────────────────────────────────────────────────

function setupIdentityHandlers(): void {
  const identityService = new IdentityService()

  ipcMain.handle('identity:create', async () => {
    return await identityService.createIdentity()
  })

  ipcMain.handle('identity:load', async () => {
    return await identityService.loadIdentity()
  })

  ipcMain.handle('identity:save', async (_event, identity) => {
    return await identityService.saveIdentity(identity)
  })

  ipcMain.handle('identity:exists', async () => {
    return await identityService.identityExists()
  })

  // Seed phrase export/import (BIP39-style)
  ipcMain.handle('identity:exportSeedPhrase', async () => {
    try {
      return await identityService.exportSeedPhrase()
    } catch (err) {
      console.error('[IPC] identity:exportSeedPhrase failed:', err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('identity:importSeedPhrase', async (_event, words: string[]) => {
    console.log('[IPC] identity:importSeedPhrase called with', words.length, 'words')
    try {
      const result = await identityService.importSeedPhrase(words)
      console.log('[IPC] identity:importSeedPhrase SUCCESS, publicKey:', result.publicKey.slice(0, 16))
      return result
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : JSON.stringify(err)
      console.error('[IPC] identity:importSeedPhrase failed:', errMsg)
      console.error('[IPC] Error details:', err instanceof Error ? err.stack : String(err))
      throw new Error(errMsg)
    }
  })
}

// ─── Network Handlers ────────────────────────────────────────────────────────

function setupNetworkHandlers(win: BrowserWindow): void {
  const networkService = new NetworkService()
  networkServiceRef = networkService // Store reference for corestore wiring after storage init

  // Corestore will be wired after storage initialization completes.
  // It's only needed when peers connect (async), so this is safe.

  // Forward network events to renderer
  networkService.on('peer', (peer) => {
    safeSend(win, 'network:peer', peer)
  })

  networkService.on('message', (msg) => {
    safeSend(win, 'network:message', msg)
  })

  // Forward media data (audio/video chunks) to renderer
  networkService.on('media', (msg) => {
    safeSend(win, 'network:media', msg)
  })

  // Forward file transfer data to renderer (dedicated Protomux channel)
  networkService.on('file', (msg) => {
    safeSend(win, 'network:file', msg)
  })

  // Forward peer identity events (Ed25519 key mapped to Hyperswarm peer ID)
  networkService.on('peer:identified', (data) => {
    safeSend(win, 'network:peerIdentified', data)
  })

  // PERFORMANCE: Forward peer ban events to UI
  networkService.on('peer:banned', (data) => {
    safeSend(win, 'network:peerBanned', data)
  })

  // PERFORMANCE: Forward real-time status updates to UI
  networkService.on('status:update', (status) => {
    safeSend(win, 'network:statusUpdate', status)
  })

  ipcMain.handle('network:join', async (_event, topic: string) => {
    return await networkService.join(topic)
  })

  ipcMain.handle('network:setIdentity', async (_event, publicKeyHex: string) => {
    // Derive a 32-byte seed from the Ed25519 public key for deterministic Hyperswarm identity
    const crypto = await import('crypto')
    const seed = crypto.createHash('sha256').update(publicKeyHex).digest()
    // CRITICAL: Set the local public key BEFORE starting Hyperswarm.
    // setSeed() creates the Hyperswarm instance which immediately starts accepting
    // connections. If a peer connects before setLocalPublicKey is called,
    // this.localPublicKey is null and the identity is never sent — breaking
    // all presence detection and contact discovery.
    networkService.setLocalPublicKey(publicKeyHex)
    await networkService.setSeed(seed.toString('hex'))
    return { peerId: seed.toString('hex').slice(0, 64) }
  })

  ipcMain.handle('network:deriveNoisePublicKey', async (_event, ed25519PublicKeyHex: string) => {
    return await networkService.deriveNoisePublicKey(ed25519PublicKeyHex)
  })

  ipcMain.handle('network:setLocalPublicKey', async (_event, publicKeyHex: string) => {
    networkService.setLocalPublicKey(publicKeyHex)
  })

  ipcMain.handle('network:reidentifyAll', async () => {
    networkService.reidentifyAll()
  })

  ipcMain.handle('network:leave', async (_event, topic: string) => {
    return await networkService.leave(topic)
  })

  ipcMain.handle('network:send', async (_event, peerId: string, data: unknown) => {
    // PERFORMANCE: Fast-path conversion for contextBridge-serialized Uint8Array.
    let buf: Buffer
    if (Buffer.isBuffer(data)) {
      buf = data
    } else if (data instanceof Uint8Array) {
      buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    } else if (data && typeof data === 'object') {
      // contextBridge serializes Uint8Array as object with numeric keys
      // Use Buffer.from() which handles array-like objects efficiently
      const obj = data as Record<string, unknown>
      const len = typeof obj.length === 'number' ? obj.length as number : 0
      if (len > 0) {
        const arr = new Uint8Array(len)
        for (let i = 0; i < len; i++) arr[i] = Number(obj[i])
        buf = Buffer.from(arr)
      } else {
        throw new Error('Invalid data type for network:send')
      }
    } else {
      throw new Error('Invalid data type for network:send')
    }
    try {
      await networkService.send(peerId, buf)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[NetworkService] send failed:', msg)
      throw new Error(msg)
    }
  })

  ipcMain.handle('network:sendMedia', async (_event, peerId: string, data: Uint8Array) => {
    return await networkService.sendMedia(peerId, data)
  })

  // HOLEPUNCH PATTERN: Batch media send with cork/uncork for optimal audio throughput
  ipcMain.handle('network:sendMediaBatch', async (_event, peerId: string, dataArray: unknown[]) => {
    if (!Array.isArray(dataArray) || dataArray.length === 0) return
    const chunks: Uint8Array[] = []
    for (const data of dataArray) {
      if (Buffer.isBuffer(data)) {
        chunks.push(new Uint8Array(data))
      } else if (data instanceof Uint8Array) {
        chunks.push(data)
      } else if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>
        const len = typeof obj.length === 'number' ? obj.length as number : 0
        if (len <= 0) continue
        const arr = new Uint8Array(len)
        for (let i = 0; i < len; i++) arr[i] = Number(obj[i])
        chunks.push(arr)
      }
    }
    return await networkService.sendMediaBatch(peerId, chunks)
  })

  // HOLEPUNCH PATTERN: Dedicated file transfer channel for isolation from media
  ipcMain.handle('network:sendFileData', async (_event, peerId: string, data: Uint8Array) => {
    return await networkService.sendFileData(peerId, data)
  })

  // PERFORMANCE: Batch send — cork, send all messages, uncork in a single IPC call.
  // Avoids N*2 IPC round-trips for cork/uncork when sending multiple messages.
  ipcMain.handle('network:sendBatch', async (_event, peerId: string, dataArray: unknown[]) => {
    if (!Array.isArray(dataArray) || dataArray.length === 0) return

    // Cork the channel
    await networkService.corkChannel(peerId)

    try {
      for (const data of dataArray) {
        let buf: Buffer
        if (Buffer.isBuffer(data)) {
          buf = data
        } else if (data instanceof Uint8Array) {
          buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        } else if (data && typeof data === 'object') {
          const obj = data as Record<string, unknown>
          const len = typeof obj.length === 'number' ? obj.length as number : 0
          if (len <= 0) continue
          const arr = new Uint8Array(len)
          for (let i = 0; i < len; i++) arr[i] = Number(obj[i])
          buf = Buffer.from(arr)
        } else {
          continue
        }
        await networkService.send(peerId, buf)
      }
    } finally {
      // Always uncork to flush
      await networkService.uncorkChannel(peerId)
    }
  })

  // CONNECTIVITY: Check if a peer is connected
  ipcMain.handle('network:isPeerConnected', async (_event, peerId: string) => {
    return networkService.isPeerConnected(peerId)
  })

  // CONNECTIVITY: Wait for a peer to connect with timeout
  ipcMain.handle('network:waitForPeer', async (_event, peerId: string, timeoutMs?: number) => {
    return await networkService.waitForPeer(peerId, timeoutMs)
  })

  // PERFORMANCE: Cork/Uncork Protomux channels for batch sending
  ipcMain.handle('network:cork', async (_event, peerId: string) => {
    networkService.corkChannel(peerId)
  })

  ipcMain.handle('network:uncork', async (_event, peerId: string) => {
    networkService.uncorkChannel(peerId)
  })

  // PERFORMANCE: Prioritize known peers for fast reconnection
  ipcMain.handle('network:prioritize', async (_event, peerId: string, prioritized: boolean) => {
    networkService.prioritizePeer(peerId, prioritized)
  })

  // PERFORMANCE: Direct peer connections (bypass DHT lookup)
  ipcMain.handle('network:joinPeer', async (_event, noisePublicKeyHex: string) => {
    networkService.joinPeer(noisePublicKeyHex)
  })

  // CONNECTIVITY: Connect to a contact with prioritization
  ipcMain.handle('network:connectToContact', async (_event, noisePublicKeyHex: string, prioritized: boolean) => {
    networkService.connectToContact(noisePublicKeyHex, prioritized)
  })

  ipcMain.handle('network:leavePeer', async (_event, noisePublicKeyHex: string) => {
    networkService.leavePeer(noisePublicKeyHex)
  })

  // PERFORMANCE: Suspend/resume swarm for battery saving
  ipcMain.handle('network:suspend', async () => {
    await networkService.suspend()
  })

  ipcMain.handle('network:resume', async () => {
    await networkService.resume()
  })

  // PERFORMANCE: Wait for all pending DHT announces and connections
  ipcMain.handle('network:flush', async () => {
    await networkService.flush()
  })

  ipcMain.handle('network:updateConfig', async (_event, config: { maxPeers?: number; relayEnabled?: boolean }) => {
    networkService.updateConfig(config)
  })

  // PERFORMANCE: Block/unblock peers via firewall
  ipcMain.handle('network:blockPeer', async (_event, noisePublicKeyHex: string, blocked: boolean) => {
    networkService.blockPeer(noisePublicKeyHex, blocked)
  })

  // PERFORMANCE: Get peer quality scores for diagnostics
  ipcMain.handle('network:getPeerScores', async () => {
    return networkService.getPeerScores()
  })

  // DHT Profile publishing and fetching
  ipcMain.handle('network:publishProfile', async (_event, displayName: string, avatar?: string) => {
    return await networkService.publishProfile(displayName, avatar)
  })

  ipcMain.handle('network:fetchProfile', async (_event, publicKeyHex: string) => {
    return await networkService.fetchProfile(publicKeyHex)
  })

  ipcMain.handle('network:clearProfileCache', async (_event, publicKeyHex?: string) => {
    networkService.clearProfileCache(publicKeyHex)
  })

  // STATUS: Publish and get user online status
  ipcMain.handle('network:publishStatus', async (_event, status: 'online' | 'away' | 'offline' | 'dnd', statusMessage?: string) => {
    return await networkService.publishStatus(status, statusMessage)
  })

  ipcMain.handle('network:getCurrentStatus', async () => {
    return networkService.getCurrentStatus()
  })

  // IMMUTABLE RECORDS: Store and fetch public immutable data in DHT
  ipcMain.handle('network:immutablePut', async (_event, valueHex: string) => {
    return await networkService.immutablePut(Buffer.from(valueHex, 'hex'))
  })

  ipcMain.handle('network:immutableGet', async (_event, hash: string) => {
    const result = await networkService.immutableGet(hash)
    return result ? result.toString('hex') : null
  })

  // OPTIMIZATION: Protomux channel diagnostics
  ipcMain.handle('network:isChannelOpen', async (_event, peerId: string) => {
    return networkService.isChannelOpen(peerId)
  })

  ipcMain.handle('network:getActiveChannelPeers', async () => {
    return networkService.getActiveChannelPeers()
  })

  ipcMain.handle('network:isIdle', async () => {
    return networkService.isIdle()
  })

  // OPTIMIZATION: SecretStream session identification and metrics
  ipcMain.handle('network:getHandshakeHash', async (_event, peerId: string) => {
    return networkService.getHandshakeHash(peerId)
  })

  ipcMain.handle('network:getPeerBandwidth', async (_event, peerId: string) => {
    return networkService.getPeerBandwidth(peerId)
  })

  ipcMain.handle('network:setPeerKeepAlive', async (_event, peerId: string, ms: number) => {
    networkService.setPeerKeepAlive(peerId, ms)
  })

  // OPTIMIZATION: Hyperswarm call optimization
  ipcMain.handle('network:getConnectingCount', async () => {
    return networkService.getConnectingCount()
  })

  ipcMain.handle('network:getConnectedPeersInfo', async () => {
    return networkService.getConnectedPeersInfo()
  })

  ipcMain.handle('network:setPeerPriorized', async (_event, peerPublicKey: string, prioritized: boolean) => {
    return networkService.setPeerPriorized(peerPublicKey, prioritized)
  })

  ipcMain.handle('network:banPeer', async (_event, peerPublicKey: string, banStatus: boolean) => {
    return networkService.banPeer(peerPublicKey, banStatus)
  })

  ipcMain.handle('network:getBlockedPeers', async () => {
    return networkService.getBlockedPeers()
  })

  // CONFORMITÉ IPC : le canal mort 'network:onPeerBan' → 'network:peerBan' a été
  // retiré — les événements de bannissement Hyperswarm atteignent déjà le
  // renderer via le forwarding 'peer:banned' → 'network:peerBanned'
  // (→ preload onPeerBanned). Le second listener était redondant.

  // OPTIMIZATION: HyperDHT call optimization
  ipcMain.handle('network:setFirewall', async (
    _event,
    firewallFn: (remotePublicKey: string, remoteHandshakePayload: unknown) => boolean
  ) => {
    return networkService.setFirewall(firewallFn)
  })

  ipcMain.handle('network:getServerAddress', async () => {
    return networkService.getServerAddress()
  })

  ipcMain.handle('network:refreshServer', async () => {
    return networkService.refreshServer()
  })

  // OPTIMIZATION: Hyperswarm power management and flush
  ipcMain.handle('network:suspendSwarm', async () => {
    return await networkService.suspendSwarm()
  })

  ipcMain.handle('network:resumeSwarm', async () => {
    return await networkService.resumeSwarm()
  })

  ipcMain.handle('network:flushSwarm', async () => {
    return await networkService.flushSwarm()
  })

  // OPTIMIZATION: HyperDHT direct operations
  ipcMain.handle('network:dhtLookup', async (_event, topicHex: string) => {
    const topic = Buffer.from(topicHex, 'hex')
    return await networkService.dhtLookup(topic)
  })

  ipcMain.handle('network:dhtAnnounce', async (_event, topicHex: string) => {
    const topic = Buffer.from(topicHex, 'hex')
    return await networkService.dhtAnnounce(topic)
  })

  ipcMain.handle('network:dhtUnannounce', async (_event, topicHex: string) => {
    const topic = Buffer.from(topicHex, 'hex')
    return await networkService.dhtUnannounce(topic)
  })

  // CONNECTIVITY: Network status monitoring and reconnection
  ipcMain.handle('network:handleNetworkChange', async (_event, online: boolean) => {
    networkService.handleNetworkChange(online)
  })

  ipcMain.handle('network:getConnectivityStatus', async () => {
    return networkService.getConnectivityStatus()
  })

  ipcMain.handle('network:scheduleReconnect', async (_event, peerId: string) => {
    return networkService.scheduleReconnect(peerId)
  })

  ipcMain.handle('network:resetReconnectAttempts', async (_event, peerId: string) => {
    networkService.resetReconnectAttempts(peerId)
  })

  // OPTIMIZATION: HyperDHT direct connect, destroy and keyPair
  ipcMain.handle('network:connectToPeer', async (_event, remotePublicKey: string) => {
    return await networkService.connectToPeer(remotePublicKey)
  })

  ipcMain.handle('network:destroyDht', async (_event, options?: { force?: boolean }) => {
    return await networkService.destroyDht(options)
  })

  ipcMain.handle('network:generateKeyPair', async (_event, seedHex?: string) => {
    const seed = seedHex ? Buffer.from(seedHex, 'hex') : undefined
    return await networkService.generateKeyPair(seed)
  })

  ipcMain.handle('network:status', async () => {
    return networkService.getStatus()
  })

  // CONNECTIVITÉ : réconciliation PULL de la liste des pairs connectés. Les
  // évènements push `network:peer` peuvent être égarés (pair connecté avant
  // l'abonnement du renderer, rechargement de fenêtre) — sans ce pull, le
  // renderer resterait à `peers=0` sur un socket pourtant vivant.
  ipcMain.handle('network:getLivePeers', async () => {
    return networkService.getLivePeers()
  })

  // Cleanup on app quit — AVANT le corestore (ordre d'enregistrement ; cf.
  // registerQuitCleanup en tête de fichier pour le pattern preventDefault/re-quit)
  registerQuitCleanup('network', () => networkService.destroy())
}

// ─── Storage Handlers ────────────────────────────────────────────────────────

async function setupStorageHandlers(): Promise<void> {
  const storage = getStorage()
  await storage.initialize()

  // Legacy handlers
  ipcMain.handle('storage:getPath', () => {
    return path.join(app.getPath('userData'), 'asgard-data')
  })

  ipcMain.handle('storage:getSize', async () => {
    return await storage.getStorageSize()
  })

  // Message handlers
  ipcMain.handle('storage:saveMessage', async (_event, conversationId: string, message) => {
    return await storage.saveMessage(conversationId, message)
  })

  ipcMain.handle('storage:saveMessages', async (_event, conversationId: string, messages) => {
    return await storage.saveMessages(conversationId, messages)
  })

  ipcMain.handle('storage:getMessages', async (_event, conversationId: string, options?) => {
    return await storage.getMessages(conversationId, options)
  })

  ipcMain.handle('storage:getLastMessages', async (_event, conversationId: string, count?: number) => {
    return await storage.getLastMessages(conversationId, count)
  })

  ipcMain.handle('storage:getLatestMessage', async (_event, conversationId: string) => {
    return await storage.getLatestMessage(conversationId)
  })

  ipcMain.handle('storage:clearMessages', async (_event, conversationId: string) => {
    return await storage.clearMessages(conversationId)
  })

  ipcMain.handle('storage:countMessages', async (_event, conversationId: string) => {
    return await storage.countMessages(conversationId)
  })

  // PERFORMANCE: Search messages by content with early termination
  ipcMain.handle('storage:searchMessages', async (_event, conversationId: string, query: string, limit?: number) => {
    return await storage.searchMessages(conversationId, query, limit)
  })

  ipcMain.handle('storage:deleteMessage', async (_event, conversationId: string, messageId: string) => {
    return await storage.deleteMessage(conversationId, messageId)
  })

  // OPTIMIZATION: Watch conversation for real-time changes
  ipcMain.handle('storage:watchConversation', async (_event, conversationId: string) => {
    return await storage.watchConversation(conversationId, (version) => {
      // Emit event to renderer
      _event.sender.send('storage:conversationChanged', { conversationId, version })
    })
  })

  ipcMain.handle('storage:unwatchConversation', async (_event, conversationId: string) => {
    return await storage.unwatchConversation(conversationId)
  })

  ipcMain.handle('storage:getConversationVersion', async (_event, conversationId: string) => {
    return await storage.getConversationVersion(conversationId)
  })

  // OPTIMIZATION: Get diff between conversation versions for efficient sync
  ipcMain.handle('storage:getConversationDiff', async (
    _event,
    conversationId: string,
    fromVersion: number,
    toVersion?: number
  ) => {
    return await storage.getConversationDiff(conversationId, fromVersion, toVersion)
  })

  // OPTIMIZATION: Truncate conversation history
  ipcMain.handle('storage:truncateConversation', async (_event, conversationId: string, maxMessages: number) => {
    return await storage.truncateConversation(conversationId, maxMessages)
  })

  // OPTIMIZATION: Get conversation storage info (Hypercore level)
  ipcMain.handle('storage:getConversationStorageInfo', async (_event, conversationId: string) => {
    return await storage.getConversationStorageInfo(conversationId)
  })

  // Contact handlers
  ipcMain.handle('storage:saveContact', async (_event, contact) => {
    return await storage.saveContact(contact)
  })

  ipcMain.handle('storage:getContacts', async () => {
    return await storage.getContacts()
  })

  ipcMain.handle('storage:getContact', async (_event, publicKey: string) => {
    return await storage.getContact(publicKey)
  })

  ipcMain.handle('storage:deleteContact', async (_event, publicKey: string) => {
    return await storage.deleteContact(publicKey)
  })

  // Group handlers
  ipcMain.handle('storage:saveGroup', async (_event, group) => {
    return await storage.saveGroup(group)
  })

  ipcMain.handle('storage:getGroups', async () => {
    return await storage.getGroups()
  })

  ipcMain.handle('storage:getGroup', async (_event, groupId: string) => {
    return await storage.getGroup(groupId)
  })

  ipcMain.handle('storage:deleteGroup', async (_event, groupId: string) => {
    return await storage.deleteGroup(groupId)
  })

  // Blob handlers
  ipcMain.handle('storage:putBlob', async (_event, data: Buffer) => {
    return await storage.putBlob(data)
  })

  ipcMain.handle('storage:getBlob', async (_event, id: string) => {
    return await storage.getBlob(id)
  })

  // OPTIMIZATION: Partial blob reads for streaming/resume
  ipcMain.handle('storage:getBlobRange', async (_event, id: string, start: number, length: number) => {
    return await storage.getBlobRange(id, start, length)
  })

  // OPTIMIZATION: Delete blob to free disk space
  ipcMain.handle('storage:deleteBlob', async (_event, id: string) => {
    return await storage.deleteBlob(id)
  })

  // OPTIMIZATION: Get blob metadata
  ipcMain.handle('storage:getBlobInfo', async (_event, id: string) => {
    return await storage.getBlobInfo(id)
  })

  // OPTIMIZATION: Stream blob for reading (large files)
  ipcMain.handle('storage:streamBlob', async (_event, id: string) => {
    const chunks: Buffer[] = []
    for await (const chunk of storage.streamBlob(id)) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  })

  // OPTIMIZATION: Stream blob for writing (large files)
  ipcMain.handle('storage:writeBlobStream', async (_event, chunks: Buffer[]) => {
    async function* toAsyncIterable() {
      for (const chunk of chunks) {
        yield Buffer.from(chunk)
      }
    }
    return await storage.writeBlobStream(toAsyncIterable())
  })

  // OPTIMIZATION: Corestore listing and diagnostics
  ipcMain.handle('storage:listConversations', async () => {
    return await storage.listConversations()
  })

  ipcMain.handle('storage:getCoreCount', async () => {
    return await storage.getCoreCount()
  })

  // OPTIMIZATION: Hypercore block operations
  ipcMain.handle('storage:downloadConversationBlocks', async (
    _event,
    conversationId: string,
    blocks: number[]
  ) => {
    return await storage.downloadConversationBlocks(conversationId, blocks)
  })

  ipcMain.handle('storage:hasConversationBlocks', async (
    _event,
    conversationId: string,
    start: number,
    end?: number
  ) => {
    return await storage.hasConversationBlocks(conversationId, start, end)
  })

  // OPTIMIZATION: Hypercore seek for random byte access
  ipcMain.handle('storage:seekConversationOffset', async (
    _event,
    conversationId: string,
    byteOffset: number
  ) => {
    return await storage.seekConversationOffset(conversationId, byteOffset)
  })

  // OPTIMIZATION: Hypercore update and Hyperbee history/seq access
  ipcMain.handle('storage:updateConversation', async (_event, conversationId: string) => {
    return await storage.updateConversation(conversationId)
  })

  ipcMain.handle('storage:getConversationHistory', async (
    _event,
    conversationId: string,
    options?: { live?: boolean; reverse?: boolean; limit?: number; gte?: number; lte?: number }
  ) => {
    return await storage.getConversationHistory(conversationId, options)
  })

  ipcMain.handle('storage:getConversationBySeq', async (
    _event,
    conversationId: string,
    seq: number
  ) => {
    return await storage.getConversationBySeq(conversationId, seq)
  })

  // OPTIMIZATION: Hypercore treeHash and createReadStream
  ipcMain.handle('storage:getConversationTreeHash', async (
    _event,
    conversationId: string,
    length?: number
  ) => {
    return await storage.getConversationTreeHash(conversationId, length)
  })

  ipcMain.handle('storage:createConversationReadStream', async (
    _event,
    conversationId: string,
    options?: { start?: number; end?: number; live?: boolean }
  ) => {
    const stream = await storage.createConversationReadStream(conversationId, options)
    if (!stream) return null
    
    // Collect stream into array for IPC transport
    const blocks: Buffer[] = []
    try {
      for await (const block of stream) {
        blocks.push(block)
      }
    } catch (err) {
      console.error('[IPC] Failed to read conversation stream:', err)
      return null
    }
    return blocks
  })

  // OPTIMIZATION: Hyperbee batch operations
  ipcMain.handle('storage:batchConversationOperations', async (
    _event,
    conversationId: string,
    operations: Array<{ type: 'put' | 'del'; key: string; value?: unknown }>
  ) => {
    return await storage.batchConversationOperations(conversationId, operations)
  })

  // OPTIMIZATION: Hypercore user data (local metadata)
  ipcMain.handle('storage:setConversationUserData', async (
    _event,
    conversationId: string,
    key: string,
    value: string | Buffer
  ) => {
    return await storage.setConversationUserData(conversationId, key, value)
  })

  ipcMain.handle('storage:getConversationUserData', async (
    _event,
    conversationId: string,
    key: string
  ) => {
    return await storage.getConversationUserData(conversationId, key)
  })

  // OPTIMIZATION: Hypercore events and remote contiguous length
  ipcMain.handle('storage:getConversationRemoteContiguousLength', async (
    _event,
    conversationId: string
  ) => {
    return await storage.getConversationRemoteContiguousLength(conversationId)
  })

  ipcMain.handle('storage:onConversationEvent', async (
    _event,
    conversationId: string,
    event: string,
    callbackId: string
  ) => {
    const cleanup = await storage.onConversationEvent(conversationId, event, callbackId, (data) => {
      const win = BrowserWindow.getAllWindows()[0]
      safeSend(win, 'storage:conversationEvent', { callbackId, data })
    })
    return cleanup
  })

  // OPTIMIZATION: Hypercore range cancel and Hyperbee CAS
  ipcMain.handle('storage:cancelConversationDownload', async (
    _event,
    conversationId: string,
    range: unknown
  ) => {
    return await storage.cancelConversationDownload(conversationId, range)
  })

  ipcMain.handle('storage:putConversationWithCas', async (
    _event,
    conversationId: string,
    key: string,
    value: unknown
  ) => {
    // Default CAS: only update if value changed
    const casFn = (prev: unknown, next: unknown) => {
      const prevVal = (prev as { value: unknown })?.value
      const nextVal = (next as { value: unknown })?.value
      return JSON.stringify(prevVal) !== JSON.stringify(nextVal)
    }
    return await storage.putConversationWithCas(conversationId, key, value, casFn)
  })

  // OPTIMIZATION: Hypercore cryptographic proofs
  ipcMain.handle('storage:getConversationProof', async (
    _event,
    conversationId: string,
    opts?: { index?: number }
  ) => {
    return await storage.getConversationProof(conversationId, opts)
  })

  ipcMain.handle('storage:verifyConversationProof', async (
    _event,
    conversationId: string,
    proof: unknown
  ) => {
    return await storage.verifyConversationProof(conversationId, proof)
  })

  ipcMain.handle('storage:getConversationSignable', async (
    _event,
    conversationId: string,
    length?: number,
    fork?: number
  ) => {
    return await storage.getConversationSignable(conversationId, length, fork)
  })

  ipcMain.handle('storage:createConversationWriteStream', async (
    _event,
    conversationId: string,
    chunks: unknown[]
  ) => {
    return await storage.createConversationWriteStream(conversationId, chunks)
  })

  // OPTIMIZATION: Hypercore manifest for multiwriter
  ipcMain.handle('storage:getConversationManifest', async (
    _event,
    conversationId: string
  ) => {
    return await storage.getConversationManifest(conversationId)
  })

  // OPTIMIZATION: Hypercore discovery key and signed length
  ipcMain.handle('storage:getConversationDiscoveryKey', async (
    _event,
    conversationId: string
  ) => {
    return await storage.getConversationDiscoveryKey(conversationId)
  })

  ipcMain.handle('storage:getConversationSignedLength', async (
    _event,
    conversationId: string
  ) => {
    return await storage.getConversationSignedLength(conversationId)
  })

  // OPTIMIZATION: Hypercore writable/readable/byteLength
  ipcMain.handle('storage:isConversationWritable', async (
    _event,
    conversationId: string
  ) => {
    return await storage.isConversationWritable(conversationId)
  })

  ipcMain.handle('storage:isConversationReadable', async (
    _event,
    conversationId: string
  ) => {
    return await storage.isConversationReadable(conversationId)
  })

  ipcMain.handle('storage:getConversationByteLength', async (
    _event,
    conversationId: string
  ) => {
    return await storage.getConversationByteLength(conversationId)
  })

  // OPTIMIZATION: Hypercore contiguous length and fork
  ipcMain.handle('storage:getConversationContiguousLength', async (
    _event,
    conversationId: string
  ) => {
    return await storage.getConversationContiguousLength(conversationId)
  })

  ipcMain.handle('storage:getConversationFork', async (
    _event,
    conversationId: string
  ) => {
    return await storage.getConversationFork(conversationId)
  })

  // OPTIMIZATION: Hypercore length
  ipcMain.handle('storage:getConversationLength', async (
    _event,
    conversationId: string
  ) => {
    return await storage.getConversationLength(conversationId)
  })

  // OPTIMIZATION: Hypercore id and key
  ipcMain.handle('storage:getConversationCoreId', async (
    _event,
    conversationId: string
  ) => {
    return await storage.getConversationCoreId(conversationId)
  })

  ipcMain.handle('storage:getConversationCoreKey', async (
    _event,
    conversationId: string
  ) => {
    return await storage.getConversationCoreKey(conversationId)
  })

  // OPTIMIZATION: Hypercore peers and encryption
  ipcMain.handle('storage:getConversationPeers', async (
    _event,
    conversationId: string
  ) => {
    return await storage.getConversationPeers(conversationId)
  })

  ipcMain.handle('storage:setConversationEncryption', async (
    _event,
    conversationId: string,
    encryption: unknown
  ) => {
    return await storage.setConversationEncryption(conversationId, encryption)
  })

  // OPTIMIZATION: Hypercore replicate
  ipcMain.handle('storage:replicateConversation', async (
    _event,
    conversationId: string,
    isInitiator: boolean
  ) => {
    return await storage.replicateConversation(conversationId, isInitiator)
  })

  // OPTIMIZATION: Hypercore setKeyPair and setActive
  ipcMain.handle('storage:setConversationKeyPair', async (
    _event,
    conversationId: string,
    keyPair: { publicKey: string; secretKey: string }
  ) => {
    return await storage.setConversationKeyPair(conversationId, keyPair)
  })

  ipcMain.handle('storage:setConversationActive', async (
    _event,
    conversationId: string,
    active: boolean
  ) => {
    return await storage.setConversationActive(conversationId, active)
  })

  // OPTIMIZATION: Hypercore static methods
  ipcMain.handle('storage:getMaxSuggestedBlockSize', async () => {
    return storage.getMaxSuggestedBlockSize()
  })

  ipcMain.handle('storage:getDiscoveryKeyFromKey', async (
    _event,
    publicKey: string
  ) => {
    return storage.getDiscoveryKeyFromKey(publicKey)
  })

  ipcMain.handle('storage:getBlockEncryptionKey', async (
    _event,
    key: string,
    encryptionKey: string
  ) => {
    return storage.getBlockEncryptionKey(key, encryptionKey)
  })

  // OPTIMIZATION: Hypercore static methods for manifest and protocol
  ipcMain.handle('storage:getKeyFromManifest', async (
    _event,
    manifest: unknown,
    options?: { compat?: boolean; version?: number; namespace?: Buffer }
  ) => {
    return storage.getKeyFromManifest(manifest, options)
  })

  ipcMain.handle('storage:createProtocolStream', async (
    _event,
    isInitiator: boolean,
    opts?: { ondiscoverykey?: (discoveryKey: Buffer) => void }
  ) => {
    return storage.createProtocolStream(isInitiator, opts)
  })

  // OPTIMIZATION: Hypercore static methods for protocol and storage
  ipcMain.handle('storage:getProtocolMuxer', async (
    _event,
    stream: unknown
  ) => {
    return storage.getProtocolMuxer(stream)
  })

  ipcMain.handle('storage:getDefaultStorage', async (
    _event,
    storagePath: string,
    opts?: Record<string, unknown>
  ) => {
    return storage.getDefaultStorage(storagePath, opts)
  })

  // OPTIMIZATION: Hypercore createCore static method
  ipcMain.handle('storage:createCore', async (
    _event,
    storageArg: unknown,
    opts?: Record<string, unknown>
  ) => {
    return storage.createCore(storageArg, opts)
  })

  // OPTIMIZATION: Hypercore close and ready
  ipcMain.handle('storage:closeConversation', async (
    _event,
    conversationId: string,
    error?: Error
  ) => {
    return await storage.closeConversation(conversationId, error)
  })

  ipcMain.handle('storage:waitForConversationReady', async (
    _event,
    conversationId: string
  ) => {
    return await storage.waitForConversationReady(conversationId)
  })

  // CONFORMITÉ IPC : les 9 canaux 'storage:onConversation*' (PeerAdd,
  // PeerRemove, Upload, Download, Append, Truncate, RemoteContiguousLength,
  // Close, Ready) ont été retirés — ils émettaient vers des canaux sans
  // récepteur preload. Le canal générique 'storage:onConversationEvent'
  // (→ preload onConversationEventReceived) couvre ces mêmes événements
  // Hypercore, plomberie complète.

  // OPTIMIZATION: Corestore suspend/resume and deterministic keys
  ipcMain.handle('storage:suspendStorage', async () => {
    return await storage.suspendStorage()
  })

  ipcMain.handle('storage:resumeStorage', async () => {
    return await storage.resumeStorage()
  })

  ipcMain.handle('storage:createDeterministicKeyPair', async (
    _event,
    name: string,
    namespace?: string
  ) => {
    return await storage.createDeterministicKeyPair(name, namespace)
  })

  // OPTIMIZATION: Hyperbee sub-database and key watcher
  ipcMain.handle('storage:getSubBee', async (
    _event,
    conversationId: string,
    prefix: string
  ) => {
    const subBee = await storage.getSubBee(conversationId, prefix)
    return subBee !== null
  })

  ipcMain.handle('storage:watchKey', async (
    _event,
    conversationId: string,
    key: string,
    callbackId: string
  ) => {
    const unwatch = await storage.watchKey(conversationId, key, (value) => {
      // Send value back via IPC event
      const win = BrowserWindow.getAllWindows()[0]
      safeSend(win, 'storage:keyChanged', { callbackId, value })
    })
    return unwatch
  })

  // OPTIMIZATION: Corestore group call management
  ipcMain.handle('storage:createCorestoreSession', async () => {
    return storage.createCorestoreSession()
  })

  ipcMain.handle('storage:notifyGroup', async (_event, topic: string) => {
    return storage.notifyGroup(topic)
  })

  ipcMain.handle('storage:getGroupUpdates', async (
    _event,
    handle: unknown,
    opts?: { since?: number; reverse?: boolean }
  ) => {
    return await storage.getGroupUpdates(handle, opts)
  })

  ipcMain.handle('storage:destroyGroupHandle', async (_event, handle: unknown) => {
    return storage.destroyGroupHandle(handle)
  })

  // OPTIMIZATION: Corestore group-active event
  ipcMain.on('storage:onGroupActive', async (_event) => {
    // Fenêtre résolue À CHAQUE callback : la capturée à l'abonnement serait un
    // objet périmé (donc « destroyed ») dès que l'utilisateur ferme la fenêtre.
    const callback = (topic: string) => {
      safeSend(BrowserWindow.getAllWindows()[0], 'storage:groupActive', topic)
    }
    storage.onGroupActive(callback)
  })

  // Utility handlers
  ipcMain.handle('storage:clearAll', async () => {
    return await storage.clearAll()
  })

  ipcMain.handle('storage:exportData', async () => {
    return await storage.exportData()
  })

  ipcMain.handle('storage:importData', async (_event, data) => {
    return await storage.importData(data)
  })

  // File save dialog — allows user to save a blob to a local folder.
  // Uses the SAME initialized storage instance as all other blob handlers.
  ipcMain.handle('file:save-as', async (_event, blobId: string, suggestedName: string) => {
    try {
      console.log(`[file:save-as] Requested blobId=${blobId}, name=${suggestedName}`)
      const data = await storage.getBlob(blobId)
      if (!data || data.length === 0) {
        const available = await storage.listBlobIds()
        console.warn('[file:save-as] Blob not found or empty:', blobId, 'available blobs:', available.length, available.slice(0, 10))
        return { success: false, reason: 'not-found' }
      }

      const ext = path.extname(suggestedName) || ''
      const parentWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
        title: 'Enregistrer le fichier',
        defaultPath: suggestedName,
        filters: ext ? [{ name: 'Fichiers', extensions: [ext.slice(1)] }] : undefined,
      })
      if (canceled || !filePath) return { success: false, reason: 'canceled' }

      await fs.writeFile(filePath, data)
      console.log('[file:save-as] Saved', suggestedName, 'to', filePath, `(${data.length} bytes)`)
      return { success: true, filePath }
    } catch (err) {
      console.error('[file:save-as] Failed:', err)
      return { success: false, reason: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  })

  // Cleanup on app quit — APRÈS le réseau (le swarm doit être détruit tant que
  // le corestore est encore ouvert ; cf. registerQuitCleanup en tête de fichier)
  registerQuitCleanup('storage', () => storage.destroy())
}

// ─── Notification Handlers ───────────────────────────────────────────────────

function setupNotificationHandlers(): void {
  ipcMain.on('notifications:show', (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({
        title,
        body,
        silent: false,
      }).show()
    }
  })

  ipcMain.handle('notifications:requestPermission', () => {
    // Windows always has permission if Notification.isSupported()
    return Notification.isSupported()
  })
}

// ─── App Handlers ────────────────────────────────────────────────────────────

// DEEP LINK: asgard://invite/<publicKey>?name=<displayName> — liens générés
// par ContactInviteModal et transmis par l'OS (mimeTypes Linux .desktop,
// build.protocols → Info.plist macOS, setAsDefaultProtocolClient Windows).
// Au démarrage à froid l'URL arrive AVANT que le renderer n'enregistre son
// listener : elle est gardée en attente et tirée par app:getPendingDeepLink
// (pull) au montage du renderer, insensible à la course d'enregistrement.
let pendingDeepLink: string | null = null

export function setPendingDeepLink(url: string | null): void {
  pendingDeepLink = url
}

// ── PRIVACY SETTINGS (privacy.linkPreviews) ──
// Aperçus de liens : les métadonnées Open Graph sont récupérées par le MAIN
// process — le renderer ne contacte jamais l'hôte directement. Le cache
// borne à une requête par URL et par session (50 entrées max, FIFO).
const linkPreviewCache = new Map<string, LinkPreviewResult>()

interface LinkPreviewResult {
  url: string
  hostname: string
  title: string | null
  description: string | null
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

async function fetchLinkPreview(rawUrl: string): Promise<LinkPreviewResult | null> {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    const cached = linkPreviewCache.get(rawUrl)
    if (cached) return cached

    // 5s de timeout — un site lent ne doit jamais bloquer le renderer
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Asgard Link Preview)' },
    })
    clearTimeout(timeout)

    const preview: LinkPreviewResult = { url: rawUrl, hostname: url.hostname, title: null, description: null }
    if (res.ok && res.body) {
      // Lire au plus 64 KB — les balises OG vivent dans le <head>
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let html = ''
      let received = 0
      while (received < 65536) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.length
        html += decoder.decode(value, { stream: true })
      }
      try { await reader.cancel() } catch {}

      const pick = (...patterns: RegExp[]): string | null => {
        for (const p of patterns) {
          const m = html.match(p)
          if (m?.[1]) return decodeHtmlEntities(m[1].trim()).slice(0, 200)
        }
        return null
      }
      preview.title = pick(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
        /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
        /<title[^>]*>([^<]+)<\/title>/i
      )
      preview.description = pick(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
      )
    }

    if (linkPreviewCache.size >= 50) {
      const oldest = linkPreviewCache.keys().next().value
      if (oldest !== undefined) linkPreviewCache.delete(oldest)
    }
    linkPreviewCache.set(rawUrl, preview)
    return preview
  } catch {
    return null
  }
}

function setupAppHandlers(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('app:getPendingDeepLink', () => {
    const url = pendingDeepLink
    pendingDeepLink = null
    return url
  })

  ipcMain.on('app:openExternal', (_event, url: string) => {
    // Validate URL before opening
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {
      console.warn('Invalid URL blocked:', url)
    }
  })

  // PRIVACY SETTINGS (privacy.linkPreviews): récupération des métadonnées OG
  // pour la carte d'aperçu — uniquement http(s), timeout 5s, lecture plafonnée.
  ipcMain.handle('app:fetchLinkPreview', (_event, rawUrl: string) => fetchLinkPreview(rawUrl))

  ipcMain.handle('app:getTheme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  // Notify renderer of system theme changes
  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    // Émetteur lié au cycle de vie de l'app (pas de la fenêtre) : résolution
    // fraîche + safeSend, sinon « Object has been destroyed » après la fermeture.
    safeSend(BrowserWindow.getAllWindows()[0], 'app:themeChange', theme)
  })

  // ── Firewall handlers ──
  ipcMain.handle('firewall:getStatus', () => getFirewallStatus())
  // CONFORMITÉ IPC : await réel du netsh — l'ancienne version répondait true
  // avant la fin de l'ajout, provoquant une UAC inutile côté renderer.
  ipcMain.handle('firewall:configure', () => configureFirewall())
  ipcMain.handle('firewall:runAsAdmin', () => runFirewallHelperAsAdmin())
  ipcMain.handle('firewall:check', () => checkFirewallRule())
}
