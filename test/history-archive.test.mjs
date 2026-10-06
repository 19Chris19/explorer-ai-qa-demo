import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, truncateSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARCHIVE_LIMITS, loadHistoryArchive, parseHistoryArchive } from '../history-archive.mjs';

import { owner, otherOwner, syntheticConversation } from '../test-support/history-fixture.mjs';

test('archive is optional, isolated by exact owner, namespaced, expired and never exposes identity', () => {
  assert.deepEqual(loadHistoryArchive().list(owner), []);
  assert.equal(loadHistoryArchive().enabled, false);
  const dir = mkdtempSync(join(tmpdir(), 'synthetic-history-'));
  try {
    const file = join(dir, 'archive.json');
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, conversations: [syntheticConversation(), syntheticConversation({ id: 'other', ownerKey: otherOwner })] }));
    const archive = loadHistoryArchive(file);
    assert.equal(archive.enabled, true);
    assert.deepEqual(archive.list(owner).map(row => row.conversationId), ['archive:synthetic-collision']);
    assert.equal(archive.detail('synthetic-collision', owner), null);
    assert.equal(archive.detail('archive:synthetic-collision', otherOwner), null);
    assert.equal(archive.detail('archive:synthetic-collision', owner, Date.parse('2099-01-01T00:00:00Z')), null);
    assert.deepEqual(archive.list(owner, Date.parse('2099-01-01T00:00:00Z')), []);
    const detail = archive.detail('archive:synthetic-collision', owner);
    assert.equal(detail.messages[1].content, 'Synthetic answer');
    assert.equal(detail.readOnly, true);
    assert.equal(JSON.stringify(detail).includes('owner'), false);
    detail.messages[1].sources[0].title = 'changed';
    assert.equal(archive.detail('archive:synthetic-collision', owner).messages[1].sources[0].title, 'Synthetic source');
    for (const data of ['{', '', '{"schemaVersion":2,"conversations":[]}']) {
      writeFileSync(file, data); assert.throws(() => loadHistoryArchive(file), /Invalid PROVIDER_A_HISTORY_ARCHIVE_PATH/);
    }
    writeFileSync(file, Buffer.from([0xff, 0xfe]));
    assert.throws(() => loadHistoryArchive(file));
    truncateSync(file, ARCHIVE_LIMITS.bytes + 1);
    assert.throws(() => loadHistoryArchive(file));
    assert.throws(() => loadHistoryArchive(join(dir, 'missing')));
    assert.throws(() => loadHistoryArchive(dir));
    symlinkSync(file, join(dir, 'link'));
    assert.throws(() => loadHistoryArchive(join(dir, 'link')));
    assert.throws(() => loadHistoryArchive('relative.json'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('strict schema rejects orphaned/malformed/private data, duplicates and excessive counts', () => {
  const invalidRows = [
    { ownerKey: '' }, { ownerKey: 'demo:orphan' }, { ownerKey: null }, { id: 'archive:collision' },
    { title: 1 }, { mode: 1 }, { accountId: 'synthetic-only' }, { upstreamBindings: {} },
    { expiresAt: '2025-01-01T00:00:00Z' }, { updatedAt: '2026-02-30T00:00:00Z' },
    { turns: [] }, { turns: new Array(1001).fill(syntheticConversation().turns[0]) },
  ];
  for (const overrides of invalidRows) assert.throws(() => parseHistoryArchive({ schemaVersion: 1, conversations: [syntheticConversation(overrides)] }));
  for (const overrides of [{ question: '' }, { answer: [] }, { createdAt: '2027-01-01T00:00:00Z' }, { sources: [{}] },
    { sources: [{ token: 'synthetic-only' }] }, { sources: [{ url: 'javascript:alert(1)' }] },
    { sources: [{ url: 'https://synthetic:synthetic@example.com/' }] }, { evidence: { ownerKey: owner } },
    { evidence: { source_count: -1 } }, { searchSummary: {} }, { credentials: 'synthetic' }]) {
    const row = syntheticConversation(); Object.assign(row.turns[0], overrides);
    assert.throws(() => parseHistoryArchive({ schemaVersion: 1, conversations: [row] }));
  }
  const row = syntheticConversation(); delete row.ownerKey;
  assert.throws(() => parseHistoryArchive({ schemaVersion: 1, conversations: [row] }));
  assert.throws(() => parseHistoryArchive({ schemaVersion: 1, conversations: [syntheticConversation(), syntheticConversation()] }));
  assert.throws(() => parseHistoryArchive({ schemaVersion: 1, conversations: new Array(10001).fill(syntheticConversation()) }));
  const many = Array.from({ length: 51 }, (_, index) => syntheticConversation({ id: `synthetic-${index}`, turns: new Array(1000).fill(syntheticConversation().turns[0]) }));
  assert.throws(() => parseHistoryArchive({ schemaVersion: 1, conversations: many }));
});

test('Provider numeric timestamps and absent optional metadata are accepted without weakening identity validation', () => {
  const row = syntheticConversation();
  delete row.title; delete row.mode;
  row.turns = [{ question: 'Synthetic question', answer: 'Synthetic answer', createdAt: row.createdAt }];
  assert.equal(parseHistoryArchive({ schemaVersion: 1, conversations: [row] }).size, 1);
  for (const value of [NaN, Infinity, -1, 1.5, 8640000000000001, null]) {
    assert.throws(() => parseHistoryArchive({ schemaVersion: 1, conversations: [{ ...row, createdAt: value }] }));
  }
});
