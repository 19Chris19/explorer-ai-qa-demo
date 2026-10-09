import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi, until } from '../test-support/ui-harness.mjs';

const conversationId = 'synthetic-conversation';
const requestId = 'synthetic-request';
const json = data => Response.json(data);
const submit = (view, text) => {
  const question = view.document.querySelector('#question'); question.value = text;
  view.document.querySelector('#askForm').dispatchEvent(new view.window.Event('submit', { bubbles: true, cancelable: true }));
};
const conversations = url => url === `/api/qa/conversations/${conversationId}`
  ? json({ conversation: { conversationId }, messages: [] }) : null;

test('refresh consumes an owned rejected receipt and allows a new explicit submission', async () => {
  const view = await openUi({ conversationId, setup(window) {
    window.localStorage.setItem('qa-task-identities-v1', JSON.stringify([{ requestId, conversationId }]));
  }, fetchImpl(url, options = {}) {
    if (url.includes('requestId=')) return json({ tasks: [], receipt: { requestId, conversationId, status: 'rejected', rejectionStatus: 429 } });
    if (url === '/api/qa/tasks' && options.method === 'POST') return new Response('{}', { status: 429 });
    return conversations(url);
  } });
  try {
    await until(() => view.window.localStorage.getItem('qa-task-identities-v1') === '[]');
    assert.equal(view.document.querySelector('#question').value, '');
    submit(view, 'Synthetic new question');
    await until(() => view.requests.some(row => row.url === '/api/qa/tasks' && row.options?.method === 'POST'));
    assert.equal(view.document.querySelector('#question').value, 'Synthetic new question');
    assert.equal(view.requests.filter(row => row.options?.method === 'POST').length, 1);
  } finally { view.close(); }
});

test('refresh links a lost queued receipt to a paused draft and deletion clears requestId', async () => {
  let deleted = false;
  const job = { id: 'synthetic-job', requestId, conversationId, question: 'Synthetic paused draft', status: 'paused', createdAt: Date.now() };
  const view = await openUi({ conversationId, setup(window) {
    window.localStorage.setItem('qa-task-identities-v1', JSON.stringify([{ requestId, conversationId, queue: true }]));
  }, fetchImpl(url, options = {}) {
    if (url === '/api/qa/queue/synthetic-job' && options.method === 'DELETE') { deleted = true; return json({ removed: true }); }
    if (url.startsWith('/api/qa/queue?')) return json({ queue: deleted ? [] : [job] });
    if (url.includes('requestId=')) return json(deleted
      ? { tasks: [], receipt: { requestId, conversationId, status: 'cancelled' } } : { tasks: [], job });
    if (url === '/api/qa/tasks' && options.method === 'POST') return new Response('{}', { status: 429 });
    return conversations(url);
  } });
  try {
    await until(() => JSON.parse(view.window.localStorage.getItem('qa-task-identities-v1'))[0]?.jobId === job.id);
    await until(() => view.document.querySelector('.queued-controls'));
    assert.equal(view.requests.some(row => row.options?.method === 'POST'), false);
    view.document.querySelector('.queued-controls button:last-child').click();
    await until(() => view.window.localStorage.getItem('qa-task-identities-v1') === '[]');
    await until(() => !view.document.querySelector('.queued-controls'));
    submit(view, 'Synthetic next explicit question');
    await until(() => view.requests.some(row => row.url === '/api/qa/tasks' && row.options?.method === 'POST'));
    assert.equal(view.requests.filter(row => row.options?.method === 'POST').length, 1);
  } finally { view.close(); }
});

for (const knownJob of [false, true]) test(`refresh after a lost draft deletion consumes only the cancelled request receipt (known job: ${knownJob})`, async () => {
  const view = await openUi({ conversationId, setup(window) {
    window.localStorage.setItem('qa-task-identities-v1', JSON.stringify([{ requestId, conversationId, queue: true,
      ...(knownJob ? { jobId: 'synthetic-job' } : {}) }]));
  }, fetchImpl(url) {
    if (url.includes('requestId=')) return json({ tasks: [], receipt: { requestId, conversationId, status: 'cancelled' } });
    return conversations(url);
  } });
  try {
    await until(() => view.window.localStorage.getItem('qa-task-identities-v1') === '[]');
    assert.equal(view.requests.some(row => ['POST', 'DELETE'].includes(row.options?.method)), false);
  } finally { view.close(); }
});

test('422 rejects visibly in both languages without lookup and retains the draft', async () => {
  const view = await openUi({ conversationId, fetchImpl(url, options = {}) {
    if (url === '/api/qa/tasks' && options.method === 'POST') return new Response('{}', { status: 422 });
    return conversations(url);
  } });
  try {
    await until(() => view.requests.some(row => row.url.startsWith('/api/qa/queue?')));
    for (const locale of ['zh', 'en']) {
      if (locale === 'en') view.document.querySelector('#languageButton').click();
      submit(view, 'Synthetic invalid retained draft');
      await until(() => /未被接收|rejected/.test(view.document.querySelector('#requestStatus').textContent));
      assert.equal(view.document.querySelector('#question').value, 'Synthetic invalid retained draft');
      assert.equal(view.window.localStorage.getItem('qa-task-identities-v1'), '[]');
      assert.equal(view.requests.some(row => row.url.includes('requestId=')), false);
    }
  } finally { view.close(); }
});
