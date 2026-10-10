import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { createStaticResponder } from '../static-assets.mjs';

test('static responses negotiate gzip, conditional requests and HEAD without touching API streams', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-static-')); const body = '/* synthetic stylesheet */\n'.repeat(200);
  writeFileSync(join(root, 'asset.css'), body);
  const serve = createStaticResponder(root);
  const server = createServer((req, res) => serve(req, res, 'asset.css', 'text/css; charset=utf-8'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const get = (headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    request(`http://127.0.0.1:${server.address().port}/asset.css`, { headers, method }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject).end();
  });
  try {
    const plain = await get(); assert.equal(plain.body.toString(), body);
    const compressed = await get({ 'Accept-Encoding': 'gzip' });
    assert.equal(compressed.headers['content-encoding'], 'gzip');
    assert.equal(gunzipSync(compressed.body).toString(), body);
    assert.ok(compressed.body.length < plain.body.length / 2);
    assert.equal(compressed.headers.vary, 'Accept-Encoding');
    assert.match(compressed.headers['cache-control'], /must-revalidate/);
    assert.notEqual(compressed.headers.etag, plain.headers.etag);
    const cached = await get({ 'Accept-Encoding': 'gzip', 'If-None-Match': compressed.headers.etag });
    assert.equal(cached.status, 304); assert.equal(cached.body.length, 0);
    const denied = await get({ 'Accept-Encoding': 'gzip;q=0, identity;q=1' });
    assert.equal(denied.headers['content-encoding'], undefined); assert.equal(denied.body.toString(), body);
    const head = await get({ 'Accept-Encoding': 'gzip' }, 'HEAD');
    assert.equal(head.body.length, 0); assert.equal(Number(head.headers['content-length']), compressed.body.length);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); }
});
