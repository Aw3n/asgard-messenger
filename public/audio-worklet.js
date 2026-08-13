/**
 * AudioWorklet Processor for low-latency PCM capture and playback.
 * Runs in a separate real-time audio thread for minimal latency and
 * zero main-thread jank (superior to the deprecated ScriptProcessorNode).
 *
 * CAPTURE MODE: Accumulates 128-sample render quanta into fixed-size chunks
 * (default 512 samples ≈ 10.6ms @ 48kHz), computes the RMS level in-thread,
 * and posts { data, rms } to the main thread with a transferable buffer
 * (zero-copy). Samples stay Float32 so they can feed the Opus encoder
 * (WebCodecs AudioData) directly without a lossy round-trip; the main thread
 * converts to Int16 only for the raw-PCM fallback path.
 * PLAYBACK MODE: Receives audio from main thread, outputs to speakers
 */

class AsgardAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._mode = 'capture' // 'capture' or 'playback'
    this._muted = false
    // QUALITY: chunk accumulator — batches 128-sample quanta into larger
    // chunks so one message carries a full encoder/wire frame.
    this._chunkSize = 512
    this._accumulator = new Float32Array(this._chunkSize)
    this._accumulated = 0

    // Listen for configuration messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'setMode') {
        this._mode = event.data.mode
      } else if (event.data.type === 'setMuted') {
        this._muted = event.data.muted
      } else if (event.data.type === 'setChunkSize') {
        this._chunkSize = event.data.chunkSize
        this._accumulator = new Float32Array(this._chunkSize)
        this._accumulated = 0
      }
    }
  }

  _flushChunk() {
    const len = this._chunkSize
    const samples = this._accumulator

    // Compute RMS in the audio thread (keeps main thread free)
    let rms = 0
    for (let i = 0; i < len; i++) {
      rms += samples[i] * samples[i]
    }
    rms = Math.sqrt(rms / len)

    // Copy out so the accumulator can keep filling while the main thread works
    const chunk = new Float32Array(len)
    chunk.set(samples)

    // Zero-copy transfer to main thread
    this.port.postMessage({ type: 'audio', data: chunk.buffer, rms }, [chunk.buffer])
    this._accumulated = 0
  }

  process(inputs, _outputs, _parameters) {
    if (this._mode === 'capture') {
      const input = inputs[0]
      if (input && input[0] && input[0].length > 0 && !this._muted) {
        const channelData = input[0]
        let offset = 0
        while (offset < channelData.length) {
          const space = this._chunkSize - this._accumulated
          const toCopy = Math.min(space, channelData.length - offset)
          this._accumulator.set(channelData.subarray(offset, offset + toCopy), this._accumulated)
          this._accumulated += toCopy
          offset += toCopy
          if (this._accumulated >= this._chunkSize) {
            this._flushChunk()
          }
        }
      } else if (this._muted) {
        // Drop any partial chunk while muted to avoid stale audio on unmute
        this._accumulated = 0
      }
    } else if (this._mode === 'playback') {
      // Playback mode: receive audio from main thread, output to speakers
      // Audio data is sent via port messages, handled in main thread
      // Output is silent by default - actual playback handled via buffer scheduling
    }

    return true // Keep processor alive
  }
}

registerProcessor('asgard-audio-processor', AsgardAudioProcessor)
