import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { qaAdmissionConfig, allocationView } from '../qa-admission-config.mjs';
import { PreviewAdmission } from '../preview-admission.mjs';
import { ConversationTurnQueue } from '../conversation-turn-queue.mjs';
import { createProviderAClient } from '../provider-a-client.mjs';

const features = { knowledge_agent_keyed_sse_v1: true, durable_qa_tasks_v1: true, source_intent_web_requested_v1: true };
const allocation = { schemaVersion: 1, maxConcurrent: 2, active: 1, queued: 3, available: 1, queueLimit: 4, maxWaitMs: 1000, weight: 3, shared: true };
function client(value, { identity = 'website', appId = 'website' } = {}) {
  const urls = [];
  return { urls, provider: createProviderAClient({ baseUrl: 'http://127.0.0.1:3117', apiToken: 'synthetic-api', serviceToken: 'synthetic-service', knowledgeScopeRef: 'a'.repeat(64),
    fetchImpl: async (url, options = {}) => {
      urls.push({ url, token: options.headers?.Authorization });
      return new Response(JSON.stringify(url.endsWith('/capacity') ? { website: { schemaVersion: 1, features, mode: 'knowledge_agent', applicationId: appId,
        policies: { knowledge_agent: { max_concurrent: 100 } }, allocation: value } } : url.endsWith('/api/capabilities') ? { applicationId: identity } : {}));
    } }) };
}

test('admission defaults are unchanged and all overrides are bounded', () => {
  const config = qaAdmissionConfig(); assert.equal(config.maxSubmissions, 10); assert.equal(config.maxPending, 8); assert.equal(config.maxPendingPerConversation, 3);
  for (const env of [{ DEMO_PREVIEW_MAX_PENDING: '0' }, { DEMO_MAX_PENDING_PER_CONVERSATION: '51' }, { DEMO_PROVIDER_SUBMIT_TIMEOUT_MS: 'secret' }]) assert.throws(() => qaAdmissionConfig(env), error => !error.message.includes('secret'));
  const custom = qaAdmissionConfig({ DEMO_PREVIEW_MAX_PENDING: '30', DEMO_PREVIEW_MAX_SUBMISSIONS: '15' });
  const gate = new PreviewAdmission(() => 0, custom); assert.equal(gate.hasRoom(29), true); assert.equal(gate.hasRoom(30), false);
  for (let i = 0; i < 15; i++) assert.equal(gate.admit('visitor', `r${i}`), true);
  assert.equal(gate.admit('visitor', 'r15'), false); assert.equal(gate.admit('visitor', 'r0'), true);
});

test('rate-window memory is bounded without evicting duplicate receipts early', () => {
  let now = 0; const gate = new PreviewAdmission(() => now, qaAdmissionConfig({ DEMO_PREVIEW_MAX_RECENT_RECORDS: '10' }));
  for (let i = 0; i < 10; i++) assert.equal(gate.admit(`v${i}`, 'r'), true);
  assert.equal(gate.admit('overflow', 'r'), false); assert.equal(gate.admit('v0', 'r'), true); assert.equal(gate.recent.size, 10);
  now = 60000; assert.equal(gate.admit('overflow', 'r'), true); assert.equal(gate.recent.size, 1);
});

test('per-session pending limit is configurable; separate sessions run independently', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-elastic-admission-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  let release; const hold = new Promise(resolve => { release = resolve; }); const starts = [];
  const queue = new ConversationTurnQueue(join(dir, 'queue.json'), async job => { starts.push(job.conversationId); await hold; }, () => 1,
    { maxPendingPerConversation: 1 });
  const enqueue = (session, id) => queue.enqueue({ clientId: 'fixture', conversationId: session, requestId: id, question: 'synthetic fixture' });
  const first = enqueue('one', 'r1'); assert.ok(first.job); assert.ok(enqueue('one', 'r2').job); assert.equal(enqueue('one', 'r3').error, 'full');
  assert.ok(enqueue('two', 'r4').job); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(starts.sort(), ['one', 'two']);
  assert.equal(queue.enqueue({ clientId: 'fixture', conversationId: 'one', requestId: 'r1', question: 'synthetic fixture' }).repeated, true);
  release(); await new Promise(resolve => setTimeout(resolve, 10));
});

test('website uses only its authenticated quota, validates role pairing, and ignores extra fields', async () => {
  const h = client({ ...allocation, credential: 'do-not-project', otherApplications: ['private'] });
  const result = await h.provider.readiness();
  assert.equal(result.capacity, 2); assert.equal(result.active, 1); assert.equal(result.queued, 3);
  assert.equal(result.allocation.isolationVerified, true);
  assert.doesNotMatch(JSON.stringify(result), /do-not-project|private|otherApplications/);
  assert.equal(h.urls.find(row => row.url.endsWith('/api/capabilities')).token, 'Bearer synthetic-api');
  const mismatch = await client(allocation, { identity: 'other' }).provider.readiness();
  assert.equal(mismatch.authenticated, false); assert.equal(mismatch.ready, false); assert.equal(mismatch.capacity, 0);
});

test('malformed, paused and legacy allocations fail or degrade accurately', async () => {
  for (const invalid of [null, {}, { ...allocation, maxConcurrent: 101 }, { ...allocation, active: -1 }, { ...allocation, shared: false }]) {
    assert.equal(allocationView(invalid), null);
    const result = await client(invalid).provider.readiness(); assert.equal(result.allocationValid, false); assert.equal(result.ready, false); assert.equal(result.capacity, 0);
  }
  const paused = await client({ ...allocation, maxConcurrent: 0, available: 0 }).provider.readiness(); assert.equal(paused.capacity, 0); assert.equal(paused.ready, false);
  const legacy = await client(allocation, { appId: null }).provider.readiness();
  // A named pair is checked above; legacy compatibility remains explicit in the next fixture.
  assert.equal(legacy.capacity, 2); assert.equal(legacy.allocation.isolationVerified, false);
});

test('packaging and UI retain recovery routes and describe capacity waiting without assuming a previous turn', () => {
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /taskQueued: '正在排队，等待可用处理额度…'/);
  assert.match(source, /taskQueued: 'Queued; waiting for available capacity…'/);
  const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8'); assert.ok(build.includes('qa-admission-config.mjs'));
});
