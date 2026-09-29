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
