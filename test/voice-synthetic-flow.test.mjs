import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceDictation } from '../public/voice-dictation.mjs';
import { openTencentVoiceTransport } from '../public/voice-tencent-transport.mjs';
import { insertVoiceText } from '../public/voice-transcript.mjs';
import { VoicePcmEncoder } from '../public/voice-pcm.mjs';
import { buildTencentVoiceTicket } from '../voice-tencent-signature.mjs';
import { createVoiceAdmission } from '../voice-admission.mjs';
import { allowedPreviewRoute } from '../preview-gateway.mjs';
import { proxy } from '../preview/api/proxy.mjs';

test('synthetic microphone → bounded PCM → simulated cloud → current draft, without dispatching a question', async () => {
  let socket, feed, stopped = 0, state = [], previews = [], sends = 0, question = '原有草稿';
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { sends++; throw new Error('unexpected_network'); };
  class FakeWebSocket {
    constructor() { socket = this; this.readyState = 1; this.bufferedAmount = 0; this.frames = [];
      queueMicrotask(() => this.onmessage({ data:JSON.stringify({ code:0, voice_id:'voice-test' }) })); }
    send(value) { this.frames.push(value); }
    close() { this.readyState = 3; }
    result(value) { this.onmessage({ data:JSON.stringify({ code:0, voice_id:'voice-test', ...value }) }); }
  }
  const admission = createVoiceAdmission({ makeId:()=>'lease-test' });
  const controller = createVoiceDictation({
    requestMicrophone:async()=>({ getTracks:()=>[{ stop() { stopped++; } }] }),
    issueSession:async()=>{
      assert.equal(admission.admit('a'.repeat(64)).ok, true);
      return buildTencentVoiceTicket({ appId:'123456', secretId:'synthetic', secretKey:'notarealkey', voiceId:'voice-test' });
    },
    openTransport:(session, events)=>openTencentVoiceTransport(session, events, { WebSocketImpl:FakeWebSocket }),
    startPump:async(_stream, events)=>{ const encoder = new VoicePcmEncoder(48000);
      feed = samples => encoder.push(samples).forEach(events.onAudio);
      return { finish:async()=>encoder.finish(), cancel() {} }; },
    onState:value=>state.push(value), onTranscript:value=>previews.push(value),
    onCommit:text=>{ question = insertVoiceText(question, question.length, text).value; },
  });
  try {
    assert.equal(await controller.start(), true);
    feed(new Float32Array(9600).fill(.25)); assert.equal(socket.frames[0].byteLength, 6400);
    socket.result({ result:{ index:0, slice_type:1, voice_text_str:'三滴' } });
    socket.result({ result:{ index:0, slice_type:2, voice_text_str:'3DGS' } });
    assert.equal(question, '原有草稿'); assert.deepEqual(previews, ['三滴','3DGS']);
    assert.equal(await controller.stop(), true); assert.equal(stopped, 1); assert.equal(socket.frames.at(-1), '{"type":"end"}');
    socket.result({ final:1 }); assert.equal(question, '原有草稿3DGS'); assert.equal(sends, 0); assert.equal(state.at(-1), 'idle');
  } finally { globalThis.fetch = previousFetch; }
});

test('production preview routes do not expose the unfinished voice ticket endpoint', async () => {
  assert.equal(allowedPreviewRoute('/api/qa/voice/session', 'POST'), false);
  assert.equal(allowedPreviewRoute('/voice-dictation.mjs', 'GET'), false);
  const oldKey = process.env.PREVIEW_ORIGIN_KEY, oldOrigin = process.env.PREVIEW_ORIGIN_URL;
  process.env.PREVIEW_ORIGIN_KEY = 'x'.repeat(32); process.env.PREVIEW_ORIGIN_URL = 'https://example.test/';
  try {
    const response = await proxy(new Request('https://example.test/api/proxy?path=api%2Fqa%2Fvoice%2Fsession', {
      method:'POST', headers:{ origin:'https://example.test' }, body:'{}' }));
    assert.equal(response.status, 404);
  } finally {
    if (oldKey === undefined) delete process.env.PREVIEW_ORIGIN_KEY; else process.env.PREVIEW_ORIGIN_KEY = oldKey;
    if (oldOrigin === undefined) delete process.env.PREVIEW_ORIGIN_URL; else process.env.PREVIEW_ORIGIN_URL = oldOrigin;
  }
});
