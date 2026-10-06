import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, chmodSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConversationTurnQueue } from '../conversation-turn-queue.mjs';
import { MaintenanceGate, transitionMaintenance, checkMaintenance } from '../maintenance-gate.mjs';

function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'synthetic-maintenance-storage-')));
  chmodSync(dir, 0o700);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'queue.json');
  const queue = new ConversationTurnQueue(file, () => assert.fail('unexpected dispatch'), () => 1000);
  queue.beginDirect('synthetic-owner', 'synthetic-conversation');
  queue.enqueue({ clientId: 'synthetic-owner', conversationId: 'synthetic-conversation', requestId: 'synthetic-request', question: 'Synthetic question' });
  return { dir, file, row: JSON.parse(readFileSync(file, 'utf8'))[0] };
}

const invalid = {
  'string date': row => [{ ...row, createdAt: '1000' }],
  'negative date': row => [{ ...row, createdAt: -1 }],
  'fractional date': row => [{ ...row, createdAt: 1.5 }],
  'out of range date': row => [{ ...row, createdAt: 8640000000000001 }],
  'null row': () => [null],
  'array row': () => [[]],
  'blank question': row => [{ ...row, question: '  ' }],
  'invalid owner': row => [{ ...row, owner: '' }],
  'empty conversation': row => [{ ...row, conversationId: '' }],
  'empty request': row => [{ ...row, requestId: '' }],
  'invalid id': row => [{ ...row, id: '' }],
  'unknown status': row => [{ ...row, status: 'complete' }],
  'invalid preview': row => [{ ...row, preview: 'false' }],
  'unknown intent': row => [{ ...row, sourceIntent: 'unknown' }],
  'missing field': ({ status, ...row }) => [row],
  'unknown field': row => [{ ...row, extra: 'Synthetic retained data' }],
  'duplicate id': row => [row, { ...row, question: 'Synthetic second question' }],
  'valid then invalid': row => [row, { ...row, id: 'synthetic-other', question: null }],
  'invalid then valid': row => [null, row],
};

for (const [name, mutate] of Object.entries(invalid)) {
  test(`preserve rejects ${name} before rewriting or publishing drain`, t => {
    const { dir, file, row } = fixture(t);
    const bytes = Buffer.from(JSON.stringify(mutate(row), null, 2) + '\n');
    writeFileSync(file, bytes);
    const state = join(dir, 'state.json');
    transitionMaintenance(state, 'close', { generation: 0, operationId: 'synthetic-storage-check' });
    let gate;
    t.after(() => gate?.stop());
    assert.throws(() => {
      const queue = new ConversationTurnQueue(file, () => assert.fail('unexpected dispatch'), () => 1000, { preserveExpiredPending: true });
      gate = new MaintenanceGate(state);
      gate.start(() => ({ ...queue.maintenanceSnapshot(), previewActive: 0, previewWaiters: 0 }));
    }, /^Error: Invalid queued-turn storage$/u);
    assert.deepEqual(readFileSync(file), bytes);
    assert.equal(existsSync(`${state}.snapshot`), false);
    assert.equal(existsSync(`${state}.writer`), false);
    assert.throws(() => checkMaintenance(state));
  });
}

for (const bytes of [Buffer.from('{broken'), Buffer.from('{}'), Buffer.from('null'), Buffer.from('"synthetic"'),
  Buffer.from('[{"question":"\xc3("}]', 'binary')]) {
  test(`preserve rejects invalid root/encoding ${bytes.toString('hex')} without writes`, t => {
    const { file } = fixture(t);
    writeFileSync(file, bytes);
    assert.throws(() => new ConversationTurnQueue(file, () => {}, undefined, { preserveExpiredPending: true }));
    assert.deepEqual(readFileSync(file), bytes);
  });
}

test('legacy still skips malformed rows, overwrites duplicate IDs, and expires old pending', t => {
  const { file, row } = fixture(t);
  writeFileSync(file, JSON.stringify([null, row, { ...row, question: 'Synthetic replacement' }]));
  const queue = new ConversationTurnQueue(file, () => {}, () => 1000);
  assert.equal(queue.jobs.size, 1);
  assert.equal([...queue.jobs.values()][0].question, 'Synthetic replacement');
  new ConversationTurnQueue(file, () => {}, () => 3601001);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), []);
});

test('legacy parse and non-array errors still reject without rewriting', t => {
  const { file } = fixture(t);
  for (const text of ['{broken', '{}', 'null']) {
    writeFileSync(file, text);
    assert.throws(() => new ConversationTurnQueue(file, () => {}));
    assert.equal(readFileSync(file, 'utf8'), text);
  }
});

test('valid empty storage is not normalized or rewritten', t => {
  const { file } = fixture(t);
  const bytes = Buffer.from('[  \n ]\n');
  writeFileSync(file, bytes);
  const queue = new ConversationTurnQueue(file, () => {}, undefined, { preserveExpiredPending: true });
  assert.equal(queue.jobs.size, 0);
  assert.deepEqual(readFileSync(file), bytes);
});

test('missing storage is a new empty queue; unreadable non-file storage is not empty', t => {
  const { dir } = fixture(t);
  const absent = join(dir, 'absent.json');
  assert.equal(new ConversationTurnQueue(absent, () => {}, undefined, { preserveExpiredPending: true }).jobs.size, 0);
  assert.equal(existsSync(absent), false);
  mkdirSync(absent);
  assert.throws(() => new ConversationTurnQueue(absent, () => {}, undefined, { preserveExpiredPending: true }));
});

test('preserve rejects invalid UTF-8 inside an otherwise valid serialized row', t => {
  const { file, row } = fixture(t);
  const text = JSON.stringify([{ ...row, question: 'SYNTHETIC_MARKER' }]);
  const [before, after] = text.split('SYNTHETIC_MARKER');
  const bytes = Buffer.concat([Buffer.from(before), Buffer.from([0xc3, 0x28]), Buffer.from(after)]);
  writeFileSync(file, bytes);
  assert.throws(() => new ConversationTurnQueue(file, () => {}, undefined, { preserveExpiredPending: true }));
  assert.deepEqual(readFileSync(file), bytes);
});

test('preserve rejects existing and dangling storage symlinks without touching either path', t => {
  const { dir, file } = fixture(t);
  const bytes = readFileSync(file);
  for (const target of [file, join(dir, 'missing-target')]) {
    const link = join(dir, 'linked.json');
    symlinkSync(target, link);
    assert.throws(() => new ConversationTurnQueue(link, () => {}, undefined, { preserveExpiredPending: true }));
    assert.deepEqual(readFileSync(file), bytes);
    rmSync(link);
  }
});

for (const kind of ['invalid-row', 'duplicate-id', 'malformed-json', 'non-array']) {
  test(`actual BFF refuses ${kind} before publishing a drain snapshot`, async t => {
    const { dir, row } = fixture(t);
    const runtime = join(dir, 'runtime'); mkdirSync(runtime);
    const file = join(runtime, 'queued-turns.json');
    const bytes = Buffer.from(kind === 'malformed-json' ? '{broken'
      : JSON.stringify(kind === 'invalid-row' ? [row, { ...row, createdAt: '1000' }]
        : kind === 'duplicate-id' ? [row, row] : {}));
    writeFileSync(file, bytes, { mode: 0o600 });
    const state = join(dir, 'state.json');
    transitionMaintenance(state, 'close', { generation: 0, operationId: 'synthetic-startup-check' });
    let calls = 0;
    const provider = createServer((_req, res) => { calls++; res.end('{}'); });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    t.after(() => new Promise(resolve => provider.close(resolve)));
    const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
    const port = reserve.address().port; reserve.close(); await once(reserve, 'close');
    const child = spawn(process.execPath, ['server.mjs'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'ignore',
      env: { PATH: process.env.PATH, PORT: String(port), DEMO_RUNTIME_DIR: runtime,
        DEMO_MAINTENANCE_STATE_PATH: state, DEMO_COOKIE_SECRET: 'synthetic-secret',
        PROVIDER_A_BASE_URL: `http://127.0.0.1:${provider.address().port}` },
    });
    const timeout = setTimeout(() => child.kill(), 5000);
    let code;
    try { [code] = await once(child, 'exit'); } finally { clearTimeout(timeout); }
    assert.notEqual(code, null, 'must reject startup, not wait for the watchdog');
    assert.notEqual(code, 0);
    assert.deepEqual(readFileSync(file), bytes);
    assert.equal(existsSync(`${state}.snapshot`), false);
    assert.equal(existsSync(`${state}.writer`), false);
    assert.throws(() => checkMaintenance(state));
    assert.equal(calls, 0);
  });
}

test('all valid serialized statuses restore paused with expired contents retained', t => {
  const { file, row } = fixture(t);
  for (const status of ['queued', 'paused', 'running']) {
    writeFileSync(file, JSON.stringify([{ ...row, status }]));
    const queue = new ConversationTurnQueue(file, () => assert.fail('unexpected dispatch'), () => 3601001, { preserveExpiredPending: true });
    const restored = queue.list('synthetic-owner', 'synthetic-conversation');
    assert.equal(restored.length, 1);
    assert.equal(restored[0].status, 'paused');
    assert.equal(restored[0].question, row.question);
    assert.equal(queue.maintenanceSnapshot().expiredPending, 1);
  }
});
