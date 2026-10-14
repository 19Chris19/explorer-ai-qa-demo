import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { ConversationTurnQueue } from '../conversation-turn-queue.mjs';
import { followTask } from '../durable-task-bridge.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
const packet = (id, event, data) => Buffer.from(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const input = id => ({ clientId: 'synthetic-owner', conversationId: `conversation-${id}`, requestId: `request-${id}`, question: 'Synthetic question' });
function fixture(t, dispatch = async () => {}, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'queue-replay-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return new ConversationTurnQueue(join(directory, 'pending.json'), dispatch, Date.now, options);
}
function response() {
  return Object.assign(new EventEmitter(), { chunks: [], writeHead() {},
    write(chunk) { this.chunks.push(Buffer.from(chunk)); return true; }, end() { this.ended = true; } });
}

test('more than 2 MiB of repeated rich sources completes and reconnects byte-for-byte', async t => {
  const sources = [], frames = [];
  for (let n = 0; n < 33; n++) {
    sources.push({ citationKey: `key-${n}`, index: String(99 - n), url: `https://example.org/${n % 6}`,
      snippet: `Synthetic excerpt ${n % 6}: ` + '中文资料描述，不代表真实历史。'.repeat(110) });
    frames.push(packet(n + 1, 'sources', { sources: sources.slice() }));
  }
  frames.push(packet(34, 'delta', { text: 'A complete synthetic answer\n' }));
  frames.push(packet(35, 'done', { conversationId: 'conversation-rich' }));
  const wire = Buffer.concat(frames);
  assert.ok(wire.length > 2 * 1024 * 1024);
  const queue = fixture(t, async (job, emit) => {
    queue.markSubmitting(job); queue.attachTask(job, 'synthetic-provider-task');
    for (const frame of frames) emit(frame);
  });
  const { job: admitted } = queue.enqueue(input('rich'));
  await settle();
  const job = queue.jobs.get(admitted.id);
  assert.equal(job.status, 'complete');
  assert.equal(job.wireBytes, wire.length); assert.ok(job.bytes < wire.length / 4);
  const res = response();
  assert.equal(queue.subscribe('synthetic-owner', job.id, res), true);
  assert.deepEqual(Buffer.concat(res.chunks.slice(1)), wire);
  assert.equal(res.ended, true);
  assert.equal(queue.subscribe('other-owner', job.id, response()), false);
  assert.deepEqual(JSON.parse(readFileSync(queue.file, 'utf8')), []);
});

test('temporary replay has independent per-job, global, wire and admission bounds', t => {
  const queue = fixture(t, undefined, { maxReplayBytes: 1000, maxJobs: 2 });
  queue.beginDirect('synthetic-owner', 'conversation-a');
  queue.beginDirect('synthetic-owner', 'conversation-b');
  const a = queue.enqueue(input('a')).job, b = queue.enqueue(input('b')).job;
  assert.equal(queue.enqueue(input('c')).error, 'busy');
  assert.equal(queue.enqueue(input('a')).repeated, true, 'admission cannot invalidate idempotency');
  queue.emit(queue.jobs.get(a.id), Buffer.alloc(700, 1));
  assert.throws(() => queue.emit(queue.jobs.get(b.id), Buffer.alloc(700, 2)), /queued_stream_too_large/);
  assert.equal(queue.jobs.get(b.id).bytes, 0);
  assert.throws(() => queue.emit(queue.jobs.get(b.id), Buffer.alloc(2 * 1024 * 1024 + 1)), /queued_stream_too_large/);

  const roomy = fixture(t), job = { bytes: 0, events: [], subscribers: new Set() };
  const frame = Buffer.alloc(1024 * 1024, 65);
  for (let i = 0; i < 16; i++) roomy.emit(job, frame);
  const before = job.bytes;
  assert.ok(before < 2 * 1024 * 1024);
  assert.throws(() => roomy.emit(job, frame), /queued_stream_too_large/);
  assert.equal(job.bytes, before); assert.equal(job.events.length, 16);
});

test('downstream failure retains the same task; a later read replaces the partial replay cache', async t => {
  let calls = 0, posts = 0;
  const prefix = packet(1, 'delta', { text: 'partial prefix' }), done = packet(2, 'done', {});
  const queue = fixture(t, async (job, emit) => {
    calls++;
    if (!job.taskId) { posts++; queue.markSubmitting(job); queue.attachTask(job, 'the-original-task'); }
    assert.equal(job.taskId, 'the-original-task');
    emit(prefix);
    if (calls === 1) throw Object.assign(new Error('task_output_failed'), { downstreamFailure: true });
    emit(done);
  });
  const { job: admitted } = queue.enqueue(input('resume'));
  await settle();
  assert.equal(queue.jobs.get(admitted.id).status, 'paused');
  assert.equal(queue.jobs.get(admitted.id).recoverTask, true);
  assert.equal(JSON.parse(readFileSync(queue.file, 'utf8'))[0].taskId, 'the-original-task');
  assert.equal(queue.get('other-owner', admitted.id), null); assert.equal(calls, 1);
  const res = response(); queue.subscribe('synthetic-owner', admitted.id, res);
  await settle();
  assert.equal(queue.jobs.get(admitted.id).status, 'complete');
  assert.equal(calls, 2); assert.equal(posts, 1);
  const again = response(); queue.subscribe('synthetic-owner', admitted.id, again);
  assert.deepEqual(Buffer.concat(again.chunks.slice(1)), Buffer.concat([prefix, done]));
});

test('unchanged Provider status does not fsync the entire pending metadata again', t => {
  const queue = fixture(t); let writes = 0; queue.save = () => { writes++; };
  const job = {};
  queue.providerStatus(job, 'queued'); queue.providerStatus(job, 'queued');
  queue.providerStatus(job, 'running'); queue.providerStatus(job, 'running');
  queue.providerStatus(job, 'succeeded');
  assert.equal(writes, 2);
});

for (const mode of ['sse', 'snapshot']) {
  test(`${mode} output failure is propagated without an infinite transport retry or a new POST`, async () => {
    const calls = [], output = [], failure = new Error('queued_stream_too_large');
    const provider = { request: async args => {
      calls.push(args);
      assert.ok(calls.length <= 2, 'must not repeatedly retry the failed output');
      if (args.route.includes('/events')) return mode === 'sse'
        ? new Response(Buffer.concat([packet(1, 'delta', { text: 'first' }), packet(2, 'delta', { text: 'second' })]), { headers: { 'Content-Type': 'text/event-stream' } })
        : Response.json({}, { status: 503 });
      return Response.json({ task: { id: 'one', status: 'running' }, snapshot: { events: [
        { id: 1, event: 'delta', data: { text: 'first' } }, { id: 2, event: 'delta', data: { text: 'second' } },
      ] } });
    } };
    await assert.rejects(followTask(provider, { clientId: 'synthetic-owner', taskId: 'one', retryMs: 1,
      emit(chunk) { if (output.length) throw failure; output.push(chunk); } }),
    error => error.downstreamFailure && error.cause === failure && !error.confirmedTerminal);
    assert.equal(output.length, 1);
    assert.deepEqual(calls.map(call => call.method), mode === 'sse' ? ['GET'] : ['GET', 'GET']);
  });

  test(`${mode} routing status write failure also leaves the transport retry loop`, async () => {
    const calls = [], failure = new Error('synthetic status persistence failure');
    const provider = { request: async args => {
      calls.push(args); assert.ok(calls.length <= 2);
      if (args.route.includes('/events')) return mode === 'sse'
        ? new Response(packet(1, 'task.status', { status: 'running' }), { headers: { 'Content-Type': 'text/event-stream' } })
        : Response.json({}, { status: 503 });
      return Response.json({ task: { id: 'one', status: 'running' }, snapshot: { events: [{ id: 1, event: 'task.status', data: { status: 'running' } }] } });
    } };
    await assert.rejects(followTask(provider, { clientId: 'synthetic', taskId: 'one', emit() {}, retryMs: 1,
      onStatus() { throw failure; } }), error => error.downstreamFailure && error.cause === failure);
    assert.deepEqual(calls.map(call => call.method), mode === 'sse' ? ['GET'] : ['GET', 'GET']);
  });
}

test('one broken browser observer cannot fail queued execution or interrupt other subscribers', async t => {
  const delivered = []; let destroyed = false, ended = false;
  const queue = fixture(t, async (job, emit) => {
    job.subscribers.add({ write() { throw new Error('synthetic broken observer'); }, destroy() { destroyed = true; } });
    job.subscribers.add({ write(chunk) { delivered.push(String(chunk)); return true; }, end() { ended = true; } });
    emit(packet(1, 'delta', { text: 'answer' })); emit(packet(2, 'done', {}));
  });
  const { job } = queue.enqueue(input('observer'));
  await settle();
  assert.equal(queue.jobs.get(job.id).status, 'complete');
  assert.equal(destroyed, true); assert.equal(ended, true);
  assert.equal(delivered.length, 2);
});
