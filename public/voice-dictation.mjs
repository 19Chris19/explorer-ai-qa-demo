import { createVoiceTranscript } from './voice-transcript.mjs';

// Dependencies are supplied by the host page. Nothing starts until start() is called.
// Live publication is intentionally not wired up while the visual design is in review.
export function createVoiceDictation({ requestMicrophone, issueSession, openTransport, startPump,
  onState = () => {}, onTranscript = () => {}, onCommit = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout, maxDurationMs = 60000, finalTimeoutMs = 5000 }) {
  let current = null, phase = 'idle', sequence = 0, retained = '';
  const publish = next => { phase = next; onState(next); };
  const active = run => current === run && !run.closed;
  function stopMedia(run) {
    for (const track of run.stream?.getTracks?.() || []) { try { track.stop(); } catch {} }
    run.stream = null;
  }
  function dispose(run) {
    if (run.closed) return;
    run.closed = true; clearTimer(run.deadline); clearTimer(run.finalTimer); run.abort.abort();
    try { run.pump?.cancel?.(); } catch {} stopMedia(run);
    try { run.transport?.close?.(); } catch {}
    if (current === run) current = null;
  }
  function fail(run, code) {
    if (!active(run)) return;
    retained = run.transcript?.text || retained; dispose(run); onTranscript(retained); publish(code);
  }
  async function start() {
    if (current) return false;
    retained = ''; const run = { id: ++sequence, abort: new AbortController(), closed: false }; current = run; publish('requesting_microphone');
    try {
      const stream = await requestMicrophone({ signal: run.abort.signal });
      if (!active(run)) { for (const track of stream?.getTracks?.() || []) track.stop(); return false; }
      run.stream = stream; publish('connecting');
      const session = await issueSession({ signal: run.abort.signal });
      if (!active(run)) return false;
      if (!session || typeof session.voiceId !== 'string' || !session.voiceId) throw new Error('invalid_session');
      run.transcript = createVoiceTranscript(session.voiceId);
      const transport = await openTransport(session, {
        signal: run.abort.signal,
        onMessage(message) {
          if (!active(run)) return;
          const value = run.transcript.read(message);
          if (value.kind === 'invalid') return fail(run, 'invalid_response');
          if (value.kind === 'error') return fail(run, 'recognition_failed');
          retained = value.text; onTranscript(retained);
          if (value.kind === 'final') {
            // A provider completion before the user stops may be partial or an outage.
            if (phase !== 'finishing') return fail(run, 'unexpected_completion');
            dispose(run); publish('idle'); if (retained) onCommit(retained);
          }
        },
        onError() { fail(run, 'connection_failed'); },
        onClose() { if (active(run)) fail(run, 'connection_closed'); },
      });
      if (!active(run)) { transport?.close?.(); return false; }
      run.transport = transport;
      const pump = await startPump(run.stream, { signal: run.abort.signal,
        onAudio(frame) {
          if (!active(run) || phase !== 'recording') return;
          try { if (!run.transport.sendAudio(frame)) fail(run, 'connection_busy'); }
          catch { fail(run, 'connection_failed'); }
        },
        onError() { fail(run, 'microphone_failed'); },
      });
      if (!active(run)) { pump?.cancel?.(); return false; }
      run.pump = pump; publish('recording');
      run.deadline = setTimer(() => { void stop(); }, maxDurationMs);
      return true;
    } catch (error) {
      if (active(run)) fail(run, error?.name === 'NotAllowedError' ? 'microphone_denied' :
        error?.name === 'NotFoundError' ? 'microphone_missing' : 'start_failed');
      return false;
    }
  }
  async function stop() {
    const run = current;
    if (!run || phase !== 'recording') return false;
    publish('finishing'); clearTimer(run.deadline);
    try {
      const pendingAudio = run.pump?.finish?.();
      stopMedia(run);
      const last = await pendingAudio;
      if (!active(run)) return false;
      if (last && !run.transport.sendAudio(last)) throw new Error('backpressure');
      run.finalTimer = setTimer(() => fail(run, 'final_timeout'), finalTimeoutMs);
      run.transport.end(); return true;
    } catch { fail(run, 'connection_failed'); return false; }
  }
  function cancel() {
    const run = current; if (!run) return;
    retained = run.transcript?.text || retained; dispose(run); publish('idle');
  }
  return { start, stop, cancel, get state() { return phase; }, get transcript() { return retained; } };
}
