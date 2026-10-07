import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAClient } from '../provider-a-client.mjs';

const options = { mode: 'shared', gatewayUrl: 'https://air.example-tail.ts.net', gatewayToken: 'synthetic-site-token' };
test('shared transport refuses disabled TLS verification even when invoked without installer', () => {
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try { assert.throws(() => createProviderAClient(options), /shared_tls_verification_required/u); }
  finally {
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
  }
});
test('shared mode rejects unsafe and unapproved origins', () => {
  for (const gatewayUrl of ['http://air.example-tail.ts.net', 'https://example.com', 'https://air.example-tail.ts.net/path', 'https://user:pass@air.example-tail.ts.net', 'https://air.example-tail.ts.net?x=1', 'https://air.example-tail.ts.net:3117', 'https://air.example-tail.ts.net.evil.test']) {
    assert.throws(() => createProviderAClient({ ...options, gatewayUrl }));
  }
  assert.throws(() => createProviderAClient({ ...options, mode: 'typo' }));
});
test('shared readiness needs a supported contract, not just HTTP success', async () => {
  const client = createProviderAClient({ ...options, fetchImpl: async (url, init) => {
    assert.equal(url, `${options.gatewayUrl}/v1/capabilities`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${options.gatewayToken}`);
    return Response.json({ connected: true, authenticated: true, ready: true, capacity: 5 });
  } });
  assert.equal((await client.readiness()).ready, false);
});
test('shared maps routes and intent without internal credentials or fields', async () => {
  const controller = new AbortController();
  const calls = [];
  const client = createProviderAClient({ ...options, fetchImpl: async (...args) => { calls.push(args); return new Response(''); } });
  assert.equal(client.configured, true);
  await client.request({ route: '/api/ask', method: 'POST', clientId: 'visitor:synthetic', requestId: '11111111-1111-4111-8111-111111111111', sourceIntent: 'web', body: JSON.stringify({ question: 'synthetic', conversationId: 'abc' }), signal: controller.signal });
  assert.equal(calls[0][0], `${options.gatewayUrl}/v1/ask`);
  assert.deepEqual(JSON.parse(calls[0][1].body), { question: 'synthetic', conversationId: 'abc', request_id: '11111111-1111-4111-8111-111111111111', sourceIntent: 'web' });
  assert.equal(calls[0][1].signal, controller.signal);
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].headers['X-IMA-Client-Id'], 'visitor:synthetic');
  await client.request({ route: '/api/conversations?limit=50', method: 'GET', clientId: 'visitor:synthetic' });
  assert.equal(calls[1][0], `${options.gatewayUrl}/v1/conversations?limit=50`);
  assert.throws(() => client.request({ route: '/internal/provider-a/capacity', method: 'GET' }));
  assert.throws(() => client.request({ route: '/api/conversations/../admin', method: 'GET' }));
});
