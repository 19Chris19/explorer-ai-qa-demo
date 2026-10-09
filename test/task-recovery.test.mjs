import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
async function until(check) {
  for (let n = 0; n < 160; n++) { if (await check()) return; await delay(25); }
  assert.fail('synthetic condition did not settle');
}

async function fixture(t) {
  const state = { postMode: 'ok', lookupMode: 'ok', deleteMode: 'ok', snapshotMode: 'ok', eventsMode: 'hang', status: 'queued', posts: 0, deletes: 0, snapshots: 0, tasks: new Map(), held: [] };
  const upstream = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://synthetic');
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname === '/healthz') return json(200, {});
    if (url.pathname === '/internal/provider-a/capacity') return json(200, { schemaVersion: 1, features: { knowledge_agent_keyed_sse_v1: true, durable_qa_tasks_v1: true }, policies: { knowledge_agent: { max_concurrent: 5 } } });
    if (url.pathname === '/api/conversations') return json(200, req.method === 'POST' ? { conversation: { conversationId: randomUUID() } } : { conversations: [] });
    if (!url.pathname.startsWith('/internal/provider-a/tasks')) return json(404, {});
    const owner = req.headers['x-ima-client-id'];
    if (req.method === 'POST') {
      state.posts++;
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      if (state.postMode === 'reject') return json(429, { error: 'synthetic rejection' });
      const task = { id: randomUUID(), conversationId: body.conversationId, status: state.status, requestKey: req.headers['idempotency-key'] };
      state.tasks.set(task.id, { owner, task });
      if (state.postMode === 'truncated') { res.writeHead(202, { 'Content-Type': 'application/json' }); res.end('{'); return; }
      if (state.postMode === 'disconnect') { res.destroy(); return; }
      if (state.postMode === 'hold') {
        res.writeHead(202, { 'Content-Type': 'application/json' }); res.flushHeaders();
        state.held.push(() => res.end(JSON.stringify({ task }))); return;
      }
      return json(202, { task });
    }
    if (url.pathname === '/internal/provider-a/tasks') {
      if (state.lookupMode === 'truncated') { res.end('{'); return; }
      return json(200, { tasks: state.lookupMode === 'empty' ? [] : [...state.tasks.values()].filter(row => row.owner === owner && (!url.searchParams.has('requestKey') || row.task.requestKey === url.searchParams.get('requestKey'))).map(row => row.task) });
    }
    const row = state.tasks.get(url.pathname.split('/')[4]);
    if (!row || row.owner !== owner) return json(404, {});
    if (req.method === 'DELETE') {
      state.deletes++;
      if (state.deleteMode === 'fail') return json(503, {});
      row.task.status = 'cancelled'; return json(200, { task: row.task });
    }
    if (url.pathname.endsWith('/events')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (state.eventsMode === 'done') {
        row.task.status = 'succeeded';
        res.end('id: 1\nevent: done\ndata: {}\n\n'); return;
      }
      if (state.eventsMode === 'close') { res.end(); return; }
      res.write(': upstream-heartbeat\n\n');
      res.on('close', () => res.end()); return;
    }
    state.snapshots++;
    if (state.snapshotMode === 'truncated') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{'); return; }
    return json(200, { task: row.task, snapshot: { events: [] } });
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const free = createServer(); free.listen(0, '127.0.0.1'); await once(free, 'listening');
  const port = free.address().port; await new Promise(resolve => free.close(resolve));
  const runtime = mkdtempSync(join(tmpdir(), 'task-recovery-'));
  const base = `http://127.0.0.1:${port}`;
  let child, headers;
  const stop = async () => { if (child) { const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit; child = null; } };
  const start = async () => {
    child = spawn(process.execPath, ['server.mjs'], { cwd: root, stdio: 'ignore', env: {
      ...process.env, PORT: String(port), DEMO_RUNTIME_DIR: runtime, DEMO_COOKIE_SECRET: 'synthetic-cookie',
      PROVIDER_A_BASE_URL: `http://127.0.0.1:${upstream.address().port}`, PROVIDER_A_API_TOKEN: 'synthetic-api',
      PROVIDER_A_INTERNAL_SERVICE_TOKEN: 'synthetic-service', PROVIDER_A_KNOWLEDGE_SCOPE_REF: 'a'.repeat(64),
    } });
    await until(async () => { try { return (await fetch(base + '/api/qa/health')).ok; } catch { return false; } });
  };
  t.after(async () => { await stop(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); rmSync(runtime, { recursive: true, force: true }); });
  await start();
  const conversation = async () => {
    const response = await fetch(base + '/api/qa/conversations', { method: 'POST', headers });
    if (!headers) headers = { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: base, 'Content-Type': 'application/json', 'X-Explorer-Preview-Visitor': 'a'.repeat(64) };
    return (await response.json()).conversation.conversationId;
  };
  const input = async () => ({ conversationId: await conversation(), question: 'synthetic question', requestId: randomUUID() });
  const request = (route, method = 'GET', body) => fetch(base + '/api/qa/' + route, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const rows = file => { try { return JSON.parse(readFileSync(join(runtime, file), 'utf8')); } catch { return []; } };
  return { state, stop, start, input, request, rows };
}

test('queued cancellation during readiness cannot dispatch a POST', async () => {
  const source = readFileSync(join(root, 'server.mjs'), 'utf8');
  const functionSource = source.slice(source.indexOf('async function dispatchQueuedTurn('), source.indexOf('\nasync function proxy('));
  let ready, posts = 0, intents = 0;
  const controller = new AbortController();
  const dispatch = runInNewContext(`(${functionSource})`, {
    nativeSessions: { belongsToNative: () => true }, taskWatchStore: { findRequest: () => null },
    provider: { readiness: () => new Promise(resolve => { ready = resolve; }) },
    turnQueue: { markSubmitting: () => intents++ }, postTaskOnce: () => posts++,
  });
  const pending = dispatch({ clientId: 'synthetic', conversationId: 'synthetic', requestId: randomUUID() }, () => {}, controller.signal);
  controller.abort(); ready({ authenticated: true, durableTasksSupported: true });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(posts, 0); assert.equal(intents, 0);
});

test('ambiguous direct POST and pending DELETE survive two restarts without repost or false cancellation', async t => {
  const f = await fixture(t); const input = await f.input();
  f.state.postMode = 'truncated'; f.state.lookupMode = 'empty'; f.state.deleteMode = 'fail';
  assert.equal((await f.request('tasks', 'POST', input)).status, 503);
  assert.equal(f.rows('task-watch.json')[0].status, 'unconfirmed');
  assert.equal((await f.request('tasks', 'POST', input)).status, 503);
  assert.equal(f.state.posts, 1);
  await f.stop(); await f.start();
  await delay(550); assert.equal(f.state.posts, 1);
  f.state.lookupMode = 'ok';
  await until(() => f.rows('task-watch.json')[0]?.taskId);
  const task = [...f.state.tasks.values()][0].task;
  const cancel = await f.request('tasks/' + task.id, 'DELETE');
  assert.equal(cancel.status, 202); assert.equal((await cancel.json()).cancelPending, true);
  assert.equal(task.status, 'queued');
  assert.equal(f.rows('task-watch.json')[0].cancelRequested, true);
  assert.equal(f.rows('task-watch.json')[0].status, 'queued');
  await f.stop(); f.state.deleteMode = 'ok'; await f.start();
  await until(() => f.rows('task-watch.json')[0]?.status === 'cancelled');
  assert.equal(task.status, 'cancelled'); assert.equal(f.state.posts, 1);
});

test('ambiguous queued submission and unresolved cancellation recover by GET after restart', async t => {
  const f = await fixture(t); const input = await f.input();
  f.state.postMode = 'disconnect'; f.state.lookupMode = 'empty';
  const submitted = await f.request('queue', 'POST', input); assert.equal(submitted.status, 202);
  const { job } = await submitted.json();
  await until(() => f.state.posts === 1 && f.rows('queued-turns.json')[0]?.submissionStarted);
  await f.stop(); await f.start();
  await delay(550); assert.equal(f.state.posts, 1);
  const cancel = await f.request('queue/' + job.id, 'DELETE'); assert.equal(cancel.status, 202);
  assert.equal((await cancel.json()).removed, false);
  assert.equal(f.rows('queued-turns.json')[0].cancelRequested, true);
  await f.stop(); f.state.lookupMode = 'ok'; await f.start();
  await until(() => [...f.state.tasks.values()][0].task.status === 'cancelled');
  await until(() => f.rows('queued-turns.json').length === 0);
  assert.equal(f.state.posts, 1);
  assert.equal(f.rows('task-watch.json')[0].status, 'cancelled');
});

test('truncated snapshot observation never fails or drops an accepted queued task', async t => {
  const f = await fixture(t); const input = await f.input();
  f.state.eventsMode = 'close'; f.state.snapshotMode = 'truncated';
  const { job } = await (await f.request('queue', 'POST', input)).json();
  await until(() => f.state.snapshots >= 2);
  assert.equal(f.rows('queued-turns.json')[0].status, 'running');
  assert.equal((await (await f.request('queue?conversationId=' + input.conversationId)).json()).queue[0].id, job.id);
  assert.equal(f.state.posts, 1);
  f.state.eventsMode = 'done';
  await until(() => f.rows('queued-turns.json').length === 0);
  assert.equal(f.rows('task-watch.json')[0].status, 'succeeded');
});

test('public pending budget covers both entry points, distinct lanes and a held POST body', async t => {
  const f = await fixture(t);
  for (let n = 0; n < 7; n++) {
    const input = await f.input();
    assert.equal((await f.request(n % 2 ? 'queue' : 'tasks', 'POST', input)).status, 202);
  }
  await until(() => f.state.posts === 7);
  f.state.postMode = 'hold'; f.state.lookupMode = 'empty';
  const eighth = await f.input();
  const pending = f.request('tasks', 'POST', eighth);
  await until(() => f.state.held.length === 1);
  assert.equal((await f.request('tasks', 'POST', eighth)).status, 503);
  assert.equal((await f.request('tasks', 'POST', { ...eighth, question: 'changed question' })).status, 409);
  const ninth = await f.input();
  assert.equal((await f.request('queue', 'POST', ninth)).status, 429);
  assert.equal((await f.request('tasks', 'POST', ninth)).status, 429);
  assert.equal(f.state.posts, 8);
  f.state.held[0](); assert.equal((await pending).status, 202);
});

test('definitive direct rejection releases its lane and retains a non-replay receipt', async t => {
  const f = await fixture(t); const input = await f.input();
  f.state.postMode = 'reject';
  assert.equal((await f.request('tasks', 'POST', input)).status, 429);
  await delay(650);
  assert.equal(f.rows('task-watch.json')[0].status, 'rejected');
  assert.equal((await f.request('tasks', 'POST', input)).status, 429);
  assert.equal(f.state.posts, 1);
  f.state.postMode = 'ok'; f.state.eventsMode = 'done';
  const next = { ...input, requestId: randomUUID() };
  assert.equal((await f.request('queue', 'POST', next)).status, 202);
  await until(() => f.state.posts === 2);
  await until(() => f.rows('queued-turns.json').length === 0);
});
