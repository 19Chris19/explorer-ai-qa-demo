import test from 'node:test';
import assert from 'node:assert/strict';
import { openTencentVoiceTransport } from '../public/voice-tencent-transport.mjs';
import { buildTencentVoiceTicket } from '../voice-tencent-signature.mjs';
import { createVoiceAdmission } from '../voice-admission.mjs';

const config = { appId:'123456', secretId:'synthetic', secretKey:'notarealkey', now:1700000000000, nonce:123456, voiceId:'test-voice' };
const ticket = buildTencentVoiceTicket(config);

test('synthetic ticket follows the published signing contract and has a bounded expiry', () => {
  const url = new URL(ticket.socketUrl);
  assert.equal(url.hostname, 'asr.cloud.tencent.com'); assert.equal(url.searchParams.get('signature'), 'FVcwbok0K9BWHcw3j6XjwMB8sRU=');
  assert.equal(url.searchParams.get('expired'), '1700000060'); assert.equal(ticket.expiresAt, 1700000060000);
  assert.throws(() => buildTencentVoiceTicket({ ...config, appId:'../attacker' }), /invalid_voice_config/);
  assert.throws(() => buildTencentVoiceTicket({ ...config, hotwordId:'bad&signature=x' }), /invalid_voice_config/);
});

function fakeSocket() {
  let instance;
  class Socket {
    constructor(url) { instance = this; this.url = url; this.readyState = 1; this.bufferedAmount = 0; this.sent = []; this.closes = 0; }
    send(value) { this.sent.push(value); }
    close() { this.closes++; this.readyState = 3; }
    emit(value) { this.onmessage({ data: JSON.stringify(value) }); }
  }
  return { Socket, current: () => instance };
}

test('fake transport requires an exact ticket destination and valid handshake, without automatic retry', async () => {
  const f = fakeSocket(), seen = [], controller = new AbortController();
  const pending = openTencentVoiceTransport(ticket, { signal:controller.signal, onMessage:x=>seen.push(x), onError() {}, onClose() {} }, { WebSocketImpl:f.Socket });
  f.current().emit({ code:0, voice_id:ticket.voiceId });
  const socket = await pending;
  assert.equal(socket.sendAudio(new ArrayBuffer(8)), true); socket.end();
  assert.equal(f.current().sent[1], '{"type":"end"}');
  f.current().emit({ code:0, voice_id:ticket.voiceId, result:{ index:0, slice_type:1, voice_text_str:'3DGS' } });
  assert.equal(seen.length, 1); f.current().bufferedAmount = 128001; assert.equal(socket.sendAudio(new ArrayBuffer(8)), false);
  socket.close(); assert.equal(f.current().closes, 1);
  await assert.rejects(openTencentVoiceTransport({ ...ticket, socketUrl:'wss://evil.example/asr/v2/123456?voice_id=test-voice&signature=x' },
    { signal:controller.signal, onMessage() {}, onError() {}, onClose() {} }, { WebSocketImpl:f.Socket }), /invalid_voice_ticket/);
});

test('bad handshake and timeout close the pending socket without exposing the signed URL', async () => {
  const f = fakeSocket(); let timeout;
  const pending = openTencentVoiceTransport(ticket, { onMessage() {}, onError() {}, onClose() {} },
    { WebSocketImpl:f.Socket, setTimer:cb => { timeout = cb; return 1; }, clearTimer() {} });
  timeout(); await assert.rejects(pending, error => error.message === 'voice_connect_timeout' && !error.message.includes('signature'));
  assert.equal(f.current().closes, 1);
  const g = fakeSocket();
  const p = openTencentVoiceTransport(ticket, { onMessage() {}, onError() {}, onClose() {} }, { WebSocketImpl:g.Socket });
  g.current().emit({ code:0, voice_id:'wrong' }); await assert.rejects(p, /voice_connect_failed/); assert.equal(g.current().closes, 1);
});

test('single-process issuance limits concurrent and repeated starts and clears expired leases', () => {
  let time = 1000, sequence = 0;
  const budget = createVoiceAdmission({ now:()=>time, maxActive:2, maxStarts:3, maxPerVisitor:2, makeId:()=>String(++sequence) });
  const a = 'a'.repeat(64), b = 'b'.repeat(64), c = 'c'.repeat(64);
  const first = budget.admit(a); assert.equal(first.ok, true);
  assert.equal(budget.admit(a).reason, 'visitor_limit');
  assert.equal(budget.admit(b).ok, true); assert.equal(budget.admit(c).reason, 'busy');
  assert.equal(budget.release(first.leaseId), true); assert.equal(budget.admit(a).ok, true);
  assert.equal(budget.admit(c).reason, 'busy');
  time += 60001; assert.equal(budget.activeCount, 0); assert.equal(budget.admit(c).ok, true);
  assert.equal(budget.admit('raw-ip').reason, 'invalid_visitor');
});
