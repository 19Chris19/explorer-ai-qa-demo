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
