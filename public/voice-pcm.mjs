// Convert a mono Float32 stream to 16 kHz, signed 16-bit little-endian PCM.
// Weighted sample averaging keeps fractional sample boundaries across callbacks.
export class VoicePcmEncoder {
  constructor(inputRate, outputRate = 16000, frameSamples = 3200) {
    if (!Number.isInteger(inputRate) || inputRate < outputRate || inputRate > 192000 || outputRate !== 16000 || frameSamples !== 3200) {
      throw new RangeError('unsupported_audio_format');
    }
    this.width = inputRate / outputRate; this.remaining = this.width; this.sum = 0; this.samples = [];
    this.frameSamples = frameSamples;
  }
  push(input) {
    const frames = [];
    for (let sample of input) {
      if (!Number.isFinite(sample)) sample = 0;
      sample = Math.max(-1, Math.min(1, sample));
      let weight = 1;
      while (weight > 1e-9) {
        const part = Math.min(weight, this.remaining);
        this.sum += sample * part; this.remaining -= part; weight -= part;
        if (this.remaining < 1e-9) {
          const avg = Math.max(-1, Math.min(1, this.sum / this.width));
          this.samples.push(avg < 0 ? Math.round(avg * 32768) : Math.round(avg * 32767));
          this.remaining = this.width; this.sum = 0;
          if (this.samples.length === this.frameSamples) frames.push(this.take());
        }
      }
    }
    return frames;
  }
  take() {
    const bytes = new ArrayBuffer(this.samples.length * 2), view = new DataView(bytes);
    this.samples.forEach((value, index) => view.setInt16(index * 2, value, true));
    this.samples = []; return bytes;
  }
  finish() { return this.samples.length ? this.take() : null; }
}
