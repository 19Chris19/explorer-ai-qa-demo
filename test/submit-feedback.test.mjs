import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi, until } from '../test-support/ui-harness.mjs';

const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
const submit = view => view.document.querySelector('#askForm').dispatchEvent(new view.window.Event('submit', { bubbles: true, cancelable: true }));

test('send feedback precedes both POSTs; history refresh and task snapshot do not block the accepted turn', async () => {
  const create = gate(), post = gate(), history = gate(), snapshot = gate();
  let creating = false, input, historyReads = 0;
  const task = { id: 'synthetic-task', conversationId: 'synthetic-conversation', status: 'running', lastEventId: 0 };
  const view = await openUi({ async fetchImpl(url, options = {}) {
    if (url === '/api/qa/archive/conversations') return json({ conversations: [] });
    if (url === '/api/qa/conversations' && options.method === 'POST') {
      creating = true; await create.promise;
      return json({ conversation: { conversationId: task.conversationId } });
    }
    if (url === '/api/qa/conversations') {
      historyReads++;
      if (creating) await history.promise;
      return json({ conversations: [] });
    }
    if (url === '/api/qa/tasks' && options.method === 'POST') {
      input = JSON.parse(options.body); await post.promise;
      return json({ task: { ...task, requestId: input.requestId } });
    }
    if (url === `/api/qa/tasks/${task.id}`) {
      await snapshot.promise;
      return json({ task: { ...task, status: 'succeeded', lastEventId: 3 }, snapshot: { events: [
        { id: 1, event: 'delta', data: { text: 'Synthetic answer' } },
        { id: 2, event: 'done', data: {} }, { id: 3, event: 'task.status', data: { status: 'succeeded' } },
      ] } });
    }
  } });
  try {
    const draft = view.document.querySelector('#question');
    const button = view.document.querySelector('#sendButton');
    const status = view.document.querySelector('#requestStatus');
    draft.value = 'Synthetic question';
    draft.dispatchEvent(new view.window.Event('input', { bubbles: true }));
    submit(view);
    assert.equal(button.classList.contains('is-submitting'), true);
    assert.equal(button.getAttribute('aria-busy'), 'true');
    assert.equal(button.disabled, true);
    assert.match(status.textContent, /正在准备会话/);
    submit(view);
    assert.equal(view.requests.filter(row => row.options?.method === 'POST').length, 1);
    assert.equal(draft.value, 'Synthetic question');
    create.release();
    await until(() => input);
    assert.match(status.textContent, /正在发送问题/);
    assert.equal(historyReads, 1, 'do not refresh history before submitting the task');
    assert.equal(view.document.querySelector('.message.user'), null);
    post.release();
    await until(() => view.document.querySelector('.message.user'));
    assert.equal(view.document.querySelectorAll('.message.user').length, 1);
    assert.equal(view.document.querySelectorAll('.message.assistant').length, 1);
    assert.equal(draft.value, '');
    assert.equal(button.classList.contains('is-submitting'), false);
    snapshot.release(); history.release();
    await until(() => status.textContent === '回答已完成');
    assert.equal(view.document.querySelectorAll('.message.user').length, 1);
    assert.equal(view.requests.filter(row => row.url === '/api/qa/tasks' && row.options?.method === 'POST').length, 1);
  } finally { create.release(); post.release(); history.release(); snapshot.release(); view.close(); }
});
