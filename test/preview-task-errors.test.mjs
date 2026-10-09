import test from 'node:test';
import assert from 'node:assert/strict';
import { proxy } from '../preview/api/proxy.mjs';
import { createTaskClient, createTaskStore } from '../public/task-stream.mjs';

const task = { id: 'synthetic-task', conversationId: 'synthetic-conversation', requestId: 'synthetic-request', status: 'running', lastEventId: 0 };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const snapshot = (status = 'running', extra = {}) => ({ task: { ...task, status, ...extra }, snapshot: { events: [] } });
const privateError = { code: 'synthetic-private-code', error: 'synthetic-private-error', message: 'synthetic-private-message' };

function fixture(t, upstream) {
  const saved = { fetch: globalThis.fetch, key: process.env.PREVIEW_ORIGIN_KEY, url: process.env.PREVIEW_ORIGIN_URL };
  process.env.PREVIEW_ORIGIN_KEY = 'synthetic-key-123456789012345678901234';
  process.env.PREVIEW_ORIGIN_URL = 'https://synthetic.example/';
  t.after(() => {
    globalThis.fetch = saved.fetch;
    for (const [name, value] of [['PREVIEW_ORIGIN_KEY', saved.key], ['PREVIEW_ORIGIN_URL', saved.url]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  const calls = [], responses = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ path: new URL(url).pathname, method: options.method });
    return upstream(new URL(url), options);
  };
  const request = async (url, options = {}) => {
    const input = new URL(url, 'https://website.example');
    const target = new URL('https://website.example/api/proxy');
    target.searchParams.set('path', input.pathname.slice(1));
    for (const [key, value] of input.searchParams) target.searchParams.set(key, value);
    const headers = new Headers({ origin: input.origin, ...options.headers });
    const response = await proxy(new Request(target, { ...options, headers }));
    const body = response.ok ? null : await response.clone().json();
    if (body) assert.doesNotMatch(JSON.stringify(body), /synthetic-private|NGROK/);
    responses.push({ path: input.pathname, status: response.status, ...(body ? { code: body.code } : {}) });
    return response;
  };
  const client = options => createTaskClient({ fetch: request, delay: async () => {}, ...options });
  return { request, client, calls, responses };
}

test('cross-proxy events 410 preserves expiry code and recovers the expired snapshot with GET only', async t => {
  let reads = 0;
  const f = fixture(t, url => url.pathname.endsWith('/events') ? json(privateError, 410)
    : json(++reads === 1 ? snapshot() : snapshot('succeeded', { eventsExpired: true, history: { conversationId: task.conversationId, taskId: task.id } })));
  const result = await f.client().subscribe(task, { signal: new AbortController().signal });
  assert.equal(result.eventsExpired, true);
  assert.equal(result.task.history.taskId, task.id);
  assert.equal(reads, 2);
  assert.equal(f.responses[1].status, 410);
  assert.equal(f.responses[1].code, 'task_events_expired');
  assert.deepEqual(f.calls.map(call => call.method), ['GET', 'GET', 'GET']);
});

test('cross-proxy cursor 409 preserves mismatch code and recovers from a fresh snapshot', async t => {
  let reads = 0;
  const f = fixture(t, url => url.pathname.endsWith('/events') ? json(privateError, 409)
    : json(++reads === 1 ? snapshot() : snapshot('cancelled')));
  const result = await f.client().subscribe(task, { signal: new AbortController().signal });
  assert.equal(result.task.status, 'cancelled');
  assert.equal(f.responses[1].status, 409);
  assert.equal(f.responses[1].code, 'task_cursor_mismatch');
  assert.deepEqual(f.calls.map(call => call.method), ['GET', 'GET', 'GET']);
});

for (const queue of [false, true]) {
  test(`cross-proxy POST 409 rejects without lookup or repost (queue: ${queue})`, async t => {
    const f = fixture(t, () => json(privateError, 409));
    const store = createTaskStore();
    await assert.rejects(f.client({ store }).submit({ ...task, question: 'synthetic question' }, { queue }), { status: 409 });
    assert.deepEqual(f.calls.map(call => call.method), ['POST']);
    assert.equal(f.responses[0].code, 'task_request_conflict');
    assert.deepEqual(store.list(), []);
  });
}

test('cross-proxy DELETE 202 preserves pending cancellation without claiming a terminal outcome', async t => {
  const pending = { cancelPending: true, taskId: task.id };
  const f = fixture(t, () => json(pending, 202));
  assert.deepEqual(await f.client().cancel(task.id), pending);
  assert.deepEqual(f.calls.map(call => call.method), ['DELETE']);
});

test('cross-proxy DELETE 503 stays unconfirmed until the snapshot confirms cancellation', async t => {
  const f = fixture(t, (_url, options) => options.method === 'DELETE' ? json(privateError, 503) : json(snapshot('cancelled')));
  const client = f.client();
  await assert.rejects(client.cancel(task.id), { status: 503 });
  assert.equal(f.responses[0].code, 'task_request_unconfirmed');
  const result = await client.subscribe(task, { signal: new AbortController().signal });
  assert.equal(result.task.status, 'cancelled');
  assert.deepEqual(f.calls.map(call => call.method), ['DELETE', 'GET']);
});

test('cross-proxy split SSE error and cancelled status retain the authoritative terminal state', async t => {
  const f = fixture(t, url => url.pathname.endsWith('/events') ? new Response(new ReadableStream({ start(controller) {
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode('id: 1\nevent: error\ndata: {"code":"task_cancelled"}\n\n'));
    controller.enqueue(encoder.encode('id: 2\nevent: task.status\ndata: {"status":"cancelled"}\n\n'));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } }) : json(snapshot()));
  const result = await f.client().subscribe(task, { signal: new AbortController().signal });
  assert.equal(result.task.status, 'cancelled');
  assert.equal(result.cursor, 2);
  assert.deepEqual(f.calls.map(call => call.method), ['GET', 'GET']);
});

test('only known JSON API errors may retain 410, never tunnel, SSE, asset or invalid content types', async t => {
  let headers = {};
  const f = fixture(t, () => json(privateError, 410, headers));
  assert.equal((await f.request(`/api/qa/tasks/${task.id}`)).status, 410);
  assert.equal(f.responses.at(-1).code, 'task_request_unconfirmed');
  assert.equal((await f.request('/api/qa/health')).status, 410);
  assert.equal(f.responses.at(-1).code, 'preview_410');
  for (headers of [{ 'ngrok-error-code': 'ERR_NGROK_3200' }, { 'Content-Type': 'text/html' }, { 'Content-Type': 'text/event-stream' }]) {
    assert.equal((await f.request(`/api/qa/tasks/${task.id}/events`)).status, 503);
    assert.equal(f.responses.at(-1).code, 'preview_503');
  }
  headers = {};
  assert.equal((await f.request('/questions.json')).status, 503);
  assert.equal(f.responses.at(-1).code, 'preview_503');
});

test('maintenance Retry-After, unknown-error masking and admission restrictions remain intact', async t => {
  const f = fixture(t, () => json(privateError, 503, { 'Retry-After': '30', 'X-Private-Metadata': 'synthetic-private-header' }));
  const response = await f.request('/api/qa/tasks', { method: 'POST', body: '{}' });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '30');
  assert.equal(response.headers.get('x-private-metadata'), null);
  assert.equal(f.responses.at(-1).code, 'task_request_unconfirmed');
  const before = f.calls.length;
  for (const path of ['/internal/provider-a/tasks', '/admin', '/api/qa/tasks/unknown/extra']) {
    assert.equal((await f.request(path)).status, 404);
  }
  assert.equal((await f.request('/api/qa/tasks', { method: 'POST', headers: { origin: 'https://other.example' }, body: '{}' })).status, 403);
  const key = process.env.PREVIEW_ORIGIN_KEY;
  delete process.env.PREVIEW_ORIGIN_KEY;
  assert.equal((await f.request(`/api/qa/tasks/${task.id}/events`)).status, 503);
  process.env.PREVIEW_ORIGIN_KEY = key;
  assert.equal(f.calls.length, before);
});

test('machine codes depend only on exact endpoint, method and original HTTP status', async t => {
  let upstreamStatus = 500;
  const f = fixture(t, () => json({ ...privateError, code: 'task_events_expired' }, upstreamStatus));
  for (const [path, method, status, expectedStatus, code] of [
    [`/api/qa/tasks/${task.id}/events`, 'GET', 500, 503, 'preview_503'],
    [`/api/qa/tasks/${task.id}/events`, 'GET', 503, 503, 'task_subscription_unavailable'],
    [`/api/qa/tasks/${task.id}`, 'DELETE', 409, 409, 'preview_409'],
    ['/api/qa/tasks', 'GET', 503, 503, 'preview_503'],
    ['/api/qa/tasks', 'POST', 410, 410, 'preview_410'],
    ['/api/qa/tasks', 'POST', 429, 429, 'preview_429'],
  ]) {
    upstreamStatus = status;
    const response = await f.request(path, { method, ...(method === 'POST' ? { body: '{}' } : {}) });
    assert.equal(response.status, expectedStatus);
    assert.equal(f.responses.at(-1).code, code);
  }
});
