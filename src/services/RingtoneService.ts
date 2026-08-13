/**
 * RingtoneService — generates ringtone sounds for incoming calls using Web Audio API.
 * Follows Holepunch/Keet patterns for minimal audio feedback.
 */
class RingtoneService {
  private audioContext: AudioContext | null = null
  private oscillator: OscillatorNode | null = null
  private gainNode: GainNode | null = null
  private isPlaying = false
  private intervalId: ReturnType<typeof setInterval> | null = null

  /**
   * Start playing ringtone for incoming calls.
   * Uses a pleasant two-tone pattern similar to phone ringtones.
   */
  startRingtone(): void {
    if (this.isPlaying) return

    try {
      this.audioContext = new AudioContext()
      this.gainNode = this.audioContext.createGain()
      this.gainNode.connect(this.audioContext.destination)
      this.gainNode.gain.value = 0.1 // Low volume to not be jarring

      this.isPlaying = true

      // Create a two-tone ringtone pattern (like a phone)
      const frequencies = [440, 480] // A4 and B4
      let toneIndex = 0

      const playTone = () => {
        if (!this.isPlaying || !this.audioContext || !this.gainNode) return

        // Stop previous oscillator if any
        if (this.oscillator) {
          this.oscillator.stop()
          this.oscillator.disconnect()
        }

        // Create new oscillator for current tone
        this.oscillator = this.audioContext.createOscillator()
        this.oscillator.type = 'sine'
        this.oscillator.frequency.value = frequencies[toneIndex % frequencies.length]
        this.oscillator.connect(this.gainNode)
        this.oscillator.start()

        toneIndex++
      }

      // Play tone pattern: 2s on, 1s off (classic ringtone pattern)
      playTone()
      this.intervalId = setInterval(() => {
        if (!this.isPlaying) return
        if (toneIndex % 2 === 0) {
          // Silence between rings
          if (this.oscillator) {
            this.oscillator.stop()
            this.oscillator.disconnect()
            this.oscillator = null
          }
        } else {
          playTone()
        }
      }, 1000)
    } catch (err) {
      console.error('[RingtoneService] Failed to start ringtone:', err)
    }
  }

  /**
   * Stop the ringtone.
   */
  stopRingtone(): void {
    this.isPlaying = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    if (this.oscillator) {
      try {
        this.oscillator.stop()
        this.oscillator.disconnect()
      } catch {}
      this.oscillator = null
    }

    if (this.gainNode) {
      this.gainNode.disconnect()
      this.gainNode = null
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
  }

  /**
   * Play a short beep for call events (connect, disconnect).
   */
  playBeep(frequency: number = 800, duration: number = 100): void {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.value = frequency
      gain.gain.value = 0.05

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start()
      setTimeout(() => {
        osc.stop()
        osc.disconnect()
        gain.disconnect()
        ctx.close()
      }, duration)
    } catch (err) {
      console.error('[RingtoneService] Failed to play beep:', err)
    }
  }
}

export const ringtoneService = new RingtoneService()
