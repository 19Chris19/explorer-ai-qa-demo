import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAClient } from '../provider-a-client.mjs';

test('task transport uses service auth and stable scoped idempotency, not ordinary ask', async () => {
  const calls = [];
  const client = createProviderAClient({ baseUrl: 'http://127.0.0.1:3000', apiToken: 'synthetic-api', serviceToken: 'synthetic-service', knowledgeScopeRef: 'a'.repeat(64),
    fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response('{}'); } });
  const request = { route: '/api/tasks', method: 'POST', clientId: 'demo:one', requestId: '00000000-0000-4000-8000-000000000001', body: JSON.stringify({ question: 'synthetic', conversationId: 'one' }), sourceIntent: 'web' };
  await client.request(request); await client.request(request);
  await client.request({ ...request, clientId: 'demo:two' });
  assert.equal(calls[0].url, 'http://127.0.0.1:3000/internal/provider-a/tasks');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-service');
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
  assert.notEqual(calls[0].options.headers['Idempotency-Key'], calls[2].options.headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(calls[0].options.body), { question: 'synthetic', conversationId: 'one', retrieval_policy: 'knowledge_agent', knowledge_scope_ref: 'a'.repeat(64), source_intent: 'web_requested' });
  await client.request({ route: '/api/tasks/one/events?after=7', method: 'GET', clientId: 'demo:one' });
  assert.equal(calls[3].url, 'http://127.0.0.1:3000/internal/provider-a/tasks/one/events?after=7');
  assert.equal(calls[3].options.headers.Authorization, 'Bearer synthetic-service');
  assert.equal(calls[3].options.redirect, 'error');
});
