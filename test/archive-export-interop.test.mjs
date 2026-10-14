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
  const { exportHistory, exportHistoryWithReport, auditHistoryInput } = createRequire(import.meta.url)(modulePath);
  const rejected = (row, reason, options = {}) => {
    const store = { conversations: [row] };
    const report = auditHistoryInput(store, options);
    assert.equal(report.ready, false);
    if (reason) assert.equal(report.reasons[reason], 1);
    assert.throws(() => exportHistoryWithReport(store, options), error => {
      assert.equal(error.code, 'archive_preflight_failed');
      assert.deepEqual(error.report, report);
      return true;
    });
    if (Object.keys(options).length === 0) assert.throws(() => exportHistory(store), { code: 'archive_preflight_failed' });
    return report;
  };
  const exported = row => JSON.parse(JSON.stringify(exportHistory({ conversations: [row] })));
  const parse = row => parseHistoryArchive(exported(row)).get(`archive:${row.id}`);
  const withEvidence = value => {
    const row = syntheticConversation(); row.turns[0].evidence = value; return row;
  };

  await t.test('presentation fields survive Provider export and website archive parsing', () => {
    const row = syntheticConversation();
    Object.assign(row.turns[0], { citationMap: { 'index:42': { type: 'web', sources: [{ url: 'https://example.org/paper', title: 'Web', snippet: 'excerpt' }], displayNumbers: ['7'] },
      'index:5': { type: 'knowledge', title: 'synthetic-private-title' } },
      suggestions: [{ text: 'Followup', knowledgeBaseId: 'synthetic-private-scope' }],
      process: [{ phase: 'web', status: 'completed', text: 'synthetic-private-process' }] });
    const restored = parse(row).turns[0];
    assert.deepEqual(restored.citationMap['index:42'].displayNumbers, ['7']);
    assert.deepEqual(restored.citationMap['index:5'], { type: 'knowledge' });
    assert.deepEqual(restored.suggestions, ['Followup']);
    assert.doesNotMatch(JSON.stringify(exported(row)), /synthetic-private/);
  });

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
    rejected(withEvidence({ sourceIntent: 'web' }), 'intent_invalid');
    rejected(withEvidence({ sourceIntent: 'web_requested', source_intent: '' }), 'intent_conflict');
    rejected(withEvidence(undefined), 'shape_invalid');
    const absent = syntheticConversation(); delete absent.turns[0].evidence;
    assert.equal(parse(absent).turns[0].evidence, undefined);
    assert.deepEqual(parse(withEvidence({})).turns[0].evidence, {});
  });

  await t.test('numeric and ISO times pass; audit rejects invalid/reversed/missing times before serialization', () => {
    assert.ok(parse(syntheticConversation()));
    const iso = syntheticConversation();
    for (const key of ['createdAt', 'updatedAt', 'expiresAt']) iso[key] = new Date(iso[key]).toISOString();
    iso.turns[0].createdAt = iso.createdAt;
    assert.ok(parse(iso));
    const epoch = syntheticConversation({ createdAt: 0, updatedAt: 0 }); epoch.turns[0].createdAt = 0;
    assert.ok(parse(epoch));
    for (const createdAt of [undefined, null, -1, 0.5, NaN, Infinity, '1767225600000', '2026-02-30T00:00:00Z']) {
      rejected(syntheticConversation({ createdAt }), 'date_invalid');
      const row = syntheticConversation(); row.turns[0].createdAt = createdAt;
      rejected(row, 'date_invalid');
    }
    rejected(syntheticConversation({ updatedAt: 1 }), 'chronology_invalid');
    rejected(syntheticConversation({ expiresAt: 1 }), 'chronology_invalid');
  });

  await t.test('audit blocks empty shells by default; explicit exclusion counts them without weakening parser', () => {
    const empty = syntheticConversation({ turns: [] });
    const report = rejected(empty);
    assert.equal(report.emptyShells, 1);
    assert.equal(report.excludedEmptyShells, 0);
    assert.throws(() => parseHistoryArchive({ schemaVersion: 1, conversations: [empty] }));
    const valid = syntheticConversation({ id: 'retained' });
    const store = { conversations: [empty, valid] };
    const before = structuredClone(store);
    const result = exportHistoryWithReport(store, { excludeEmptyShells: true });
    assert.equal(result.report.ready, true);
    assert.equal(result.report.conversations, 2);
    assert.equal(result.report.validConversations, 1);
    assert.equal(result.report.emptyShells, 1);
    assert.equal(result.report.excludedEmptyShells, 1);
    assert.equal(result.report.invalidConversations, 0);
    assert.deepEqual([...parseHistoryArchive(JSON.parse(JSON.stringify(result.archive))).keys()], ['archive:retained']);
    assert.deepEqual(store, before);
    rejected(syntheticConversation({ turns: [], ownerKey: 'invalid-owner' }), 'owner_invalid', { excludeEmptyShells: true });
    for (const key of ['question', 'answer']) {
      for (const value of ['', '   ']) {
        const row = syntheticConversation(); row.turns[0][key] = value;
        rejected(row, 'text_invalid', { excludeEmptyShells: true });
        assert.throws(() => parseHistoryArchive({ schemaVersion: 1, conversations: [row] }));
      }
    }
    assert.equal(parseHistoryArchive(exportHistory({ conversations: [] })).size, 0);
  });

  await t.test('explicit URL omission reports every removal and cannot drop malformed sources', () => {
    const row = syntheticConversation();
    row.turns[0].sources = [
      { title: 'Synthetic unsafe URL', url: 'https://example.invalid/source?token=synthetic-only' },
      { title: 'Synthetic safe URL', url: 'https://example.invalid/safe' },
    ];
    rejected(row, 'source_url_unsafe');
    const before = structuredClone(row);
    const result = exportHistoryWithReport({ conversations: [row, syntheticConversation({ id: 'empty', turns: [] })] },
      { omitSourceUrls: true, excludeEmptyShells: true });
    assert.equal(result.report.ready, true);
    assert.equal(result.report.removedSourceUrls, 2);
    assert.equal(result.report.excludedEmptyShells, 1);
    assert.equal(result.report.validConversations, 1);
    const parsed = parseHistoryArchive(JSON.parse(JSON.stringify(result.archive))).get(`archive:${row.id}`);
    assert.deepEqual(parsed.turns[0].sources.map(source => source.title), row.turns[0].sources.map(source => source.title));
    assert.ok(parsed.turns[0].sources.every(source => !Object.hasOwn(source, 'url')));
    assert.ok(!JSON.stringify(result).includes('synthetic-only'));
    assert.deepEqual(row, before);
    const onlyUrl = syntheticConversation(); onlyUrl.turns[0].sources = [{ url: 'https://example.invalid/' }];
    assert.equal(parse(onlyUrl).turns[0].sources[0].url, 'https://example.invalid/');
    rejected(onlyUrl, 'source_invalid', { omitSourceUrls: true });
    const badType = syntheticConversation(); badType.turns[0].sources[0].type = {};
    rejected(badType, 'text_invalid', { omitSourceUrls: true });
  });

  await t.test('native flat evidence survives export; conflicts, active and incomplete records fail audit', () => {
    const row = syntheticConversation({ activeRequest: false, upstream: { accountId: 'synthetic-private' } });
    delete row.turns[0].evidence;
    Object.assign(row.turns[0], { answerBasis: 'mixed', sourceCount: 2, knowledgeSourceCount: 1,
      webSourceCount: 1, sourceIntent: 'web_requested', l0ContextCount: 1, l0TruncationReason: 'none' });
    const before = structuredClone(row);
    const { archive, report } = exportHistoryWithReport({ conversations: [row] });
    assert.equal(report.mappedEvidenceFields, 5);
    assert.equal(report.excludedUpstreamFields, 1);
    assert.equal(report.excludedL0Fields, 2);
    const parsed = parseHistoryArchive(JSON.parse(JSON.stringify(archive))).get(`archive:${row.id}`);
    assert.deepEqual(parsed.turns[0].evidence, { answer_basis: 'mixed', source_count: 2,
      knowledge_source_count: 1, web_source_count: 1, source_intent: 'web_requested' });
    assert.equal(parsed.turns[0].question, row.turns[0].question);
    assert.equal(parsed.turns[0].answer, row.turns[0].answer);
    assert.ok(!JSON.stringify(archive).includes('synthetic-private'));
    assert.ok(!JSON.stringify(archive).includes('l0ContextCount'));
    assert.deepEqual(row, before);
    const conflict = structuredClone(row); conflict.turns[0].evidence = { source_count: 1 };
    rejected(conflict, 'evidence_conflict');
    const aliasConflict = structuredClone(row); aliasConflict.turns[0].evidence = { sourceIntent: '' };
    rejected(aliasConflict, 'evidence_conflict');
    const invalidCount = structuredClone(row); invalidCount.turns[0].sourceCount = '2';
    rejected(invalidCount, 'evidence_invalid');
    rejected({ ...row, activeRequest: true }, 'conversation_active');
    for (const evidence of [{ complete: false }, { interrupted: true }]) rejected(withEvidence(evidence), 'turn_incomplete');
  });
});
