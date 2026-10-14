import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { relaySourcePreview, readPreviewBody } from '../source-preview.mjs';
import { createProviderAClient } from '../provider-a-client.mjs';
import { allowedPreviewRoute, createPreviewGateway } from '../preview-gateway.mjs';
import proxy from '../preview/api/proxy.mjs';
import { validResponseType, boundedPreviewBody } from '../preview/api/failure.mjs';

test('source preview uses service identity without submitting a task or adding source intent', async () => {
  let seen;
  const client = createProviderAClient({ baseUrl: 'http://127.0.0.1:3117', apiToken: 'synthetic-ordinary', serviceToken: 'synthetic-internal', knowledgeScopeRef: 'a'.repeat(64),
    fetchImpl: async (url, options) => { seen = { url, ...options }; return new Response('{}'); } });
  await client.request({ route: '/api/source-preview/image?taskId=task', method: 'GET', clientId: 'demo:synthetic' });
  assert.equal(seen.url, 'http://127.0.0.1:3117/internal/provider-a/source-preview/image?taskId=task');
  assert.equal(seen.headers.Authorization, 'Bearer synthetic-internal'); assert.equal(seen.headers['X-IMA-Client-Id'], 'demo:synthetic');
  assert.equal(seen.body, undefined); assert.equal(seen.headers['Idempotency-Key'], undefined);
});
test('BFF resolves current cookie identity, hides internal paths and silently degrades older providers', async t => {
  let available = true, seen;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    void relaySourcePreview({ async request(options) { seen = options; return available ? new Response('{"status":"ready","imagePath":"/internal/private"}', { headers: { 'Content-Type': 'application/json' } }) : new Response('{}', { status: 404 }); } },
      { req, res, clientId: 'signed-owner', params: url.searchParams, image: false, prefix: '/qa' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/qa/source-preview`, query = 'conversationId=conv&taskId=task&citationKey=index%3A42&sourceId=' + 'a'.repeat(64);
  const response = await fetch(`${base}?${query}`), data = await response.json();
  assert.equal(seen.clientId, 'signed-owner'); assert.match(data.imagePath, /^\/qa\/api\/qa\/source-preview\/image\?/); assert.doesNotMatch(JSON.stringify(data), /internal|private/);
  available = false; assert.equal((await (await fetch(`${base}?${query}`)).json()).status, 'text_only');
  assert.equal((await fetch(`${base}?${query}&url=https://example.org`)).status, 404);
});
test('both public proxies only allow read-only preview paths and supported image MIME', () => {
  for (const path of ['/api/qa/source-preview', '/api/qa/source-preview/image']) {
    assert.equal(allowedPreviewRoute(path, 'GET'), true);
    for (const method of ['HEAD', 'POST', 'DELETE', 'PUT']) assert.equal(allowedPreviewRoute(path, method), false);
  }
  assert.equal(allowedPreviewRoute('/api/qa/source-preview/anything', 'GET'), false);
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) assert.equal(validResponseType('api/qa/source-preview/image', type), true);
  for (const type of ['image/svg+xml', 'text/html', 'text/javascript']) assert.equal(validResponseType('api/qa/source-preview/image', type), false);
  assert.equal(validResponseType('api/qa/tasks', 'image/png'), false);
});
test('BFF/Vercel bounded readers cancel oversized responses with or without Content-Length', async () => {
  for (const reader of [readPreviewBody, boundedPreviewBody]) {
    await assert.rejects(reader(new Response('x', { headers: { 'Content-Length': '9999999' } }), 512 * 1024));
    await assert.rejects(reader(new Response(new Uint8Array(512 * 1024 + 1)), 512 * 1024));
    assert.equal((await reader(new Response(new Uint8Array(32)), 512 * 1024)).length, 32);
  }
});
test('Vercel transports cached image bytes privately without broadening the external fetch target', async () => {
  const old = { key: process.env.PREVIEW_ORIGIN_KEY, url: process.env.PREVIEW_ORIGIN_URL, fetch: globalThis.fetch };
  process.env.PREVIEW_ORIGIN_KEY = 'synthetic-key-123456789012345678901234567890'; process.env.PREVIEW_ORIGIN_URL = 'https://fixture.ngrok.app';
  let type = 'image/png', size = 32, seen;
  globalThis.fetch = async (url, options) => { seen = { url: String(url), options }; return new Response(new Uint8Array(size), { headers: { 'Content-Type': type } }); };
  try {
    const request = () => new Request('https://fixture.vercel.app/api/proxy?path=api/qa/source-preview/image&taskId=task');
    const response = await proxy.fetch(request()); assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, 32);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.match(seen.url, /^https:\/\/fixture.ngrok.app\/api\/qa\/source-preview\/image\?/);
    type = 'image/svg+xml'; assert.equal((await proxy.fetch(request())).status, 503);
    type = 'image/png'; size = 512 * 1024 + 1; assert.equal((await proxy.fetch(request())).status, 503);
  } finally { globalThis.fetch = old.fetch; if (old.key === undefined) delete process.env.PREVIEW_ORIGIN_KEY; else process.env.PREVIEW_ORIGIN_KEY = old.key;
    if (old.url === undefined) delete process.env.PREVIEW_ORIGIN_URL; else process.env.PREVIEW_ORIGIN_URL = old.url; }
});
