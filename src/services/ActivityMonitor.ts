/**
 * ActivityMonitor — Tracks user activity and manages auto-away status.
 * 
 * Monitors mouse, keyboard, and window focus events to detect user presence.
 * Automatically sets status to "away" after inactivity timeout.
 * Restores previous status when user becomes active again.
 */

import { useIdentityStore } from '@/stores/identityStore'
import { useUIStore } from '@/stores/uiStore'
import { chatService } from './ChatService'
import type { UserStatus } from '@/types'

class ActivityMonitor {
  private lastActivity = Date.now()
  private previousStatus: UserStatus = 'online'
  private isAway = false
  private checkInterval: ReturnType<typeof setInterval> | null = null
  private isStarted = false

  // Configuration
  private static readonly AWAY_TIMEOUT = 5 * 60 * 1000 // 5 minutes of inactivity
  private static readonly CHECK_INTERVAL = 30 * 1000 // Check every 30 seconds

  /**
   * Start monitoring user activity.
   */
  start(): void {
    if (this.isStarted) return
    this.isStarted = true

    // Listen for user activity events
    window.addEventListener('mousemove', this.handleActivity)
    window.addEventListener('keydown', this.handleActivity)
    window.addEventListener('focus', this.handleFocus)
    window.addEventListener('blur', this.handleBlur)
    window.addEventListener('click', this.handleActivity)
    window.addEventListener('scroll', this.handleActivity)
    window.addEventListener('touchstart', this.handleActivity)

    // Start periodic check
    this.checkInterval = setInterval(() => this.checkInactivity(), ActivityMonitor.CHECK_INTERVAL)

    console.log('[ActivityMonitor] Started monitoring user activity')
  }

  /**
   * Stop monitoring user activity.
   */
  stop(): void {
    if (!this.isStarted) return
    this.isStarted = false

    window.removeEventListener('mousemove', this.handleActivity)
    window.removeEventListener('keydown', this.handleActivity)
    window.removeEventListener('focus', this.handleFocus)
    window.removeEventListener('blur', this.handleBlur)
    window.removeEventListener('click', this.handleActivity)
    window.removeEventListener('scroll', this.handleActivity)
    window.removeEventListener('touchstart', this.handleActivity)

    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }

    console.log('[ActivityMonitor] Stopped monitoring user activity')
  }

  /**
   * Handle user activity events.
   */
  private handleActivity = (): void => {
    this.lastActivity = Date.now()

    // If we were away, restore previous status
    if (this.isAway) {
      this.restoreStatus()
    }
  }

  /**
   * Handle window focus event.
   */
  private handleFocus = (): void => {
    this.lastActivity = Date.now()
    if (this.isAway) {
      this.restoreStatus()
    }
  }

  /**
   * Handle window blur event.
   */
  private handleBlur = (): void => {
    // Don't immediately set away on blur, let the timeout handle it
    // This prevents flickering when switching windows briefly
  }

  /**
   * Check if user has been inactive for too long.
   */
  private checkInactivity(): void {
    const idleTime = Date.now() - this.lastActivity
    const identity = useIdentityStore.getState().identity
    const privacy = useUIStore.getState().settings.privacy

    // Don't auto-away if:
    // - Privacy setting disables online status
    // - User is busy (don't interrupt)
    // - User is invisible
    if (!privacy.onlineStatus) return
    if (identity?.profile.status === 'busy') return
    if (identity?.profile.status === 'invisible') return

    if (idleTime >= ActivityMonitor.AWAY_TIMEOUT && !this.isAway) {
      this.setAutoAway()
    }
  }

  /**
   * Set status to away due to inactivity.
   */
  private setAutoAway(): void {
    const identity = useIdentityStore.getState().identity
    if (!identity) return

    // Save current status to restore later
    this.previousStatus = identity.profile.status
    this.isAway = true

    // Set status to away
    useIdentityStore.getState().setStatus('away').catch(console.error)

    // Broadcast presence update
    chatService.broadcastPresence().catch(console.error)

    console.log('[ActivityMonitor] User inactive, setting status to away')
  }

  /**
   * Restore previous status after user returns.
   */
  private restoreStatus(): void {
    const identity = useIdentityStore.getState().identity
    if (!identity || !this.isAway) return

    this.isAway = false

    // Restore previous status (unless it was away)
    const statusToRestore = this.previousStatus === 'away' ? 'online' : this.previousStatus
    useIdentityStore.getState().setStatus(statusToRestore).catch(console.error)

    // Broadcast presence update
    chatService.broadcastPresence().catch(console.error)

    console.log('[ActivityMonitor] User active again, restoring status to', statusToRestore)
  }

  /**
   * Get the current idle time in milliseconds.
   */
  getIdleTime(): number {
    return Date.now() - this.lastActivity
  }

  /**
   * Check if user is currently considered away due to inactivity.
   */
  getIsAway(): boolean {
    return this.isAway
  }
}

export const activityMonitor = new ActivityMonitor()
