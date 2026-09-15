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
  // Distinction capitale : « away » posé par nous (inactivité) ne doit jamais être
  // confondu avec « absent » choisi à la main par l'utilisateur. Le premier se
  // relève au retour, le second non.
  private autoSetAway = false
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

    // Un auto-away en cours ne doit pas survivre à l'arrêt du monitor : sinon le
    // profil resterait bloqué sur « absent » alors que l'utilisateur est là.
    if (this.isAway) this.restoreStatus()

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

    // Ne jamais toucher un statut choisi :
    // - Privacy coupée : rien à annoncer.
    // - L'auto-away ne s'applique qu'à un utilisateur clairement « en ligne ».
    // Il partait de n'importe quel statut sauf busy/invisible, donc un « absent »
    // manuel était écrasé puis, au retour, transformé en « en ligne » par la
    // règle `previousStatus === 'away' ? 'online'` : le choix de l'utilisateur
    // mourait au premier mouvement de souris.
    if (!privacy.onlineStatus) return
    if (identity?.profile.status !== 'online') return

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
    if (identity.profile.status !== 'online') return

    // Save current status to restore later
    this.previousStatus = identity.profile.status
    this.isAway = true
    this.autoSetAway = true

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
    if (!this.autoSetAway) return
    this.autoSetAway = false

    // Annuler uniquement CE QUE NOUS AVONS FAIT. Si le profil ne dit plus « away »
    // (statut choisi entre-temps, changement venu d'un autre écran), cette
    // déclaration prime et ne doit pas être écrasée.
    if (identity.profile.status !== 'away') return

    useIdentityStore.getState().setStatus(this.previousStatus).catch(console.error)

    // Broadcast presence update
    chatService.broadcastPresence().catch(console.error)

    console.log('[ActivityMonitor] User active again, restoring status to', this.previousStatus)
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
