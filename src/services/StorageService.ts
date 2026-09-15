import type { Message } from '@/types/message'
import type { Contact } from '@/types/contact'
import type { Group } from '@/types/group'
import { getCurrentLanguage } from '@/i18n/config'

/**
 * StorageService — frontend wrapper for persistent storage via IPC.
 *
 * Communicates with the Electron main process StorageService through
 * the window.asgard.storage bridge. Provides typed methods for saving
 * and retrieving messages, contacts, groups, and blobs.
 */
class StorageServiceClient {
  private get api() {
    return window.asgard?.storage
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  async saveMessage(conversationId: string, message: Message): Promise<void> {
    if (!this.api) throw new Error('Storage API not available')
    await this.api.saveMessage(conversationId, message)
  }

  /**
   * Save multiple messages in a single batch operation.
   * OPTIMIZATION: Much faster than individual saveMessage calls.
   */
  async saveMessages(conversationId: string, messages: Message[]): Promise<void> {
    if (!this.api) throw new Error('Storage API not available')
    await this.api.saveMessages(conversationId, messages)
  }

  async getMessages(
    conversationId: string,
    options?: { limit?: number; before?: number; after?: number; reverse?: boolean }
  ): Promise<Message[]> {
    if (!this.api) throw new Error('Storage API not available')
    const messages = await this.api.getMessages(conversationId, options)
    return messages as unknown as Message[]
  }

  /**
   * Get the last N messages efficiently using reverse streaming.
   * OPTIMIZATION: Uses Hyperbee reverse + limit for pagination.
   */
  async getLastMessages(conversationId: string, count = 50): Promise<Message[]> {
    if (!this.api) throw new Error('Storage API not available')
    const messages = await this.api.getLastMessages(conversationId, count)
    return messages as unknown as Message[]
  }

  /**
   * Get the latest message in a conversation (for preview).
   * OPTIMIZATION: Uses reverse + limit=1 instead of loading all messages.
   */
  async getLatestMessage(conversationId: string): Promise<Message | null> {
    if (!this.api) throw new Error('Storage API not available')
    const message = await this.api.getLatestMessage(conversationId)
    return message as unknown as Message | null
  }

  /**
   * Delete all messages in a conversation efficiently.
   * OPTIMIZATION: Uses batch delete instead of individual deletes.
   */
  async clearMessages(conversationId: string): Promise<void> {
    if (!this.api) throw new Error('Storage API not available')
    await this.api.clearMessages(conversationId)
  }

  /**
   * Count messages in a conversation without loading them.
   */
  async countMessages(conversationId: string): Promise<number> {
    if (!this.api) throw new Error('Storage API not available')
    return await this.api.countMessages(conversationId)
  }

  /**
   * Search messages by content in a conversation.
   * OPTIMIZATION: Uses Hyperbee range scan with early termination in main process.
   */
  async searchMessages(conversationId: string, query: string, limit = 50): Promise<Message[]> {
    if (!this.api) throw new Error('Storage API not available')
    const messages = await this.api.searchMessages(conversationId, query, limit)
    return messages as unknown as Message[]
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<boolean> {
    if (!this.api) throw new Error('Storage API not available')
    return await this.api.deleteMessage(conversationId, messageId)
  }

  // ─── Contacts ──────────────────────────────────────────────────────────────

  async saveContact(contact: Contact): Promise<void> {
    if (!this.api) throw new Error('Storage API not available')
    await this.api.saveContact(contact)
  }

  async getContacts(): Promise<Contact[]> {
    if (!this.api) throw new Error('Storage API not available')
    const contacts = await this.api.getContacts()
    return contacts as unknown as Contact[]
  }

  async getContact(publicKey: string): Promise<Contact | null> {
    if (!this.api) throw new Error('Storage API not available')
    const contact = await this.api.getContact(publicKey)
    return contact as unknown as Contact | null
  }

  async deleteContact(publicKey: string): Promise<boolean> {
    if (!this.api) throw new Error('Storage API not available')
    return await this.api.deleteContact(publicKey)
  }

  // ─── Groups ────────────────────────────────────────────────────────────────

  async saveGroup(group: Group): Promise<void> {
    if (!this.api) throw new Error('Storage API not available')
    await this.api.saveGroup(group)
  }

  async getGroups(): Promise<Group[]> {
    if (!this.api) throw new Error('Storage API not available')
    const groups = await this.api.getGroups()
    return groups as unknown as Group[]
  }

  async getGroup(groupId: string): Promise<Group | null> {
    if (!this.api) throw new Error('Storage API not available')
    const group = await this.api.getGroup(groupId)
    return group as unknown as Group | null
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    if (!this.api) throw new Error('Storage API not available')
    return await this.api.deleteGroup(groupId)
  }

  // ─── Blobs ─────────────────────────────────────────────────────────────────

  async putBlob(data: ArrayBuffer): Promise<string> {
    if (!this.api) throw new Error('Storage API not available')
    return await this.api.putBlob(data)
  }

  async getBlob(id: string): Promise<ArrayBuffer | null> {
    if (!this.api) throw new Error('Storage API not available')
    return await this.api.getBlob(id)
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  async getPath(): Promise<string> {
    if (!this.api) throw new Error('Storage API not available')
    return await this.api.getPath()
  }

  async getSize(): Promise<number> {
    if (!this.api) throw new Error('Storage API not available')
    return await this.api.getSize()
  }

  async clearAll(): Promise<void> {
    if (!this.api) throw new Error('Storage API not available')
    await this.api.clearAll()
  }

  async exportData(): Promise<unknown> {
    if (!this.api) throw new Error('Storage API not available')
    return await this.api.exportData()
  }

  async importData(data: unknown): Promise<void> {
    if (!this.api) throw new Error('Storage API not available')
    await this.api.importData(data)
  }

  // ─── Backup & Restore (Hypercore-inspired) ─────────────────────────────

  private backupHistory: BackupInfo[] = []
  private autoBackupEnabled = false
  private autoBackupInterval: ReturnType<typeof setInterval> | null = null

  /**
   * Create a backup of all data.
   */
  async createBackup(name?: string): Promise<BackupInfo> {
    if (!this.api) throw new Error('Storage API not available')

    const backup: BackupInfo = {
      id: `backup-${Date.now()}`,
      name: name || `Backup ${new Date().toLocaleString(getCurrentLanguage())}`,
      createdAt: Date.now(),
      size: 0,
      type: 'full',
    }

    try {
      const data = await this.exportData()
      backup.data = data
      backup.size = JSON.stringify(data).length
      this.backupHistory.push(backup)
      console.log(`[StorageService] Backup created: ${backup.name} (${backup.size} bytes)`)
    } catch (err) {
      console.error('[StorageService] Failed to create backup:', err)
      throw err
    }

    return backup
  }

  /**
   * Restore from a backup.
   */
  async restoreBackup(backupId: string): Promise<void> {
    const backup = this.backupHistory.find(b => b.id === backupId)
    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`)
    }

    try {
      await this.importData(backup.data)
      console.log(`[StorageService] Restored from backup: ${backup.name}`)
    } catch (err) {
      console.error('[StorageService] Failed to restore backup:', err)
      throw err
    }
  }

  /**
   * Get all backups.
   */
  getBackups(): BackupInfo[] {
    return [...this.backupHistory]
  }

  /**
   * Delete a backup.
   */
  deleteBackup(backupId: string): void {
    this.backupHistory = this.backupHistory.filter(b => b.id !== backupId)
    console.log(`[StorageService] Backup deleted: ${backupId}`)
  }

  /**
   * Enable auto backup.
   */
  enableAutoBackup(intervalMinutes: number = 60): void {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval)
    }

    this.autoBackupEnabled = true
    this.autoBackupInterval = setInterval(async () => {
      try {
        await this.createBackup('Auto Backup')
        console.log('[StorageService] Auto backup completed')
      } catch (err) {
        console.error('[StorageService] Auto backup failed:', err)
      }
    }, intervalMinutes * 60 * 1000)

    console.log(`[StorageService] Auto backup enabled (every ${intervalMinutes} minutes)`)
  }

  /**
   * Disable auto backup.
   */
  disableAutoBackup(): void {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval)
      this.autoBackupInterval = null
    }
    this.autoBackupEnabled = false
    console.log('[StorageService] Auto backup disabled')
  }

  /**
   * Check if auto backup is enabled.
   */
  isAutoBackupEnabled(): boolean {
    return this.autoBackupEnabled
  }

  /**
   * Get backup statistics.
   */
  getBackupStats(): {
    totalBackups: number
    totalSize: number
    lastBackup: number | null
    autoBackupEnabled: boolean
  } {
    const totalSize = this.backupHistory.reduce((sum, b) => sum + b.size, 0)
    const lastBackup = this.backupHistory.length > 0
      ? Math.max(...this.backupHistory.map(b => b.createdAt))
      : null

    return {
      totalBackups: this.backupHistory.length,
      totalSize,
      lastBackup,
      autoBackupEnabled: this.autoBackupEnabled,
    }
  }

  // ─── Archiving (Hypercore-inspired) ────────────────────────────────────

  private archivedConversations: Set<string> = new Set()

  /**
   * Archive a conversation.
   */
  async archiveConversation(conversationId: string): Promise<void> {
    this.archivedConversations.add(conversationId)
    console.log(`[StorageService] Conversation archived: ${conversationId}`)
  }

  /**
   * Unarchive a conversation.
   */
  unarchiveConversation(conversationId: string): void {
    this.archivedConversations.delete(conversationId)
    console.log(`[StorageService] Conversation unarchived: ${conversationId}`)
  }

  /**
   * Check if a conversation is archived.
   */
  isArchived(conversationId: string): boolean {
    return this.archivedConversations.has(conversationId)
  }

  /**
   * Get all archived conversations.
   */
  getArchivedConversations(): string[] {
    return Array.from(this.archivedConversations)
  }

  /**
   * Export archived conversations.
   */
  async exportArchivedConversations(): Promise<ArchivedData[]> {
    const archived: ArchivedData[] = []

    for (const conversationId of this.archivedConversations) {
      const messages = await this.getMessages(conversationId)
      archived.push({
        conversationId,
        messages,
        archivedAt: Date.now(),
      })
    }

    return archived
  }

  /**
   * Import archived conversations.
   */
  async importArchivedConversations(data: ArchivedData[]): Promise<void> {
    for (const item of data) {
      await this.saveMessages(item.conversationId, item.messages)
      this.archivedConversations.add(item.conversationId)
    }
    console.log(`[StorageService] Imported ${data.length} archived conversations`)
  }

  /**
   * Get archive statistics.
   */
  getArchiveStats(): {
    totalArchived: number
    archivedConversations: string[]
  } {
    return {
      totalArchived: this.archivedConversations.size,
      archivedConversations: Array.from(this.archivedConversations),
    }
  }

  // ─── Distributed Cache (Hyperbee-inspired) ─────────────────────────────

  private cache: Map<string, CacheEntry> = new Map()
  private cacheMaxSize = 1000
  private cacheTTL = 3600000 // 1 hour default

  /**
   * Set a cache entry.
   */
  setCache(key: string, value: unknown, ttl?: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.cacheMaxSize) {
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt)[0]
      if (oldest) {
        this.cache.delete(oldest[0])
      }
    }

    this.cache.set(key, {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ttl || this.cacheTTL),
      accessCount: 0,
    })
  }

  /**
   * Get a cache entry.
   */
  getCache<T = unknown>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    entry.accessCount++
    entry.lastAccessed = Date.now()
    return entry.value as T
  }

  /**
   * Check if a key exists in cache.
   */
  hasCache(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return false
    }
    return true
  }

  /**
   * Delete a cache entry.
   */
  deleteCache(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Clear all cache entries.
   */
  clearCache(): void {
    this.cache.clear()
    console.log('[StorageService] Cache cleared')
  }

  /**
   * Clean expired cache entries.
   */
  cleanExpiredCache(): number {
    const now = Date.now()
    let cleaned = 0
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        cleaned++
      }
    }
    console.log(`[StorageService] Cleaned ${cleaned} expired cache entries`)
    return cleaned
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): {
    size: number
    maxSize: number
    hitRate: number
    averageAccessCount: number
    oldestEntry: number | null
    newestEntry: number | null
  } {
    const entries = Array.from(this.cache.values())
    const totalAccess = entries.reduce((sum, e) => sum + e.accessCount, 0)
    const averageAccess = entries.length > 0 ? totalAccess / entries.length : 0
    const timestamps = entries.map(e => e.createdAt)
    const oldest = timestamps.length > 0 ? Math.min(...timestamps) : null
    const newest = timestamps.length > 0 ? Math.max(...timestamps) : null

    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      hitRate: totalAccess / Math.max(1, this.cache.size),
      averageAccessCount: averageAccess,
      oldestEntry: oldest,
      newestEntry: newest,
    }
  }

  /**
   * Set cache max size.
   */
  setCacheMaxSize(maxSize: number): void {
    this.cacheMaxSize = maxSize
    console.log(`[StorageService] Cache max size set to: ${maxSize}`)
  }

  /**
   * Set default cache TTL.
   */
  setCacheTTL(ttl: number): void {
    this.cacheTTL = ttl
    console.log(`[StorageService] Cache TTL set to: ${ttl}ms`)
  }

  // ─── Temporary Data Management (Hyperbee-inspired) ─────────────────────

  private tempData: Map<string, TempEntry> = new Map()

  /**
   * Store temporary data.
   */
  setTempData(key: string, value: unknown, ttl: number = 300000): void { // 5 min default
    this.tempData.set(key, {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
    })
  }

  /**
   * Get temporary data.
   */
  getTempData<T = unknown>(key: string): T | null {
    const entry = this.tempData.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.tempData.delete(key)
      return null
    }

    return entry.value as T
  }

  /**
   * Delete temporary data.
   */
  deleteTempData(key: string): void {
    this.tempData.delete(key)
  }

  /**
   * Clear all temporary data.
   */
  clearTempData(): void {
    this.tempData.clear()
    console.log('[StorageService] Temporary data cleared')
  }

  /**
   * Clean expired temporary data.
   */
  cleanExpiredTempData(): number {
    const now = Date.now()
    let cleaned = 0
    for (const [key, entry] of this.tempData.entries()) {
      if (now > entry.expiresAt) {
        this.tempData.delete(key)
        cleaned++
      }
    }
    return cleaned
  }

  /**
   * Get temporary data statistics.
   */
  getTempDataStats(): {
    size: number
    expiredCount: number
    averageTTL: number
  } {
    const entries = Array.from(this.tempData.values())
    const now = Date.now()
    const expired = entries.filter(e => now > e.expiresAt).length
    const averageTTL = entries.length > 0
      ? entries.reduce((sum, e) => sum + (e.expiresAt - e.createdAt), 0) / entries.length
      : 0

    return {
      size: this.tempData.size,
      expiredCount: expired,
      averageTTL,
    }
  }

  // ─── Cryptographic Proofs (Hypercore-inspired) ─────────────────────────

  private proofLog: ProofEntry[] = []
  private integrityChecks: Map<string, IntegrityCheck> = new Map()

  /**
   * Generate a cryptographic proof for data.
   */
  async generateProof(data: unknown): Promise<ProofEntry> {
    const dataStr = JSON.stringify(data)
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(dataStr)

    // Generate SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
    const hashArray = new Uint8Array(hashBuffer)
    const hash = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')

    const proof: ProofEntry = {
      id: `proof-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      dataHash: hash,
      timestamp: Date.now(),
      verified: false,
      merkleRoot: hash, // Simplified - in real implementation, would be Merkle tree root
    }

    this.proofLog.push(proof)
    console.log(`[StorageService] Proof generated: ${hash.slice(0, 16)}...`)
    return proof
  }

  /**
   * Verify data integrity against a proof.
   */
  async verifyDataIntegrity(data: unknown, expectedHash: string): Promise<boolean> {
    const dataStr = JSON.stringify(data)
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(dataStr)

    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
    const hashArray = new Uint8Array(hashBuffer)
    const hash = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')

    const valid = hash === expectedHash

    // Record the check
    this.integrityChecks.set(expectedHash, {
      hash: expectedHash,
      checkedAt: Date.now(),
      valid,
      computedHash: hash,
    })

    console.log(`[StorageService] Integrity check: ${valid ? 'PASS' : 'FAIL'} for ${expectedHash.slice(0, 16)}...`)
    return valid
  }

  /**
   * Get proof log.
   */
  getProofLog(limit: number = 100): ProofEntry[] {
    return this.proofLog.slice(-limit)
  }

  /**
   * Get integrity check history.
   */
  getIntegrityChecks(): IntegrityCheck[] {
    return Array.from(this.integrityChecks.values())
  }

  /**
   * Get proof statistics.
   */
  getProofStats(): {
    totalProofs: number
    verifiedProofs: number
    integrityChecks: number
    passedChecks: number
    failedChecks: number
  } {
    const verifiedProofs = this.proofLog.filter(p => p.verified).length
    const checks = Array.from(this.integrityChecks.values())
    const passed = checks.filter(c => c.valid).length
    const failed = checks.filter(c => !c.valid).length

    return {
      totalProofs: this.proofLog.length,
      verifiedProofs,
      integrityChecks: checks.length,
      passedChecks: passed,
      failedChecks: failed,
    }
  }

  /**
   * Mark a proof as verified.
   */
  verifyProof(proofId: string): void {
    const proof = this.proofLog.find(p => p.id === proofId)
    if (proof) {
      proof.verified = true
      console.log(`[StorageService] Proof verified: ${proofId}`)
    }
  }

  // ─── Audit Trail (Hypercore-inspired) ──────────────────────────────────

  private auditLog: AuditEntry[] = []
  private auditEnabled = true

  /**
   * Record an audit event.
   */
  recordAudit(event: AuditEntry): void {
    if (!this.auditEnabled) return

    this.auditLog.push({
      ...event,
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    })

    // Keep only last 10000 entries
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000)
    }
  }

  /**
   * Get audit log.
   */
  getAuditLog(options: { limit?: number; type?: string; startDate?: number } = {}): AuditEntry[] {
    let log = [...this.auditLog]

    if (options.type) {
      log = log.filter(e => e.type === options.type)
    }
    if (options.startDate) {
      log = log.filter(e => e.timestamp >= options.startDate!)
    }
    if (options.limit) {
      log = log.slice(-options.limit)
    }

    return log
  }

  /**
   * Enable/disable audit logging.
   */
  setAuditEnabled(enabled: boolean): void {
    this.auditEnabled = enabled
    console.log(`[StorageService] Audit logging ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Check if audit logging is enabled.
   */
  isAuditEnabled(): boolean {
    return this.auditEnabled
  }

  /**
   * Get audit statistics.
   */
  getAuditStats(): {
    totalEvents: number
    eventsByType: Record<string, number>
    recentEvents: number
    oldestEvent: number | null
    newestEvent: number | null
  } {
    const eventsByType: Record<string, number> = {}
    for (const entry of this.auditLog) {
      eventsByType[entry.type] = (eventsByType[entry.type] || 0) + 1
    }

    const recentThreshold = Date.now() - 86400000 // Last 24 hours
    const recentEvents = this.auditLog.filter(e => e.timestamp > recentThreshold).length
    const timestamps = this.auditLog.map(e => e.timestamp)

    return {
      totalEvents: this.auditLog.length,
      eventsByType,
      recentEvents,
      oldestEvent: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEvent: timestamps.length > 0 ? Math.max(...timestamps) : null,
    }
  }

  /**
   * Clear audit log.
   */
  clearAuditLog(): void {
    this.auditLog = []
    console.log('[StorageService] Audit log cleared')
  }
}

export const storageService = new StorageServiceClient()

// ─── Types ──────────────────────────────────────────────────────────────────

interface BackupInfo {
  id: string
  name: string
  createdAt: number
  size: number
  type: 'full' | 'incremental'
  data?: unknown
}

interface ArchivedData {
  conversationId: string
  messages: Message[]
  archivedAt: number
}

interface CacheEntry {
  key: string
  value: unknown
  createdAt: number
  expiresAt: number
  accessCount: number
  lastAccessed?: number
}

interface TempEntry {
  key: string
  value: unknown
  createdAt: number
  expiresAt: number
}

interface ProofEntry {
  id: string
  dataHash: string
  timestamp: number
  verified: boolean
  merkleRoot: string
}

interface IntegrityCheck {
  hash: string
  checkedAt: number
  valid: boolean
  computedHash: string
}

interface AuditEntry {
  id: string
  type: 'create' | 'read' | 'update' | 'delete' | 'access' | 'permission' | 'backup' | 'restore'
  resource: string
  actor: string
  details?: unknown
  timestamp: number
}
