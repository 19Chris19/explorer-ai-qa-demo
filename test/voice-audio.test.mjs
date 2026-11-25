import test from 'node:test';
import assert from 'node:assert/strict';
import { VoicePcmEncoder } from '../public/voice-pcm.mjs';
import { startVoiceAudioPump } from '../public/voice-audio.mjs';

test('48 kHz and 44.1 kHz input produce bounded 16 kHz little-endian PCM at 200 ms intervals', () => {
  for (const rate of [48000, 44100]) {
    const encoder = new VoicePcmEncoder(rate), frames = [];
    for (let offset = 0; offset < rate; offset += 128) frames.push(...encoder.push(new Float32Array(Math.min(128, rate-offset)).fill(0.5)));
    const tail = encoder.finish(); if (tail) frames.push(tail);
    assert.equal(frames.reduce((sum, x) => sum + x.byteLength, 0), 32000);
    assert.ok(frames.every(x => x.byteLength <= 6400)); assert.equal(new DataView(frames[0]).getInt16(0, true), 16384);
  }
});

test('invalid rates fail and sample values are clipped', () => {
  assert.throws(() => new VoicePcmEncoder(8000), /unsupported_audio_format/);
  const e = new VoicePcmEncoder(16000); e.push(Float32Array.from([-2, 2, NaN]));
  const d = new DataView(e.finish()); assert.deepEqual([d.getInt16(0,true), d.getInt16(2,true), d.getInt16(4,true)], [-32768, 32767, 0]);
});

test('fake browser audio worklet forwards frames, flushes and closes context', async () => {
  let node, closed = 0, delivered = [];
  class Context { constructor() { this.sampleRate = 48000; this.audioWorklet = { addModule: async () => {} }; this.destination = {}; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    async resume() {} async close() { closed++; } }
  class Node { constructor() { node = this; this.port = { postMessage: () => this.port.onmessage({ data: { type: 'finished', tail: new ArrayBuffer(4) } }) }; }
    connect() {} disconnect() {} }
  const pump = await startVoiceAudioPump({}, { onAudio: x => delivered.push(x), onError() {} }, { AudioContextImpl: Context, AudioWorkletNodeImpl: Node });
  node.port.onmessage({ data: { type: 'audio', frame: new ArrayBuffer(8) } });
  assert.equal(delivered.length, 1); assert.equal((await pump.finish()).byteLength, 4); assert.equal(closed, 1);
});
