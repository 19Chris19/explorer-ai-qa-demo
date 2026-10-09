import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { followTask, relayTaskEvents } from '../durable-task-bridge.mjs';
import { allowedPreviewRoute } from '../preview-gateway.mjs';

const packet = (id, event, data) => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

test('rotated watchers resume from cursor without POST and preserve whitespace', async () => {
  const calls = []; const output = [];
  const provider = { request: async args => {
    calls.push(args);
    if (args.route.endsWith('after=0')) return new Response(packet(1, 'delta', { text: '  | A | B |\n' }), { headers: { 'Content-Type': 'text/event-stream' } });
    if (args.route.endsWith('after=1')) return new Response(packet(1, 'delta', { text: 'duplicate' }) + packet(2, 'done', { conversationId: 'synthetic' }), { headers: { 'Content-Type': 'text/event-stream' } });
    return Response.json({ task: { status: 'running' }, snapshot: { events: [] } });
  } };
  await followTask(provider, { clientId: 'synthetic', taskId: 'one', emit: chunk => output.push(chunk.toString()), retryMs: 1 });
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.equal(output.length, 2);
  assert.match(output[0], /  \| A \| B \|\\n/u);
  assert.ok(!output.join('').includes('duplicate'));
});

test('explicit stop alone issues DELETE', async () => {
  const calls = []; const controller = new AbortController(); controller.abort();
  await assert.rejects(followTask({ request: async args => { calls.push(args); return Response.json({}); } }, { clientId: 'synthetic', taskId: 'one', emit() {}, signal: controller.signal }), /cancelled/u);
  assert.deepEqual(calls.map(call => call.method), ['DELETE']);
});

test('retained successful history receipt completes observation after event expiry', async () => {
  const calls = [];
  await followTask({ request: async args => {
    calls.push(args);
    if (args.route.includes('/events')) return Response.json({}, { status: 410 });
    return Response.json({ task: { id: 'expired-one', status: 'succeeded', eventsExpired: true, history: { taskId: 'expired-one', conversationId: 'synthetic' } }, snapshot: { events: [] } });
  } }, { clientId: 'synthetic', taskId: 'expired-one', emit() { assert.fail('Expired events must not be fabricated'); }, retryMs: 1 });
  assert.deepEqual(calls.map(call => call.method), ['GET', 'GET']);
});

test('subscriber expiry aborts only the observation GET, never the task', async t => {
  const calls = [];
  const provider = { request: async args => {
    calls.push(args);
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(': connected\n\n'));
      args.signal.addEventListener('abort', () => controller.close(), { once: true });
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
  } };
  const server = createServer((req, res) => { void relayTaskEvents(provider, { req, res, clientId: 'synthetic', route: '/api/tasks/one/events?after=0', rotationMs: 60, heartbeatMs: 10 }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}`);
  assert.match(await response.text(), /transport-heartbeat/u);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].signal.aborted, true);
});

test('public task allowlist admits only supported methods and exact routes', () => {
  assert.equal(allowedPreviewRoute('/api/qa/tasks', 'POST'), true);
  assert.equal(allowedPreviewRoute('/api/qa/tasks/one/events', 'GET'), true);
  assert.equal(allowedPreviewRoute('/api/qa/tasks/one/events', 'DELETE'), false);
  assert.equal(allowedPreviewRoute('/api/qa/tasks/one', 'DELETE'), true);
  for (const path of ['/internal/provider-a/tasks', '/admin', '/api/qa/tasks/one/debug']) assert.equal(allowedPreviewRoute(path, 'GET'), false);
});
