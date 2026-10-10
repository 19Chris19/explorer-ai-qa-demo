import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('BFF submits durable tasks, isolates visitors and does not cancel on browser disconnect', async () => {
  const tasks = new Map(); const calls = []; let enabled = true;
  const provider = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://synthetic');
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname === '/healthz') return json(200, {});
    if (url.pathname === '/internal/provider-a/capacity') return json(200, { schemaVersion: 1, features: { knowledge_agent_keyed_sse_v1: true, durable_qa_tasks_v1: enabled }, policies: { knowledge_agent: { max_concurrent: 5 } } });
    if (url.pathname === '/api/conversations') return json(200, req.method === 'POST' ? { conversation: { conversationId: randomUUID() } } : { conversations: [] });
    if (!url.pathname.startsWith('/internal/provider-a/tasks')) return json(404, {});
    assert.equal(req.headers.authorization, 'Bearer synthetic-service');
    const owner = req.headers['x-ima-client-id'];
    calls.push({ method: req.method, path: url.pathname });
    if (url.pathname === '/internal/provider-a/tasks' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      assert.equal(body.retrieval_policy, 'knowledge_agent');
      const requestKey = req.headers['idempotency-key'];
      let row = [...tasks.values()].find(item => item.owner === owner && item.task.requestKey === requestKey);
      if (!row) { row = { owner, task: { id: randomUUID(), conversationId: body.conversationId, status: 'running', lastEventId: 1, requestKey } }; tasks.set(row.task.id, row); }
      return json(202, { task: row.task });
    }
    if (url.pathname === '/internal/provider-a/tasks') return json(200, { tasks: [...tasks.values()].filter(row => row.owner === owner && (!url.searchParams.has('requestKey') || row.task.requestKey === url.searchParams.get('requestKey'))).map(row => row.task) });
    const id = url.pathname.split('/')[4]; const row = tasks.get(id);
    if (!row || row.owner !== owner) return json(404, {});
    if (req.method === 'DELETE') { row.task.status = 'cancelled'; return json(200, { task: row.task }); }
    if (url.pathname.endsWith('/events')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('id: 1\nevent: delta\ndata: {"text":"  合成表格\\n"}\n\n');
      req.on('close', () => res.end()); return;
    }
    return json(200, { task: row.task, snapshot: { events: [] } });
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  const portServer = createServer(); portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening');
  const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
  const runtime = mkdtempSync(join(tmpdir(), 'durable-bff-'));
  const child = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'ignore', env: {
    ...process.env, PORT: String(port), DEMO_RUNTIME_DIR: runtime, DEMO_COOKIE_SECRET: 'synthetic-cookie',
    PROVIDER_A_BASE_URL: `http://127.0.0.1:${provider.address().port}`, PROVIDER_A_API_TOKEN: 'synthetic-api', PROVIDER_A_INTERNAL_SERVICE_TOKEN: 'synthetic-service', PROVIDER_A_KNOWLEDGE_SCOPE_REF: 'a'.repeat(64),
  } });
  const base = `http://127.0.0.1:${port}`;
  try {
    let healthy;
    for (let i = 0; i < 80; i++) { try { healthy = await fetch(`${base}/api/qa/health`); if (healthy.ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.equal((await healthy.json()).durableTasksSupported, true);
    const conversation = await fetch(`${base}/api/qa/conversations`, { method: 'POST' });
    const headers = { Cookie: conversation.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json', Origin: base, 'X-Explorer-Preview-Visitor': 'a'.repeat(64) };
    const conversationId = (await conversation.json()).conversation.conversationId;
    const input = { question: '合成问题', conversationId, requestId: randomUUID() };
    const submit = async body => fetch(`${base}/api/qa/tasks`, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal((await submit({ ...input, retrieval_policy: 'injected' })).status, 400);
    const first = await submit(input); assert.equal(first.status, 202);
    const task = (await first.json()).task;
    assert.equal((await (await submit(input)).json()).task.id, task.id);
    assert.equal(tasks.size, 1);
    const found = await (await fetch(`${base}/api/qa/tasks?requestId=${input.requestId}`, { headers })).json();
    assert.equal(found.tasks[0].id, task.id);
    assert.equal((await fetch(`${base}/api/qa/tasks/${task.id}`)).status, 404);
    const controller = new AbortController();
    const stream = await fetch(`${base}/api/qa/tasks/${task.id}/events`, { headers, signal: controller.signal });
    assert.equal(stream.status, 200); await stream.body.getReader().read(); controller.abort();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(calls.filter(call => call.method === 'DELETE').length, 0);
    assert.equal((await (await fetch(`${base}/api/qa/tasks/${task.id}`, { headers })).json()).task.status, 'running');
    // A second conversation can be accepted while the first is running.
    const other = await fetch(`${base}/api/qa/conversations`, { method: 'POST', headers });
    assert.equal((await submit({ ...input, requestId: randomUUID(), conversationId: (await other.json()).conversation.conversationId })).status, 202);
    assert.equal(tasks.size, 2);
    assert.equal((await fetch(`${base}/api/qa/tasks/${task.id}`, { method: 'DELETE', headers })).status, 200);
    assert.equal(calls.filter(call => call.method === 'DELETE').length, 1);
    enabled = false;
    const legacyHealth = await (await fetch(`${base}/api/qa/health`)).json();
    assert.equal(legacyHealth.connected, true);
    assert.equal(legacyHealth.authenticated, true);
    assert.equal(legacyHealth.contractSupported, true);
    assert.equal(legacyHealth.capacity, 5);
    assert.equal(legacyHealth.durableTasksSupported, false);
    assert.equal(legacyHealth.ready, false);
    assert.equal((await submit({ ...input, requestId: randomUUID() })).status, 409);
    assert.equal(tasks.size, 2);
  } finally {
    child.kill(); await once(child, 'exit'); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); rmSync(runtime, { recursive: true, force: true });
  }
});
