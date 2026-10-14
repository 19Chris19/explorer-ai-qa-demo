import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RequestLedger } from '../request-ledger.mjs';
import { SessionModeStore } from '../session-mode-store.mjs';

const request = { clientId: 'synthetic', requestId: 'request', question: 'question', conversationId: 'conversation' };
test('routing identity and legacy dedupe acknowledgement both cross file and directory fsync', t => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'routing-durability-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const events = [], fsync = fs.fsyncSync, rename = fs.renameSync;
  fs.fsyncSync = fd => { events.push(fs.fstatSync(fd).isDirectory() ? 'directory' : 'file'); return fsync(fd); };
  fs.renameSync = (...args) => { events.push('rename'); return rename(...args); };
  syncBuiltinESMExports();
  try {
    const ledger = new RequestLedger(join(directory, 'ledger.json'));
    const receipt = ledger.claim(request); assert.equal(receipt.accepted, true);
    assert.deepEqual(events.splice(0), ['file', 'rename', 'directory']);
    ledger.complete(receipt.key); assert.deepEqual(events.splice(0), ['file', 'rename', 'directory']);
    const mapping = new SessionModeStore(join(directory, 'sessions.json'));
    mapping.remember('conversation', 'synthetic'); assert.deepEqual(events.splice(0), ['file', 'rename', 'directory']);
    assert.equal(new RequestLedger(ledger.file).claim(request).reason, 'duplicate');
    assert.equal(new SessionModeStore(mapping.file).belongsToNative('conversation', 'synthetic'), true);
    assert.equal(fs.statSync(ledger.file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(mapping.file).mode & 0o777, 0o600);
  } finally { fs.fsyncSync = fsync; fs.renameSync = rename; syncBuiltinESMExports(); }
});

test('routing write faults are reported and cannot leave an uncommitted in-memory identity', t => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'routing-failure-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const ledger = new RequestLedger(join(directory, 'ledger.json'));
  const mapping = new SessionModeStore(join(directory, 'sessions.json'));
  const rename = fs.renameSync;
  fs.renameSync = () => { throw new Error('synthetic write fault'); }; syncBuiltinESMExports();
  try {
    assert.throws(() => ledger.claim(request), /synthetic write fault/);
    assert.deepEqual(ledger.rows, {});
    assert.throws(() => mapping.remember('conversation', 'synthetic'), /synthetic write fault/);
    assert.equal(mapping.belongsToNative('conversation', 'synthetic'), false);
    assert.deepEqual(fs.readdirSync(directory), [], 'no abandoned private temporary files');
  } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
});

test('malformed routing files never silently normalize to an empty store', t => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'routing-invalid-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'invalid.json');
  for (const invalid of ['[]', 'null', '{"conversation":"wrong-owner"}']) {
    fs.writeFileSync(file, invalid);
    assert.throws(() => new SessionModeStore(file), /invalid_session_mode_storage/);
    assert.throws(() => new RequestLedger(file), /invalid_request_ledger/);
  }
});
