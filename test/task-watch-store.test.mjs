import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskWatchStore } from '../task-watch-store.mjs';
import { ConversationTurnQueue } from '../conversation-turn-queue.mjs';

test('task watch metadata survives restart without question or answer data', t => {
  const dir = mkdtempSync(join(tmpdir(), 'synthetic-task-watch-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'watches.json');
  const store = new TaskWatchStore(file);
  const row = { id: 'synthetic-task', clientId: 'synthetic-owner', conversationId: 'synthetic-conversation', preview: true, status: 'queued' };
  store.set(row); assert.equal(store.pendingCount(), 1);
  const reload = new TaskWatchStore(file); assert.deepEqual(reload.rows.get(row.id), row);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.ok(!/question|answer|token/iu.test(readFileSync(file, 'utf8')));
  reload.set({ ...row, status: 'running' }); assert.equal(reload.pendingCount(), 0);
  reload.delete(row.id); assert.equal(new TaskWatchStore(file).rows.size, 0);
});

test('receipt capacity rejects growth without evicting active, ambiguous or terminal records', t => {
  const dir = mkdtempSync(join(tmpdir(), 'synthetic-task-watch-cap-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'watches.json');
  const store = new TaskWatchStore(file, { maxRecords: 3 });
  const base = { clientId: 'synthetic-owner', conversationId: 'synthetic-conversation', preview: false };
  for (const status of ['unconfirmed', 'running', 'rejected']) store.set({ ...base, id: status, status });
  assert.equal(store.hasRoom(), false);
  assert.throws(() => store.set({ ...base, id: 'extra', status: 'queued' }), /task_storage_full/);
  store.set({ ...store.rows.get('running'), cancelRequested: true });
  const restored = new TaskWatchStore(file, { maxRecords: 2 });
  assert.equal(restored.rows.size, 3);
  assert.equal(restored.hasRoom(), false);
  assert.equal(restored.rows.get('running').cancelRequested, true);
  restored.set({ ...restored.rows.get('running'), status: 'cancelled' });
  assert.deepEqual([...restored.rows.keys()], ['unconfirmed', 'running', 'rejected']);
  assert.throws(() => restored.set({ ...base, id: 'extra', status: 'queued' }), /task_storage_full/);
});

test('accepted queued task reattaches to the same id after restart, even after pending TTL', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'synthetic-queue-resume-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'queue.json'); let release;
  const gate = new Promise(resolve => { release = resolve; });
  const queue = new ConversationTurnQueue(file, async job => { queue.attachTask(job, 'synthetic-provider-task'); await gate; }, () => 1000);
  const job = queue.enqueue({ clientId: 'synthetic-owner', conversationId: 'synthetic-conversation', requestId: 'synthetic-request', question: 'synthetic question' }).job;
  const observed = [];
  const restored = new ConversationTurnQueue(file, async row => { observed.push(row.taskId); }, () => 1000 + 2 * 60 * 60 * 1000);
  assert.equal(restored.get('other', job.id), null);
  assert.deepEqual(observed, []);
  const record = restored.get('synthetic-owner', job.id);
  assert.equal(record.taskId, 'synthetic-provider-task');
  assert.deepEqual(observed, ['synthetic-provider-task']);
  await new Promise(resolve => setImmediate(resolve)); release();
});
