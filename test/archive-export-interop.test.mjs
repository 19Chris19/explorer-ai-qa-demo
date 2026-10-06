import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { parseHistoryArchive } from '../history-archive.mjs';
import { syntheticConversation } from '../test-support/history-fixture.mjs';

// Explicit opt-in: no runtime dependency on a second checkout or private data.
const modulePath = process.env.PROVIDER_A_TRANSFER_TEST_MODULE;
test('actual Provider exportHistory -> serialized JSON -> website parser (synthetic only)', {
  skip: !modulePath && 'Set PROVIDER_A_TRANSFER_TEST_MODULE to the reviewed account-transfer.js',
}, async t => {
  assert.ok(isAbsolute(modulePath));
  const { exportHistory } = createRequire(import.meta.url)(modulePath);
  const exported = row => JSON.parse(JSON.stringify(exportHistory({ conversations: [row] })));
  const parse = row => parseHistoryArchive(exported(row)).get(`archive:${row.id}`);
  const withEvidence = value => {
    const row = syntheticConversation(); row.turns[0].evidence = value; return row;
  };

  await t.test('actual sourceType mapping and numeric/string type interoperate', () => {
    for (const sourceType of [0, 1, 2]) {
      for (const type of [0, 1, 'knowledge']) {
        const row = syntheticConversation();
        Object.assign(row.turns[0].sources[0], { sourceType, type, accountId: 'synthetic-redacted-account' });
        const wire = exported(row);
        assert.equal(Object.hasOwn(wire.conversations[0].turns[0].sources[0], 'sourceType'), false);
        assert.equal(JSON.stringify(wire).includes('synthetic-redacted-account'), false);
        assert.equal(parse(row).turns[0].sources[0].type, type);
      }
      const row = syntheticConversation(); row.turns[0].sources[0].sourceType = sourceType;
      assert.equal(parse(row).turns[0].sources[0].type, sourceType === 0 ? 'web' : 'knowledge');
    }
    for (const type of [0.5, null, {}, Number.MAX_SAFE_INTEGER + 1]) {
      const row = syntheticConversation(); row.turns[0].sources[0].type = type;
      assert.throws(() => parse(row));
    }
  });

  await t.test('evidence enums and sourceIntent alias normalize without inventing metadata', () => {
    for (const basis of ['', 'knowledge', 'web', 'mixed', 'agent_general', 'provider_fallback']) {
      for (const intent of ['', 'web_requested']) {
        for (const key of ['source_intent', 'sourceIntent']) {
          const parsed = parse(withEvidence({ [key]: intent, answer_basis: basis, source_count: 2, knowledge_source_count: 1, web_source_count: 1 }));
          assert.equal(parsed.turns[0].evidence.source_intent, intent);
          assert.equal(Object.hasOwn(parsed.turns[0].evidence, 'sourceIntent'), false);
        }
      }
    }
    assert.equal(parse(withEvidence({ sourceIntent: 'web_requested', source_intent: 'web_requested' })).turns[0].evidence.source_intent, 'web_requested');
    for (const value of [{ source_intent: 'knowledge' }, { answer_basis: 'unknown' },
      { source_count: 101 }, { source_count: '1' }, { source_count: -1 }]) {
      assert.throws(() => parse(withEvidence(value)));
    }
    // Current exporter drops invalid aliases and prefers the canonical field.
    // This loss is NOT proof that the original source metadata was valid.
    assert.deepEqual(parse(withEvidence({ sourceIntent: 'web' })).turns[0].evidence, {});
    assert.equal(parse(withEvidence({ sourceIntent: 'web_requested', source_intent: '' })).turns[0].evidence.source_intent, '');
    assert.equal(parse(withEvidence(undefined)).turns[0].evidence, undefined);
    assert.deepEqual(parse(withEvidence({})).turns[0].evidence, {});
  });

  await t.test('numeric and ISO times pass, invalid/reversed/missing times fail after serialization', () => {
    assert.ok(parse(syntheticConversation()));
    const iso = syntheticConversation();
    for (const key of ['createdAt', 'updatedAt', 'expiresAt']) iso[key] = new Date(iso[key]).toISOString();
    iso.turns[0].createdAt = iso.createdAt;
    assert.ok(parse(iso));
    const epoch = syntheticConversation({ createdAt: 0, updatedAt: 0 }); epoch.turns[0].createdAt = 0;
    assert.ok(parse(epoch));
    for (const createdAt of [undefined, null, -1, 0.5, NaN, Infinity, '1767225600000', '2026-02-30T00:00:00Z']) {
      assert.throws(() => parse(syntheticConversation({ createdAt })));
      const row = syntheticConversation(); row.turns[0].createdAt = createdAt;
      assert.throws(() => parse(row));
    }
    assert.throws(() => parse(syntheticConversation({ updatedAt: 1 })));
    assert.throws(() => parse(syntheticConversation({ expiresAt: 1 })));
  });

  await t.test('exported empty conversations and blank turns are explicit acceptance blockers', () => {
    const empty = syntheticConversation({ turns: [] });
    assert.deepEqual(exported(empty).conversations[0].turns, []);
    assert.throws(() => parse(empty));
    for (const key of ['question', 'answer']) {
      for (const value of ['', '   ']) {
        const row = syntheticConversation(); row.turns[0][key] = value;
        assert.throws(() => parse(row));
      }
    }
    assert.equal(parseHistoryArchive(exportHistory({ conversations: [] })).size, 0);
  });
});
