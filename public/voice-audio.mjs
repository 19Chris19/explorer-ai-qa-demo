// Browser microphone acquisition is performed separately after an explicit click.
export async function startVoiceAudioPump(stream, { signal, onAudio, onError }, {
  AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext,
  AudioWorkletNodeImpl = globalThis.AudioWorkletNode,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  if (!AudioContextImpl || !AudioWorkletNodeImpl) throw new Error('audio_worklet_unavailable');
  const context = new AudioContextImpl();
  let source, worklet, sink, closed = false, pending, rejectPending, timer;
  function cleanup() {
    if (closed) return; closed = true; clearTimer(timer);
    signal?.removeEventListener('abort', abort);
    try { source?.disconnect(); worklet?.disconnect(); sink?.disconnect(); } catch {}
    void context.close().catch(() => {});
  }
  function abort() { const reject = rejectPending; pending = null; rejectPending = null; cleanup(); reject?.(new Error('cancelled')); }
  if (signal?.aborted) { cleanup(); throw new Error('cancelled'); }
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await context.audioWorklet.addModule(new URL('./voice-audio-worklet.mjs', import.meta.url).href);
    if (closed) throw new Error('cancelled');
    if (context.sampleRate < 16000 || context.sampleRate > 192000) throw new Error('unsupported_audio_format');
    source = context.createMediaStreamSource(stream);
    worklet = new AudioWorkletNodeImpl(context, 'voice-pcm');
    sink = context.createGain(); sink.gain.value = 0;
    worklet.port.onmessage = event => {
      if (closed) return;
      if (event.data?.type === 'audio' && event.data.frame instanceof ArrayBuffer) onAudio(event.data.frame);
      if (event.data?.type === 'finished' && pending) { const resolve = pending; pending = null; rejectPending = null; cleanup(); resolve(event.data.tail || null); }
    };
    worklet.onprocessorerror = () => { const reject = rejectPending; pending = null; rejectPending = null; cleanup(); reject?.(new Error('audio_processor_failed')); onError(); };
    source.connect(worklet); worklet.connect(sink); sink.connect(context.destination);
    await context.resume();
    if (closed) throw new Error('cancelled');
  } catch (error) { cleanup(); throw error; }
  return {
    finish() {
      if (closed || pending) return Promise.reject(new Error('audio_already_closed'));
      return new Promise((resolve, reject) => {
        pending = resolve; rejectPending = reject; timer = setTimer(() => { pending = null; rejectPending = null; cleanup(); reject(new Error('audio_finish_timeout')); }, 1000);
        worklet.port.postMessage({ type: 'finish' });
      });
    },
    cancel() { const resolve = pending; pending = null; rejectPending = null; cleanup(); resolve?.(null); },
  };
}
