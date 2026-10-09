import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi, until } from '../test-support/ui-harness.mjs';

const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const task = (id = 'synthetic-task', conversationId = 'synthetic-conversation', extra = {}) => ({
  id, conversationId, status: 'running', lastEventId: 0, question: 'Synthetic question', ...extra,
});
const delta = (id, text) => ({ id, event: 'delta', data: { text } });
const done = id => ({ id, event: 'done', data: {} });
const terminal = (id, status = 'succeeded') => ({ id, event: 'task.status', data: { status } });
const snapshot = (item, events) => json({ task: { ...item, lastEventId: events.at(-1)?.id || 0 }, snapshot: { events } });
const packet = item => `id: ${item.id}\nevent: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`;
function stream(events = [], open = false) {
  let controller;
  const response = new Response(new ReadableStream({
    start(value) { controller = value; for (const event of events) value.enqueue(new TextEncoder().encode(packet(event))); if (!open) value.close(); },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
  return { response, push: event => controller.enqueue(new TextEncoder().encode(packet(event))) };
}
function submit(view, text = 'Synthetic question') {
  const draft = view.document.querySelector('#question');
  draft.value = text;
  draft.dispatchEvent(new view.window.Event('input', { bubbles: true }));
  view.document.querySelector('#askForm').dispatchEvent(new view.window.Event('submit', { bubbles: true, cancelable: true }));
}
const answer = view => view.document.querySelector('.message.assistant .message-content')?.textContent;
const posts = view => view.requests.filter(({ options }) => options?.method === 'POST');
async function eventually(predicate) {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw Error('Synthetic task UI did not settle');
}
function conversations(url, options = {}) {
  if (url === '/api/qa/archive/conversations') return json({ conversations: [] });
  if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation: { conversationId: 'synthetic-conversation' } });
  if (url === '/api/qa/conversations/synthetic-conversation') return json({ conversation: { conversationId: 'synthetic-conversation' }, messages: [] });
}

test('missing durable capability blocks all submissions and retains the draft in both languages', async () => {
  const view = await openUi({ fetchImpl: (url, options) => url === '/api/qa/health'
    ? json({ connected: true, authenticated: true, ready: true, contractSupported: true }) : conversations(url, options) });
  try {
    await until(() => view.document.querySelector('#composerAccessNote').textContent.includes('不兼容'));
    submit(view, 'Synthetic retained draft');
    assert.equal(view.document.querySelector('#question').value, 'Synthetic retained draft');
    assert.equal(view.document.querySelector('#sendButton').disabled, true);
    assert.match(view.document.querySelector('#composerAccessNote').textContent, /不兼容/);
    view.document.querySelector('#languageButton').click();
    submit(view, 'Synthetic retained draft');
    assert.match(view.document.querySelector('#requestStatus').textContent, /Incompatible/);
    assert.equal(posts(view).length, 0);
  } finally { view.close(); }
});

test('accepted queued question is visible before snapshot and hands off to one running turn', async () => {
  const queued = task(undefined, undefined, { status: 'queued', createdAt: Date.now() - 5000 });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const live = stream([], true);
  const view = await openUi({ fetchImpl(url, options = {}) {
    if (url === '/api/qa/tasks' && options.method === 'POST') return json({ task: queued });
    if (url === `/api/qa/tasks/${queued.id}`) return pending;
    if (url.includes(`/${queued.id}/events`)) return live.response;
    return conversations(url, options);
  } });
  try {
    submit(view);
    await until(() => view.document.querySelector('.answer-lifecycle[data-status="queued"]'));
    assert.equal(view.document.querySelector('.message.user .message-content').textContent, queued.question);
    assert.equal(view.document.querySelector('#question').value, '');
    assert.equal(answer(view), '');
    assert.equal(view.document.querySelector('.typing'), null);
    assert.ok(Number(view.document.querySelector('.answer-lifecycle-details').textContent.match(/等待 ([\d.]+)/)?.[1]) >= 5);
    assert.doesNotMatch(view.document.querySelector('.answer-lifecycle-details').textContent, /已用时/);
    release(snapshot({ ...queued, status: 'running', trace: { dispatchedAt: Date.now() - 2000 } }, []));
    await until(() => view.document.querySelector('.answer-lifecycle[data-status="connecting"]'));
    assert.ok(Number(view.document.querySelector('.answer-lifecycle-details').textContent.match(/已用时 ([\d.]+)/)?.[1]) >= 2);
    live.push(delta(1, 'Synthetic answer'));
    live.push(done(2)); live.push(terminal(3));
    await until(() => view.document.querySelector('.answer-lifecycle[data-status="done"]'));
    assert.equal(view.document.querySelectorAll('.message.user').length, 1);
    assert.equal(view.document.querySelectorAll('.message.assistant').length, 1);
    assert.equal(answer(view), 'Synthetic answer');
    assert.equal(posts(view).filter(row => row.url === '/api/qa/tasks').length, 1);
  } finally { release(snapshot(queued, [])); view.close(); }
});

test('queued cancellation has no execution timer or duplicate bubble', async () => {
  const queued = task(undefined, undefined, { status: 'queued' });
  const live = stream([], true);
  const view = await openUi({ fetchImpl(url, options = {}) {
    if (url === '/api/qa/tasks' && options.method === 'POST') return json({ task: queued });
    if (url === `/api/qa/tasks/${queued.id}` && options.method === 'DELETE') {
      live.push(terminal(1, 'cancelled')); return json({ task: { ...queued, status: 'cancelled' } });
    }
    if (url === `/api/qa/tasks/${queued.id}`) return snapshot(queued, []);
    if (url.includes(`/${queued.id}/events`)) return live.response;
    return conversations(url, options);
  } });
  try {
    submit(view);
    await until(() => view.requests.some(row => row.url.includes('/events')));
    view.document.querySelector('#sendButton').click();
    await until(() => view.document.querySelector('.answer-lifecycle[data-status="cancelled"]'));
    assert.doesNotMatch(view.document.querySelector('.answer-lifecycle-details').textContent, /用时/);
    assert.equal(view.document.querySelectorAll('.message.user').length, 1);
    assert.equal(view.document.querySelector('.typing'), null);
  } finally { view.close(); }
});

test('refresh running task restores server elapsed time and original question without POST', async () => {
  const item = task(undefined, undefined, { createdAt: Date.now() - 30000, trace: { dispatchedAt: Date.now() - 20000 } });
  const view = await openUi({ conversationId: item.conversationId, fetchImpl(url, options) {
    if (url.startsWith('/api/qa/tasks?')) return json({ tasks: [item] });
    if (url === `/api/qa/tasks/${item.id}`) return snapshot(item, []);
    if (url.includes(`/${item.id}/events`)) return stream([], true).response;
    return conversations(url, options);
  } });
  try {
    await until(() => view.document.querySelector('.answer-lifecycle[data-status="connecting"]'));
    const details = view.document.querySelector('.answer-lifecycle-details').textContent;
    assert.match(details, /等待 10(?:\.0)? 秒/);
    assert.ok(Number(details.match(/已用时 ([\d.]+)/)?.[1]) >= 20);
    assert.equal(view.document.querySelector('.message.user .message-content').textContent, item.question);
    assert.equal(posts(view).length, 0);
  } finally { view.close(); }
});

test('POST conflict keeps the draft and rejects visibly without adopting a task in both languages', async () => {
  const view = await openUi({ fetchImpl(url, options = {}) {
    if (url === '/api/qa/tasks' && options.method === 'POST') return new Response('{}', { status: 409 });
    return conversations(url, options);
  } });
  try {
    for (const locale of ['zh', 'en']) {
      if (locale === 'en') view.document.querySelector('#languageButton').click();
      submit(view, 'Synthetic conflicting draft');
      await until(() => /被拒绝|rejected/.test(view.document.querySelector('#requestStatus').textContent));
      assert.equal(view.document.querySelector('#question').value, 'Synthetic conflicting draft');
      assert.equal(view.document.querySelector('.message.user'), null);
      assert.equal(view.requests.some(row => row.url.includes('requestId=')), false);
      assert.equal(view.window.localStorage.getItem('qa-task-identities-v1'), '[]');
    }
  } finally { view.close(); }
});

test('direct task rotates its stream and restores a terminal snapshot without false failure or duplicate text', async () => {
  let accepted, reads = 0;
  const view = await openUi({ fetchImpl(url, options = {}) {
    if (url === '/api/qa/tasks' && options.method === 'POST') { accepted = { ...task(), requestId: JSON.parse(options.body).requestId }; return json({ task: accepted }); }
    if (url === '/api/qa/tasks/synthetic-task') return ++reads === 1 ? snapshot(accepted, [])
      : snapshot({ ...accepted, status: 'succeeded' }, [delta(1, 'Synthetic '), delta(2, 'answer'), done(3), terminal(4)]);
    if (url.includes('/synthetic-task/events')) return stream([delta(1, 'Synthetic ')]).response;
    return conversations(url, options);
  } });
  try {
    submit(view);
    await until(() => answer(view) === 'Synthetic ');
    assert.equal(view.document.querySelector('.message-error'), null);
    await eventually(() => view.document.querySelector('#requestStatus').textContent === '回答已完成');
    assert.equal(answer(view), 'Synthetic answer');
    assert.equal(view.document.querySelectorAll('.message.assistant').length, 1);
    assert.equal(view.document.querySelectorAll('.message.user').length, 1);
    assert.equal(posts(view).filter(row => row.url === '/api/qa/tasks').length, 1);
    assert.equal(view.requests.some(row => row.url === '/api/qa/ask'), false);
    assert.equal(view.document.querySelector('.message-error'), null);
  } finally { view.close(); }
});

test('answer lifecycle becomes generating with text and stays generating across ticks and reconnect', async () => {
  const item = task();
  const live = stream([], true);
  let reads = 0;
  const view = await openUi({ conversationId: item.conversationId, fetchImpl(url, options) {
    if (url.startsWith('/api/qa/tasks?')) return json({ tasks: [item] });
    if (url === `/api/qa/tasks/${item.id}`) { reads++; return snapshot(item, [delta(1, '# Synthetic ongoing answer')]); }
    if (url.includes(`/${item.id}/events`)) return reads === 1 ? stream([]).response : live.response;
    return conversations(url, options);
  } });
  try {
    await until(() => answer(view)?.includes('Synthetic ongoing answer'));
    assert.equal(view.document.querySelector('.answer-lifecycle').dataset.status, 'generating');
    await eventually(() => reads >= 2);
    assert.equal(view.document.querySelector('.answer-lifecycle').dataset.status, 'generating');
    view.document.querySelector('#languageButton').click();
    await eventually(() => view.document.querySelector('.answer-lifecycle-label').textContent === 'Generating the answer');
    assert.equal(view.document.querySelectorAll('.message.assistant').length, 1);
    assert.equal(posts(view).length, 0);
  } finally { view.close(); }
});

for (const outcome of ['failed', 'cancelled', 'indeterminate']) {
  for (const withHistory of [false, true]) {
  test(`refresh restores newest ${outcome} partial answer without local identity (earlier history: ${withHistory})`, async () => {
    const item = task('synthetic-terminal', 'synthetic-conversation', { status: outcome, createdAt: 2000, trace: { terminalAt: 4000 } });
    const older = task('synthetic-old-success', item.conversationId, { status: 'succeeded', createdAt: 1000 });
    const olderFailed = task('synthetic-old-failed', item.conversationId, { status: 'failed', createdAt: 1500 });
    const messages = withHistory ? [{ role: 'user', taskId: older.id, content: 'Earlier question' },
      { role: 'assistant', taskId: older.id, content: 'Earlier answer', createdAt: new Date(3000).toISOString() }] : [];
    const view = await openUi({ conversationId: item.conversationId, fetchImpl(url, options) {
      if (url.startsWith('/api/qa/tasks?')) return json({ tasks: withHistory ? [item, olderFailed, older] : [item, olderFailed] });
      if (url === `/api/qa/conversations/${item.conversationId}`) return json({ conversation: { conversationId: item.conversationId }, messages });
      if (url === `/api/qa/tasks/${item.id}`) return snapshot(item, [delta(1, 'Retained partial answer'), terminal(2, outcome)]);
      return conversations(url, options);
    } });
    try {
      await until(() => view.requests.some(row => row.url.startsWith('/api/qa/queue?')));
      assert.deepEqual([...view.document.querySelectorAll('.message.assistant .message-content')].map(node => node.textContent), withHistory ? ['Earlier answer', 'Retained partial answer'] : ['Retained partial answer']);
      assert.equal(view.document.querySelectorAll('.message.user').length, withHistory ? 2 : 1);
      assert.equal(view.document.querySelectorAll('.message-error').length, 1);
      assert.equal(posts(view).length, 0);
      assert.equal(view.requests.some(row => row.url.includes('/events')), false);
      assert.equal(view.requests.some(row => row.url === `/api/qa/tasks/${olderFailed.id}`), false);
      assert.doesNotMatch(view.window.localStorage.getItem('qa-task-identities-v1') || '', /Retained partial|question/);
    } finally { view.close(); }
  });
  }
}

for (const receiptListed of [true, false]) {
  test(`refresh does not resurrect an older failure before newer history (receipt listed: ${receiptListed})`, async () => {
    const old = task('synthetic-old-failure', 'synthetic-conversation', { status: 'failed', createdAt: 1000, trace: { terminalAt: 2000 } });
    const newer = task('synthetic-success', old.conversationId, { status: 'succeeded', createdAt: 3000 });
    const view = await openUi({ conversationId: old.conversationId, setup(window) {
      window.localStorage.setItem('qa-task-identities-v1', JSON.stringify([{ id: old.id, conversationId: old.conversationId }]));
    }, fetchImpl(url, options) {
      if (url.startsWith('/api/qa/tasks?')) return json({ tasks: receiptListed ? [newer, old] : [old] });
      if (url === `/api/qa/conversations/${old.conversationId}`) return json({ conversation: { conversationId: old.conversationId }, messages: [
        { role: 'user', taskId: newer.id, content: 'Newer question' },
        { role: 'assistant', taskId: newer.id, content: 'Newer successful answer', createdAt: new Date(4000).toISOString() },
      ] });
      if (url === `/api/qa/tasks/${old.id}`) return snapshot(old, [delta(1, 'Old partial'), terminal(2, 'failed')]);
      return conversations(url, options);
    } });
    try {
      await until(() => view.requests.some(row => row.url.startsWith('/api/qa/queue?')));
      assert.equal(view.document.querySelectorAll('.message.assistant').length, 1);
      assert.equal(answer(view), 'Newer successful answer');
      assert.equal(view.requests.some(row => row.url === `/api/qa/tasks/${old.id}`), false);
      assert.equal(posts(view).length, 0);
    } finally { view.close(); }
  });
}

test('new conversation detaches viewing without cancel and accepts a task while another conversation runs', async () => {
  const first = task(), second = task('synthetic-second', 'synthetic-new');
  let active = false;
  const view = await openUi({ conversationId: first.conversationId, fetchImpl(url, options = {}) {
    if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation: { conversationId: second.conversationId } });
    if (url === '/api/qa/conversations') return json({ conversations: [{ conversationId: first.conversationId, title: 'Synthetic first' }] });
    if (url === '/api/qa/tasks' && options.method === 'POST') {
      const input = JSON.parse(options.body); active = true;
      return json({ task: { ...(input.conversationId === first.conversationId ? first : second), requestId: input.requestId } });
    }
    if (url.startsWith('/api/qa/tasks?')) return json({ tasks: active && url.includes(first.conversationId) ? [first] : [] });
    if (url === `/api/qa/tasks/${first.id}`) return snapshot(first, [delta(1, 'First partial')]);
    if (url.includes(`/${first.id}/events`)) return stream([], true).response;
    if (url === `/api/qa/tasks/${second.id}`) return snapshot({ ...second, status: 'succeeded' }, [delta(1, 'Second answer'), done(2), terminal(3)]);
    if (url === `/api/qa/conversations/${first.conversationId}`) return json({ conversation: { conversationId: first.conversationId }, messages: active ? [
      { role: 'user', content: first.question, taskId: first.id },
      { role: 'assistant', content: 'First partial', taskId: first.id, complete: false },
    ] : [] });
    return conversations(url, options);
  } });
  try {
    await until(() => view.requests.some(row => row.url.startsWith('/api/qa/queue?')));
    submit(view);
    await until(() => answer(view) === 'First partial');
    view.document.querySelector('#newChat').click();
    await until(() => view.window.sessionStorage.getItem('qa-native-conversation-id') === second.conversationId);
    submit(view, 'Synthetic second question');
    await until(() => answer(view) === 'Second answer');
    assert.equal(posts(view).filter(row => row.url === '/api/qa/tasks').length, 2);
    assert.equal(view.requests.some(row => row.options?.method === 'DELETE'), false);
    view.document.querySelector('.conversation-open').click();
    await until(() => answer(view) === 'First partial');
    assert.equal(view.document.querySelectorAll('.message.assistant').length, 1);
    assert.equal(view.document.querySelectorAll('.message.user').length, 1);
    assert.equal(posts(view).filter(row => row.url === '/api/qa/tasks').length, 2);
  } finally { view.close(); }
});

test('refresh restores stored task IDs with no question content saved and renders partial terminal outcome honestly', async () => {
  const item = task();
  const view = await openUi({ setup(window) {
    window.localStorage.setItem('qa-task-identities-v1', JSON.stringify([{ id: item.id, conversationId: item.conversationId, requestId: 'synthetic-request' }]));
  }, fetchImpl(url, options) {
    if (url.startsWith('/api/qa/tasks?')) return json({ tasks: [item] });
    if (url === `/api/qa/tasks/${item.id}`) return snapshot({ ...item, status: 'indeterminate' }, [delta(1, 'Synthetic partial'), terminal(2, 'indeterminate')]);
    return conversations(url, options);
  } });
  try {
    await until(() => view.document.querySelector('.message-error'));
    assert.equal(answer(view), 'Synthetic partial');
    assert.match(view.document.querySelector('.message-error').textContent, /无法确认/);
    assert.equal(posts(view).length, 0);
    assert.doesNotMatch(view.window.localStorage.getItem('qa-task-identities-v1'), /Synthetic partial|question|token/);
  } finally { view.close(); }
});

test('explicit stop DELETEs the task and preserves its partial answer, even if the cancellation reply is lost', async () => {
  let activeStream;
  const item = task();
  const view = await openUi({ fetchImpl(url, options = {}) {
    if (url === '/api/qa/tasks' && options.method === 'POST') return json({ task: item });
    if (url === `/api/qa/tasks/${item.id}` && options.method === 'DELETE') {
      activeStream.push(terminal(2, 'cancelled'));
      throw Error('synthetic cancellation acknowledgement lost');
    }
    if (url === `/api/qa/tasks/${item.id}`) return snapshot(item, [delta(1, 'Kept partial')]);
    if (url.includes(`/${item.id}/events`)) { activeStream = stream([], true); return activeStream.response; }
    return conversations(url, options);
  } });
  try {
    submit(view);
    await until(() => activeStream);
    view.document.querySelector('#sendButton').click();
    await until(() => view.document.querySelector('.message-error'));
    assert.equal(answer(view), 'Kept partial');
    assert.match(view.document.querySelector('.message-error').textContent, /已停止/);
    assert.deepEqual(view.requests.filter(row => row.options?.method === 'DELETE').map(row => row.url), [`/api/qa/tasks/${item.id}`]);
  } finally { view.close(); }
});

test('queued questions remain editable and execute through their taskId subscription', async () => {
  const first = task(), second = task('synthetic-queued-task');
  let activeStream, job, finished = false;
  const view = await openUi({ fetchImpl(url, options = {}) {
    if (url === '/api/qa/tasks' && options.method === 'POST') return json({ task: first });
    if (url === '/api/qa/queue' && options.method === 'POST') {
      job = { id: 'synthetic-job', ...JSON.parse(options.body), status: 'queued' };
      return json({ job });
    }
    if (url === '/api/qa/queue/synthetic-job' && options.method === 'PATCH') {
      job.question = JSON.parse(options.body).question; return json({ job });
    }
    if (url.startsWith('/api/qa/queue?')) return json({ queue: job ? [job] : [] });
    if (url.startsWith('/api/qa/tasks?')) return json({ tasks: finished ? [{ ...second, question: job.question, requestId: job.requestId }] : [] });
    if (url === `/api/qa/tasks/${first.id}`) return snapshot(first, [delta(1, 'First')]);
    if (url.includes(`/${first.id}/events`)) { activeStream = stream([], true); return activeStream.response; }
    if (url === `/api/qa/tasks/${second.id}`) {
      finished = false; job = null;
      return snapshot({ ...second, status: 'succeeded' }, [delta(1, 'Queued answer'), done(2), terminal(3)]);
    }
    return conversations(url, options);
  } });
  try {
    submit(view); await until(() => activeStream);
    submit(view, 'Synthetic queued question');
    await until(() => view.document.querySelector('.queued-question'));
    view.document.querySelector('.queued-controls button').click();
    view.document.querySelector('.queued-editor').value = 'Synthetic edited question';
    view.document.querySelector('.queued-controls button').click();
    await until(() => view.document.querySelector('.queued-question')?.textContent === 'Synthetic edited question');
    finished = true; job.taskId = second.id; job.status = 'running';
    activeStream.push(done(2)); activeStream.push(terminal(3));
    await until(() => [...view.document.querySelectorAll('.message.assistant .message-content')].some(node => node.textContent === 'Queued answer'));
    assert.equal(view.document.querySelectorAll('.message.assistant').length, 2);
    assert.equal([...view.document.querySelectorAll('.message.user')].at(-1).textContent, 'Synthetic edited question');
    assert.equal(view.requests.some(row => /\/queue\/.*\/events/.test(row.url)), false);
    assert.equal(posts(view).filter(row => row.url === '/api/qa/tasks').length, 1);
  } finally { view.close(); }
});

test('ambiguous submit keeps its identity, looks it up, and never posts a second request', async () => {
  let requestId, lookups = 0;
  const item = task();
  const view = await openUi({ fetchImpl(url, options = {}) {
    if (url === '/api/qa/tasks' && options.method === 'POST') { requestId = JSON.parse(options.body).requestId; throw Error('synthetic lost response'); }
    if (url.includes('/api/qa/tasks?requestId=')) { lookups++; return json({ tasks: lookups > 1 ? [{ ...item, clientRequestId: requestId }] : [] }); }
    if (url === `/api/qa/tasks/${item.id}`) return snapshot({ ...item, status: 'succeeded' }, [delta(1, 'Recovered answer'), done(2), terminal(3)]);
    return conversations(url, options);
  } });
  try {
    submit(view); submit(view);
    await until(() => answer(view) === 'Recovered answer');
    assert.equal(posts(view).filter(row => row.url === '/api/qa/tasks').length, 1);
    assert.ok(lookups >= 2);
    assert.equal(view.document.querySelector('.message-error'), null);
  } finally { view.close(); }
});

for (const initiallyPresent of [false, true]) test(`expired task events recover canonical history without duplicate answers (history already present: ${initiallyPresent})`, async () => {
  const item = task('synthetic-task', 'synthetic-conversation', { status: 'succeeded', eventsExpired: true,
    history: { conversationId: 'synthetic-conversation', taskId: 'synthetic-task' } });
  let reads = 0;
  const messages = [{ role: 'user', content: 'Synthetic original question', taskId: item.id },
    { role: 'assistant', content: 'Synthetic archived answer', taskId: item.id, complete: true }];
  const view = await openUi({ setup(window) {
    window.localStorage.setItem('qa-task-identities-v1', JSON.stringify([{ id: item.id, conversationId: item.conversationId }]));
  }, fetchImpl(url, options) {
    if (url.startsWith('/api/qa/tasks?')) return json({ tasks: [item] });
    if (url === `/api/qa/tasks/${item.id}`) return json({ task: { ...item, lastEventId: 100 }, snapshot: { events: [] } });
    if (url === `/api/qa/conversations/${item.conversationId}`) return json({ conversation: { conversationId: item.conversationId },
      messages: initiallyPresent || ++reads > 1 ? messages : [] });
    return conversations(url, options);
  } });
  try {
    await until(() => view.document.querySelector('#requestStatus').textContent === '回答已完成');
    assert.equal(answer(view), 'Synthetic archived answer');
    assert.equal(view.document.querySelectorAll('.message.assistant').length, 1);
    assert.equal(view.document.querySelectorAll('.message.user').length, 1);
    assert.equal(view.document.querySelector('.message-error'), null);
    assert.equal(view.requests.some(row => row.url.includes('/events')), false);
    assert.equal(posts(view).length, 0);
  } finally { view.close(); }
});

test('expired events with missing history retain existing content and do not claim success or resubmit', async () => {
  const item = task('synthetic-task', 'synthetic-conversation', { status: 'succeeded', eventsExpired: true,
    history: { conversationId: 'synthetic-conversation', taskId: 'synthetic-task' } });
  const view = await openUi({ setup(window) {
    window.localStorage.setItem('qa-task-identities-v1', JSON.stringify([{ id: item.id, conversationId: item.conversationId }]));
  }, fetchImpl(url, options) {
    if (url.startsWith('/api/qa/tasks?')) return json({ tasks: [item] });
    if (url === `/api/qa/tasks/${item.id}`) return snapshot(item, []);
    return conversations(url, options);
  } });
  try {
    await until(() => view.document.querySelector('#requestStatus').textContent.includes('暂时无法恢复'));
    assert.equal(view.document.querySelectorAll('.message.assistant').length, 0);
    assert.equal(posts(view).length, 0);
    assert.equal(view.requests.some(row => row.url.includes('/events')), false);
    assert.match(view.window.localStorage.getItem('qa-task-identities-v1'), /synthetic-task/);
  } finally { view.close(); }
});

test('normal completed task already present in history is not appended again or replayed', async () => {
  const item = task('synthetic-task', 'synthetic-conversation', { status: 'succeeded' });
  const view = await openUi({ setup(window) {
    window.localStorage.setItem('qa-task-identities-v1', JSON.stringify([{ id: item.id, conversationId: item.conversationId }]));
  }, fetchImpl(url, options) {
    if (url.startsWith('/api/qa/tasks?')) return json({ tasks: [item] });
    if (url === `/api/qa/conversations/${item.conversationId}`) return json({ conversation: { conversationId: item.conversationId }, messages: [
      { role: 'user', content: 'Synthetic original question', taskId: item.id },
      { role: 'assistant', content: 'Synthetic complete history', taskId: item.id, complete: true },
      { role: 'user', content: 'Synthetic later question', taskId: 'synthetic-later' },
      { role: 'assistant', content: 'Synthetic later answer', taskId: 'synthetic-later', complete: true },
    ] });
    return conversations(url, options);
  } });
  try {
    await until(() => view.requests.some(row => row.url.startsWith('/api/qa/queue?')));
    assert.equal(view.document.querySelectorAll('.message.assistant').length, 2);
    assert.equal(answer(view), 'Synthetic complete history');
    assert.equal(view.requests.some(row => row.url === `/api/qa/tasks/${item.id}`), false);
    assert.equal(posts(view).length, 0);
  } finally { view.close(); }
});

test('fast queued completion missing from queue is recovered with requestId and queued deletion stays editable', async () => {
  const first = task(), second = task('synthetic-fast');
  let activeStream, job, requestId, finished = false, removed = false;
  const view = await openUi({ fetchImpl(url, options = {}) {
    if (url === '/api/qa/tasks' && options.method === 'POST') return json({ task: first });
    if (url === '/api/qa/queue' && options.method === 'POST') {
      job = { id: removed ? 'synthetic-kept-job' : 'synthetic-deleted-job', ...JSON.parse(options.body), status: 'queued' };
      requestId = job.requestId; return json({ job });
    }
    if (url === '/api/qa/queue/synthetic-deleted-job' && options.method === 'DELETE') { removed = true; job = null; return json({ ok: true }); }
    if (url.startsWith('/api/qa/queue?')) return json({ queue: job && !finished ? [job] : [] });
    if (url.includes('/api/qa/tasks?requestId=')) return json({ tasks: finished && url.includes(requestId) ? [{ ...second, status: 'succeeded' }] : [] });
    if (url.startsWith('/api/qa/tasks?')) return json({ tasks: finished ? [{ ...second, status: 'succeeded' }] : [] });
    if (url === `/api/qa/tasks/${first.id}`) return snapshot(first, [delta(1, 'First')]);
    if (url.includes(`/${first.id}/events`)) { activeStream = stream([], true); return activeStream.response; }
    if (url === `/api/qa/tasks/${second.id}`) return snapshot({ ...second, status: 'succeeded' }, [delta(1, 'Fast queued answer'), done(2), terminal(3)]);
    return conversations(url, options);
  } });
  try {
    submit(view); await until(() => activeStream);
    submit(view, 'Synthetic question to delete'); await until(() => view.document.querySelector('.queued-controls'));
    view.document.querySelector('.queued-controls button:last-child').click();
    await until(() => removed && !view.document.querySelector('.queued-controls'));
    assert.doesNotMatch(view.window.localStorage.getItem('qa-task-identities-v1'), /synthetic-deleted-job/);
    submit(view, 'Synthetic fast queued question'); await until(() => view.document.querySelector('.queued-controls'));
    finished = true;
    activeStream.push(done(2)); activeStream.push(terminal(3));
    await until(() => [...view.document.querySelectorAll('.message.assistant .message-content')].some(node => node.textContent === 'Fast queued answer'));
    assert.equal(view.document.querySelectorAll('.message.assistant').length, 2);
    assert.ok(view.requests.some(row => row.url.includes(`/api/qa/tasks?requestId=${requestId}`)));
    assert.equal(posts(view).filter(row => row.url === '/api/qa/tasks').length, 1);
  } finally { view.close(); }
});
