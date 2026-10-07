import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createProviderAClient } from '../provider-a-client.mjs';

const gatewayModule = process.env.PROVIDER_A_SHARED_GATEWAY_TEST_MODULE;
test('website client interoperates with actual shared gateway across two synthetic deployments', { skip: !gatewayModule && 'Set PROVIDER_A_SHARED_GATEWAY_TEST_MODULE to reviewed shared-gateway.js' }, async () => {
  const { createSharedGateway } = await import(pathToFileURL(gatewayModule));
  const records = new Map();
  const stream = 'event: delta\ndata: {"text":"| A | B |\\n|---|---|\\n| 1 | 2 |\\n"}\n\nevent: done\ndata: {"complete":true}\n\n';
  const upstream = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const owner = req.headers['x-ima-client-id'];
    if (req.url === '/internal/provider-a/capacity') return res.end(JSON.stringify({ schemaVersion: 1, features: { knowledge_agent_keyed_sse_v1: true, source_intent_web_requested_v1: true }, policies: { knowledge_agent: { max_concurrent: 5 } }, active: 0, queued: 0 }));
    if (req.url.startsWith('/api/conversations?')) return res.end(JSON.stringify({ conversations: [...records.values()].filter(row => row.owner === owner).map(row => ({ conversationId: row.id })) }));
    if (req.url === '/api/conversations' && req.method === 'POST') {
      const id = randomUUID(); records.set(id, { id, owner });
      return res.end(JSON.stringify({ conversation: { conversationId: id } }));
    }
    if (req.url.startsWith('/api/conversations/')) {
      const id = req.url.slice('/api/conversations/'.length);
      if (records.get(id)?.owner !== owner) { res.statusCode = 404; return res.end('{}'); }
      if (req.method === 'DELETE') { records.delete(id); return res.end('{}'); }
      return res.end(JSON.stringify({ conversation: { conversationId: id }, messages: [] }));
    }
    if (req.url === '/internal/provider-a/deep-ask') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      assert.equal(body.retrieval_policy, 'knowledge_agent');
      assert.equal(body.source_intent, 'web_requested');
      res.setHeader('Content-Type', 'text/event-stream');
      for (const byte of Buffer.from(stream)) res.write(Buffer.from([byte]));
      return res.end();
    }
    res.statusCode = 404; res.end('{}');
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const siteA = 'synthetic-site-a-token-123456789';
  const siteB = 'synthetic-site-b-token-123456789';
  const gateway = createSharedGateway({ providerUrl: `http://127.0.0.1:${upstream.address().port}`, apiToken: 'synthetic-api', serviceToken: 'synthetic-service', knowledgeScopeRef: 'a'.repeat(64), hmacKey: 'synthetic-stable-owner-key-123456789', sites: [{ deploymentId: 'site-a', token: siteA }, { deploymentId: 'site-b', token: siteB }] });
  gateway.listen(0); await once(gateway.server, 'listening');
  const origin = 'https://air.synthetic-tail.ts.net';
  // Synthetic transport substitution only. This is not a TLS or Tailscale test.
  const transport = (url, init) => {
    assert.ok(url.startsWith(origin + '/v1/'));
    assert.equal(init.redirect, 'error');
    return fetch(`http://127.0.0.1:${gateway.server.address().port}${url.slice(origin.length)}`, init);
  };
  const client = token => createProviderAClient({ mode: 'shared', gatewayUrl: origin, gatewayToken: token, fetchImpl: transport });
  const a = client(siteA); const b = client(siteB);
  const call = (c, route, method = 'GET', extra = {}) => c.request({ route, method, clientId: 'demo:same-visitor', ...extra });
  try {
    assert.equal((await a.readiness()).ready, true);
    assert.equal((await a.readiness()).capacity, 5);
    const created = await (await call(a, '/api/conversations', 'POST', { body: '{}' })).json();
    const id = created.conversation.conversationId;
    assert.equal((await call(b, `/api/conversations/${id}`)).status, 404);
    assert.equal((await call(b, `/api/conversations/${id}`, 'DELETE')).status, 404);
    assert.equal((await call(a, `/api/conversations/${id}`)).status, 200);
    const result = await call(a, '/api/ask', 'POST', { body: JSON.stringify({ question: 'Synthetic table', conversationId: id }), requestId: randomUUID(), sourceIntent: 'web' });
    assert.equal(await result.text(), stream);
    const rotated = 'synthetic-site-a-rotated-123456789';
    gateway.replaceSites([{ deploymentId: 'site-a', token: rotated }, { deploymentId: 'site-b', token: siteB }]);
    assert.equal((await call(a, `/api/conversations/${id}`)).status, 401);
    assert.equal((await call(client(rotated), `/api/conversations/${id}`)).status, 200);
  } finally {
    gateway.server.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise(resolve => gateway.server.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
  }
});
