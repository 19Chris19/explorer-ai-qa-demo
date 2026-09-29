import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSourceEvidence } from '../source-evidence.mjs';

test('requested web is distinct from verified web-source evidence', () => {
  assert.deepEqual(inspectSourceEvidence({
    source_intent: 'web_requested', answer_basis: 'knowledge', source_count: 2,
    knowledge_source_count: 2, web_source_count: 0,
  }, true), { kind: 'requested_web_missing', verified: false });
  assert.deepEqual(inspectSourceEvidence({
    source_intent: 'web_requested', answer_basis: 'mixed', source_count: 3,
    knowledge_source_count: 2, web_source_count: 1,
  }, true), { kind: 'requested_web_found', count: 1, verified: true });
});

test('web sources are not claimed from absent intent, malformed counts, or contradictory basis', () => {
  assert.deepEqual(inspectSourceEvidence({ source_count: 1, web_source_count: 1 }), {
    kind: 'web_present', count: 1, verified: true,
  });
  assert.deepEqual(inspectSourceEvidence({ source_count: 1, web_source_count: 1 }, true), {
    kind: 'unverified', verified: false,
  });
  assert.deepEqual(inspectSourceEvidence({
    source_intent: 'web_requested', answer_basis: 'mixed', source_count: 2,
    knowledge_source_count: 1, web_source_count: 3,
  }, true), { kind: 'unverified', verified: false });
  assert.deepEqual(inspectSourceEvidence({
    source_intent: 'web_requested', answer_basis: 'knowledge', source_count: 2,
    knowledge_source_count: 2, web_source_count: 'unknown',
  }, true), { kind: 'unverified', verified: false });
});

test('legacy history with no evidence contract remains quiet', () => {
  assert.deepEqual(inspectSourceEvidence({ sources: [{ title: 'synthetic' }] }, false, 1), {
    kind: 'none', verified: false,
  });
});
