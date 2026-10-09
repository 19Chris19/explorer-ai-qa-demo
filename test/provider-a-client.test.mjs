import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProviderAClient } from '../provider-a-client.mjs';
import { SessionModeStore } from '../session-mode-store.mjs';
import { RequestLedger } from '../request-ledger.mjs';

test('host gateway requires boolean opt-in and only the exact fixed origin is allowed', () => {
  const baseUrl = 'http://host.docker.internal:3117';
  for (const allowHostGateway of [undefined, false, 'true', 1]) assert.throws(() => createProviderAClient({ baseUrl, allowHostGateway }));
  assert.doesNotThrow(() => createProviderAClient({ baseUrl, allowHostGateway: true }));
  for (const url of ['http://127.0.0.1:3117', 'http://provider-a:3000']) assert.doesNotThrow(() => createProviderAClient({ baseUrl: url }));
  for (const url of ['https://host.docker.internal:3117', `${baseUrl}/`, `${baseUrl}?x=1`, `${baseUrl}#x`, `${baseUrl}/internal`,
    'http://user:pass@host.docker.internal:3117', 'http://host.docker.internal:3118', 'http://HOST.docker.internal:3117',
    'http://host.docker.internal.evil:3117', 'http://example.com:3117', 'http://127.0.0.1:3117?x=1', 'http://provider-a:3000/']) {
    assert.throws(() => createProviderAClient({ baseUrl: url, allowHostGateway: true }), url);
  }
});

test('all provider reads and writes prohibit redirects including readiness credentials', async () => {
  const calls = [];
  const client = createProviderAClient({ baseUrl: 'http://host.docker.internal:3117', allowHostGateway: true,
    apiToken: '<synthetic-api>', serviceToken: '<synthetic-service>', knowledgeScopeRef: 'a'.repeat(64),
    fetchImpl: async (url, options) => { calls.push(options); return new Response('{}'); },
  });
  await client.readiness();
  await client.request({ route: '/api/conversations', method: 'POST', clientId: 'synthetic', body: '{}' });
  assert.equal(calls.length, 4);
  assert.ok(calls.every(options => options.redirect === 'error'));
});

test('native capacity zero stays unready even when both credentials work', async () => {
  const calls = [];
  const client = createProviderAClient({
    baseUrl: 'http://127.0.0.1:3117', apiToken: 'ordinary', serviceToken: 'internal',
    knowledgeScopeRef: 'a'.repeat(64),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, auth: options.headers?.Authorization });
      if (url.endsWith('/healthz')) return new Response('{"queue":{"queuedRequests":0}}', { status: 200 });
      if (url.endsWith('/capacity')) return new Response('{"schemaVersion":1,"policies":{"knowledge_agent":{"max_concurrent":0}},"features":{"knowledge_agent_keyed_sse_v1":true,"durable_qa_tasks_v1":true}}', { status: 200 });
      return new Response('{"conversations":[]}', { status: 200 });
    },
  });
  const result = await client.readiness();
  assert.equal(result.connected, true);
  assert.equal(result.authenticated, true);
  assert.equal(result.contractSupported, true);
  assert.equal(result.ready, false);
  assert.equal(result.capacity, 0);
  assert.equal(calls.find(call => call.url.endsWith('/capacity')).auth, 'Bearer internal');
  assert.equal(calls.find(call => call.url.includes('/api/conversations')).auth, 'Bearer ordinary');
});

test('legacy keyed SSE alone is not ready for the durable UI but retains capability and capacity facts', async () => {
  for (const durable of [undefined, false, 'true', true]) {
    const client = createProviderAClient({
      baseUrl: 'http://127.0.0.1:3117', apiToken: 'synthetic-api', serviceToken: 'synthetic-service',
      knowledgeScopeRef: 'a'.repeat(64),
      fetchImpl: async url => new Response(JSON.stringify(url.endsWith('/capacity') ? {
        schemaVersion: 1, features: { knowledge_agent_keyed_sse_v1: true,
          source_intent_web_requested_v1: true, durable_qa_tasks_v1: durable },
        policies: { knowledge_agent: { max_concurrent: 2 } }, active: 2, queued: 3,
      } : {})),
    });
    const result = await client.readiness();
    assert.equal(result.authenticated, true);
    assert.equal(result.contractSupported, true);
    assert.equal(result.webIntentSupported, true);
    assert.equal(result.capacity, 2);
    assert.equal(result.active, 2);
    assert.equal(result.queued, 3);
    assert.equal(result.durableTasksSupported, durable === true);
    assert.equal(result.ready, durable === true);
  }
});

test('native streaming uses internal service credentials and a stable upstream idempotency key', async () => {
  const captured = [];
  const client = createProviderAClient({
    baseUrl: 'http://127.0.0.1:3117', apiToken: 'ordinary', serviceToken: 'internal',
    knowledgeScopeRef: 'a'.repeat(64),
    fetchImpl: async (url, options) => { captured.push({ url, ...options }); return new Response('', { status: 200 }); },
  });
  const input = { route: '/api/ask', method: 'POST', clientId: 'demo:synthetic', requestId: '00000000-0000-4000-8000-000000000001', body: '{"question":"合成问题"}' };
  await client.request(input);
  assert.match(captured[0].headers['Idempotency-Key'], /^[a-f0-9]{64}$/u);
  assert.ok(captured.every(row => row.url.endsWith('/internal/provider-a/deep-ask')));
  assert.equal(JSON.parse(captured[0].body).retrieval_policy, 'knowledge_agent');
  await client.request({ ...input, sourceIntent: 'web' });
  assert.equal(JSON.parse(captured[1].body).source_intent, 'web_requested');
});

test('readiness advertises web intent only when Provider A declares the internal contract', async () => {
  const makeClient = features => createProviderAClient({
    baseUrl: 'http://127.0.0.1:3117', apiToken: 'ordinary', serviceToken: 'internal',
    knowledgeScopeRef: 'a'.repeat(64),
    fetchImpl: async url => {
      if (url.endsWith('/healthz')) return new Response('{"queue":{"queuedRequests":0}}', { status: 200 });
      if (url.endsWith('/capacity')) return new Response(JSON.stringify({ schemaVersion: 1, policies: { knowledge_agent: { max_concurrent: 2 } }, features }), { status: 200 });
      return new Response('{"conversations":[]}', { status: 200 });
    },
  });
  const compatible = await makeClient({ knowledge_agent_keyed_sse_v1: true, durable_qa_tasks_v1: true, source_intent_web_requested_v1: true }).readiness();
  assert.equal(compatible.ready, true);
  assert.equal(compatible.webIntentSupported, true);
  const older = await makeClient({ source_intent_web_requested_v1: true }).readiness();
  assert.equal(older.authenticated, true);
  assert.equal(older.capacity, 2);
  assert.equal(older.contractSupported, false);
  assert.equal(older.ready, false);
  assert.equal(older.webIntentSupported, false);
});

test('private request ledger blocks duplicate dispatch across restart without retaining question text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ima-web-ledger-'));
  try {
    const path = join(dir, 'requests.json');
    const input = { clientId: 'demo:synthetic', requestId: '00000000-0000-4000-8000-000000000001', question: '合成首问', conversationId: 'demo-1' };
    const ledger = new RequestLedger(path);
    const first = ledger.claim(input);
    assert.equal(first.accepted, true);
    assert.equal(ledger.claim(input).reason, 'duplicate');
    ledger.complete(first.key);
    const reopened = new RequestLedger(path);
    assert.equal(reopened.claim(input).reason, 'duplicate');
    assert.equal(reopened.claim({ ...input, question: '合成追问' }).reason, 'conflict');
    assert.equal(reopened.claim({ ...input, sourceIntent: 'web' }).reason, 'conflict');
    assert.equal(reopened.claim({ ...input, clientId: 'demo:someone-else' }).accepted, true);
    assert.equal(readFileSync(path, 'utf8').includes(input.question), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('native session ownership survives reopening its private registry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ima-web-native-mode-'));
  try {
    const path = join(dir, 'sessions.json');
    new SessionModeStore(path).remember('synthetic-conversation', 'demo:user-one');
    const reopened = new SessionModeStore(path);
    assert.equal(reopened.belongsToNative('synthetic-conversation', 'demo:user-one'), true);
    assert.equal(reopened.belongsToNative('synthetic-conversation', 'demo:user-two'), false);
    assert.equal(reopened.belongsToNative('old-conversation', 'demo:user-one'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
