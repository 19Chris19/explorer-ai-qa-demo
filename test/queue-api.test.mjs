import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('BFF queues, edits, removes, isolates, then auto-dispatches the next streamed turn', async () => {
  let firstStarted;
  let releaseFirst;
  const started = new Promise(resolve => { firstStarted = resolve; });
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  const providerAsks = [];
  const durableTasks = new Map();
  let contractEnabled = true;
  let conversationCount = 0;
  const provider = createServer(async (req, res) => {
    if (req.url === '/healthz') { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); return; }
    if (req.url === '/api/conversations?limit=1') { res.setHeader('Content-Type', 'application/json'); res.end('{"conversations":[]}'); return; }
    if (req.url === '/internal/provider-a/capacity') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ schemaVersion: 1, policies: { knowledge_agent: { max_concurrent: 1 } }, features: { knowledge_agent_keyed_sse_v1: contractEnabled, durable_qa_tasks_v1: contractEnabled, source_intent_web_requested_v1: true } })); return; }
    if (req.url === '/api/conversations' && req.method === 'POST') {
      conversationCount += 1;
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversation: { conversationId: `synthetic-${conversationCount}` } }));
      return;
    }
    if (req.url === '/internal/provider-a/deep-ask') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      providerAsks.push({ body, clientId: req.headers['x-ima-client-id'], key: req.headers['idempotency-key'] });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`event: conversation\ndata: ${JSON.stringify({ conversationId: body.conversationId })}\n\n`);
      res.write('event: sources\ndata: {"sources":[{"title":"合成来源"}]}\n\n');
      res.write('event: delta\ndata: {"text":"合成回答"}\n\n');
      if (providerAsks.length === 1) { firstStarted(); await gate; }
      res.end(`event: done\ndata: ${JSON.stringify({ conversationId: body.conversationId, source_count: 1 })}\n\n`);
      return;
    }
    if (req.url === '/internal/provider-a/tasks' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      providerAsks.push({ body, clientId: req.headers['x-ima-client-id'], key: req.headers['idempotency-key'] });
      const task = { id: randomUUID(), conversationId: body.conversationId, status: 'succeeded', lastEventId: 3 };
      durableTasks.set(task.id, task);
      res.writeHead(202, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ task })); return;
    }
    const taskMatch = /^\/internal\/provider-a\/tasks\/([^/]+)\/events\?after=0$/u.exec(req.url);
    if (taskMatch) {
      const task = durableTasks.get(taskMatch[1]);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(`id: 1\nevent: conversation\ndata: ${JSON.stringify({ conversationId: task.conversationId })}\n\nid: 2\nevent: delta\ndata: {"text":"合成回答"}\n\nid: 3\nevent: done\ndata: ${JSON.stringify({ conversationId: task.conversationId })}\n\n`); return;
    }
    res.writeHead(404); res.end();
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  const port = await freePort();
  const runtimeDir = mkdtempSync(join(tmpdir(), 'ima-queue-api-'));
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: {
      ...process.env, PORT: String(port), DEMO_RUNTIME_DIR: runtimeDir, DEMO_COOKIE_SECRET: 'synthetic-cookie-secret',
      PROVIDER_A_BASE_URL: `http://127.0.0.1:${provider.address().port}`,
      PROVIDER_A_API_TOKEN: 'synthetic-api-token', PROVIDER_A_INTERNAL_SERVICE_TOKEN: 'synthetic-service-token',
      PROVIDER_A_KNOWLEDGE_SCOPE_REF: 'a'.repeat(64),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitFor(`${base}/api/qa/health`);
    const created = await fetch(`${base}/api/qa/conversations`, { method: 'POST' });
    const cookie = created.headers.get('set-cookie').split(';')[0];
    assert.equal((await created.json()).conversation.conversationId, 'synthetic-1');
    const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
    const first = await fetch(`${base}/api/qa/ask`, {
      method: 'POST', headers,
      body: JSON.stringify({ question: '合成首问', conversationId: 'synthetic-1', requestId: randomUUID() }),
    });
    assert.equal(first.status, 200);
    await started;
    const queuedId = randomUUID();
    const queued = await fetch(`${base}/api/qa/queue`, {
      method: 'POST', headers,
      body: JSON.stringify({ question: '待修改问题', conversationId: 'synthetic-1', requestId: queuedId }),
    });
    assert.equal(queued.status, 202);
    const job = (await queued.json()).job;
    assert.equal(job.status, 'queued');
    assert.equal(providerAsks.length, 1);
    const duplicate = await fetch(`${base}/api/qa/queue`, {
      method: 'POST', headers,
      body: JSON.stringify({ question: '待修改问题', conversationId: 'synthetic-1', requestId: queuedId }),
    });
    assert.equal((await duplicate.json()).repeated, true);
    const edit = await fetch(`${base}/api/qa/queue/${job.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ question: '编辑后的追问', sourceIntent: 'web' }),
    });
    assert.equal(edit.status, 200);
    const removable = await fetch(`${base}/api/qa/queue`, {
      method: 'POST', headers,
      body: JSON.stringify({ question: '要删除的问题', conversationId: 'synthetic-1', requestId: randomUUID() }),
    });
    const removableId = (await removable.json()).job.id;
    assert.equal((await fetch(`${base}/api/qa/queue/${removableId}`, { method: 'DELETE', headers })).status, 200);
    const list = await (await fetch(`${base}/api/qa/queue?conversationId=synthetic-1`, { headers })).json();
    assert.deepEqual(list.queue.map(item => item.question), ['编辑后的追问']);
    const other = await fetch(`${base}/api/qa/conversations`, { method: 'POST' });
    const otherCookie = other.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${base}/api/qa/queue/${job.id}/events`, { headers: { Cookie: otherCookie } })).status, 404);
    assert.deepEqual((await (await fetch(`${base}/api/qa/queue?conversationId=synthetic-2`, { headers: { Cookie: otherCookie } })).json()).queue, []);
    const next = await fetch(`${base}/api/qa/queue/${job.id}/events`, { headers: { Cookie: cookie } });
    assert.equal(next.status, 200);
    assert.equal(providerAsks.length, 1);
    releaseFirst();
    assert.match(await first.text(), /event: done/u);
    const nextStream = await next.text();
    assert.match(nextStream, /event: queue.status/u);
    assert.match(nextStream, /"question":"编辑后的追问"/u);
    assert.match(nextStream, /event: delta/u);
    assert.match(nextStream, /event: done/u);
    assert.equal(providerAsks.length, 2);
    assert.equal(providerAsks[1].body.question, '编辑后的追问');
    assert.equal(providerAsks[1].body.conversationId, 'synthetic-1');
    assert.equal(providerAsks[1].body.source_intent, 'web_requested');
    assert.equal(providerAsks[1].clientId, providerAsks[0].clientId);
    assert.notEqual(providerAsks[1].key, providerAsks[0].key);
    contractEnabled = false;
    const refused = await fetch(`${base}/api/qa/queue`, {
      method: 'POST', headers,
      body: JSON.stringify({ question: '旧合同不可排队', conversationId: 'synthetic-1', requestId: randomUUID() }),
    });
    assert.equal(refused.status, 409);
    assert.equal((await refused.json()).code, 'provider_contract_incompatible');
    assert.equal(providerAsks.length, 2);
    assert.equal(statSync(join(runtimeDir, 'queued-turns.json')).mode & 0o777, 0o600);
  } finally {
    releaseFirst(); child.kill(); provider.close(); rmSync(runtimeDir, { recursive: true, force: true });
  }
});

async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; server.close(); await once(server, 'close'); return port;
}

async function waitFor(url) {
  for (let i = 0; i < 40; i++) {
    try { const response = await fetch(url); if (response.status) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Demo server did not start');
}
