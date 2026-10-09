import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskClient, createTaskReplay, createTaskStore } from '../public/task-stream.mjs';

const task = { id: 'synthetic-task', conversationId: 'synthetic-conversation', requestId: 'synthetic-request', status: 'running', lastEventId: 0 };
const event = (id, name, data) => ({ id, event: name, data });
const delta = (id, text) => event(id, 'delta', { text });
const done = id => event(id, 'done', { conversationId: task.conversationId });
const status = (id, value) => event(id, 'task.status', { status: value });
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const snapshot = (events = [], state = 'running', lastEventId = events.at(-1)?.id || 0) => ({ task: { ...task, status: state, lastEventId }, snapshot: { events } });
const encode = value => new TextEncoder().encode(value);
const packet = item => `id: ${item.id}\nevent: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`;
const sse = (events, { open = false, signal } = {}) => new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(encode(': heartbeat\n\n' + events.map(packet).join('')));
    if (!open) controller.close();
    else signal?.addEventListener('abort', () => { try { controller.close(); } catch {} }, { once: true });
  },
}), { headers: { 'Content-Type': 'text/event-stream' } });

test('replay deduplicates overlap and extends a partial snapshot without duplicating text', () => {
  const replay = createTaskReplay(task);
  assert.equal(replay.snapshot(snapshot([delta(1, 'one')], 'running', 3)).text, 'one');
  assert.equal(replay.event(delta(1, 'one')).text, 'one');
  assert.equal(replay.event(delta(2, ' two')).text, 'one two');
  assert.equal(replay.snapshot(snapshot([delta(1, 'one'), delta(2, ' two'), done(3)])).text, 'one two');
  assert.equal(replay.snapshot(snapshot([status(4, 'succeeded')], 'succeeded')).cursor, 4);
  assert.throws(() => replay.event(delta(6, 'lost prefix')), /cursor_gap/);
  assert.throws(() => createTaskReplay(task).snapshot(snapshot([delta(2, 'suffix')])), /cursor_gap/);
});

test('stream rotation and network loss reconnect with GET to the same task and recover cursor conflict', async () => {
  const calls = [], views = [], connections = [];
  let reads = 0, streams = 0;
  const client = createTaskClient({ delay: async () => {}, fetch: async (url, options) => {
    calls.push({ url, method: options.method || 'GET' });
    if (!url.includes('/events')) {
      reads++;
      if (reads === 2) throw Error('synthetic offline');
      return json(snapshot(reads >= 4 ? [delta(1, 'A'), delta(2, 'B')] : reads >= 3 ? [delta(1, 'A')] : []));
    }
    streams++;
    if (streams === 1) return sse([delta(1, 'A')]);
    if (streams === 2) return new Response('{}', { status: 409 });
    return sse([delta(2, 'B'), delta(3, 'C'), done(4), status(5, 'succeeded')]);
  } });
  const result = await client.subscribe(task, { signal: new AbortController().signal,
    onUpdate: view => views.push(view.text), onConnection: phase => connections.push(phase) });
  assert.equal(result.text, 'ABC');
  assert.ok(views.every(text => ['', 'A', 'AB', 'ABC'].includes(text)));
  assert.ok(calls.some(call => call.url.endsWith('/events?after=2')));
  assert.ok(calls.every(call => call.method === 'GET' && call.url.includes(task.id)));
  assert.ok(connections.includes('reconnecting'));
});

test('terminal metadata with a partial snapshot still fetches missing events before settling', async () => {
  const client = createTaskClient({ fetch: async url => url.includes('/events')
    ? sse([delta(2, 'B'), done(3), status(4, 'succeeded')])
    : json(snapshot([delta(1, 'A')], 'succeeded', 4)) });
  const result = await client.subscribe(task, { signal: new AbortController().signal });
  assert.equal(result.text, 'AB');
  assert.equal(result.cursor, 4);
});

test('heartbeat timeout reconnects; detaching cancels only the view, never DELETE or POST', async () => {
  const calls = [];
  let streams = 0;
  const abort = new AbortController();
  const client = createTaskClient({ heartbeatTimeoutMs: 5, delay: async () => {}, fetch: async (url, options) => {
    calls.push(options.method || 'GET');
    if (!url.includes('/events')) return json(snapshot());
    if (++streams === 2) queueMicrotask(() => abort.abort());
    return sse([], { open: true, signal: options.signal });
  } });
  await assert.rejects(client.subscribe(task, { signal: abort.signal }), /detached/);
  assert.equal(streams, 2);
  assert.ok(calls.every(method => method === 'GET'));
});

test('explicit cancel sends DELETE; cancelled snapshot preserves partial text', async () => {
  const calls = [];
  const client = createTaskClient({ fetch: async (url, options) => {
    calls.push([url, options.method || 'GET']);
    return json(options.method === 'DELETE' ? { task: { ...task, status: 'cancelled' } }
      : snapshot([delta(1, 'partial'), status(2, 'cancelled')], 'cancelled'));
  } });
  await client.cancel(task.id);
  const result = await client.subscribe(task, { signal: new AbortController().signal });
  assert.equal(result.task.status, 'cancelled');
  assert.equal(result.text, 'partial');
  assert.deepEqual(calls.map(([, method]) => method), ['DELETE', 'GET']);
});

test('ambiguous POST uses requestId lookup, never submits twice, and persists identities only', async () => {
  let saved = '';
  const store = createTaskStore({ getItem: () => '', setItem: (_, value) => { saved = value; } }, 'synthetic-key');
  const calls = [];
  const client = createTaskClient({ store, fetch: async (url, options) => {
    calls.push([url, options.method || 'GET']);
    if (options.method === 'POST') throw Error('synthetic network loss after acceptance');
    return json({ tasks: [{ ...task, requestId: undefined, clientRequestId: task.requestId }] });
  } });
  const result = await client.submit({ question: 'synthetic confidential content', ...task });
  assert.equal(result.task.id, task.id);
  assert.deepEqual(calls.map(([, method]) => method), ['POST', 'GET']);
  assert.match(calls[1][0], /requestId=synthetic-request/);
  assert.doesNotMatch(saved, /confidential|question|status|text|token/);
  const restored = createTaskStore({ getItem: () => saved }, 'synthetic-key');
  assert.deepEqual(restored.list(), [{ conversationId: task.conversationId, requestId: task.requestId, id: task.id }]);
});

test('unresolved POST survives refresh and resolves only through reads', async () => {
  let saved;
  const store = createTaskStore({ getItem: () => null, setItem: (_, value) => { saved = value; } }, 'synthetic');
  let posts = 0;
  const client = createTaskClient({ store, fetch: async (_, options) => {
    if (options.method === 'POST') { posts++; throw Error('offline'); }
    return json({ tasks: [] });
  } });
  await assert.rejects(client.submit({ question: 'synthetic draft', conversationId: task.conversationId, requestId: task.requestId }), /submission_unknown/);
  const restored = createTaskStore({ getItem: () => saved }, 'synthetic');
  let reads = 0;
  const resumed = createTaskClient({ store: restored, delay: async () => {}, fetch: async (_, options) => {
    assert.notEqual(options.method, 'POST');
    return json({ tasks: ++reads > 1 ? [task] : [] });
  } });
  assert.equal((await resumed.resolve(restored.list()[0], { signal: new AbortController().signal })).id, task.id);
  assert.equal(posts, 1);
});

test('definitive POST 409 conflicts reject without looking up or adopting the original task', async () => {
  for (const queue of [false, true]) {
    const calls = [];
    const store = createTaskStore();
    const client = createTaskClient({ store, fetch: async (url, options) => {
      calls.push([url, options.method]);
      return options.method === 'POST'
        ? new Response(JSON.stringify({ error: 'request_fingerprint_conflict' }), { status: 409 })
        : json({ tasks: [task] });
    } });
    await assert.rejects(client.submit({ ...task, question: 'Different synthetic question' }, { queue }), { status: 409 });
    assert.deepEqual(calls, [[queue ? '/api/qa/queue' : '/api/qa/tasks', 'POST']]);
    assert.deepEqual(store.list(), []);
  }
});

test('blocked/corrupt storage is safe; accepted queue identity contains no draft', async () => {
  const broken = createTaskStore({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }, 'synthetic');
  broken.remember({ ...task, question: 'private', token: 'private' });
  assert.equal(broken.list().length, 1);
  assert.equal(broken.list()[0].question, undefined);
  const store = createTaskStore({ getItem: () => '[{"conversationId":"../../bad","requestId":"x"}]' }, 'synthetic');
  assert.deepEqual(store.list(), []);
  const client = createTaskClient({ store, fetch: async () => json({ job: { id: 'synthetic-job', taskId: task.id } }) });
  await client.submit({ ...task, question: 'synthetic draft' }, { queue: true });
  assert.equal(store.list()[0].jobId, 'synthetic-job');
  assert.equal(store.list()[0].id, task.id);
});

test('expired terminal events return history recovery metadata without streaming or claiming an empty answer', async () => {
  const calls = [], updates = [];
  const history = { conversationId: task.conversationId, taskId: task.id };
  const client = createTaskClient({ fetch: async url => {
    calls.push(url);
    return json({ task: { ...task, status: 'succeeded', lastEventId: 42, eventsExpired: true, history }, snapshot: { events: [] } });
  } });
  const result = await client.subscribe(task, { signal: new AbortController().signal, onUpdate: view => updates.push(view) });
  assert.equal(result.eventsExpired, true);
  assert.deepEqual(result.task.history, history);
  assert.equal(updates.length, 0);
  assert.deepEqual(calls, [`/api/qa/tasks/${task.id}`]);
});

test('events expiring between snapshot and subscription recover from a fresh snapshot', async () => {
  let reads = 0, streams = 0;
  const client = createTaskClient({ delay: async () => {}, fetch: async url => {
    if (url.includes('/events')) { streams++; return new Response('{}', { status: 410 }); }
    if (++reads === 1) return json(snapshot());
    return json({ task: { ...task, status: 'succeeded', eventsExpired: true,
      history: { conversationId: task.conversationId, taskId: task.id } }, snapshot: { events: [] } });
  } });
  const result = await client.subscribe(task, { signal: new AbortController().signal });
  assert.equal(result.eventsExpired, true);
  assert.equal(reads, 2);
  assert.equal(streams, 1);
});
