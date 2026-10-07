import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { setImmediate as tick } from 'node:timers/promises';
import { createStreamObserver } from '../provider-a-client.mjs';

const packet = text => Buffer.from(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);

test('observer rejects an oversized complete event before counting it', () => {
  const observer = createStreamObserver();
  assert.throws(() => observer.append(packet('x'.repeat(65536))), /provider_event_too_large/);
  assert.equal(observer.result().delta, 0);
});

test('observer rejects an oversized event completed by a later chunk', () => {
  const observer = createStreamObserver();
  const oversized = packet('x'.repeat(65536));
  observer.append(oversized.subarray(0, 64000));
  assert.throws(() => observer.append(oversized.subarray(64000)), /provider_event_too_large/);
  assert.equal(observer.result().delta, 0);
});

test('observer limits UTF-8 bytes, including unterminated packets', () => {
  for (const terminated of [true, false]) {
    const observer = createStreamObserver();
    const oversized = packet('\u4e2d'.repeat(22000));
    assert.throws(() => observer.append(terminated ? oversized : oversized.subarray(0, -2)), /provider_event_too_large/);
  }
});

test('observer accepts many small events coalesced beyond the per-event limit', () => {
  const observer = createStreamObserver();
  observer.append(Buffer.concat(Array.from({ length: 100 }, () => packet('x'.repeat(1000)))));
  assert.equal(observer.result().delta, 100);
});

test('observer enforces the exact frame limit across delimiter splits', () => {
  const limit = packet('x'.repeat(65536 - packet('').length));
  assert.equal(limit.length, 65536);
  for (const split of [0, 65534, 65535, 65536]) {
    const observer = createStreamObserver();
    observer.append(limit.subarray(0, split));
    observer.append(limit.subarray(split));
    assert.equal(observer.result().delta, 1);
  }
  assert.throws(() => createStreamObserver().append(packet('x'.repeat(65537 - packet('').length))), /provider_event_too_large/);
});

// Evaluate the real handler without starting the app, reading secrets, or creating runtime files.
const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const proxySource = source.slice(source.indexOf('async function proxy('));

function fixture({ abortDuringWrite = false } = {}) {
  let deadline, signal, finished, released = 0, settled = false;
  const res = new EventEmitter();
  Object.assign(res, {
    destroyed: false, writableEnded: false,
    writeHead() {},
    write() { if (abortDuringWrite) deadline(); return false; },
    end() { this.writableEnded = true; },
    destroy() { this.destroyed = true; this.emit('close'); },
  });
  const context = {
    AbortController, createStreamObserver,
    validateQuestion(question) { assert.equal(question, 'synthetic'); },
    setTimeout(fn) { deadline = fn; return 1; }, clearTimeout() {},
    readBody: async () => ({ question: 'synthetic', requestId: '11111111-1111-4111-8111-111111111111' }),
    getClientId: () => 'demo:synthetic', requireNativeContract: async () => true,
    previewVisitor: () => 'synthetic',
    previewAdmission: { hasRoom: () => true, tryEnter: () => () => { released += 1; }, admit: () => true },
    turnQueue: { hasItems: () => false, previewPendingCount: () => 0, beginDirect: () => true,
      finishDirect(_client, _conversation, complete) { finished = complete; } },
    requestLedger: { claim: () => ({ accepted: true, key: 'synthetic' }) },
    provider: { async request(options) {
      signal = options.signal;
      return { ok: true, headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: (async function* () { yield packet('synthetic'); })() };
    } },
  };
  vm.createContext(context);
  vm.runInContext(proxySource, context);
  const operation = context.proxy({ method: 'POST' }, res, '/api/ask').finally(() => { settled = true; });
  return { res, operation, expire: () => deadline(), state: () => ({ aborted: signal?.aborted, finished, released, settled }) };
}

for (const abortDuringWrite of [false, true]) {
  test(`proxy deadline releases backpressure and admission (abort during write: ${abortDuringWrite})`, async () => {
    const f = fixture({ abortDuringWrite });
    try {
      await tick();
      if (!abortDuringWrite) f.expire();
      await tick();
      assert.deepEqual(f.state(), { aborted: true, finished: false, released: 1, settled: true });
      assert.equal(f.res.destroyed, true);
      assert.equal(f.res.listenerCount('drain'), 0);
    } finally {
      f.res.destroy();
      await f.operation;
    }
  });
}

test('proxy disconnect releases a backpressure wait', async () => {
  const f = fixture();
  await tick();
  f.res.destroy();
  await f.operation;
  assert.deepEqual(f.state(), { aborted: true, finished: false, released: 1, settled: true });
  assert.equal(f.res.listenerCount('drain'), 0);
});

test('proxy normal drain releases its temporary listeners and admission', async () => {
  const f = fixture();
  await tick();
  f.res.emit('drain');
  await f.operation;
  assert.equal(f.state().released, 1);
  assert.equal(f.res.listenerCount('drain'), 0);
  assert.equal(f.res.listenerCount('close'), 1);
  assert.equal(f.res.writableEnded, true);
  assert.equal(f.res.destroyed, false);
});
