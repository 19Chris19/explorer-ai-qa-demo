import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConversationTurnQueue } from '../conversation-turn-queue.mjs';

const turn = (clientId, conversationId, requestId, question) => ({ clientId, conversationId, requestId, question });
const settle = () => new Promise(resolve => setImmediate(resolve));

test('queued turns stay editable until one successful prior turn completes, then dispatch serially', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ima-turn-queue-'));
  try {
    const started = [];
    const releases = [];
    const queue = new ConversationTurnQueue(join(dir, 'pending.json'), job => {
      started.push({ question: job.question, conversationId: job.conversationId });
      return new Promise(resolve => releases.push(resolve));
    });
    assert.equal(queue.beginDirect('client-a', 'conversation-a'), true);
    const first = queue.enqueue(turn('client-a', 'conversation-a', 'request-a', '原问题'));
    const second = queue.enqueue(turn('client-a', 'conversation-a', 'request-b', '第二问'));
    assert.equal(first.job.status, 'queued');
    assert.equal(started.length, 0);
    assert.equal(queue.edit('client-a', first.job.id, '修改后的问题', 'web').job.question, '修改后的问题');
    assert.equal(queue.get('client-b', first.job.id), null);
    assert.equal(queue.beginDirect('client-a', 'conversation-a'), false);
    queue.finishDirect('client-a', 'conversation-a', true);
    await settle();
    assert.deepEqual(started, [{ question: '修改后的问题', conversationId: 'conversation-a' }]);
    assert.equal(queue.edit('client-a', first.job.id, '太迟了', '').error, 'already_started');
    assert.equal(queue.list('client-a', 'conversation-a').length, 2);
    releases.shift()();
    await settle();
    assert.equal(started.length, 2);
    assert.equal(started[1].question, '第二问');
    releases.shift()();
    await settle();
    assert.deepEqual(queue.list('client-a', 'conversation-a'), []);
    assert.equal(queue.beginDirect('client-a', 'conversation-a'), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('deduplication, limits, deletion, failure pause, and private restart recovery', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ima-turn-queue-'));
  const file = join(dir, 'pending.json');
  try {
    let dispatched = 0;
    const queue = new ConversationTurnQueue(file, async () => { dispatched += 1; });
    queue.beginDirect('client-a', 'conversation-a');
    const first = queue.enqueue(turn('client-a', 'conversation-a', 'request-a', '问题一'));
    assert.equal(queue.enqueue(turn('client-a', 'conversation-a', 'request-a', '问题一')).repeated, true);
    assert.equal(queue.enqueue(turn('client-a', 'conversation-a', 'request-a', '不同问题')).error, 'conflict');
    queue.enqueue(turn('client-a', 'conversation-a', 'request-b', '问题二'));
    queue.enqueue(turn('client-a', 'conversation-a', 'request-c', '问题三'));
    assert.equal(queue.enqueue(turn('client-a', 'conversation-a', 'request-d', '问题四')).error, 'full');
    assert.equal(queue.remove('client-b', first.job.id).error, 'not_found');
    assert.equal(queue.remove('client-a', first.job.id).removed, true);
    queue.finishDirect('client-a', 'conversation-a', false);
    assert.equal(dispatched, 0);
    assert.equal(queue.list('client-a', 'conversation-a').every(item => item.status === 'paused'), true);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(saved.some(row => row.clientId || row.serviceToken), false);
    const recovered = new ConversationTurnQueue(file, async () => { dispatched += 1; });
    assert.equal(recovered.list('client-a', 'conversation-a').length, 2);
    assert.equal(recovered.list('client-b', 'conversation-a').length, 0);
    assert.equal(dispatched, 0);
    assert.equal(recovered.edit('client-a', recovered.list('client-a', 'conversation-a')[0].id, '重启后编辑', '').job.question, '重启后编辑');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('expired pending text is removed from private storage on restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ima-turn-queue-'));
  const file = join(dir, 'pending.json');
  try {
    let now = 1_000_000;
    const queue = new ConversationTurnQueue(file, async () => {}, () => now);
    queue.beginDirect('client-a', 'conversation-a');
    queue.enqueue(turn('client-a', 'conversation-a', 'request-a', '不应遗留的待发问题'));
    now += 60 * 60 * 1000 + 1;
    const recovered = new ConversationTurnQueue(file, async () => {}, () => now);
    assert.deepEqual(recovered.list('client-a', 'conversation-a'), []);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('stopping a running queued answer pauses later questions instead of dispatching them', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ima-turn-queue-'));
  try {
    const started = [];
    const queue = new ConversationTurnQueue(join(dir, 'pending.json'), (job, _emit, signal) => {
      started.push(job.question);
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
    });
    queue.beginDirect('client-a', 'conversation-a');
    const first = queue.enqueue(turn('client-a', 'conversation-a', 'request-a', '将被停止'));
    queue.enqueue(turn('client-a', 'conversation-a', 'request-b', '不能自动发送'));
    queue.finishDirect('client-a', 'conversation-a', true);
    await settle();
    assert.deepEqual(started, ['将被停止']);
    assert.equal(queue.remove('client-a', first.job.id).removed, true);
    await settle();
    assert.deepEqual(started, ['将被停止']);
    assert.deepEqual(queue.list('client-a', 'conversation-a').map(item => item.status), ['paused']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('confirmed Provider error is forwarded once, without a second BFF terminal error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ima-turn-queue-'));
  try {
    const queue = new ConversationTurnQueue(join(dir, 'pending.json'), async (job, emit) => {
      queue.markSubmitting(job);
      emit('id: 1\nevent: error\ndata: {"code":"task_cancelled"}\n\n');
      emit('id: 2\nevent: task.status\ndata: {"status":"cancelled"}\n\n');
      throw Object.assign(new Error('cancelled'), { confirmedTerminal: true, taskStatus: 'cancelled' });
    });
    const chunks = [];
    const broadcast = queue.broadcast.bind(queue);
    queue.broadcast = (job, chunk) => { chunks.push(chunk.toString()); broadcast(job, chunk); };
    const { job } = queue.enqueue(turn('synthetic', 'synthetic-conversation', 'synthetic-request', 'synthetic question'));
    await settle();
    assert.equal(queue.get('synthetic', job.id).status, 'cancelled');
    assert.equal(chunks.filter(chunk => chunk.includes('event: error\n')).length, 1);
    assert.deepEqual(JSON.parse(readFileSync(queue.file, 'utf8')), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const preserveExpiredPending of [false, true]) {
  test(`unsubmitted cancellation receipt survives recovery (preserve pending: ${preserveExpiredPending})`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ima-turn-cancel-'));
    const file = join(dir, 'pending.json');
    let ready;
    let posts = 0;
    try {
      const queue = new ConversationTurnQueue(file, async (_job, _emit, signal) => {
        await new Promise(resolve => { ready = resolve; });
        signal.throwIfAborted();
        posts++;
      });
      const { job } = queue.enqueue(turn('synthetic-client', 'synthetic-conversation', 'cancelled', 'cancel this draft'));
      const next = queue.enqueue(turn('synthetic-client', 'synthetic-conversation', 'keep', 'keep this draft')).job;
      assert.deepEqual(queue.remove('synthetic-client', job.id), { removed: true });
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      assert.equal(saved[0].cancelRequested, true);
      assert.equal(saved[0].submissionStarted, undefined);
      assert.equal(saved.some(row => Object.hasOwn(row, 'clientId')), false);
      const recovered = new ConversationTurnQueue(file, async () => { posts++; }, () => Date.now(), { preserveExpiredPending });
      assert.equal(recovered.get('synthetic-client', job.id), null);
      assert.deepEqual(recovered.list('synthetic-client', 'synthetic-conversation').map(row => [row.id, row.status]), [[next.id, 'paused']]);
      assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).map(row => row.id), [next.id]);
      recovered.resumeRecovered();
      assert.equal(posts, 0);
    } finally {
      ready?.();
      await settle();
      rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(posts, 0);
  });
}
