import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, chmodSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { MaintenanceGate, transitionMaintenance, checkMaintenance } from '../maintenance-gate.mjs';
import { ConversationTurnQueue } from '../conversation-turn-queue.mjs';

const zero = () => ({ activeDirect: 0, running: 0, queued: 0, paused: 0, pending: 0, expiredPending: 0, previewActive: 0, previewWaiters: 0 });
function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'synthetic-maintenance-')));
  chmodSync(dir, 0o700);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'state.json');
}
const close = (file, generation = 0, operationId = 'synthetic-op-1') => transitionMaintenance(file, 'close', { generation, operationId });

test('unconfigured open; configured missing and malformed fail closed; observed close drains and bound open resumes', async t => {
  assert.equal(new MaintenanceGate('').admit() instanceof Function, true);
  const file = fixture(t); const gate = new MaintenanceGate(file);
  t.after(() => gate.stop());
  assert.equal(gate.admit(), null);
  close(file);
  await gate.start(zero);
  assert.equal((await checkMaintenance(file)).drained, true);
  assert.throws(() => transitionMaintenance(file, 'open', { generation: 1, operationId: 'synthetic-wrong' }));
  transitionMaintenance(file, 'open', { generation: 1, operationId: 'synthetic-op-1' });
  const release = gate.admit(); assert.equal(typeof release, 'function');
  close(file, 2, 'synthetic-op-2'); gate.publish();
  assert.equal((await checkMaintenance(file)).snapshot.inflight, 1);
  assert.equal((await checkMaintenance(file)).drained, false);
  assert.equal(gate.admit(), null);
  release(); release(); gate.publish();
  assert.equal((await checkMaintenance(file)).drained, true);
  writeFileSync(file, '{bad', { mode: 0o600 });
  assert.equal(gate.admit(), null);
  await assert.rejects(checkMaintenance(file));
});

test('a stopped snapshot writer cannot certify drain even while its PID is alive', async t => {
  const file = fixture(t); close(file);
  const gate = new MaintenanceGate(file); await gate.start(zero); gate.stop();
  await assert.rejects(checkMaintenance(file));
});

test('CAS rejects stale generation and concurrent writer; snapshots must acknowledge state and stay fresh', async t => {
  const file = fixture(t); close(file);
  assert.throws(() => close(file));
  const gate = new MaintenanceGate(file); await gate.start(zero); t.after(() => gate.stop());
  await assert.rejects(new MaintenanceGate(file).start(zero));
  transitionMaintenance(file, 'open', { generation: 1, operationId: 'synthetic-op-1' });
  assert.equal((await checkMaintenance(file)).state.generation, 2);
  const inode = statSync(file).ino;
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.equal(existsSync(`${file}.snapshot`), false);
  assert.equal(statSync(file).ino, inode);
  assert.equal((await checkMaintenance(file)).state.generation, 2);
});

test('permissions, links and project locations are rejected without touching target data', async t => {
  const file = fixture(t); close(file);
  chmodSync(file, 0o644); assert.throws(() => close(file, 1));
  assert.equal(new MaintenanceGate(file).admit(), null);
  chmodSync(file, 0o600);
  const linked = `${file}.linked`; symlinkSync(file, linked);
  assert.throws(() => close(linked));
  rmSync(linked); linkSync(file, linked); assert.throws(() => close(file, 1)); rmSync(linked);
  chmodSync(join(file, '..'), 0o755); assert.throws(() => close(file, 1));
  assert.throws(() => close(join(process.cwd(), 'synthetic-maintenance-state.json')));
});

test('maintenance counters retain expired paused pending through prune and restart', async t => {
  const file = fixture(t); let now = 1000;
  const queueFile = `${file}.queue`;
  const q = new ConversationTurnQueue(queueFile, async () => {}, () => now, { preserveExpiredPending: true });
  q.beginDirect('synthetic-owner', 'synthetic-conversation');
  q.enqueue({ clientId: 'synthetic-owner', conversationId: 'synthetic-conversation', requestId: 'synthetic-request', question: 'synthetic' });
  assert.equal(q.maintenanceSnapshot().activeDirect, 1);
  now += 3600001;
  q.finishDirect('synthetic-owner', 'synthetic-conversation', true);
  q.prune();
  assert.deepEqual(q.maintenanceSnapshot(), { activeDirect: 0, running: 0, queued: 0, paused: 1, pending: 1, expiredPending: 1 });
  const restored = new ConversationTurnQueue(queueFile, async () => assert.fail('must not dispatch'), () => now, { preserveExpiredPending: true });
  const rows = restored.list('synthetic-owner', 'synthetic-conversation');
  assert.equal(rows.length, 1);
  restored.remove('synthetic-owner', rows[0].id);
  assert.equal(restored.maintenanceSnapshot().pending, 0);
});

test('invalid schema, generation rollback and unsafe snapshot cannot certify admission or drain', async t => {
  const file = fixture(t); close(file);
  const original = readFileSync(file, 'utf8');
  transitionMaintenance(file, 'open', { generation: 1, operationId: 'synthetic-op-1' });
  const gate = new MaintenanceGate(file); await gate.start(zero); t.after(() => gate.stop());
  gate.admit()();
  writeFileSync(file, original);
  assert.equal(gate.admit(), null);
  for (const value of [[], { ...JSON.parse(original), unexpected: true }, { ...JSON.parse(original), generation: '1' }]) {
    writeFileSync(file, JSON.stringify(value));
    assert.equal(gate.admit(), null);
    await assert.rejects(checkMaintenance(file));
  }
  writeFileSync(file, JSON.stringify({ ...JSON.parse(original), generation: 3 }));
  gate.publish(); assert.equal((await checkMaintenance(file)).drained, true);
  chmodSync(gate.address, 0o644);
  await assert.rejects(checkMaintenance(file));
  chmodSync(gate.address, 0o600);
  assert.equal((await checkMaintenance(file)).drained, true);
});

test('expired paused head prevents dispatching later queued items in the same lane', async t => {
  const file = fixture(t); let now = 1000;
  const queue = new ConversationTurnQueue(`${file}.queue`, () => assert.fail('paused lane dispatched'), () => now, { preserveExpiredPending: true });
  queue.beginDirect('synthetic', 'lane');
  queue.enqueue({ clientId: 'synthetic', conversationId: 'lane', requestId: 'old', question: 'old synthetic' });
  now += 1800000;
  queue.enqueue({ clientId: 'synthetic', conversationId: 'lane', requestId: 'new', question: 'new synthetic' });
  now += 1800001;
  queue.finishDirect('synthetic', 'lane', true);
  assert.equal(queue.maintenanceSnapshot().running, 0);
  assert.equal(queue.maintenanceSnapshot().pending, 2);
});

test('two independent CLI writers cannot both commit one expected generation', async t => {
  const file = fixture(t); close(file);
  const run = async () => {
    const child = spawn(process.execPath, ['scripts/maintenance.mjs', 'open', '--generation', '1', '--operation-id', 'synthetic-op-1'], {
      env: { ...process.env, DEMO_MAINTENANCE_STATE_PATH: file }, stdio: 'ignore',
    });
    return (await once(child, 'exit'))[0];
  };
  assert.deepEqual((await Promise.all([run(), run()])).sort(), [0, 1]);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).generation, 2);
});

test('loss of the private writer lease fails admission closed', async t => {
  const file = fixture(t); close(file);
  transitionMaintenance(file, 'open', { generation: 1, operationId: 'synthetic-op-1' });
  const gate = new MaintenanceGate(file); await gate.start(zero); t.after(() => gate.stop());
  rmSync(`${file}.writer`, { recursive: true });
  gate.publish();
  assert.equal(gate.admit(), null);
});


test('live IPC rejects invalid counters and lost lease; never trusts a legacy snapshot', async t => {
  const file = fixture(t); close(file);
  const gate = new MaintenanceGate(file); await gate.start(() => ({ ...zero(), pending: 1 }));
  t.after(() => gate.stop());
  writeFileSync(`${file}.snapshot`, '{}', { mode: 0o600 });
  await assert.rejects(checkMaintenance(file));
  gate.counts = zero;
  assert.equal((await checkMaintenance(file)).drained, true);
  writeFileSync(`${file}.writer/owner`, JSON.stringify({ pid: process.pid, instanceId: 'a'.repeat(36) }));
  await assert.rejects(checkMaintenance(file));
  assert.equal(gate.admit(), null);
});

test('an unresponsive private endpoint cannot certify drain and times out within two seconds', async t => {
  const file = fixture(t); close(file);
  const gate = new MaintenanceGate(file); await gate.start(zero);
  const address = gate.address;
  await new Promise(resolve => gate.server.close(resolve));
  const sockets = new Set();
  const stalled = createServer(socket => { sockets.add(socket); socket.on('error', () => {}); });
  await new Promise(resolve => stalled.listen(address, resolve)); chmodSync(address, 0o600);
  t.after(() => { for (const socket of sockets) socket.destroy(); stalled.close(); gate.stop(); });
  const started = performance.now();
  await assert.rejects(checkMaintenance(file));
  const elapsed = performance.now() - started;
  assert.ok(elapsed >= 1900 && elapsed < 2800);
});
