import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProviderAClient } from '../provider-a-client.mjs';
import { SessionModeStore } from '../session-mode-store.mjs';
import { RequestLedger } from '../request-ledger.mjs';

test('native capacity zero stays unready even when both credentials work', async () => {
  const calls = [];
  const client = createProviderAClient({
    baseUrl: 'http://127.0.0.1:3117', apiToken: 'ordinary', serviceToken: 'internal',
    knowledgeScopeRef: 'a'.repeat(64),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, auth: options.headers?.Authorization });
      if (url.endsWith('/healthz')) return new Response('{"queue":{"queuedRequests":0}}', { status: 200 });
      if (url.endsWith('/capacity')) return new Response('{"policies":{"knowledge_agent":{"max_concurrent":0}}}', { status: 200 });
      return new Response('{"conversations":[]}', { status: 200 });
    },
  });
  const result = await client.readiness();
  assert.equal(result.connected, true);
  assert.equal(result.authenticated, true);
  assert.equal(result.ready, false);
  assert.equal(result.capacity, 0);
  assert.equal(calls.find(call => call.url.endsWith('/capacity')).auth, 'Bearer internal');
  assert.equal(calls.find(call => call.url.includes('/api/conversations')).auth, 'Bearer ordinary');
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
      if (url.endsWith('/capacity')) return new Response(JSON.stringify({ policies: { knowledge_agent: { max_concurrent: 2 } }, features }), { status: 200 });
      return new Response('{"conversations":[]}', { status: 200 });
    },
  });
  assert.equal((await makeClient({ source_intent_web_requested_v1: true }).readiness()).webIntentSupported, true);
  assert.equal((await makeClient({}).readiness()).webIntentSupported, false);
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
