import { VoicePcmEncoder } from './voice-pcm.mjs';

class VoicePcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super(); this.encoder = new VoicePcmEncoder(sampleRate); this.finished = false;
    this.port.onmessage = event => {
      if (event.data?.type !== 'finish' || this.finished) return;
      this.finished = true;
      const tail = this.encoder.finish();
      this.port.postMessage({ type: 'finished', tail }, tail ? [tail] : []);
    };
  }
  process(inputs) {
    if (this.finished) return false;
    const mono = inputs[0]?.[0];
    if (mono) for (const frame of this.encoder.push(mono)) this.port.postMessage({ type: 'audio', frame }, [frame]);
    return true;
  }
}
registerProcessor('voice-pcm', VoicePcmWorklet);
