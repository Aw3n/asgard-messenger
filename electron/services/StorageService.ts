import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'

/**
 * StorageService — manages persistent local storage using Corestore + Hyperbee.
 *
 * Runs in the Electron main process. Provides structured storage for messages,
 * contacts, groups, and file blobs. All data is stored in userData/asgard-data/.
 *
 * CONFORMITÉ HOLEPUNCH : les blobs de fichiers sont stockés sur le filesystem
 * (voir putBlob/getBlob) — décision de robustesse assumée (limites IPC).
 * L'instance Hyperblobs n'est PAS initialisée : son API officielle
 * (put → id objet { block, blockOffset, blockLength, offset, length }) est
 * déclarée dans electron/types.d.ts pour toute future migration.
 */
export class StorageService {
  private corestore: CorestoreInstance | null = null
  private bees: Map<string, HyperbeeInstance> = new Map()
  private initialized = false
  private dataPath = ''
  private blobsPath = ''
  // Watchers for real-time notifications
  private watchers: Map<string, HyperbeeWatcher> = new Map()
  private watchCallbacks: Map<string, (version: number) => void> = new Map()

  /**
   * Initialize the storage layer — creates Corestore and the default Hyperbee.
   * CONFORMITÉ HOLEPUNCH : le core 'blobs' Hyperblobs n'est plus ouvert — il était
   * initialisé mais jamais lu ni écrit (putBlob/getBlob utilisent le filesystem),
   * et se retrouvait répliqué P2P via corestore.replicate() pour rien.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    this.dataPath = path.join(app.getPath('userData'), 'asgard-data')
    this.blobsPath = path.join(this.dataPath, 'blobs')
    await fs.mkdir(this.dataPath, { recursive: true })
    await fs.mkdir(this.blobsPath, { recursive: true })

    try {
      // Dynamic imports for ESM-only packages
      const Corestore = (await import('corestore')).default
      const Hyperbee = (await import('hyperbee')).default

      // Initialize Corestore at the data path
      this.corestore = new Corestore(this.dataPath) as unknown as CorestoreInstance

      // HOLEPUNCH BEST PRACTICE: Wait for corestore to be fully ready
      // before creating any cores or replicating.
      await this.corestore.ready()

      // Create a default Hyperbee for key-value metadata (contacts, groups index)
      const defaultCore = this.corestore.get({ name: 'default' })
      await defaultCore.ready()
      this.bees.set('default', new Hyperbee(defaultCore, { keyEncoding: 'utf-8', valueEncoding: 'json' }) as unknown as HyperbeeInstance)

      this.initialized = true
      console.log('[StorageService] Initialized at', this.dataPath)
    } catch (err) {
      console.error('[StorageService] Failed to initialize:', err)
      throw err
    }
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  /**
   * Get or create a Hyperbee sub-database for a specific conversation's messages.
   * OPTIMIZATION: Uses Hyperbee.sub() for efficient namespacing and key prefixing.
   */
  private async getMessagesBee(conversationId: string): Promise<HyperbeeInstance> {
    if (this.bees.has(`messages:${conversationId}`)) {
      return this.bees.get(`messages:${conversationId}`)!
    }

    if (!this.corestore) throw new Error('Storage not initialized')

    const Hyperbee = (await import('hyperbee')).default
    const core = this.corestore.get({ name: `messages-${conversationId}` })
    await core.ready()
    const bee = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' }) as unknown as HyperbeeInstance
    this.bees.set(`messages:${conversationId}`, bee)
    return bee
  }

  /**
   * Save a message indexed by conversation + timestamp.
   * OPTIMIZATION: Uses batch for single writes to ensure atomicity.
   */
  async saveMessage(conversationId: string, message: SerializedMessage): Promise<void> {
    const bee = await this.getMessagesBee(conversationId)
    const key = `${message.timestamp}:${message.id}`
    // Use batch for atomic single write (Hyperbee best practice)
    const batch = bee.batch()
    await batch.put(key, message)
    await batch.flush()
  }

  /**
   * Save multiple messages in a single batch operation.
   * OPTIMIZATION: Hyperbee batch is MUCH faster than individual puts.
   */
  async saveMessages(conversationId: string, messages: SerializedMessage[]): Promise<void> {
    if (messages.length === 0) return
    const bee = await this.getMessagesBee(conversationId)
    const batch = bee.batch()
    for (const message of messages) {
      const key = `${message.timestamp}:${message.id}`
      await batch.put(key, message)
    }
    await batch.flush()
  }

  /**
   * Get messages for a conversation, optionally within a time range.
   * OPTIMIZATION: Supports reverse pagination (newest first) and limit.
   * Uses Hyperbee's native reverse streaming for efficiency.
   */
  async getMessages(
    conversationId: string,
    options?: { limit?: number; before?: number; after?: number; reverse?: boolean }
  ): Promise<SerializedMessage[]> {
    const bee = await this.getMessagesBee(conversationId)
    const messages: SerializedMessage[] = []

    const rangeOpts: Record<string, unknown> = {}
    if (options?.after) {
      rangeOpts.gt = `${options.after}:\uffff`
    } else if (!options?.before) {
      // No range specified — get all
    }
    if (options?.before) {
      rangeOpts.lt = `${options.before}:`
    }

    // OPTIMIZATION: Use reverse for loading latest messages first (chat pagination)
    const streamOpts: Record<string, unknown> = { ...rangeOpts }
    if (options?.reverse) {
      streamOpts.reverse = true
    }

    const stream = bee.createReadStream(streamOpts)
    for await (const entry of stream) {
      const value = (entry as { value: SerializedMessage }).value
      messages.push(value)
      if (options?.limit && messages.length >= options.limit) break
    }

    // Sort: if reverse, keep newest-first; otherwise ascending
    if (options?.reverse) {
      messages.sort((a, b) => b.timestamp - a.timestamp)
    } else {
      messages.sort((a, b) => a.timestamp - b.timestamp)
    }
    return messages
  }

  /**
   * Get the last N messages efficiently using Hyperbee reverse streaming.
   * OPTIMIZATION: Uses peek/reverse instead of loading all messages.
   */
  async getLastMessages(conversationId: string, count = 50): Promise<SerializedMessage[]> {
    return this.getMessages(conversationId, { limit: count, reverse: true })
  }

  /**
   * Get a single message by ID (scans conversation).
   * OPTIMIZATION: Uses peek for faster single-key lookup.
   */
  async getMessage(conversationId: string, messageId: string): Promise<SerializedMessage | null> {
    const bee = await this.getMessagesBee(conversationId)
    // Scan with prefix matching — Hyperbee doesn't support secondary indexes
    const stream = bee.createReadStream()
    for await (const entry of stream) {
      const value = (entry as { value: SerializedMessage }).value
      if (value.id === messageId) return value
    }
    return null
  }

  /**
   * Get the latest message in a conversation (for preview).
   * OPTIMIZATION: Uses reverse + limit=1 instead of loading all messages.
   */
  async getLatestMessage(conversationId: string): Promise<SerializedMessage | null> {
    const bee = await this.getMessagesBee(conversationId)
    // OPTIMIZATION: Use peek() instead of createReadStream for faster single entry retrieval
    // peek() is optimized for getting the first value matching a range
    const entry = await bee.peek({ reverse: true })
    if (entry) {
      return (entry as { value: SerializedMessage }).value
    }
    return null
  }

  /**
   * Delete a message (mark as deleted).
   * OPTIMIZATION: Uses batch for atomic update.
   */
  async deleteMessage(conversationId: string, messageId: string): Promise<boolean> {
    const msg = await this.getMessage(conversationId, messageId)
    if (!msg) return false

    msg.deleted = true
    msg.content = ''
    await this.saveMessage(conversationId, msg)
    return true
  }

  /**
   * Delete all messages in a conversation efficiently.
   * OPTIMIZATION: Uses batch delete + Hypercore core.clear() to reclaim storage.
   */
  async clearMessages(conversationId: string): Promise<void> {
    const bee = await this.getMessagesBee(conversationId)
    const batch = bee.batch()
    const stream = bee.createReadStream()
    for await (const entry of stream) {
      const key = (entry as { key: string }).key
      await batch.del(key)
    }
    await batch.flush()

    // OPTIMIZATION: Reclaim storage at the Hypercore level
    // core.clear() removes stored blocks, freeing disk space
    const core = (bee as unknown as { core: HypercoreLike }).core
    if (core && typeof core.clear === 'function') {
      try {
        await core.clear(0, core.length)
      } catch {
        // Ignore clear errors — batch del already removed the entries
      }
    }
  }

  /**
   * Count messages in a conversation without loading them all.
   */
  async countMessages(conversationId: string): Promise<number> {
    const bee = await this.getMessagesBee(conversationId)
    let count = 0
    const stream = bee.createReadStream()
    for await (const _entry of stream) {
      count++
    }
    return count
  }

  /**
   * Search messages in a conversation by content.
   * OPTIMIZATION: Uses Hyperbee range scan with early termination.
   */
  async searchMessages(conversationId: string, query: string, limit = 50): Promise<SerializedMessage[]> {
    const bee = await this.getMessagesBee(conversationId)
    const results: SerializedMessage[] = []
    const lowerQuery = query.toLowerCase()

    // Scan in reverse (newest first) with early termination
    const stream = bee.createReadStream({ reverse: true })
    for await (const entry of stream) {
      const value = (entry as { value: SerializedMessage }).value
      if (value.content?.toLowerCase().includes(lowerQuery)) {
        results.push(value)
        if (results.length >= limit) break
      }
    }
    return results
  }

  /**
   * Watch a conversation for real-time changes.
   * OPTIMIZATION: Uses Hyperbee.watch() for efficient change detection.
   * Returns a callback to stop watching.
   */
  async watchConversation(conversationId: string, callback: (version: number) => void): Promise<() => void> {
    const watchKey = `messages:${conversationId}`

    // If already watching, update callback
    if (this.watchers.has(watchKey)) {
      this.watchCallbacks.set(watchKey, callback)
      return () => this.unwatchConversation(conversationId)
    }

    const bee = await this.getMessagesBee(conversationId)

    try {
      const watcher = bee.watch()
      await watcher.ready()

      this.watchers.set(watchKey, watcher)
      this.watchCallbacks.set(watchKey, callback)

      // Start async iterator in background
      this.runWatcher(watchKey, watcher).catch(() => {})

      console.log('[StorageService] Watching conversation:', conversationId)
    } catch (err) {
      console.error('[StorageService] Failed to watch conversation:', err)
    }

    return () => this.unwatchConversation(conversationId)
  }

  /**
   * Stop watching a conversation.
   */
  async unwatchConversation(conversationId: string): Promise<void> {
    const watchKey = `messages:${conversationId}`
    const watcher = this.watchers.get(watchKey)
    if (watcher) {
      await watcher.close().catch(() => {})
      this.watchers.delete(watchKey)
      this.watchCallbacks.delete(watchKey)
      console.log('[StorageService] Unwatched conversation:', conversationId)
    }
  }

  /**
   * Stop watching all conversations.
   */
  async unwatchAll(): Promise<void> {
    for (const [key, watcher] of this.watchers) {
      await watcher.close().catch(() => {})
      console.log('[StorageService] Unwatched:', key)
    }
    this.watchers.clear()
    this.watchCallbacks.clear()
  }

  /**
   * Internal: Run the watcher async iterator.
   */
  private async runWatcher(watchKey: string, watcher: HyperbeeWatcher): Promise<void> {
    try {
      for await (const [current] of watcher) {
        const callback = this.watchCallbacks.get(watchKey)
        if (callback) {
          callback(current.version)
        }
      }
    } catch (err) {
      // Watcher closed or error — ignore
      console.log('[StorageService] Watcher ended:', watchKey)
    }
  }

  /**
   * Get the current version of a conversation's Hyperbee.
   * Useful for detecting changes since last sync.
   */
  async getConversationVersion(conversationId: string): Promise<number> {
    const bee = await this.getMessagesBee(conversationId)
    return bee.version
  }

  /**
   * Get the diff between two versions of a conversation.
   * OPTIMIZATION: Uses Hyperbee createDiffStream for efficient sync.
   * Returns only the changes between versions, not the full data.
   */
  async getConversationDiff(
    conversationId: string,
    fromVersion: number,
    _toVersion?: number
  ): Promise<{ added: SerializedMessage[]; removed: string[] }> {
    const bee = await this.getMessagesBee(conversationId)
    const added: SerializedMessage[] = []
    const removed: string[] = []

    try {
      // Create a checkout at the fromVersion for comparison
      const checkoutBee = (bee as unknown as { checkout: (v: number) => HyperbeeInstance }).checkout(fromVersion)

      // Use createDiffStream if available
      const diffStreamFn = (bee as unknown as { createDiffStream?: (other: HyperbeeInstance, opts?: Record<string, unknown>) => AsyncIterable<unknown> }).createDiffStream

      if (typeof diffStreamFn === 'function') {
        const stream = diffStreamFn.call(bee, checkoutBee, { gte: 0 })

        for await (const entry of stream) {
          const e = entry as { left?: { key: string; value: SerializedMessage }; right?: { key: string } }
          if (e.left && !e.right) {
            // Added in current version
            added.push(e.left.value)
          } else if (!e.left && e.right) {
            // Removed in current version
            removed.push(e.right.key)
          }
        }
      } else {
        // Fallback: manual diff by reading both versions
        const currentStream = bee.createReadStream()
        const oldKeys = new Set<string>()
        const oldStream = checkoutBee.createReadStream()

        for await (const entry of oldStream) {
          oldKeys.add((entry as { key: string }).key)
        }

        for await (const entry of currentStream) {
          const e = entry as { key: string; value: SerializedMessage }
          if (!oldKeys.has(e.key)) {
            added.push(e.value)
          }
          oldKeys.delete(e.key)
        }

        // Remaining keys were removed
        removed.push(...oldKeys)
      }
    } catch (err) {
      console.error('[StorageService] Failed to get conversation diff:', err)
    }

    return { added, removed }
  }

  /**
   * Download specific blocks of a conversation's core.
   * OPTIMIZATION: Uses Hypercore download() for prefetching blocks.
   * Useful for preloading messages before they're needed.
   */
  async downloadConversationBlocks(
    conversationId: string,
    blocks: number[]
  ): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof core.download !== 'function') {
      console.warn('[StorageService] Hypercore download not available')
      return false
    }

    try {
      const range = core.download({ blocks })
      await range.done()
      return true
    } catch (err) {
      console.error('[StorageService] Failed to download blocks:', err)
      return false
    }
  }

  /**
   * Check if specific blocks are available locally.
   * OPTIMIZATION: Uses Hypercore has() to verify block availability.
   * Avoids unnecessary network requests.
   */
  async hasConversationBlocks(
    conversationId: string,
    start: number,
    end?: number
  ): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof core.has !== 'function') {
      return false
    }

    try {
      return await core.has(start, end)
    } catch (err) {
      console.error('[StorageService] Failed to check blocks:', err)
      return false
    }
  }

  /**
   * Seek to a byte offset in a conversation's core.
   * OPTIMIZATION: Uses Hypercore seek() for random byte access.
   * Returns [blockIndex, relativeOffset] for efficient navigation.
   */
  async seekConversationOffset(
    conversationId: string,
    byteOffset: number
  ): Promise<{ blockIndex: number; relativeOffset: number } | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof core.seek !== 'function') {
      return null
    }

    try {
      const [blockIndex, relativeOffset] = await core.seek(byteOffset)
      return { blockIndex, relativeOffset }
    } catch (err) {
      console.error('[StorageService] Failed to seek:', err)
      return null
    }
  }

  /**
   * Create a byte stream for reading conversation data.
   * OPTIMIZATION: Uses Hypercore createByteStream() for efficient byte-level streaming.
   * Useful for streaming large files or partial content with prefetch.
   */
  async createConversationByteStream(
    conversationId: string,
    options?: { byteOffset?: number; byteLength?: number; prefetch?: number }
  ): Promise<AsyncIterable<Buffer> | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof core.createByteStream !== 'function') {
      return null
    }

    try {
      return core.createByteStream(options)
    } catch (err) {
      console.error('[StorageService] Failed to create byte stream:', err)
      return null
    }
  }

  /**
   * Wait for core to update its length from peers.
   * OPTIMIZATION: Uses Hypercore update() for sync verification.
   * Useful for ensuring we have the latest data before operations.
   */
  async updateConversation(conversationId: string): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof core.update !== 'function') {
      return false
    }

    try {
      const updated = await core.update()
      return updated
    } catch (err) {
      console.error('[StorageService] Failed to update core:', err)
      return false
    }
  }

  /**
   * Get the history of operations on a conversation.
   * OPTIMIZATION: Uses Hyperbee createHistoryStream() for operation audit.
   * Returns all put/del operations with optional live mode.
   */
  async getConversationHistory(
    conversationId: string,
    options?: { live?: boolean; reverse?: boolean; limit?: number; gte?: number; lte?: number }
  ): Promise<Array<{ type: string; key: string; value?: unknown; seq: number }>> {
    const bee = await this.getMessagesBee(conversationId)
    const historyFn = (bee as unknown as { createHistoryStream?: (opts?: Record<string, unknown>) => AsyncIterable<unknown> }).createHistoryStream

    if (typeof historyFn !== 'function') {
      return []
    }

    const history: Array<{ type: string; key: string; value?: unknown; seq: number }> = []

    try {
      const stream = historyFn.call(bee, options)
      for await (const entry of stream) {
        const e = entry as { type: string; key: string; value?: unknown; seq: number }
        history.push(e)
      }
    } catch (err) {
      console.error('[StorageService] Failed to get history:', err)
    }

    return history
  }

  /**
   * Get an entry by its sequence number.
   * OPTIMIZATION: Uses Hyperbee getBySeq() for direct sequence access.
   * Useful for audit trails and debugging.
   */
  async getConversationBySeq(
    conversationId: string,
    seq: number
  ): Promise<{ key: string; value: unknown } | null> {
    const bee = await this.getMessagesBee(conversationId)
    const getBySeqFn = (bee as unknown as { getBySeq?: (seq: number) => Promise<{ key: string; value: unknown } | null> }).getBySeq

    if (typeof getBySeqFn !== 'function') {
      return null
    }

    try {
      return await getBySeqFn.call(bee, seq)
    } catch (err) {
      console.error('[StorageService] Failed to get by seq:', err)
      return null
    }
  }

  /**
   * Get the Merkle Tree hash of a conversation's core.
   * OPTIMIZATION: Uses Hypercore treeHash() for integrity verification.
   * Useful for verifying data consistency between peers.
   */
  async getConversationTreeHash(conversationId: string, length?: number): Promise<string | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof core.treeHash !== 'function') {
      return null
    }

    try {
      const hash = await core.treeHash(length)
      return hash.toString('hex')
    } catch (err) {
      console.error('[StorageService] Failed to get tree hash:', err)
      return null
    }
  }

  /**
   * Create a read stream for a range of conversation blocks.
   * OPTIMIZATION: Uses Hypercore createReadStream() for efficient export.
   * Useful for exporting conversation history or syncing.
   */
  async createConversationReadStream(
    conversationId: string,
    options?: { start?: number; end?: number; live?: boolean }
  ): Promise<AsyncIterable<Buffer> | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof core.createReadStream !== 'function') {
      return null
    }

    try {
      return core.createReadStream(options)
    } catch (err) {
      console.error('[StorageService] Failed to create read stream:', err)
      return null
    }
  }

  /**
   * Perform batch operations on a conversation atomically.
   * OPTIMIZATION: Uses Hyperbee batch() for atomic multi-operation commits.
   * Much faster than individual puts when inserting multiple messages.
   */
  async batchConversationOperations(
    conversationId: string,
    operations: Array<{ type: 'put' | 'del'; key: string; value?: unknown }>
  ): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const batchFn = (bee as unknown as { batch?: () => {
      put: (key: string, value?: unknown) => Promise<void>
      del: (key: string) => Promise<void>
      flush: () => Promise<void>
      close: () => Promise<void>
    } }).batch

    if (typeof batchFn !== 'function') {
      // Fallback to individual operations
      for (const op of operations) {
        try {
          if (op.type === 'put' && op.value !== undefined) {
            await bee.put(op.key, op.value)
          } else if (op.type === 'del') {
            await bee.del(op.key)
          }
        } catch (err) {
          console.error('[StorageService] Batch fallback operation failed:', err)
          return false
        }
      }
      return true
    }

    const batch = batchFn.call(bee)
    try {
      for (const op of operations) {
        if (op.type === 'put' && op.value !== undefined) {
          await batch.put(op.key, op.value)
        } else if (op.type === 'del') {
          await batch.del(op.key)
        }
      }
      await batch.flush()
      return true
    } catch (err) {
      console.error('[StorageService] Batch operations failed:', err)
      await batch.close().catch(() => {})
      return false
    }
  }

  /**
   * Set user data on a conversation's core.
   * OPTIMIZATION: Uses Hypercore setUserData() for local metadata storage.
   * User data is NOT replicated, only stored locally for this peer.
   */
  async setConversationUserData(
    conversationId: string,
    key: string,
    value: string | Buffer
  ): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof core.setUserData !== 'function') {
      return false
    }

    try {
      await core.setUserData(key, value)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to set user data:', err)
      return false
    }
  }

  /**
   * Get user data from a conversation's core.
   * OPTIMIZATION: Uses Hypercore getUserData() for local metadata retrieval.
   * Returns locally stored metadata that is not replicated.
   */
  async getConversationUserData(
    conversationId: string,
    key: string
  ): Promise<string | Buffer | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof core.getUserData !== 'function') {
      return null
    }

    try {
      return await core.getUserData(key)
    } catch (err) {
      console.error('[StorageService] Failed to get user data:', err)
      return null
    }
  }

  /**
   * Get the remote contiguous length for a conversation's core.
   * OPTIMIZATION: Uses Hypercore remoteContiguousLength for sync monitoring.
   * Returns the max known contiguous length from remote peers.
   */
  async getConversationRemoteContiguousLength(conversationId: string): Promise<number | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) {
      return null
    }

    return (core as unknown as { remoteContiguousLength?: number }).remoteContiguousLength ?? null
  }

  /**
   * Register event listeners for a conversation's core.
   * OPTIMIZATION: Uses Hypercore events for real-time monitoring.
   * Supported events: 'append', 'truncate', 'peer-add', 'peer-remove', 'upload', 'download'
   */
  async onConversationEvent(
    conversationId: string,
    event: string,
    _callbackId: string,
    callback: (data: unknown) => void
  ): Promise<() => void> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike; on?: (event: string, handler: (...args: unknown[]) => void) => void }).core

    if (!core || typeof core.on !== 'function') {
      return () => {}
    }

    const handler = (...args: unknown[]) => {
      callback({ event, args, conversationId })
    }

    core.on(event, handler)

    // Return cleanup function
    return () => {
      const off = (core as unknown as { off?: (event: string, handler: (...args: unknown[]) => void) => void }).off
      if (typeof off === 'function') {
        off.call(core, event, handler)
      }
    }
  }

  /**
   * Cancel downloading a range of blocks.
   * OPTIMIZATION: Uses Hypercore range.destroy() to stop downloads.
   * Useful for cancelling prefetch when user navigates away.
   */
  async cancelConversationDownload(_conversationId: string, range: unknown): Promise<boolean> {
    const destroyFn = (range as { destroy?: () => void }).destroy
    if (typeof destroyFn === 'function') {
      try {
        destroyFn.call(range)
        return true
      } catch (err) {
        console.error('[StorageService] Failed to cancel download:', err)
        return false
      }
    }
    return false
  }

  /**
   * Put a value with Compare And Swap (CAS) semantics.
   * OPTIMIZATION: Uses Hyperbee cas option for conditional updates.
   * Only updates if the comparator function returns true.
   */
  async putConversationWithCas(
    conversationId: string,
    key: string,
    value: unknown,
    casFn: (prev: unknown, next: unknown) => boolean
  ): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)

    try {
      // Hyperbee supports cas option in put()
      await bee.put(key, value, { cas: casFn } as Record<string, unknown>)
      return true
    } catch (err) {
      console.error('[StorageService] CAS put failed:', err)
      return false
    }
  }

  /**
   * Generate a cryptographic proof for a conversation.
   * OPTIMIZATION: Uses Hypercore proof() for integrity verification.
   * Useful for verifying data authenticity with remote peers.
   */
  async getConversationProof(conversationId: string, opts?: { index?: number }): Promise<unknown | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { proof?: (opts?: { index?: number }) => Promise<unknown> }).proof !== 'function') {
      return null
    }

    try {
      const proofFn = (core as unknown as { proof: (opts?: { index?: number }) => Promise<unknown> }).proof
      return await proofFn.call(core, opts)
    } catch (err) {
      console.error('[StorageService] Failed to generate proof:', err)
      return null
    }
  }

  /**
   * Verify a proof and get the merkle tree batch.
   * OPTIMIZATION: Uses Hypercore verifyFullyRemote() for proof verification.
   * Returns the batch if valid, throws if invalid.
   */
  async verifyConversationProof(conversationId: string, proof: unknown): Promise<unknown | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { verifyFullyRemote?: (proof: unknown) => Promise<unknown> }).verifyFullyRemote !== 'function') {
      return null
    }

    try {
      const verifyFn = (core as unknown as { verifyFullyRemote: (proof: unknown) => Promise<unknown> }).verifyFullyRemote
      return await verifyFn.call(core, proof)
    } catch (err) {
      console.error('[StorageService] Proof verification failed:', err)
      return null
    }
  }

  /**
   * Get a signable buffer for a conversation.
   * OPTIMIZATION: Uses Hypercore signable() for external signatures.
   * Useful for signing data with external keys.
   */
  async getConversationSignable(conversationId: string, length?: number, fork?: number): Promise<Buffer | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { signable?: (length?: number, fork?: number) => Promise<Buffer> }).signable !== 'function') {
      return null
    }

    try {
      const signableFn = (core as unknown as { signable: (length?: number, fork?: number) => Promise<Buffer> }).signable
      return await signableFn.call(core, length, fork)
    } catch (err) {
      console.error('[StorageService] Failed to get signable buffer:', err)
      return null
    }
  }

  /**
   * Create a write stream to append blocks to a conversation.
   * OPTIMIZATION: Uses Hypercore createWriteStream() for efficient bulk writes.
   * Useful for importing large amounts of data.
   */
  async createConversationWriteStream(conversationId: string, chunks: unknown[]): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { createWriteStream?: () => { write: (data: unknown) => void; end: () => void; on: (event: string, handler: () => void) => void } }).createWriteStream !== 'function') {
      return false
    }

    try {
      const createWriteStreamFn = (core as unknown as { createWriteStream: () => { write: (data: unknown) => void; end: () => void; on: (event: string, handler: () => void) => void } }).createWriteStream
      const ws = createWriteStreamFn.call(core)

      // Write all chunks
      for (const chunk of chunks) {
        ws.write(chunk)
      }
      ws.end()

      // Wait for finish
      return new Promise((resolve) => {
        ws.on('finish', () => resolve(true))
        // Timeout after 30 seconds
        setTimeout(() => resolve(false), 30000)
      })
    } catch (err) {
      console.error('[StorageService] Failed to create write stream:', err)
      return false
    }
  }

  /**
   * Get or set the manifest for a conversation.
   * OPTIMIZATION: Uses Hypercore manifest for multiwriter support.
   * Useful for group conversations with multiple signers.
   */
  async getConversationManifest(conversationId: string): Promise<{
    version?: number
    hash?: string
    allowPatch?: boolean
    quorum?: number
    signers?: Array<{ namespace: Buffer; publicKey: Buffer }>
  } | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const manifest = (core as unknown as { manifest?: {
        version?: number
        hash?: string
        allowPatch?: boolean
        quorum?: number
        signers?: Array<{ namespace: Buffer; publicKey: Buffer }>
      } }).manifest
      
      if (!manifest) return null

      // Convert Buffers to hex strings for IPC
      return {
        version: manifest.version,
        hash: manifest.hash,
        allowPatch: manifest.allowPatch,
        quorum: manifest.quorum,
        signers: manifest.signers?.map(s => ({
          namespace: Buffer.isBuffer(s.namespace) ? s.namespace.toString('hex') : s.namespace,
          publicKey: Buffer.isBuffer(s.publicKey) ? s.publicKey.toString('hex') : s.publicKey
        })) as Array<{ namespace: Buffer; publicKey: Buffer }> | undefined
      }
    } catch (err) {
      console.error('[StorageService] Failed to get manifest:', err)
      return null
    }
  }

  /**
   * Get the discovery key for a conversation.
   * OPTIMIZATION: Uses Hypercore discoveryKey for safe public sharing.
   * Discovery key can be shared without leaking the core key.
   */
  async getConversationDiscoveryKey(conversationId: string): Promise<string | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const discoveryKey = (core as unknown as { discoveryKey?: Buffer }).discoveryKey
      if (!discoveryKey) return null
      return Buffer.isBuffer(discoveryKey) ? discoveryKey.toString('hex') : String(discoveryKey)
    } catch (err) {
      console.error('[StorageService] Failed to get discovery key:', err)
      return null
    }
  }

  /**
   * Get the signed length for a conversation.
   * OPTIMIZATION: Uses Hypercore signedLength for quorum validation.
   * Returns the number of blocks signed by a quorum of signers.
   */
  async getConversationSignedLength(conversationId: string): Promise<number | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const signedLength = (core as unknown as { signedLength?: number }).signedLength
      return typeof signedLength === 'number' ? signedLength : null
    } catch (err) {
      console.error('[StorageService] Failed to get signed length:', err)
      return null
    }
  }

  /**
   * Check if a conversation core is writable.
   * OPTIMIZATION: Uses Hypercore writable property for access verification.
   */
  async isConversationWritable(conversationId: string): Promise<boolean | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const writable = (core as unknown as { writable?: boolean }).writable
      return typeof writable === 'boolean' ? writable : null
    } catch (err) {
      console.error('[StorageService] Failed to check writable:', err)
      return null
    }
  }

  /**
   * Check if a conversation core is readable.
   * OPTIMIZATION: Uses Hypercore readable property for access verification.
   */
  async isConversationReadable(conversationId: string): Promise<boolean | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const readable = (core as unknown as { readable?: boolean }).readable
      return typeof readable === 'boolean' ? readable : null
    } catch (err) {
      console.error('[StorageService] Failed to check readable:', err)
      return null
    }
  }

  /**
   * Get the total byte length for a conversation.
   * OPTIMIZATION: Uses Hypercore byteLength for size calculation.
   */
  async getConversationByteLength(conversationId: string): Promise<number | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const byteLength = (core as unknown as { byteLength?: number }).byteLength
      return typeof byteLength === 'number' ? byteLength : null
    } catch (err) {
      console.error('[StorageService] Failed to get byte length:', err)
      return null
    }
  }

  /**
   * Get the contiguous length for a conversation.
   * OPTIMIZATION: Uses Hypercore contiguousLength for local sync status.
   * Returns the number of contiguous blocks from the start.
   */
  async getConversationContiguousLength(conversationId: string): Promise<number | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const contiguousLength = (core as unknown as { contiguousLength?: number }).contiguousLength
      return typeof contiguousLength === 'number' ? contiguousLength : null
    } catch (err) {
      console.error('[StorageService] Failed to get contiguous length:', err)
      return null
    }
  }

  /**
   * Get the fork id for a conversation.
   * OPTIMIZATION: Uses Hypercore fork for fork detection.
   * Returns the current fork identifier.
   */
  async getConversationFork(conversationId: string): Promise<number | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const fork = (core as unknown as { fork?: number }).fork
      return typeof fork === 'number' ? fork : null
    } catch (err) {
      console.error('[StorageService] Failed to get fork:', err)
      return null
    }
  }

  /**
   * Get the number of blocks in a conversation's core.
   * OPTIMIZATION: Uses Hypercore length for block count.
   * Returns how many blocks of data are available on this core.
   */
  async getConversationLength(conversationId: string): Promise<number | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const length = (core as unknown as { length?: number }).length
      return typeof length === 'number' ? length : null
    } catch (err) {
      console.error('[StorageService] Failed to get length:', err)
      return null
    }
  }

  /**
   * Get the core id for a conversation.
   * OPTIMIZATION: Uses Hypercore id for unique identification.
   * Returns the z-base-32 encoded key.
   */
  async getConversationCoreId(conversationId: string): Promise<string | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const id = (core as unknown as { id?: string }).id
      return typeof id === 'string' ? id : null
    } catch (err) {
      console.error('[StorageService] Failed to get core id:', err)
      return null
    }
  }

  /**
   * Get the core key for a conversation.
   * OPTIMIZATION: Uses Hypercore key for public key access.
   * Returns the public key as hex string.
   */
  async getConversationCoreKey(conversationId: string): Promise<string | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const key = (core as unknown as { key?: Buffer }).key
      if (!key) return null
      return Buffer.isBuffer(key) ? key.toString('hex') : String(key)
    } catch (err) {
      console.error('[StorageService] Failed to get core key:', err)
      return null
    }
  }

  /**
   * Get the list of peers for a conversation.
   * OPTIMIZATION: Uses Hypercore peers for replication monitoring.
   * Returns an array of current peers the core is replicating with.
   */
  async getConversationPeers(conversationId: string): Promise<Array<{ remotePublicKey: string }> | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core) return null

    try {
      const peers = (core as unknown as { peers?: Array<{ remotePublicKey?: Buffer }> }).peers
      if (!Array.isArray(peers)) return null
      
      return peers.map(p => ({
        remotePublicKey: p.remotePublicKey && Buffer.isBuffer(p.remotePublicKey) 
          ? p.remotePublicKey.toString('hex') 
          : String(p.remotePublicKey || '')
      }))
    } catch (err) {
      console.error('[StorageService] Failed to get peers:', err)
      return null
    }
  }

  /**
   * Set encryption for a conversation.
   * OPTIMIZATION: Uses Hypercore setEncryption for data encryption.
   * Useful for encrypting conversation data at rest.
   */
  async setConversationEncryption(conversationId: string, encryption: unknown): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { setEncryption?: (encryption: unknown) => Promise<void> }).setEncryption !== 'function') {
      return false
    }

    try {
      const setEncryptionFn = (core as unknown as { setEncryption: (encryption: unknown) => Promise<void> }).setEncryption
      await setEncryptionFn.call(core, encryption)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to set encryption:', err)
      return false
    }
  }

  /**
   * Create a replication stream for a conversation.
   * OPTIMIZATION: Uses Hypercore replicate for custom replication.
   * Useful for manual replication over custom transports.
   */
  async replicateConversation(conversationId: string, isInitiator: boolean): Promise<unknown | null> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { replicate?: (isInitiator: boolean, opts?: Record<string, unknown>) => unknown }).replicate !== 'function') {
      return null
    }

    try {
      const replicateFn = (core as unknown as { replicate: (isInitiator: boolean, opts?: Record<string, unknown>) => unknown }).replicate
      return replicateFn.call(core, isInitiator)
    } catch (err) {
      console.error('[StorageService] Failed to replicate:', err)
      return null
    }
  }

  /**
   * Update the key pair for a conversation.
   * OPTIMIZATION: Uses Hypercore setKeyPair for key rotation.
   * Advanced feature as the keyPair is used throughout Hypercore.
   */
  async setConversationKeyPair(conversationId: string, keyPair: { publicKey: Buffer | string; secretKey: Buffer | string }): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { setKeyPair?: (keyPair: unknown) => void }).setKeyPair !== 'function') {
      return false
    }

    try {
      const setKeyPairFn = (core as unknown as { setKeyPair: (keyPair: unknown) => void }).setKeyPair
      setKeyPairFn.call(core, {
        publicKey: typeof keyPair.publicKey === 'string' ? Buffer.from(keyPair.publicKey, 'hex') : keyPair.publicKey,
        secretKey: typeof keyPair.secretKey === 'string' ? Buffer.from(keyPair.secretKey, 'hex') : keyPair.secretKey
      })
      return true
    } catch (err) {
      console.error('[StorageService] Failed to set key pair:', err)
      return false
    }
  }

  /**
   * Set the active state for a conversation.
   * OPTIMIZATION: Uses Hypercore setActive for replication control.
   * A core is considered 'active' if it should linger to download blocks from peers.
   */
  async setConversationActive(conversationId: string, active: boolean): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { setActive?: (active: boolean) => void }).setActive !== 'function') {
      return false
    }

    try {
      const setActiveFn = (core as unknown as { setActive: (active: boolean) => void }).setActive
      setActiveFn.call(core, active)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to set active:', err)
      return false
    }
  }

  /**
   * Get the maximum suggested block size for Hypercore.
   * OPTIMIZATION: Uses Hypercore MAX_SUGGESTED_BLOCK_SIZE constant.
   * Returns 15MB max size for blocks to ensure smooth replication.
   */
  getMaxSuggestedBlockSize(): number {
    // Hypercore.MAX_SUGGESTED_BLOCK_SIZE is 15MB (15 * 1024 * 1024)
    return 15 * 1024 * 1024
  }

  /**
   * Get the discovery key from a public key.
   * OPTIMIZATION: Uses Hypercore.discoveryKey() static method.
   * Returns a key that can be shared publicly without leaking the core key.
   */
  getDiscoveryKeyFromKey(publicKey: string): string | null {
    if (!publicKey) return null

    try {
      // Import Hypercore dynamically to access static methods
      const Hypercore = require('hypercore')
      if (typeof Hypercore.discoveryKey !== 'function') return null
      
      const keyBuffer = Buffer.from(publicKey, 'hex')
      const discoveryKey = Hypercore.discoveryKey(keyBuffer)
      return Buffer.isBuffer(discoveryKey) ? discoveryKey.toString('hex') : String(discoveryKey)
    } catch (err) {
      console.error('[StorageService] Failed to get discovery key:', err)
      return null
    }
  }

  /**
   * Get the block encryption key from a key and encryption key.
   * OPTIMIZATION: Uses Hypercore.blockEncryptionKey() static method.
   * Returns the encryption key for block-level encryption.
   */
  getBlockEncryptionKey(key: string, encryptionKey: string): string | null {
    if (!key || !encryptionKey) return null

    try {
      // Import Hypercore dynamically to access static methods
      const Hypercore = require('hypercore')
      if (typeof Hypercore.blockEncryptionKey !== 'function') return null
      
      const keyBuffer = Buffer.from(key, 'hex')
      const encryptionKeyBuffer = Buffer.from(encryptionKey, 'hex')
      const blockKey = Hypercore.blockEncryptionKey(keyBuffer, encryptionKeyBuffer)
      return Buffer.isBuffer(blockKey) ? blockKey.toString('hex') : String(blockKey)
    } catch (err) {
      console.error('[StorageService] Failed to get block encryption key:', err)
      return null
    }
  }

  /**
   * Get the key from a manifest.
   * OPTIMIZATION: Uses Hypercore.key() static method.
   * Returns the key for a given manifest.
   */
  getKeyFromManifest(manifest: unknown, options?: { compat?: boolean; version?: number; namespace?: Buffer }): string | null {
    if (!manifest) return null

    try {
      // Import Hypercore dynamically to access static methods
      const Hypercore = require('hypercore')
      if (typeof Hypercore.key !== 'function') return null
      
      const key = Hypercore.key(manifest, options)
      return Buffer.isBuffer(key) ? key.toString('hex') : String(key)
    } catch (err) {
      console.error('[StorageService] Failed to get key from manifest:', err)
      return null
    }
  }

  /**
   * Create a protocol stream for replication.
   * OPTIMIZATION: Uses Hypercore.createProtocolStream() static method.
   * Returns an encrypted noise stream with a protomux instance attached.
   */
  createProtocolStream(isInitiator: boolean, opts?: { ondiscoverykey?: (discoveryKey: Buffer) => void }): unknown | null {
    try {
      // Import Hypercore dynamically to access static methods
      const Hypercore = require('hypercore')
      if (typeof Hypercore.createProtocolStream !== 'function') return null
      
      return Hypercore.createProtocolStream(isInitiator, opts)
    } catch (err) {
      console.error('[StorageService] Failed to create protocol stream:', err)
      return null
    }
  }

  /**
   * Get the protomux instance from a protocol stream.
   * OPTIMIZATION: Uses Hypercore.getProtocolMuxer() static method.
   * Returns a protomux instance from the provided stream.
   */
  getProtocolMuxer(stream: unknown): unknown | null {
    try {
      // Import Hypercore dynamically to access static methods
      const Hypercore = require('hypercore')
      if (typeof Hypercore.getProtocolMuxer !== 'function') return null
      
      return Hypercore.getProtocolMuxer(stream)
    } catch (err) {
      console.error('[StorageService] Failed to get protocol muxer:', err)
      return null
    }
  }

  /**
   * Get the default storage for Hypercore.
   * OPTIMIZATION: Uses Hypercore.defaultStorage() static method.
   * Returns a default hypercore storage instance.
   */
  getDefaultStorage(storagePath: string, opts?: Record<string, unknown>): unknown | null {
    try {
      // Import Hypercore dynamically to access static methods
      const Hypercore = require('hypercore')
      if (typeof Hypercore.defaultStorage !== 'function') return null
      
      return Hypercore.defaultStorage(storagePath, opts)
    } catch (err) {
      console.error('[StorageService] Failed to get default storage:', err)
      return null
    }
  }

  /**
   * Create an internal core using storage and opts.
   * OPTIMIZATION: Uses Hypercore.createCore() static method.
   * Returns the internal core without creating a full Hypercore instance.
   */
  createCore(storage: unknown, opts?: Record<string, unknown>): unknown | null {
    try {
      // Import Hypercore dynamically to access static methods
      const Hypercore = require('hypercore')
      if (typeof Hypercore.createCore !== 'function') return null
      
      return Hypercore.createCore(storage, opts)
    } catch (err) {
      console.error('[StorageService] Failed to create core:', err)
      return null
    }
  }

  /**
   * Close a conversation's core completely.
   * OPTIMIZATION: Uses Hypercore close() for resource cleanup.
   * Fully closes the core and rejects pending replicator requests.
   */
  async closeConversation(conversationId: string, error?: Error): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { close?: (opts?: { error?: Error }) => Promise<void> }).close !== 'function') {
      return false
    }

    try {
      const closeFn = (core as unknown as { close: (opts?: { error?: Error }) => Promise<void> }).close
      await closeFn.call(core, error ? { error } : undefined)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to close core:', err)
      return false
    }
  }

  /**
   * Wait for a conversation's core to be fully opened.
   * OPTIMIZATION: Uses Hypercore ready() for initialization sync.
   * Useful when checking synchronous properties like length.
   */
  async waitForConversationReady(conversationId: string): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { ready?: () => Promise<void> }).ready !== 'function') {
      return false
    }

    try {
      const readyFn = (core as unknown as { ready: () => Promise<void> }).ready
      await readyFn.call(core)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to wait for ready:', err)
      return false
    }
  }

  /**
   * Subscribe to peer-add events for a conversation.
   * OPTIMIZATION: Uses Hypercore peer-add event for peer monitoring.
   * Emitted when a new connection has been established with a peer.
   */
  async onConversationPeerAdd(conversationId: string, callback: (peer: unknown) => void): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { on?: (event: string, cb: (peer: unknown) => void) => void }).on !== 'function') {
      return false
    }

    try {
      const onFn = (core as unknown as { on: (event: string, cb: (peer: unknown) => void) => void }).on
      onFn.call(core, 'peer-add', callback)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to subscribe to peer-add:', err)
      return false
    }
  }

  /**
   * Subscribe to peer-remove events for a conversation.
   * OPTIMIZATION: Uses Hypercore peer-remove event for peer monitoring.
   * Emitted when a peer's connection has been closed.
   */
  async onConversationPeerRemove(conversationId: string, callback: (peer: unknown) => void): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { on?: (event: string, cb: (peer: unknown) => void) => void }).on !== 'function') {
      return false
    }

    try {
      const onFn = (core as unknown as { on: (event: string, cb: (peer: unknown) => void) => void }).on
      onFn.call(core, 'peer-remove', callback)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to subscribe to peer-remove:', err)
      return false
    }
  }

  /**
   * Subscribe to upload events for a conversation.
   * OPTIMIZATION: Uses Hypercore upload event for bandwidth monitoring.
   * Emitted when a block is uploaded to a peer.
   */
  async onConversationUpload(conversationId: string, callback: (index: number, byteLength: number, peer: unknown) => void): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { on?: (event: string, cb: (index: number, byteLength: number, peer: unknown) => void) => void }).on !== 'function') {
      return false
    }

    try {
      const onFn = (core as unknown as { on: (event: string, cb: (index: number, byteLength: number, peer: unknown) => void) => void }).on
      onFn.call(core, 'upload', callback)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to subscribe to upload:', err)
      return false
    }
  }

  /**
   * Subscribe to download events for a conversation.
   * OPTIMIZATION: Uses Hypercore download event for bandwidth monitoring.
   * Emitted when a block is downloaded from a peer.
   */
  async onConversationDownload(conversationId: string, callback: (index: number, byteLength: number, peer: unknown) => void): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { on?: (event: string, cb: (index: number, byteLength: number, peer: unknown) => void) => void }).on !== 'function') {
      return false
    }

    try {
      const onFn = (core as unknown as { on: (event: string, cb: (index: number, byteLength: number, peer: unknown) => void) => void }).on
      onFn.call(core, 'download', callback)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to subscribe to download:', err)
      return false
    }
  }

  /**
   * Subscribe to append events for a conversation.
   * OPTIMIZATION: Uses Hypercore append event for real-time sync monitoring.
   * Emitted when the core has been appended to (new blocks added).
   */
  async onConversationAppend(conversationId: string, callback: () => void): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { on?: (event: string, cb: () => void) => void }).on !== 'function') {
      return false
    }

    try {
      const onFn = (core as unknown as { on: (event: string, cb: () => void) => void }).on
      onFn.call(core, 'append', callback)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to subscribe to append:', err)
      return false
    }
  }

  /**
   * Subscribe to truncate events for a conversation.
   * OPTIMIZATION: Uses Hypercore truncate event for history change detection.
   * Emitted when the core has been truncated.
   */
  async onConversationTruncate(conversationId: string, callback: (ancestors: number, forkId: number) => void): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { on?: (event: string, cb: (ancestors: number, forkId: number) => void) => void }).on !== 'function') {
      return false
    }

    try {
      const onFn = (core as unknown as { on: (event: string, cb: (ancestors: number, forkId: number) => void) => void }).on
      onFn.call(core, 'truncate', callback)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to subscribe to truncate:', err)
      return false
    }
  }

  /**
   * Subscribe to remote-contiguous-length events for a conversation.
   * OPTIMIZATION: Uses Hypercore remote-contiguous-length event for sync progress.
   * Emitted when the max known contiguous length from a remote is updated.
   */
  async onConversationRemoteContiguousLength(conversationId: string, callback: (length: number) => void): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { on?: (event: string, cb: (length: number) => void) => void }).on !== 'function') {
      return false
    }

    try {
      const onFn = (core as unknown as { on: (event: string, cb: (length: number) => void) => void }).on
      onFn.call(core, 'remote-contiguous-length', callback)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to subscribe to remote-contiguous-length:', err)
      return false
    }
  }

  /**
   * Subscribe to close events for a conversation.
   * OPTIMIZATION: Uses Hypercore close event for lifecycle monitoring.
   * Emitted when the core has been fully closed.
   */
  async onConversationClose(conversationId: string, callback: () => void): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { on?: (event: string, cb: () => void) => void }).on !== 'function') {
      return false
    }

    try {
      const onFn = (core as unknown as { on: (event: string, cb: () => void) => void }).on
      onFn.call(core, 'close', callback)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to subscribe to close:', err)
      return false
    }
  }

  /**
   * Subscribe to ready events for a conversation.
   * OPTIMIZATION: Uses Hypercore ready event for initialization monitoring.
   * Emitted after the core has initially opened all its internal state.
   */
  async onConversationReady(conversationId: string, callback: () => void): Promise<boolean> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof (core as unknown as { on?: (event: string, cb: () => void) => void }).on !== 'function') {
      return false
    }

    try {
      const onFn = (core as unknown as { on: (event: string, cb: () => void) => void }).on
      onFn.call(core, 'ready', callback)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to subscribe to ready:', err)
      return false
    }
  }

  /**
   * Truncate a conversation's history to a maximum number of messages.
   * OPTIMIZATION: Uses Hypercore truncate() for efficient history management.
   * Keeps only the most recent `maxMessages` messages.
   */
  async truncateConversation(conversationId: string, maxMessages: number): Promise<number> {
    const bee = await this.getMessagesBee(conversationId)
    const core = (bee as unknown as { core: HypercoreLike }).core

    if (!core || typeof core.truncate !== 'function') {
      // Fallback: delete oldest messages via batch
      const messages: { key: string; timestamp: number }[] = []
      const stream = bee.createReadStream()
      for await (const entry of stream) {
        const e = entry as { key: string; value: SerializedMessage }
        messages.push({ key: e.key, timestamp: e.value.timestamp })
      }

      if (messages.length <= maxMessages) return 0

      // Sort by timestamp ascending (oldest first)
      messages.sort((a, b) => a.timestamp - b.timestamp)
      const toDelete = messages.slice(0, messages.length - maxMessages)

      const batch = bee.batch()
      for (const msg of toDelete) {
        await batch.del(msg.key)
      }
      await batch.flush()
      return toDelete.length
    }

    // Use Hypercore truncate for efficient removal
    const currentLength = core.length
    const targetLength = Math.max(0, currentLength - maxMessages)

    if (targetLength >= currentLength) return 0

    try {
      await core.truncate(targetLength)
      console.log('[StorageService] Truncated conversation:', conversationId, 'from', currentLength, 'to', targetLength)
      return currentLength - targetLength
    } catch (err) {
      console.error('[StorageService] Failed to truncate:', err)
      return 0
    }
  }

  /**
   * Get storage info for a conversation (Hypercore level).
   * OPTIMIZATION: Uses core.info() for accurate storage metrics.
   */
  async getConversationStorageInfo(conversationId: string): Promise<{
    length: number
    byteLength: number
    contiguousLength: number
    storage?: { oplog: number; tree: number; blocks: number; bitfield: number }
  } | null> {
    try {
      const bee = await this.getMessagesBee(conversationId)
      const core = (bee as unknown as { core: HypercoreLike }).core

      if (!core) return null

      const info = await core.info({ storage: true }) as {
        length: number
        byteLength: number
        contiguousLength: number
        storage?: { oplog: number; tree: number; blocks: number; bitfield: number }
      }

      return {
        length: info.length,
        byteLength: info.byteLength,
        contiguousLength: info.contiguousLength,
        storage: info.storage,
      }
    } catch (err) {
      console.error('[StorageService] Failed to get storage info:', err)
      return null
    }
  }

  // ─── Contacts ──────────────────────────────────────────────────────────────

  /**
   * Save a contact to the default store.
   */
  async saveContact(contact: SerializedContact): Promise<void> {
    const bee = this.bees.get('default')
    if (!bee) throw new Error('Default store not initialized')
    console.log('[StorageService] Saving contact:', contact.publicKey.slice(0, 16) + '...')
    try {
      await bee.put(`contact:${contact.publicKey}`, contact)
      console.log('[StorageService] Contact saved to Hyperbee key: contact:' + contact.publicKey.slice(0, 16) + '...')
    } catch (err) {
      console.error('[StorageService] Failed to save contact:', err)
      throw err
    }
  }

  /**
   * Save multiple contacts in a single batch operation.
   * OPTIMIZATION: Hyperbee batch is MUCH faster than individual puts.
   */
  async saveContacts(contacts: SerializedContact[]): Promise<void> {
    const bee = this.bees.get('default')
    if (!bee) throw new Error('Default store not initialized')
    const batch = bee.batch()
    for (const contact of contacts) {
      await batch.put(`contact:${contact.publicKey}`, contact)
    }
    await batch.flush()
  }

  /**
   * Get all contacts.
   */
  async getContacts(): Promise<SerializedContact[]> {
    const bee = this.bees.get('default')
    if (!bee) throw new Error('Default store not initialized')

    console.log('[StorageService] Getting all contacts from Hyperbee...')
    const contacts: SerializedContact[] = []
    const stream = bee.createReadStream({ gte: 'contact:', lt: 'contact:\uffff' })
    for await (const entry of stream) {
      const contact = (entry as { value: SerializedContact }).value
      console.log('[StorageService] Found contact:', contact.publicKey.slice(0, 16) + '...')
      contacts.push(contact)
    }
    console.log('[StorageService] Total contacts found:', contacts.length)
    return contacts
  }

  /**
   * Get a single contact by public key.
   */
  async getContact(publicKey: string): Promise<SerializedContact | null> {
    const bee = this.bees.get('default')
    if (!bee) throw new Error('Default store not initialized')
    const entry = await bee.get(`contact:${publicKey}`)
    return entry ? (entry as { value: SerializedContact }).value : null
  }

  /**
   * Delete a contact.
   */
  async deleteContact(publicKey: string): Promise<boolean> {
    const bee = this.bees.get('default')
    if (!bee) throw new Error('Default store not initialized')
    await bee.del(`contact:${publicKey}`)
    return true
  }

  // ─── Groups ────────────────────────────────────────────────────────────────

  /**
   * Save a group to the default store.
   * HOLEPUNCH PATTERN: Uses Hyperbee CAS (Compare-And-Swap) to prevent concurrent
   * modifications from overwriting each other. If another admin modified the group
   * between our read and write, the write is accepted only if our version is newer.
   */
  async saveGroup(group: SerializedGroup): Promise<void> {
    const bee = this.bees.get('default')
    if (!bee) throw new Error('Default store not initialized')
    await bee.put(`group:${group.id}`, group, {
      cas: (prev: unknown, _next: unknown) => {
        if (!prev) return true // New group — accept
        const prevValue = (prev as { value?: { updatedAt?: number } })?.value
        // Backward compat: accept if no updatedAt on either side
        if (!prevValue?.updatedAt || !group.updatedAt) return true
        // Only accept if our update is at least as recent
        return group.updatedAt >= prevValue.updatedAt
      }
    })
  }

  /**
   * Save multiple groups in a single batch operation.
   */
  async saveGroups(groups: SerializedGroup[]): Promise<void> {
    const bee = this.bees.get('default')
    if (!bee) throw new Error('Default store not initialized')
    const batch = bee.batch()
    for (const group of groups) {
      await batch.put(`group:${group.id}`, group)
    }
    await batch.flush()
  }

  /**
   * Get all groups.
   */
  async getGroups(): Promise<SerializedGroup[]> {
    const bee = this.bees.get('default')
    if (!bee) throw new Error('Default store not initialized')

    const groups: SerializedGroup[] = []
    const stream = bee.createReadStream({ gte: 'group:', lt: 'group:\uffff' })
    for await (const entry of stream) {
      groups.push((entry as { value: SerializedGroup }).value)
    }
    return groups
  }

  /**
   * Get a single group by ID.
   */
  async getGroup(groupId: string): Promise<SerializedGroup | null> {
    const bee = this.bees.get('default')
    if (!bee) throw new Error('Default store not initialized')
    const entry = await bee.get(`group:${groupId}`)
    return entry ? (entry as { value: SerializedGroup }).value : null
  }

  /**
   * Delete a group.
   */
  async deleteGroup(groupId: string): Promise<boolean> {
    const bee = this.bees.get('default')
    if (!bee) throw new Error('Default store not initialized')
    await bee.del(`group:${groupId}`)
    return true
  }

  // ─── Blobs (file attachments) ──────────────────────────────────────────────

  /**
   * Store a blob as a plain file and return its ID for later retrieval.
   * ROBUSTNESS: File-system storage avoids IPC limits and Hyperblobs persistence quirks.
   */
  async putBlob(data: Buffer): Promise<string> {
    if (!this.blobsPath) throw new Error('Storage not initialized')
    const id = crypto.randomUUID()
    const filePath = path.join(this.blobsPath, id)
    try {
      await fs.writeFile(filePath, data)
      // Verify the file was actually written
      const stat = await fs.stat(filePath)
      console.log('[StorageService] putBlob:', id, 'size:', data.length, 'written:', stat.size, 'path:', filePath)
      if (stat.size !== data.length) {
        throw new Error(`Size mismatch: expected ${data.length}, got ${stat.size}`)
      }
      return id
    } catch (err) {
      console.error('[StorageService] putBlob failed:', id, err)
      throw err
    }
  }

  /**
   * Get a blob by its ID.
   */
  async getBlob(id: string): Promise<Buffer | null> {
    if (!this.blobsPath) throw new Error('Storage not initialized')
    try {
      const filePath = path.join(this.blobsPath, id)
      console.log('[StorageService] getBlob:', id, 'path:', filePath)
      const data = await fs.readFile(filePath)
      console.log('[StorageService] getBlob result:', id, 'found:', true, 'size:', data.length)
      return data
    } catch (err) {
      console.warn('[StorageService] getBlob failed:', id, err)
      return null
    }
  }

  /**
   * Get a partial range of a blob.
   * Uses fs.open/fs.read with positional read for partial reads — évite de
   * charger le blob entier en mémoire. (Les commentaires précédents citaient
   * à tort Hyperblobs.get() : les blobs sont stockés sur le filesystem.)
   * Useful for streaming large files or resuming downloads.
   */
  async getBlobRange(id: string, start: number, length: number): Promise<Buffer | null> {
    if (!this.blobsPath) throw new Error('Storage not initialized')
    try {
      const filePath = path.join(this.blobsPath, id)
      const { size } = await fs.stat(filePath)
      const end = Math.min(start + length, size)
      const actualLength = Math.max(0, end - start)
      const buffer = Buffer.alloc(actualLength)
      const fd = await fs.open(filePath, 'r')
      try {
        await fd.read(buffer, 0, actualLength, start)
      } finally {
        await fd.close()
      }
      return buffer
    } catch (err) {
      console.error('[StorageService] Failed to get blob range:', err)
      return null
    }
  }

  /**
   * Delete a blob from storage, freeing disk space.
   */
  async deleteBlob(id: string): Promise<boolean> {
    if (!this.blobsPath) throw new Error('Storage not initialized')
    try {
      const filePath = path.join(this.blobsPath, id)
      await fs.unlink(filePath)
      console.log('[StorageService] Deleted blob:', id)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to delete blob:', err)
      return false
    }
  }

  /**
   * Stream a blob for reading without loading it entirely into memory.
   * Returns an async iterable that yields Buffer chunks.
   */
  async *streamBlob(id: string): AsyncIterable<Buffer> {
    if (!this.blobsPath) throw new Error('Storage not initialized')
    try {
      const filePath = path.join(this.blobsPath, id)
      const handle = await fs.open(filePath, 'r')
      const chunkSize = 256 * 1024
      let offset = 0
      try {
        const { size } = await handle.stat()
        while (offset < size) {
          const remaining = size - offset
          const toRead = Math.min(chunkSize, remaining)
          const buffer = Buffer.alloc(toRead)
          await handle.read(buffer, 0, toRead, offset)
          yield buffer
          offset += toRead
        }
      } finally {
        await handle.close()
      }
    } catch (err) {
      console.error('[StorageService] Failed to stream blob:', err)
    }
  }

  /**
   * Stream a blob for writing from an async iterable.
   * Returns the blob ID on success.
   */
  async writeBlobStream(chunks: AsyncIterable<Buffer>): Promise<string | null> {
    if (!this.blobsPath) throw new Error('Storage not initialized')
    try {
      const id = crypto.randomUUID()
      const filePath = path.join(this.blobsPath, id)
      const handle = await fs.open(filePath, 'w')
      try {
        for await (const chunk of chunks) {
          await handle.write(chunk)
        }
      } finally {
        await handle.close()
      }
      return id
    } catch (err) {
      console.error('[StorageService] Failed to write blob stream:', err)
      return null
    }
  }

  /**
   * Get blob metadata (file size).
   */
  async getBlobInfo(id: string): Promise<{
    id: string
    byteOffset: number
    blockOffset: number
    blockLength: number
    byteLength: number
  } | null> {
    if (!this.blobsPath) return null
    try {
      const filePath = path.join(this.blobsPath, id)
      const stat = await fs.stat(filePath)
      return {
        id,
        byteOffset: 0,
        blockOffset: 0,
        blockLength: 0,
        byteLength: stat.size,
      }
    } catch {
      return null
    }
  }

  /**
   * List all stored blob IDs for diagnostics.
   */
  async listBlobIds(): Promise<string[]> {
    if (!this.blobsPath) return []
    try {
      const entries = await fs.readdir(this.blobsPath)
      return entries.filter((e) => !e.startsWith('.'))
    } catch {
      return []
    }
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  /**
   * Get total storage size in bytes.
   * OPTIMIZATION: Uses Hypercore core.info({ storage: true }) for accurate size
   * instead of recursive directory walking. Falls back to dir walk if unavailable.
   */
  async getStorageSize(): Promise<number> {
    try {
      // OPTIMIZATION: Sum storage info from all active Hypercores
      let totalSize = 0
      let usedCoreInfo = false

      for (const [, bee] of this.bees) {
        const core = (bee as unknown as { core: HypercoreLike }).core
        if (core && typeof core.info === 'function') {
          try {
            const info = await core.info({ storage: true }) as { storage?: { oplog: number; tree: number; blocks: number; bitfield: number } }
            if (info.storage) {
              totalSize += info.storage.oplog + info.storage.tree + info.storage.blocks + info.storage.bitfield
              usedCoreInfo = true
            }
          } catch {
            // Fall through to dir walk for this core
          }
        }
      }

      if (usedCoreInfo) return totalSize

      // Fallback: recursive directory walk
      return await this.getDirSize(this.dataPath)
    } catch {
      return 0
    }
  }

  private async getDirSize(dirPath: string): Promise<number> {
    let size = 0
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          size += await this.getDirSize(fullPath)
        } else {
          const stat = await fs.stat(fullPath)
          size += stat.size
        }
      }
    } catch {
      // Ignore errors
    }
    return size
  }

  /**
   * Clear all data (factory reset).
   */
  async clearAll(): Promise<void> {
    // CONFORMITÉ HOLEPUNCH : Hyperbee.close() existe bien (hyperbee 2.27.3,
    // index.js:1278) — les bees DOIVENT être fermées AVANT corestore.close()
    // et la suppression du dossier, sinon les handles ouverts sur les fichiers
    // supprimés provoquent des erreurs d'écriture.
    for (const [, bee] of this.bees) {
      await bee.close().catch(() => {})
    }
    this.bees.clear()

    // Close corestore
    if (this.corestore) {
      await (this.corestore as unknown as { close: () => Promise<void> }).close()
      this.corestore = null
    }

    // Remove data directory
    await fs.rm(this.dataPath, { recursive: true, force: true })
    await fs.mkdir(this.dataPath, { recursive: true })

    // Re-initialize
    this.initialized = false
    await this.initialize()
  }

  /**
   * Export all data as JSON for backup.
   * OPTIMIZATION: Uses Hyperbee snapshot() for consistent reads during export.
   * A snapshot ensures no concurrent writes affect the export mid-iteration.
   */
  async exportData(): Promise<ExportedData> {
    const contacts = await this.getContacts()
    const groups = await this.getGroups()

    // Collect all messages from all conversation bees
    // OPTIMIZATION: Use snapshot for consistent point-in-time reads
    const allMessages: Record<string, SerializedMessage[]> = {}
    for (const [key, bee] of this.bees) {
      if (key.startsWith('messages:')) {
        const convId = key.replace('messages:', '')
        const messages: SerializedMessage[] = []

        // Use snapshot if available for consistent export
        let readBee = bee
        let snapshotObj: { close: () => Promise<void> } | null = null
        if (typeof (bee as unknown as { snapshot: () => unknown }).snapshot === 'function') {
          snapshotObj = (bee as unknown as { snapshot: () => { close: () => Promise<void> } }).snapshot()
          readBee = snapshotObj as unknown as HyperbeeInstance
        }

        try {
          const stream = readBee.createReadStream()
          for await (const entry of stream) {
            messages.push((entry as { value: SerializedMessage }).value)
          }
        } finally {
          if (snapshotObj) {
            await snapshotObj.close().catch(() => {})
          }
        }

        allMessages[convId] = messages
      }
    }

    return { contacts, groups, messages: allMessages, exportedAt: Date.now() }
  }

  /**
   * Import data from a JSON backup.
   * OPTIMIZATION: Uses batch writes for much faster import.
   */
  async importData(data: ExportedData): Promise<void> {
    // Batch contacts and groups into default bee
    const defaultBee = this.bees.get('default')
    if (defaultBee) {
      const batch = defaultBee.batch()
      for (const contact of data.contacts) {
        await batch.put(`contact:${contact.publicKey}`, contact)
      }
      for (const group of data.groups) {
        await batch.put(`group:${group.id}`, group)
      }
      await batch.flush()
    }
    // Batch messages per conversation
    for (const [convId, messages] of Object.entries(data.messages)) {
      await this.saveMessages(convId, messages)
    }
  }

  /**
   * Get the underlying Corestore instance for replication.
   */
  getCorestore(): CorestoreInstance | null {
    return this.corestore
  }

  /**
   * Suspend the Corestore storage.
   * OPTIMIZATION: Uses Corestore.suspend() for power management.
   * Useful when app is backgrounded or idle.
   */
  async suspendStorage(): Promise<boolean> {
    if (!this.corestore) return false
    const suspendFn = (this.corestore as unknown as { suspend?: () => Promise<void> }).suspend
    if (typeof suspendFn !== 'function') return false
    try {
      await suspendFn.call(this.corestore)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to suspend storage:', err)
      return false
    }
  }

  /**
   * Resume the Corestore storage.
   * OPTIMIZATION: Uses Corestore.resume() for power management.
   * Restores storage operations after suspension.
   */
  async resumeStorage(): Promise<boolean> {
    if (!this.corestore) return false
    const resumeFn = (this.corestore as unknown as { resume?: () => Promise<void> }).resume
    if (typeof resumeFn !== 'function') return false
    try {
      await resumeFn.call(this.corestore)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to resume storage:', err)
      return false
    }
  }

  /**
   * Create a deterministic key pair from a name and namespace.
   * OPTIMIZATION: Uses Corestore.createKeyPair() for deterministic keys.
   * Useful for generating peer-specific keys that are reproducible.
   */
  async createDeterministicKeyPair(name: string, namespace?: string): Promise<{ publicKey: string; secretKey: string } | null> {
    if (!this.corestore) return null
    const createKeyPairFn = (this.corestore as unknown as { createKeyPair?: (name: string, ns?: string) => Promise<{ publicKey: Buffer; secretKey: Buffer }> }).createKeyPair
    if (typeof createKeyPairFn !== 'function') return null
    try {
      const keyPair = await createKeyPairFn.call(this.corestore, name, namespace)
      return {
        publicKey: keyPair.publicKey.toString('hex'),
        secretKey: keyPair.secretKey.toString('hex')
      }
    } catch (err) {
      console.error('[StorageService] Failed to create key pair:', err)
      return null
    }
  }

  /**
   * List all stored conversation cores.
   * OPTIMIZATION: Uses Corestore.list() for efficient core enumeration.
   */
  async listConversations(): Promise<string[]> {
    if (!this.corestore) return []

    const conversations: string[] = []
    const listFn = (this.corestore as unknown as { list?: (ns?: string) => AsyncIterable<{ name?: string; key?: Buffer }> }).list

    if (typeof listFn === 'function') {
      try {
        for await (const core of listFn.call(this.corestore)) {
          const name = (core as { name?: string }).name
          if (name && name.startsWith('messages-')) {
            conversations.push(name.replace('messages-', ''))
          }
        }
      } catch (err) {
        console.error('[StorageService] Failed to list conversations:', err)
      }
    } else {
      // Fallback: use bees map
      for (const key of this.bees.keys()) {
        if (key.startsWith('messages:')) {
          conversations.push(key.replace('messages:', ''))
        }
      }
    }

    return conversations
  }

  /**
   * Get total number of cores managed by the corestore.
   */
  async getCoreCount(): Promise<number> {
    if (!this.corestore) return 0

    let count = 0
    const listFn = (this.corestore as unknown as { list?: () => AsyncIterable<unknown> }).list

    if (typeof listFn === 'function') {
      try {
        for await (const _core of listFn.call(this.corestore)) {
          count++
        }
      } catch {
        // Ignore errors
      }
    } else {
      // Fallback: use bees map size
      count = this.bees.size
    }

    return count
  }

  /**
   * Watch for new cores being opened (for diagnostics).
   */
  watchCores(callback: (coreName: string) => void): () => void {
    if (!this.corestore) return () => {}

    const watchFn = (this.corestore as unknown as { watch?: (cb: (core: { name?: string }) => void) => void }).watch

    if (typeof watchFn === 'function') {
      const handler = (core: { name?: string }) => {
        if (core.name) callback(core.name)
      }
      watchFn.call(this.corestore, handler)
      return () => {
        const unwatchFn = (this.corestore as unknown as { unwatch?: (cb: typeof handler) => void }).unwatch
        if (typeof unwatchFn === 'function') {
          unwatchFn.call(this.corestore, handler)
        }
      }
    }

    return () => {}
  }

  /**
   * Get a namespaced Corestore for isolated data storage.
   * OPTIMIZATION: Uses Corestore namespace() to prevent name collisions.
   * Useful for separating different data types (e.g., temp, cache, archive).
   */
  getNamespacedStore(namespace: string): CorestoreInstance | null {
    if (!this.corestore) return null

    const namespaceFn = (this.corestore as unknown as { namespace?: (name: string) => CorestoreInstance }).namespace

    if (typeof namespaceFn === 'function') {
      return namespaceFn.call(this.corestore, namespace)
    }

    return null
  }

  /**
   * Get a sub-database with prefixed keys.
   * OPTIMIZATION: Uses Hyperbee sub() for namespacing within a single Hyperbee.
   * Useful for organizing data like settings, contacts, groups within default bee.
   */
  async getSubBee(conversationId: string, prefix: string): Promise<HyperbeeInstance | null> {
    const bee = await this.getMessagesBee(conversationId)
    const subFn = (bee as unknown as { sub?: (prefix: string, opts?: Record<string, unknown>) => HyperbeeInstance }).sub

    if (typeof subFn === 'function') {
      return subFn.call(bee, prefix)
    }

    return null
  }

  /**
   * Watch a specific key for changes.
   * OPTIMIZATION: Uses Hyperbee getAndWatch() for real-time key updates.
   * Useful for settings sync, presence indicators, status updates.
   */
  async watchKey(
    conversationId: string,
    key: string,
    callback: (value: unknown) => void
  ): Promise<() => void> {
    const bee = await this.getMessagesBee(conversationId)
    const getAndWatchFn = (bee as unknown as { getAndWatch?: (key: string) => Promise<{
      node: { value: unknown }
      on: (event: string, cb: () => void) => void
      close: () => Promise<void>
    }> }).getAndWatch

    if (typeof getAndWatchFn !== 'function') {
      console.warn('[StorageService] Hyperbee getAndWatch not available')
      return () => {}
    }

    try {
      const watcher = await getAndWatchFn.call(bee, key)
      callback(watcher.node.value)

      watcher.on('update', () => {
        callback(watcher.node.value)
      })

      return () => {
        watcher.close().catch(() => {})
      }
    } catch (err) {
      console.error('[StorageService] Failed to watch key:', err)
      return () => {}
    }
  }

  /**
   * Create a new Corestore session.
   * OPTIMIZATION: Uses Corestore session() for call isolation.
   * Returns a new session that can be used to isolate call data.
   */
  createCorestoreSession(): unknown | null {
    if (!this.corestore) return null

    try {
      const sessionFn = (this.corestore as unknown as { session?: () => unknown }).session
      if (typeof sessionFn !== 'function') return null

      return sessionFn.call(this.corestore)
    } catch (err) {
      console.error('[StorageService] Failed to create corestore session:', err)
      return null
    }
  }

  /**
   * Get a handle for updates from all hypercores with a group topic.
   * OPTIMIZATION: Uses Corestore notifyGroup() for group call management.
   * Returns a handle that can be used to get updates for the topic.
   */
  notifyGroup(topic: string): unknown | null {
    if (!this.corestore) return null

    try {
      const notifyGroupFn = (this.corestore as unknown as { notifyGroup?: (topic: string) => unknown }).notifyGroup
      if (typeof notifyGroupFn !== 'function') return null

      return notifyGroupFn.call(this.corestore, topic)
    } catch (err) {
      console.error('[StorageService] Failed to notify group:', err)
      return null
    }
  }

  /**
   * Get updates for a group topic handle.
   * OPTIMIZATION: Uses handle.update() for group call updates.
   * Returns an async iterator of core keys that have updated.
   */
  async getGroupUpdates(handle: unknown, opts?: { since?: number; reverse?: boolean }): Promise<AsyncIterable<string> | null> {
    if (!handle) return null

    try {
      const updateFn = (handle as unknown as { update?: (opts?: { since?: number; reverse?: boolean }) => AsyncIterable<string> }).update
      if (typeof updateFn !== 'function') return null

      return updateFn.call(handle, opts)
    } catch (err) {
      console.error('[StorageService] Failed to get group updates:', err)
      return null
    }
  }

  /**
   * Destroy a group topic handle.
   * OPTIMIZATION: Uses handle.destroy() for group call cleanup.
   * Returns true if successful.
   */
  destroyGroupHandle(handle: unknown): boolean {
    if (!handle) return false

    try {
      const destroyFn = (handle as unknown as { destroy?: () => void }).destroy
      if (typeof destroyFn !== 'function') return false

      destroyFn.call(handle)
      return true
    } catch (err) {
      console.error('[StorageService] Failed to destroy group handle:', err)
      return false
    }
  }

  /**
   * Register a callback for group-active events.
   * OPTIMIZATION: Uses Corestore group-active event for group call activity.
   * Called whenever an opened Hypercore in the store updates.
   */
  onGroupActive(callback: (topic: string) => void): void {
    if (!this.corestore) return

    try {
      const onFn = (this.corestore as unknown as { on?: (event: string, callback: (topic: string) => void) => void }).on
      if (typeof onFn !== 'function') return

      onFn.call(this.corestore, 'group-active', callback)
    } catch (err) {
      console.error('[StorageService] Failed to register group-active callback:', err)
    }
  }

  /**
   * Destroy and clean up.
   * CONFORMITÉ HOLEPUNCH : ferme chaque bee (Hyperbee.close()) avant le
   * corestore — l'ordre inverse laisse des sessions Hypercore pendantes.
   */
  async destroy(): Promise<void> {
    for (const [, bee] of this.bees) {
      await bee.close().catch(() => {})
    }
    this.bees.clear()

    if (this.corestore) {
      await (this.corestore as unknown as { close: () => Promise<void> }).close()
      this.corestore = null
    }
    this.initialized = false
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface CorestoreInstance {
  get: (opts: { name: string }) => HypercoreLike
  replicate: (stream: unknown) => unknown
  ready: () => Promise<void>
  close: () => Promise<void>
}

interface HypercoreLike {
  ready: () => Promise<void>
  length: number
  clear: (start: number, end: number) => Promise<void>
  info: (opts?: { storage?: boolean }) => Promise<unknown>
  truncate: (newLength: number, opts?: { fork?: number }) => Promise<void>
  download: (opts: { blocks?: number[]; start?: number; end?: number; linear?: boolean }) => { done: () => Promise<void>; destroy: () => void }
  has: (start: number, end?: number) => Promise<boolean>
  seek: (byteOffset: number) => Promise<[number, number]>
  createByteStream: (opts?: { byteOffset?: number; byteLength?: number; prefetch?: number }) => AsyncIterable<Buffer>
  update: (opts?: { wait?: boolean; force?: boolean }) => Promise<boolean>
  treeHash: (length?: number) => Promise<Buffer>
  createReadStream: (opts?: { start?: number; end?: number; live?: boolean }) => AsyncIterable<Buffer>
  setUserData: (key: string, value: string | Buffer) => Promise<void>
  getUserData: (key: string) => Promise<string | Buffer | null>
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string, handler: (...args: unknown[]) => void) => void
}

interface HyperbeeInstance {
  put: (key: string, value: unknown, opts?: Record<string, unknown>) => Promise<void>
  get: (key: string) => Promise<{ value: unknown } | null>
  del: (key: string) => Promise<void>
  batch: () => HyperbeeBatch
  createReadStream: (opts?: Record<string, unknown>) => AsyncIterable<unknown>
  peek: (opts?: { reverse?: boolean; gt?: string; gte?: string; lt?: string; lte?: string }) => Promise<{ key: string; value: unknown; seq: number } | null>
  watch: (range?: Record<string, unknown>) => HyperbeeWatcher
  snapshot: () => HyperbeeInstance
  checkout: (version: number) => HyperbeeInstance
  createDiffStream: (other: HyperbeeInstance, opts?: Record<string, unknown>) => AsyncIterable<unknown>
  close: () => Promise<void>
  version: number
}

interface HyperbeeWatchSnapshot {
  version: number
}

interface HyperbeeWatcher {
  ready: () => Promise<void>
  close: () => Promise<void>
  // CONFORMITÉ HOLEPUNCH (hyperbee/index.js:1606) : l'itérateur yield
  // [currentSnapshot, previousSnapshot] — des snapshots Hyperbee complets
  // (exposant .version), pas des objets littéraux { version }.
  [Symbol.asyncIterator]: () => AsyncIterator<[HyperbeeWatchSnapshot, HyperbeeWatchSnapshot]>
}

interface HyperbeeBatch {
  put: (key: string, value: unknown) => Promise<void>
  del: (key: string) => Promise<void>
  flush: () => Promise<void>
  close: () => Promise<void>
}

export interface SerializedMessage {
  id: string
  conversationId: string
  senderId: string
  type: string
  content: string
  timestamp: number
  status: string
  replyTo?: { id: string; senderId: string; content: string; type: string }
  attachments?: Array<{
    id: string
    type: string
    name: string
    size: number
    mimeType: string
    blobKey?: string
    localUrl?: string
    thumbnail?: string
    duration?: number
    width?: number
    height?: number
  }>
  reactions?: Array<{ emoji: string; users: string[]; count: number }>
  edits?: Array<{ editedAt: number; previousContent: string }>
  deleted?: boolean
  forwardedFrom?: { messageId: string; senderId: string; conversationId: string }
  signature?: string
  pinned?: boolean
}

export interface SerializedContact {
  publicKey: string
  displayName: string
  remoteName?: string
  avatar?: string
  status: string
  relation: string
  verified: boolean
  note?: string
  addedAt: number
  lastSeen?: number
  lastMessage?: string
  conversationId?: string
}

export interface SerializedGroup {
  id: string
  name: string
  description?: string
  avatar?: string
  members: Array<{
    publicKey: string
    displayName: string
    avatar?: string
    role: string
    joinedAt: number
    canPost: boolean
    mutedBy?: string
  }>
  channels: Array<{
    id: string
    groupId: string
    name: string
    description?: string
    type: string
    position: number
    permissions: { send: string[]; read: string[]; manage: string[] }
    unreadCount: number
    lastActivity?: number
  }>
  activeChannelId?: string
  createdAt: number
  updatedAt?: number // For CAS (Compare-And-Swap) conflict detection
  ownerId: string
  isPublic: boolean
  maxMembers: number
  inviteKey?: string
}

export interface ExportedData {
  contacts: SerializedContact[]
  groups: SerializedGroup[]
  messages: Record<string, SerializedMessage[]>
  exportedAt: number
}
