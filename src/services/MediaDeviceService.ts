import { EventEmitter } from 'eventemitter3'

/**
 * MediaDeviceService — detects, enumerates, and monitors audio/video hardware.
 *
 * Uses the Web `navigator.mediaDevices` API (Chrome/Electron) to:
 * - Enumerate cameras, microphones, and speakers
 * - Listen for device plug/unplug events (`devicechange`)
 * - Store user preferences (selected deviceId per category)
 * - Monitor permission state
 * - Auto-fallback when a device disconnects mid-call
 *
 * Optimized following Holepunch patterns: minimal overhead, event-driven,
 * lazy initialization, and graceful degradation.
 */

export interface MediaDeviceInfo {
  deviceId: string
  label: string
  kind: MediaDeviceKind
  groupId: string
}

export interface DevicePreferences {
  audioInput?: string  // microphone deviceId
  audioOutput?: string // speaker deviceId
  videoInput?: string  // camera deviceId
}

interface MediaDeviceEvents {
  'devices:changed': () => void
  'devices:permission': (granted: boolean) => void
  'devices:error': (error: string) => void
}

class MediaDeviceService extends EventEmitter<MediaDeviceEvents> {
  private static instance: MediaDeviceService
  private devices: MediaDeviceInfo[] = []
  private preferences: DevicePreferences = {}
  private permissionGranted = false
  private monitoring = false
  private initialized = false

  static getInstance(): MediaDeviceService {
    if (!MediaDeviceService.instance) {
      MediaDeviceService.instance = new MediaDeviceService()
    }
    return MediaDeviceService.instance
  }

  /**
   * Initialize device detection and start monitoring.
   * Loads saved preferences from localStorage.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    // Load saved preferences
    this.loadPreferences()

    // Check if mediaDevices API is available
    if (!navigator.mediaDevices?.enumerateDevices) {
      console.warn('[MediaDeviceService] mediaDevices API not available')
      return
    }

    // Initial device enumeration
    await this.refreshDevices()

    // Check permission state
    await this.checkPermissions()

    // Start monitoring for device changes
    this.startMonitoring()
  }

  /**
   * Refresh the device list by calling enumerateDevices().
   * Requires permission to see device labels.
   */
  async refreshDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const rawDevices = await navigator.mediaDevices.enumerateDevices()
      this.devices = rawDevices.map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `${d.kind} (${d.deviceId.slice(0, 8)}…)`,
        kind: d.kind,
        groupId: d.groupId,
      }))

      // Auto-select defaults if no preference set
      this.autoSelectDefaults()

      this.emit('devices:changed')
      return this.devices
    } catch (err) {
      console.error('[MediaDeviceService] Failed to enumerate devices:', err)
      this.emit('devices:error', 'Failed to enumerate devices')
      return []
    }
  }

  /**
   * Get all available devices, optionally filtered by kind.
   */
  getDevices(kind?: MediaDeviceKind): MediaDeviceInfo[] {
    if (kind) {
      return this.devices.filter((d) => d.kind === kind)
    }
    return [...this.devices]
  }

  /**
   * Get available microphones (audioinput).
   */
  getMicrophones(): MediaDeviceInfo[] {
    return this.getDevices('audioinput')
  }

  /**
   * Get available cameras (videoinput).
   */
  getCameras(): MediaDeviceInfo[] {
    return this.getDevices('videoinput')
  }

  /**
   * Get available speakers (audiooutput).
   */
  getSpeakers(): MediaDeviceInfo[] {
    return this.getDevices('audiooutput')
  }

  /**
   * Get the preferred device for a given kind.
   */
  getPreferredDevice(kind: MediaDeviceKind): MediaDeviceInfo | undefined {
    const prefKey = this.getPreferenceKey(kind)
    const preferredId = prefKey ? this.preferences[prefKey] : undefined

    if (preferredId) {
      const device = this.devices.find((d) => d.deviceId === preferredId && d.kind === kind)
      if (device) return device
    }

    // Fallback to first available device of this kind
    return this.devices.find((d) => d.kind === kind)
  }

  /**
   * Set the preferred device for a given kind.
   */
  setPreferredDevice(kind: MediaDeviceKind, deviceId: string): void {
    const prefKey = this.getPreferenceKey(kind)
    if (!prefKey) return

    this.preferences[prefKey] = deviceId
    this.savePreferences()
  }

  /**
   * Get the current device preferences.
   */
  getPreferences(): DevicePreferences {
    return { ...this.preferences }
  }

  /**
   * Check if we have permission to access media devices.
   */
  async checkPermissions(): Promise<boolean> {
    try {
      if (!navigator.permissions) {
        // Fallback: try to enumerate and see if labels are available
        const devices = await navigator.mediaDevices.enumerateDevices()
        this.permissionGranted = devices.some((d) => d.label !== '')
        return this.permissionGranted
      }

      const micPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      const camPermission = await navigator.permissions.query({ name: 'camera' as PermissionName })

      this.permissionGranted = micPermission.state === 'granted' || camPermission.state === 'granted'

      // Listen for permission changes
      micPermission.onchange = () => {
        this.checkPermissions().then(() => this.refreshDevices())
      }
      camPermission.onchange = () => {
        this.checkPermissions().then(() => this.refreshDevices())
      }

      return this.permissionGranted
    } catch {
      this.permissionGranted = false
      return false
    }
  }

  /**
   * Whether permission has been granted for media devices.
   */
  hasPermission(): boolean {
    return this.permissionGranted
  }

  /**
   * Request permission by opening a temporary media stream.
   * This triggers the browser permission dialog.
   */
  async requestPermission(type: 'audio' | 'video' | 'both' = 'audio'): Promise<boolean> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: type === 'audio' || type === 'both',
        video: type === 'video' || type === 'both',
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      // Stop all tracks immediately — we just needed permission
      stream.getTracks().forEach((t) => t.stop())

      this.permissionGranted = true
      await this.refreshDevices() // Re-enumerate to get labels
      this.emit('devices:permission', true)
      return true
    } catch (err) {
      console.error('[MediaDeviceService] Permission denied:', err)
      this.permissionGranted = false
      this.emit('devices:permission', false)
      this.emit('devices:error', 'Permission denied for media devices')
      return false
    }
  }

  /**
   * Build optimized MediaStreamConstraints for a call.
   * Uses preferred devices and applies performance optimizations.
   */
  buildCallConstraints(type: 'audio' | 'video'): MediaStreamConstraints {
    const constraints: MediaStreamConstraints = {
      audio: type === 'audio' || type === 'video'
        ? ({
            deviceId: this.preferences.audioInput
              ? { exact: this.preferences.audioInput }
              : undefined,
            // QUALITY: Voice-optimized audio constraints for superior call quality
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            // 48kHz sample rate — matches AudioContext for zero-resampling
            sampleRate: 48000,
            channelCount: 1, // Mono for lower bandwidth
            // QUALITY: Higher sample size for better dynamic range
            sampleSize: 16,
            // QUALITY: System-level echo cancellation (Electron/Chrome)
            echoCancellationType: 'system',
            // QUALITY: Chrome-specific audio processing extensions
            googEchoCancellation: true,
            googAutoGainControl: true,
            googNoiseSuppression: true,
            googHighpassFilter: true,
            // QUALITY: Voice activity detection for silence detection alignment
            googTypingNoiseDetection: true,
          } as MediaTrackConstraints)
        : false,
      video: type === 'video'
        ? {
            deviceId: this.preferences.videoInput
              ? { exact: this.preferences.videoInput }
              : undefined,
            // SUPERIOR QUALITY: Capture at 720p and downscale to the wire
            // resolution — supersampling gives a visibly sharper image than
            // capturing at the wire resolution directly.
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 }, // 30fps for smooth motion
          }
        : false,
    }

    return constraints
  }

  /**
   * Find a fallback device when the current one disconnects.
   * Returns the first available device of the same kind, or undefined.
   */
  findFallbackDevice(kind: MediaDeviceKind, excludeDeviceId?: string): MediaDeviceInfo | undefined {
    return this.devices.find(
      (d) => d.kind === kind && d.deviceId !== excludeDeviceId
    )
  }

  /**
   * Test a microphone by reading audio levels.
   * Returns a function to stop the test.
   */
  async testMicrophone(
    deviceId: string,
    onLevel: (level: number) => void
  ): Promise<() => void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
    })

    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    let running = true

    const update = () => {
      if (!running) return
      analyser.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      onLevel(avg / 255) // Normalize to 0-1
      requestAnimationFrame(update)
    }
    update()

    return () => {
      running = false
      stream.getTracks().forEach((t) => t.stop())
      audioContext.close().catch(() => {})
    }
  }

  /**
   * Test a camera by returning a preview MediaStream.
   */
  async testCamera(deviceId: string): Promise<{ stream: MediaStream; stop: () => void }> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: 320, height: 240 },
    })

    return {
      stream,
      stop: () => stream.getTracks().forEach((t) => t.stop()),
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Start monitoring for device changes (plug/unplug).
   */
  private startMonitoring(): void {
    if (this.monitoring) return
    this.monitoring = true

    navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange)
  }

  /**
   * Handle device change events (device plugged/unplugged).
   */
  private handleDeviceChange = async (): Promise<void> => {
    console.log('[MediaDeviceService] Device change detected')
    await this.refreshDevices()

    // Check if any preferred device was removed
    const prefs = this.preferences
    let needsUpdate = false

    if (prefs.audioInput && !this.devices.find((d) => d.deviceId === prefs.audioInput && d.kind === 'audioinput')) {
      const fallback = this.findFallbackDevice('audioinput', prefs.audioInput)
      if (fallback) {
        this.preferences.audioInput = fallback.deviceId
        needsUpdate = true
        console.log('[MediaDeviceService] Auto-switched microphone to:', fallback.label)
      }
    }

    if (prefs.videoInput && !this.devices.find((d) => d.deviceId === prefs.videoInput && d.kind === 'videoinput')) {
      const fallback = this.findFallbackDevice('videoinput', prefs.videoInput)
      if (fallback) {
        this.preferences.videoInput = fallback.deviceId
        needsUpdate = true
        console.log('[MediaDeviceService] Auto-switched camera to:', fallback.label)
      }
    }

    if (needsUpdate) {
      this.savePreferences()
    }

    // Emit change event for UI updates
    this.emit('devices:changed')
  }

  /**
   * Auto-select default devices if no preference is set.
   */
  private autoSelectDefaults(): void {
    // Only auto-select if no preference exists
    if (!this.preferences.audioInput) {
      const firstMic = this.devices.find((d) => d.kind === 'audioinput')
      if (firstMic) this.preferences.audioInput = firstMic.deviceId
    }

    if (!this.preferences.videoInput) {
      const firstCam = this.devices.find((d) => d.kind === 'videoinput')
      if (firstCam) this.preferences.videoInput = firstCam.deviceId
    }

    if (!this.preferences.audioOutput) {
      const firstSpeaker = this.devices.find((d) => d.kind === 'audiooutput')
      if (firstSpeaker) this.preferences.audioOutput = firstSpeaker.deviceId
    }
  }

  /**
   * Load preferences from localStorage.
   */
  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem('asgard-media-devices')
      if (stored) {
        this.preferences = JSON.parse(stored)
      }
    } catch {
      this.preferences = {}
    }
  }

  /**
   * Save preferences to localStorage.
   */
  private savePreferences(): void {
    try {
      localStorage.setItem('asgard-media-devices', JSON.stringify(this.preferences))
    } catch {
      // Silently fail — preferences are not critical
    }
  }

  /**
   * Map MediaDeviceKind to preference key.
   */
  private getPreferenceKey(kind: MediaDeviceKind): keyof DevicePreferences | null {
    switch (kind) {
      case 'audioinput': return 'audioInput'
      case 'audiooutput': return 'audioOutput'
      case 'videoinput': return 'videoInput'
      default: return null
    }
  }
}

export const mediaDeviceService = MediaDeviceService.getInstance()
