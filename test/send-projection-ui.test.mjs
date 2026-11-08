import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi, until } from '../test-support/ui-harness.mjs';

const json = data => new Response(JSON.stringify(data), { headers:{ 'Content-Type':'application/json' } });
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
function submit(view, value) {
  const draft = view.document.querySelector('#question');
  draft.value = value;
  draft.dispatchEvent(new view.window.Event('input', { bubbles:true }));
  view.document.querySelector('#askForm').dispatchEvent(new view.window.Event('submit', { bubbles:true, cancelable:true }));
}
const taskFor = input => ({ id:'synthetic-task', conversationId:input.conversationId, requestId:input.requestId, status:'running', lastEventId:0 });
async function eventually(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('Synthetic send did not settle');
}
const terminal = task => json({ task:{ ...task, status:'succeeded', lastEventId:3 }, snapshot:{ events:[
  { id:1, event:'delta', data:{ text:'Synthetic answer' } },
  { id:2, event:'done', data:{} },
  { id:3, event:'task.status', data:{ status:'succeeded' } },
] } });

test('a rejected send retains its draft and explicit retry reuses the failed bubble', async () => {
  let attempt = 0, accepted;
  const view = await openUi({ fetchImpl(url, options = {}) {
    if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation:{ conversationId:'synthetic-conversation' } });
    if (url === '/api/qa/tasks' && options.method === 'POST') {
      attempt++;
      if (attempt === 1) return new Response('{}', { status:422 });
      accepted = taskFor(JSON.parse(options.body)); return json({ task:accepted });
    }
    if (url === '/api/qa/tasks/synthetic-task') return terminal(accepted);
  } });
  try {
    submit(view, 'Synthetic retained draft');
    const bubble = view.document.querySelector('.message.user');
    assert.equal(bubble.dataset.sendState, 'pending');
    await until(() => bubble.dataset.sendState === 'failed');
    assert.equal(view.document.querySelector('#question').value, 'Synthetic retained draft');
    assert.match(bubble.querySelector('.send-delivery-status').textContent, /未发送/);
    assert.equal(view.document.querySelector('.message.assistant'), null);
    submit(view, 'Synthetic retained draft');
    await eventually(() => view.document.querySelector('.message.assistant'));
    assert.equal(view.document.querySelectorAll('.message.user').length, 1);
    assert.equal(view.document.querySelector('.message.user'), bubble);
    assert.equal(bubble.dataset.sendState, 'accepted');
    assert.equal(attempt, 2);
  } finally { view.close(); }
});

test('an uncertain receipt remains one confirming bubble and never resubmits automatically', async () => {
  let requestId, lookups = 0;
  const ready = gate();
  const view = await openUi({ fetchImpl:async (url, options = {}) => {
    if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation:{ conversationId:'synthetic-conversation' } });
    if (url === '/api/qa/tasks' && options.method === 'POST') { requestId = JSON.parse(options.body).requestId; throw Error('lost reply'); }
    if (url.startsWith('/api/qa/tasks?requestId=')) {
      lookups++;
      if (lookups === 1) return json({ tasks:[] });
      await ready.promise;
      return json({ tasks:[{ id:'synthetic-task', conversationId:'synthetic-conversation', requestId, question:'Synthetic question', status:'running', lastEventId:0 }] });
    }
    if (url === '/api/qa/tasks/synthetic-task') return terminal({ id:'synthetic-task', conversationId:'synthetic-conversation', requestId, status:'running', lastEventId:0 });
  } });
  try {
    submit(view, 'Synthetic question');
    const bubble = view.document.querySelector('.message.user');
    await until(() => bubble.dataset.sendState === 'confirming');
    assert.equal(view.document.querySelector('#question').value, 'Synthetic question');
    assert.equal(view.document.querySelectorAll('.message.user').length, 1);
    assert.equal(view.requests.filter(r => r.url === '/api/qa/tasks' && r.options?.method === 'POST').length, 1);
    ready.release();
    await eventually(() => view.document.querySelector('.message.assistant'));
    assert.equal(view.document.querySelector('.message.user'), bubble);
    assert.equal(bubble.dataset.sendState, 'accepted');
    assert.equal(view.requests.filter(r => r.url === '/api/qa/tasks' && r.options?.method === 'POST').length, 1);
  } finally { ready.release(); view.close(); }
});

test('queued submission shows one pending row, then reuses it when the receipt arrives', async () => {
  const receipt = gate(); let queuedInput;
  const view = await openUi({ fetchImpl:async (url, options = {}) => {
    if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation:{ conversationId:'synthetic-conversation' } });
    if (url === '/api/qa/tasks' && options.method === 'POST') return json({ task:taskFor(JSON.parse(options.body)) });
    if (url === '/api/qa/tasks/synthetic-task') return json({ task:{ id:'synthetic-task', conversationId:'synthetic-conversation', status:'running', lastEventId:0 }, snapshot:{ events:[] } });
    if (url.startsWith('/api/qa/tasks/synthetic-task/events')) return new Response(new ReadableStream({ start() {} }), { headers:{ 'Content-Type':'text/event-stream' } });
    if (url === '/api/qa/queue' && options.method === 'POST') {
      queuedInput = JSON.parse(options.body); await receipt.promise;
      return json({ job:{ ...queuedInput, id:'synthetic-job', status:'queued' } });
    }
  } });
  try {
    submit(view, 'First question');
    await until(() => view.document.querySelector('.message.assistant'));
    submit(view, 'Queued question');
    const row = view.document.querySelector('.queued-item');
    assert.ok(row);
    assert.equal(row.dataset.sendState, 'pending');
    assert.match(row.textContent, /正在加入队列/);
    assert.equal(view.document.querySelector('#question').value, 'Queued question');
    receipt.release();
    await until(() => view.document.querySelector('.queued-controls button'));
    assert.equal(view.document.querySelectorAll('.queued-item').length, 1);
    assert.equal(view.document.querySelector('.queued-item'), row);
    assert.equal(row.dataset.sendState, 'accepted');
    assert.equal(view.document.querySelector('#question').value, '');
    assert.equal(view.requests.filter(r => r.url === '/api/qa/queue' && r.options?.method === 'POST').length, 1);
    assert.ok(queuedInput.requestId);
  } finally { receipt.release(); view.close(); }
});

test('leaving while a conversation is being created cannot attach its late answer to the new view', async () => {
  const created = gate(); let taskPosts = 0;
  const view = await openUi({ fetchImpl:async (url, options = {}) => {
    if (url === '/api/qa/conversations' && options.method === 'POST') {
      await created.promise; return json({ conversation:{ conversationId:'synthetic-conversation' } });
    }
    if (url === '/api/qa/tasks' && options.method === 'POST') {
      taskPosts++; return json({ task:taskFor(JSON.parse(options.body)) });
    }
  } });
  try {
    submit(view, 'Leaving before acknowledgement');
    view.window.dispatchEvent(new view.window.Event('pagehide'));
    created.release();
    await eventually(() => taskPosts === 1);
    assert.equal(view.document.querySelector('.message.assistant'), null);
    assert.equal(view.window.sessionStorage.getItem('qa-native-conversation-id'), null);
    assert.equal(taskPosts, 1);
  } finally { created.release(); view.close(); }
});

test('editing a new draft during a slow acknowledgement never loses that new text', async () => {
  const receipt = gate(); let accepted;
  const view = await openUi({ fetchImpl:async (url, options = {}) => {
    if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation:{ conversationId:'synthetic-conversation' } });
    if (url === '/api/qa/tasks' && options.method === 'POST') {
      accepted = taskFor(JSON.parse(options.body)); await receipt.promise; return json({ task:accepted });
    }
    if (url === '/api/qa/tasks/synthetic-task') return terminal(accepted);
  } });
  try {
    submit(view, 'First question');
    await until(() => accepted);
    const input = view.document.querySelector('#question');
    input.value = 'New draft while waiting';
    input.dispatchEvent(new view.window.Event('input', { bubbles:true }));
    receipt.release();
    await eventually(() => view.document.querySelector('.message.assistant'));
    assert.equal(input.value, 'New draft while waiting');
    assert.equal(view.document.querySelectorAll('.message.user').length, 1);
    assert.equal(view.document.querySelector('.message.user .message-content').textContent, 'First question');
  } finally { receipt.release(); view.close(); }
});

test('an uncertain queued receipt stays in confirming state without a second POST', async () => {
  const view = await openUi({ fetchImpl:async (url, options = {}) => {
    if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation:{ conversationId:'synthetic-conversation' } });
    if (url === '/api/qa/tasks' && options.method === 'POST') return json({ task:taskFor(JSON.parse(options.body)) });
    if (url === '/api/qa/tasks/synthetic-task') return json({ task:{ id:'synthetic-task', conversationId:'synthetic-conversation', status:'running', lastEventId:0 }, snapshot:{ events:[] } });
    if (url.startsWith('/api/qa/tasks/synthetic-task/events')) return new Response(new ReadableStream({ start() {} }), { headers:{ 'Content-Type':'text/event-stream' } });
    if (url === '/api/qa/queue' && options.method === 'POST') throw Error('lost queued reply');
    if (url.startsWith('/api/qa/tasks?requestId=')) return json({ tasks:[] });
  } });
  try {
    submit(view, 'First question');
    await until(() => view.document.querySelector('.message.assistant'));
    submit(view, 'Queued question');
    await until(() => view.document.querySelector('.queued-item')?.dataset.sendState === 'confirming');
    assert.equal(view.document.querySelector('#question').value, 'Queued question');
    submit(view, 'Queued question');
    assert.equal(view.requests.filter(r => r.url === '/api/qa/queue' && r.options?.method === 'POST').length, 1);
    assert.equal(view.document.querySelectorAll('.queued-item').length, 1);
  } finally { view.close(); }
});

test('a fast answer is rendered before a still-running flight finishes', async () => {
  let accepted;
  const view = await openUi({
    setup(window) {
      window.matchMedia = () => ({ matches:false });
      window.Element.prototype.getBoundingClientRect = function() {
        if (this.id === 'question') return { left:20, top:300, right:270, bottom:324, width:250, height:24 };
        if (this.classList.contains('message') && this.classList.contains('user')) return { left:80, top:100, right:280, bottom:144, width:200, height:44 };
        return { left:0, top:0, right:300, bottom:64, width:300, height:64 };
      };
      window.Element.prototype.animate = function() {
        return { cancel() { this.oncancel?.(); } };
      };
    },
    fetchImpl(url, options = {}) {
      if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation:{ conversationId:'synthetic-conversation' } });
      if (url === '/api/qa/tasks' && options.method === 'POST') { accepted = taskFor(JSON.parse(options.body)); return json({ task:accepted }); }
      if (url === '/api/qa/tasks/synthetic-task') return terminal(accepted);
    },
  });
  try {
    submit(view, 'Quick question');
    assert.ok(view.document.querySelector('.send-motion-flight'));
    await eventually(() => view.document.querySelector('.message.assistant .message-content')?.textContent === 'Synthetic answer');
    assert.ok(view.document.querySelector('.send-motion-flight'), 'the mocked flight has not been finished');
    assert.equal(view.document.querySelectorAll('.message.user').length, 1);
    assert.equal(view.document.querySelector('#question').value, '');
    assert.equal(view.document.querySelector('#question').style.opacity, '');
  } finally { view.close(); }
});

test('a later rejected queued receipt changes its pending row to failed', async () => {
  let stream, queuedId, lookups = 0;
  const view = await openUi({ fetchImpl:async (url, options = {}) => {
    if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation:{ conversationId:'synthetic-conversation' } });
    if (url === '/api/qa/tasks' && options.method === 'POST') return json({ task:taskFor(JSON.parse(options.body)) });
    if (url === '/api/qa/tasks/synthetic-task') return json({ task:{ id:'synthetic-task', conversationId:'synthetic-conversation', status:'running', lastEventId:0 }, snapshot:{ events:[] } });
    if (url.startsWith('/api/qa/tasks/synthetic-task/events')) return new Response(new ReadableStream({ start(controller) { stream = controller; } }), { headers:{ 'Content-Type':'text/event-stream' } });
    if (url === '/api/qa/queue' && options.method === 'POST') { queuedId = JSON.parse(options.body).requestId; throw Error('lost queued reply'); }
    if (url.startsWith('/api/qa/tasks?requestId=')) {
      lookups++;
      return json(lookups === 1 ? { tasks:[] } : { tasks:[], receipt:{ requestId:queuedId, conversationId:'synthetic-conversation', status:'rejected', rejectionStatus:429 } });
    }
  } });
  try {
    submit(view, 'First question');
    await until(() => stream);
    submit(view, 'Queued question');
    await until(() => view.document.querySelector('.queued-item')?.dataset.sendState === 'confirming');
    for (const [id, event, data] of [[1,'delta',{text:'Answer'}],[2,'done',{}],[3,'task.status',{status:'succeeded'}]]) {
      stream.enqueue(new TextEncoder().encode(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    }
    try { await eventually(() => view.document.querySelector('.queued-item')?.dataset.sendState === 'failed'); }
    catch { throw new Error(JSON.stringify({ lookups, status:view.document.querySelector('#requestStatus').textContent,
      queue:view.document.querySelector('.queued-item')?.outerHTML, calls:view.requests.map(r=>r.url) })); }
    assert.equal(view.document.querySelector('#question').value, 'Queued question');
    assert.match(view.document.querySelector('.queued-item').textContent, /未发送/);
    assert.equal(view.requests.filter(r => r.url === '/api/qa/queue' && r.options?.method === 'POST').length, 1);
  } finally { view.close(); }
});

test('a recovered queued receipt reuses its row and clears only the matching draft', async () => {
  let stream, job, lookups = 0, revealed = false;
  const view = await openUi({ fetchImpl:async (url, options = {}) => {
    if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation:{ conversationId:'synthetic-conversation' } });
    if (url === '/api/qa/tasks' && options.method === 'POST') return json({ task:taskFor(JSON.parse(options.body)) });
    if (url === '/api/qa/tasks/synthetic-task') return json({ task:{ id:'synthetic-task', conversationId:'synthetic-conversation', status:'running', lastEventId:0 }, snapshot:{ events:[] } });
    if (url.startsWith('/api/qa/tasks/synthetic-task/events')) return new Response(new ReadableStream({ start(controller) { stream = controller; } }), { headers:{ 'Content-Type':'text/event-stream' } });
    if (url === '/api/qa/queue' && options.method === 'POST') { job = { ...JSON.parse(options.body), id:'synthetic-job', status:'queued' }; throw Error('lost queued reply'); }
    if (url.startsWith('/api/qa/tasks?requestId=')) { lookups++; revealed = lookups > 1; return json(revealed ? { tasks:[], job } : { tasks:[] }); }
    if (url.startsWith('/api/qa/queue?')) return json({ queue:revealed ? [job] : [] });
  } });
  try {
    submit(view, 'First question');
    await until(() => stream);
    submit(view, 'Queued question');
    await until(() => view.document.querySelector('.queued-item')?.dataset.sendState === 'confirming');
    const row = view.document.querySelector('.queued-item');
    for (const [id, event, data] of [[1,'delta',{text:'Answer'}],[2,'done',{}],[3,'task.status',{status:'succeeded'}]]) {
      stream.enqueue(new TextEncoder().encode(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    }
    await eventually(() => view.document.querySelector('.queued-controls button'));
    assert.equal(view.document.querySelectorAll('.queued-item').length, 1);
    assert.equal(view.document.querySelector('.queued-item'), row);
    assert.equal(row.dataset.sendState, 'accepted');
    assert.equal(view.document.querySelector('#question').value, '');
    assert.equal(view.requests.filter(r => r.url === '/api/qa/queue' && r.options?.method === 'POST').length, 1);
  } finally { view.close(); }
});
