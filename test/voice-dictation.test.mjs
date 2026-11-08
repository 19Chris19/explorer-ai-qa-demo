import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceTranscript, insertVoiceText } from '../public/voice-transcript.mjs';
import { createVoiceDictation } from '../public/voice-dictation.mjs';

const message = (index, type, text, extra = {}) => ({ code: 0, voice_id: 'test-voice',
  result: { index, slice_type: type, voice_text_str: text }, ...extra });

test('incremental results replace their segment, retain stable segments and reject another voice ID', () => {
  const result = createVoiceTranscript('test-voice');
  assert.equal(result.read(message(0, 1, '三滴')).text, '三滴');
  assert.equal(result.read(message(0, 1, '3DGS')).text, '3DGS');
  assert.equal(result.read(message(0, 2, '3DGS ')).text, '3DGS ');
  assert.equal(result.read(message(0, 1, 'wrong')).text, '3DGS ');
  assert.equal(result.read(message(1, 1, '训练')).text, '3DGS 训练');
  assert.equal(result.read({ code: 0, voice_id: 'another' }).kind, 'invalid');
  assert.deepEqual(result.read({ code: 0, voice_id: 'test-voice', final: 1 }), { kind: 'final', text: '3DGS 训练' });
  assert.equal(result.read(message(1, 2, 'late')).kind, 'invalid');
});

test('insert at current cursor without deleting a selected range or overflowing the composer', () => {
  assert.deepEqual(insertVoiceText('已有草稿', 2, '语音'), { value: '已有语音草稿', caret: 4, truncated: false });
  assert.deepEqual(insertVoiceText('ab', 2, '😀Z', 4), { value: 'ab😀', caret: 4, truncated: true });
  assert.deepEqual(insertVoiceText('abc', 2, '语音', 3), { value: 'abc', caret: 2, truncated: true });
});

function harness(overrides = {}) {
  let callbacks, audio, stopped = 0, closed = 0, ends = 0, commits = [], states = [], partials = [], sent = [];
  const stream = { getTracks: () => [{ stop() { stopped++; } }] };
  const transport = { sendAudio(frame) { sent.push(frame); return true; }, end() { ends++; }, close() { closed++; } };
  const controller = createVoiceDictation({
    requestMicrophone: async () => stream,
    issueSession: async () => ({ voiceId: 'test-voice' }),
    openTransport: async (_session, cb) => { callbacks = cb; return transport; },
    startPump: async (_stream, cb) => { audio = cb; return { async finish() { return new ArrayBuffer(2); }, cancel() {} }; },
    onState: value => states.push(value), onTranscript: value => partials.push(value), onCommit: value => commits.push(value),
    ...overrides,
  });
  return { controller, stream, transport, result: () => ({ stopped, closed, ends, commits, states, partials, sent }),
    emit: value => callbacks.onMessage(value), audio: bytes => audio.onAudio(bytes), error: () => callbacks.onError() };
}

test('explicit click streams locally, stopping releases microphone and commits exactly once only after final', async () => {
  const h = harness(); assert.equal(await h.controller.start(), true); assert.equal(h.controller.state, 'recording');
  h.audio(new ArrayBuffer(8)); h.emit(message(0, 1, '３D')); h.emit(message(0, 2, '3DGS'));
  assert.deepEqual(h.result().commits, []); assert.equal(h.controller.transcript, '3DGS');
  assert.equal(await h.controller.stop(), true); assert.equal(h.controller.state, 'finishing'); assert.equal(h.result().stopped, 1);
  h.emit({ code: 0, voice_id: 'test-voice', final: 1 }); h.emit({ code: 0, voice_id: 'test-voice', final: 1 });
  assert.deepEqual(h.result().commits, ['3DGS']); assert.equal(h.result().ends, 1); assert.equal(h.result().sent.length, 2);
  assert.equal(h.controller.state, 'idle'); assert.equal(h.result().closed, 1);
});

test('denied microphone never creates a session or sends audio', async () => {
  let sessions = 0; const h = harness({ requestMicrophone: async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); },
    issueSession: async () => { sessions++; } });
  assert.equal(await h.controller.start(), false); assert.equal(h.controller.state, 'microphone_denied'); assert.equal(sessions, 0);
});

test('cancel while permission is pending stops a late granted stream and never contacts provider', async () => {
  let resolveMic, sessions = 0, stopped = 0;
  const h = harness({ requestMicrophone: () => new Promise(resolve => { resolveMic = resolve; }), issueSession: async () => { sessions++; } });
  const start = h.controller.start(); h.controller.cancel(); resolveMic({ getTracks: () => [{ stop() { stopped++; } }] });
  assert.equal(await start, false); assert.equal(stopped, 1); assert.equal(sessions, 0); assert.equal(h.controller.state, 'idle');
});

test('failure preserves partial transcript for recovery but never commits it as completed text', async () => {
  const h = harness(); await h.controller.start(); h.emit(message(0, 1, '已识别')); h.error();
  assert.equal(h.controller.state, 'connection_failed'); assert.equal(h.controller.transcript, '已识别');
  assert.equal(h.result().stopped, 1); assert.deepEqual(h.result().commits, []);
});

test('unexpected provider completion or wrong identity fails closed', async () => {
  const h = harness(); await h.controller.start(); h.emit({ code: 0, voice_id: 'test-voice', final: 1 });
  assert.equal(h.controller.state, 'unexpected_completion'); assert.deepEqual(h.result().commits, []);
  const j = harness(); await j.controller.start(); j.emit({ code: 0, voice_id: 'wrong', final: 1 });
  assert.equal(j.controller.state, 'invalid_response'); assert.equal(j.result().stopped, 1);
});

test('stop releases microphone immediately while the audio worklet is still finishing', async () => {
  let finish;
  const h = harness({ startPump: async () => ({ finish: () => new Promise(resolve => { finish = resolve; }), cancel() {} }) });
  await h.controller.start(); const pending = h.controller.stop();
  assert.equal(h.result().stopped, 1); assert.equal(h.result().ends, 0);
  finish(null); assert.equal(await pending, true); assert.equal(h.result().ends, 1);
  h.emit({ code:0, voice_id:'test-voice', final:1 });
});

test('missing final response times out without auto-sending a partial transcript', async () => {
  const timers = [];
  const h = harness({ setTimer: fn => { timers.push(fn); return timers.length; }, clearTimer() {} });
  await h.controller.start(); h.emit(message(0, 1, '局部')); await h.controller.stop(); timers.at(-1)();
  assert.equal(h.controller.state, 'final_timeout'); assert.equal(h.controller.transcript, '局部'); assert.deepEqual(h.result().commits, []);
});
