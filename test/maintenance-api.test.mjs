import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, chmodSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transitionMaintenance, checkMaintenance } from '../maintenance-gate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    try { const result = await fn(); if (result) return result; } catch {}
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error('synthetic condition timeout');
}

test('private CLI closes live synthetic BFF; existing queue drains, counters settle after disconnect, no public control', async t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'synthetic-bff-maintenance-'))); chmodSync(dir, 0o700);
  const state = join(dir, 'maintenance.json');
  transitionMaintenance(state, 'close', { generation: 0, operationId: 'synthetic-initial' });
  transitionMaintenance(state, 'open', { generation: 1, operationId: 'synthetic-initial' });
  let conversations = 0;
  const asks = [];
  const releases = [];
  const tasks = new Map();
  const provider = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/healthz') return res.end('{"ok":true}');
    if (req.url === '/api/conversations?limit=1' || req.url === '/api/conversations?limit=50') return res.end('{"conversations":[]}');
    if (req.url === '/internal/provider-a/capacity') return res.end(JSON.stringify({ schemaVersion: 1,
      policies: { knowledge_agent: { max_concurrent: 1 } }, features: { knowledge_agent_keyed_sse_v1: true, durable_qa_tasks_v1: true } }));
    if (req.url === '/api/conversations' && req.method === 'POST') {
      res.statusCode = 201; return res.end(JSON.stringify({ conversation: { conversationId: `synthetic-${++conversations}` } }));
    }
    if (req.url.startsWith('/api/conversations/') && req.method === 'DELETE') return res.end('{"success":true}');
    if (req.url === '/internal/provider-a/tasks' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks)); asks.push(body);
      let release; const waiting = new Promise(resolve => { release = resolve; }); releases.push(release);
      const task = { id: randomUUID(), conversationId: body.conversationId, status: 'running' };
      tasks.set(task.id, { task, waiting });
      res.statusCode = 202; res.end(JSON.stringify({ task })); return;
    }
    const match = /^\/internal\/provider-a\/tasks\/([^/]+)\/events\?after=0$/u.exec(req.url);
    if (match) {
      const { task, waiting } = tasks.get(match[1]);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('id: 1\nevent: delta\ndata: {"text":"synthetic"}\n\n');
      await waiting; task.status = 'succeeded';
      res.end(`id: 2\nevent: done\ndata: ${JSON.stringify({ conversationId: task.conversationId })}\n\n`); return;
    }
    if (req.url === '/internal/provider-a/deep-ask') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks)); asks.push(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`event: conversation\ndata: ${JSON.stringify({ conversationId: body.conversationId })}\n\n`);
      res.write('event: delta\ndata: {"text":"synthetic"}\n\n');
      let release;
      const waiting = new Promise(resolve => { release = resolve; }); releases.push(release);
      res.once('close', release); await waiting;
      res.end(`event: done\ndata: ${JSON.stringify({ conversationId: body.conversationId, source_count: 1 })}\n\n`);
      return;
    }
    res.statusCode = 404; res.end('{}');
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; reserve.close(); await once(reserve, 'close');
  const env = { ...process.env, PORT: String(port), DEMO_RUNTIME_DIR: join(dir, 'runtime'), DEMO_COOKIE_SECRET: 'synthetic-cookie',
    DEMO_MAINTENANCE_STATE_PATH: state, PROVIDER_A_HISTORY_ARCHIVE_PATH: '',
    PROVIDER_A_BASE_URL: `http://127.0.0.1:${provider.address().port}`, PROVIDER_A_API_TOKEN: 'synthetic-token',
    PROVIDER_A_INTERNAL_SERVICE_TOKEN: 'synthetic-service-token', PROVIDER_A_KNOWLEDGE_SCOPE_REF: 'a'.repeat(64) };
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env, stdio: 'ignore' });
  t.after(async () => {
    for (const release of releases) release();
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  await until(async () => (await fetch(`${base}/api/qa/health`)).ok);
  const created = await fetch(`${base}/api/qa/conversations`, { method: 'POST' });
  const cookie = created.headers.get('set-cookie').split(';')[0]; await created.json();
  const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-Explorer-Preview-Visitor': 'b'.repeat(64) };
  await (await fetch(`${base}/api/qa/conversations`, { method: 'POST', headers })).json();
  const submit = (route, conversationId, signal) => fetch(`${base}/api/qa/${route}`, {
    method: 'POST', headers, signal, body: JSON.stringify({ conversationId, question: 'synthetic', requestId: randomUUID() }),
  });
  const first = await submit('ask', 'synthetic-1');
  assert.equal(first.status, 200);
  const pending = await (await submit('queue', 'synthetic-1')).json();
  const waiting = await (await submit('queue', 'synthetic-2')).json();
  const cli = (...args) => spawnSync(process.execPath, ['scripts/maintenance.mjs', ...args], { cwd: root, env, encoding: 'utf8' });
  assert.equal(cli('close', '--generation', '2', '--operation-id', 'synthetic-drain').status, 0);
  const observed = await until(() => {
    const result = checkMaintenance(state);
    return result.state.generation === 3 && result.snapshot.running === 1 && result;
  });
  assert.equal(observed.snapshot.activeDirect, 1);
  assert.equal(observed.snapshot.running, 1);
  assert.equal(observed.snapshot.pending, 1);
  assert.equal(observed.snapshot.inflight, 1);
  assert.equal(observed.snapshot.previewWaiters, 0);
  assert.equal(observed.drained, false);
  for (const route of ['ask', 'queue', 'conversations']) {
    const response = await submit(route, 'synthetic-1');
    assert.equal(response.status, 503); assert.equal(response.headers.get('retry-after'), '30');
    assert.deepEqual(await response.json(), { error: '问答服务维护中，请稍后重试。' });
  }
  assert.equal((await fetch(`${base}/api/qa/conversations`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/api/qa/queue?conversationId=synthetic-1`, { headers })).status, 200);
  for (const path of ['/api/qa/maintenance', '/maintenance.json', '/maintenance-gate.mjs', '/scripts/maintenance.mjs']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  const events = await fetch(`${base}/api/qa/queue/${pending.job.id}/events`, { headers });
  const waitingEvents = await fetch(`${base}/api/qa/queue/${waiting.job.id}/events`, { headers });
  releases[0](); assert.match(await first.text(), /event: done/u);
  await until(() => asks.length >= 2); releases[1]();
  await until(() => asks.length === 3); releases[2]();
  assert.match(await events.text(), /event: done/u); await waitingEvents.text();
  await until(() => checkMaintenance(state).drained);
  // A busy full-suite run may age the private snapshot between two processes.
  // Keep the production freshness bound and wait for a new valid observation.
  await until(() => cli('check').status === 0);
  assert.equal(cli('open', '--generation', '3', '--operation-id', 'synthetic-drain').status, 0);
  const controller = new AbortController();
  const broken = await submit('ask', 'synthetic-1', controller.signal);
  const paused = await (await submit('queue', 'synthetic-1')).json();
  assert.equal(cli('close', '--generation', '4', '--operation-id', 'synthetic-disconnect').status, 0);
  controller.abort(); await broken.text().catch(() => {});
  const after = await until(() => {
    const result = checkMaintenance(state);
    return result.snapshot.inflight === 0 && result.snapshot.activeDirect === 0 && result.snapshot.paused === 1 && result;
  });
  assert.equal(after.snapshot.previewActive, 0); assert.equal(after.drained, false);
  assert.equal((await fetch(`${base}/api/qa/queue/${paused.job.id}`, { method: 'DELETE', headers })).status, 200);
  await until(() => checkMaintenance(state).drained);
  assert.equal((await fetch(`${base}/api/qa/conversations/synthetic-1`, { method: 'DELETE', headers })).status, 200);
  writeFileSync(state, '{invalid');
  assert.equal((await submit('ask', 'synthetic-1')).status, 503);
  assert.notEqual(cli('check').status, 0);
});
