import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createPreviewGateway, allowedPreviewRoute } from '../preview-gateway.mjs';

test('preview route allowlist excludes admin and internal APIs', () => {
  assert.equal(allowedPreviewRoute('/', 'GET'), true);
  assert.equal(allowedPreviewRoute('/api/qa/ask', 'POST'), true);
  for (const path of ['/turn-lifecycle.mjs', '/prompt-sparks.mjs', '/answer-process.mjs', '/voice-preview.mjs', '/message-shape.mjs', '/composer-shape.mjs']) {
    assert.equal(allowedPreviewRoute(path, 'GET'), true);
    assert.equal(allowedPreviewRoute(path, 'POST'), false);
  }
  for (const path of ['/admin', '/admin.js', '/internal/provider-a/capacity', '/api/qa/ask/../admin', '/api/qa/other']) {
    assert.equal(allowedPreviewRoute(path, 'GET'), false);
  }
});

test('gateway rejects bad keys and preserves synthetic SSE chunks and cookies', async () => {
  const seen = [];
  const bff = createServer((req, res) => {
    seen.push({ url: req.url, origin: req.headers.origin, visitor: req.headers['x-explorer-preview-visitor'] });
    res.setHeader('Set-Cookie', 'qa_demo_client_v2=synthetic; HttpOnly; Secure; SameSite=Lax; Path=/');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('event: delta\ndata: {"text":"a"}\n\n');
    res.end('event: done\ndata: {"complete":true}\n\n');
  });
  bff.listen(0, '127.0.0.1'); await once(bff, 'listening');
  const key = 'synthetic-preview-key-12345678901234567890';
  const gateway = createPreviewGateway({ key, bffUrl: `http://127.0.0.1:${bff.address().port}` });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  const url = `http://127.0.0.1:${gateway.address().port}`;
  try {
    assert.equal((await fetch(`${url}/`)).status, 403);
    const headers = { 'X-Preview-Key': key, 'X-Preview-Visitor': 'a'.repeat(64), 'X-Preview-Origin': 'https://example.vercel.app' };
    assert.equal((await fetch(`${url}/admin`, { headers })).status, 404);
    assert.equal((await fetch(`${url}/internal/provider-a/capacity`, { headers })).status, 404);
    assert.equal((await fetch(`${url}/api/qa/ask`, { method: 'POST', headers, body: '{}' })).status, 403);
    const stream = await fetch(`${url}/api/qa/ask`, {
      method: 'POST', headers: { ...headers, Origin: 'https://example.vercel.app', 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(stream.status, 200);
    assert.match(await stream.text(), /event: delta[\s\S]*event: done/u);
    assert.match(stream.headers.get('set-cookie'), /Secure/u);
    assert.deepEqual(seen, [{ url: '/api/qa/ask', origin: `http://127.0.0.1:${bff.address().port}`, visitor: 'a'.repeat(64) }]);
  } finally { gateway.close(); bff.close(); }
});
