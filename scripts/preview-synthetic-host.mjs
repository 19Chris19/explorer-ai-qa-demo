import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { embedUrl } from '../public/host-bridge.mjs';
import { allowedPreviewRoute } from '../preview-gateway.mjs';

// The only upstream is this in-memory fixture. No IMA client or private config.
const prefix = process.argv[2] || '/qa-app';
const frameUrl = embedUrl(prefix);
const conversations = new Map();
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
const fixture = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://fixture').pathname;
  const internal = path.startsWith('/internal/');
  if (path === '/healthz') return json(res, 200, { ok: true });
  if (req.headers.authorization !== `Bearer synthetic-${internal ? 'service' : 'api'}`) return json(res, 401, {});
  if (path === '/internal/provider-a/capacity') return json(res, 200, {
    schemaVersion: 1, features: { knowledge_agent_keyed_sse_v1: true, source_intent_web_requested_v1: true },
    policies: { knowledge_agent: { max_concurrent: 1 } }, active: 0, queued: 0,
  });
  const owner = req.headers['x-ima-client-id'];
  let body = {};
  if (req.method === 'POST') {
    const chunks = []; for await (const part of req) chunks.push(part);
    body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
  }
  if (path === '/api/conversations') {
    if (req.method === 'POST') {
      const conversation = { conversationId: randomUUID(), title: 'Synthetic host acceptance', updatedAt: new Date().toISOString() };
      conversations.set(conversation.conversationId, { owner, conversation, messages: [] });
      return json(res, 201, { conversation });
    }
    return json(res, 200, { conversations: [...conversations.values()].filter(x => x.owner === owner).map(x => x.conversation) });
  }
  const row = conversations.get(body.conversationId || path.split('/')[3]);
  if (!row || row.owner !== owner) return json(res, 404, {});
  if (path.startsWith('/api/conversations/')) return json(res, 200, { conversation: row.conversation, messages: row.messages });
  if (path !== '/internal/provider-a/deep-ask') return json(res, 404, {});
  const content = '## Synthetic acceptance\n\n**Not an IMA answer.**\n\n| Check | Result |\n| --- | --- |\n| Same-origin path | PASS |\n| Table and newlines | PASS |\n';
  const sources = [{ index: 1, title: 'Synthetic source', source_type: 'knowledge' }];
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('conversation', { conversationId: row.conversation.conversationId }); send('sources', { sources });
  for (let offset = 0; offset < content.length && !res.destroyed; offset += 12) {
    send('delta', { text: content.slice(offset, offset + 12) });
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  if (res.destroyed) return;
  row.messages.push({ role: 'user', content: body.question }, { role: 'assistant', content, sources, sourceCount: 1 });
  send('done', { conversationId: row.conversation.conversationId, source_count: 1, knowledge_source_count: 1, web_source_count: 0, answer_basis: 'knowledge' });
  res.end();
});
fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
const port = probe.address().port; probe.close(); await once(probe, 'close');
const runtime = mkdtempSync(join(tmpdir(), 'qa-host-synthetic-'));
const bff = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'ignore',
  env: { PATH: process.env.PATH, PORT: String(port), DEMO_RUNTIME_DIR: runtime, DEMO_ASSET_PREFIX: prefix === '/' ? '' : prefix,
    DEMO_COOKIE_NAME: 'qa_synthetic_host', DEMO_COOKIE_SECRET: 'synthetic-cookie-secret', DEMO_DISABLE_ADMIN: '1',
    PROVIDER_A_BASE_URL: `http://127.0.0.1:${fixture.address().port}`, PROVIDER_A_API_TOKEN: 'synthetic-api',
    PROVIDER_A_INTERNAL_SERVICE_TOKEN: 'synthetic-service', PROVIDER_A_KNOWLEDGE_SCOPE_REF: 'a'.repeat(64), DEMO_RELEASE_REVISION: 'synthetic-host-only' },
});
let listening = false;
for (let n = 0; n < 100; n++) {
  try { await fetch(`http://127.0.0.1:${port}/api/qa/health`); listening = true; break; }
  catch { await new Promise(resolve => setTimeout(resolve, 20)); }
}
if (!listening) { bff.kill(); fixture.close(); throw Error('Synthetic BFF did not start'); }
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/host-test.css"><script src="/host-test.js" defer></script></head><body><header><strong>Synthetic host only</strong><button id="new">New</button><button id="history">History</button><button id="more">More</button><button id="preferences">English / dark</button></header><iframe title="QA module" src="${frameUrl}"></iframe></body></html>`;
const host = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://host').pathname;
  if (path === '/ai-qa') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
  if (path === '/host-test.css') { res.setHeader('Content-Type', 'text/css'); return res.end('body{margin:0;font-family:system-ui}header{height:64px;display:flex;align-items:center;gap:12px;padding:0 16px;box-sizing:border-box}button{padding:8px}iframe{display:block;width:100%;height:calc(100dvh - 64px);border:0}'); }
  if (path === '/host-test.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(readFileSync(new URL('./preview-synthetic-host-ui.js', import.meta.url))); }
  const route = prefix === '/' ? path : path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : '';
  if (!route || !allowedPreviewRoute(route, req.method)) { res.writeHead(404); return res.end(); }
  const abort = new AbortController(); res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  try {
    const headers = { host: `127.0.0.1:${port}`, ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
      ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}) };
    const upstream = await fetch(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, signal: abort.signal,
      ...(req.method === 'POST' ? { body: req, duplex: 'half' } : {}) });
    for (const name of ['content-type', 'content-security-policy', 'set-cookie', 'cache-control']) {
      const value = upstream.headers.get(name); if (value) res.setHeader(name, value);
    }
    res.writeHead(upstream.status); if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res); else res.end();
  } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
});
host.listen(0, '127.0.0.1'); await once(host, 'listening');
console.log(`Synthetic host: http://127.0.0.1:${host.address().port}/ai-qa`);
let closing = false;
const stop = async () => {
  if (closing) return; closing = true;
  host.closeAllConnections(); host.close(); fixture.closeAllConnections(); fixture.close();
  const ended = once(bff, 'exit'); bff.kill('SIGTERM'); await ended;
  rmSync(runtime, { recursive: true, force: true });
};
process.on('SIGINT', () => { void stop(); }); process.on('SIGTERM', () => { void stop(); });
