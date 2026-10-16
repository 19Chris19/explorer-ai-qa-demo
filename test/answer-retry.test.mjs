import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi, until } from '../test-support/ui-harness.mjs';

async function fixture(t, { status = 'failed', denyCheck = false } = {}) {
  const task = { id: 'synthetic-failed', conversationId: 'synthetic-conversation', question: 'original synthetic question', sourceIntent: 'web', status, lastEventId: 3 };
  const events = [{ id: 1, event: 'task.status', data: { status: 'running' } },
    { id: 2, event: 'error', data: { failureReason: 'upstream_failed' } }, { id: 3, event: 'task.status', data: { status } }];
  const posts = []; let checkDenied = false;
  const page = await openUi({ conversationId: task.conversationId,
    fetchImpl: async (url, options) => {
      const json = data => ({ ok: true, json: async () => data });
      if (url === `/api/qa/conversations/${task.conversationId}`) return json({ conversation: { conversationId: task.conversationId }, messages: [] });
      if (url.startsWith('/api/qa/tasks?')) return json({ tasks: [task] });
      if (url === `/api/qa/tasks/${task.id}`) {
        if (checkDenied) return { ok: false, status: 403 };
        return json({ task, snapshot: { events } });
      }
      if (url === '/api/qa/tasks' && options?.method === 'POST') {
        posts.push(JSON.parse(options.body));
        const next = { ...task, id: 'synthetic-retry', requestId: posts.at(-1).requestId, status: 'succeeded', lastEventId: 4 };
        return json({ task: next });
      }
      if (url === '/api/qa/tasks/synthetic-retry') return json({ task: { ...task, id: 'synthetic-retry', status: 'succeeded', lastEventId: 4 }, snapshot: { events: [
        { id: 1, event: 'task.status', data: { status: 'running' } }, { id: 2, event: 'delta', data: { text: 'synthetic retry answer' } },
        { id: 3, event: 'done', data: { sourceCount: 0 } }, { id: 4, event: 'task.status', data: { status: 'succeeded' } },
      ] } });
    },
  });
  t.after(() => page.close());
  await until(() => page.document.querySelector('.answer-retry') && !page.document.querySelector('.answer-retry').disabled);
  checkDenied = denyCheck;
  return { ...page, task, events, posts };
}

test('failed answer has a one-click retry even with no text; preserves draft, intent and original evidence', async t => {
  const p = await fixture(t); const original = JSON.stringify({ task: p.task, events: p.events });
  const input = p.document.querySelector('#question'); input.value = 'unsent draft'; input.dispatchEvent(new p.window.Event('input'));
  const retry = p.document.querySelector('.answer-retry'); retry.click(); retry.click();
  await until(() => p.posts.length === 1 && p.document.querySelectorAll('.answer-retry').length === 2);
  assert.equal(p.posts[0].question, 'original synthetic question'); assert.equal(p.posts[0].sourceIntent, 'web');
  assert.equal(p.posts[0].conversationId, p.task.conversationId); assert.ok(p.posts[0].requestId);
  assert.equal(input.value, 'unsent draft'); assert.equal(JSON.stringify({ task: p.task, events: p.events }), original);
  assert.ok(p.document.querySelector('.message-error')); assert.equal(p.posts.length, 1);
  assert.equal(p.document.querySelectorAll('.message.user').length, 2);
});

test('a failed task check does not send a question and offers retry later', async t => {
  const p = await fixture(t, { denyCheck: true }); p.document.querySelector('.answer-retry').click();
  await until(() => p.document.querySelector('.retry-status').textContent.includes('没有重新发送'));
  assert.equal(p.posts.length, 0); assert.equal(p.document.querySelector('.answer-retry').disabled, false);
});

test('indeterminate answers recover the same task without submitting and keep new sends gated', async t => {
  const p = await fixture(t, { status: 'indeterminate' });
  assert.equal(p.document.querySelector('.answer-retry').textContent, '恢复连接');
  p.document.querySelector('.answer-retry').click();
  await until(() => p.document.querySelector('.answer-retry')?.textContent === '恢复连接' && !p.document.querySelector('.answer-retry').disabled);
  assert.equal(p.posts.length, 0); assert.equal(p.document.querySelector('#sendButton').disabled, true);
});

test('an unknown submission with no task ID still offers recovery of the original request, never a new POST', async t => {
  let posts = 0;
  const p = await openUi({ conversationId: 'synthetic-unknown', fetchImpl: async (url, options) => {
    const json = data => ({ ok: true, json: async () => data });
    if (url === '/api/qa/conversations/synthetic-unknown') return json({ conversation: { conversationId: 'synthetic-unknown' }, messages: [] });
    if (url.startsWith('/api/qa/tasks?requestId=')) return { ok: false, status: 403 };
    if (url === '/api/qa/tasks' && options?.method === 'POST') { posts++; throw new TypeError('synthetic lost acknowledgement'); }
  } });
  t.after(() => p.close());
  await until(() => p.requests.some(row => row.url.includes('/api/qa/tasks?conversationId=synthetic-unknown')));
  const input = p.document.querySelector('#question'); input.value = 'original unsent synthetic draft'; input.dispatchEvent(new p.window.Event('input'));
  p.document.querySelector('#askForm').dispatchEvent(new p.window.Event('submit', { cancelable: true }));
  await until(() => p.document.querySelector('.answer-retry')?.textContent === '恢复连接' && !p.document.querySelector('.answer-retry').disabled);
  const identity = p.window.localStorage.getItem('qa-task-identities-v1');
  assert.equal(posts, 1); assert.equal(input.value, 'original unsent synthetic draft');
  p.document.querySelector('.answer-retry').click();
  await until(() => p.document.querySelector('.answer-retry')?.textContent === '恢复连接' && !p.document.querySelector('.answer-retry').disabled);
  assert.equal(posts, 1); assert.equal(p.window.localStorage.getItem('qa-task-identities-v1'), identity);
  assert.equal(p.document.querySelector('#sendButton').disabled, true);
});

test('restoring history places the composer directly instead of flying across answer actions', async t => {
  const composerAnimations = [];
  const p = await openUi({ conversationId: 'synthetic-history', setup: w => {
    const bounds = w.Element.prototype.getBoundingClientRect;
    w.Element.prototype.getBoundingClientRect = function () {
      return this.id === 'askForm' ? new w.DOMRect(15, w.document.querySelector('#main').classList.contains('is-empty') ? 300 : 700, 360, 60) : bounds.call(this);
    };
    w.Element.prototype.animate = function (frames) {
      if (this.id === 'askForm') composerAnimations.push(frames);
      return { cancel() {}, finished: Promise.resolve() };
    };
  }, fetchImpl: async url => {
    if (url === '/api/qa/conversations/synthetic-history') return { ok: true, json: async () => ({ conversation: { conversationId: 'synthetic-history' },
      messages: [{ role: 'user', content: 'synthetic history question' }, { role: 'assistant', content: 'synthetic history answer' }] }) };
  } });
  t.after(() => p.close());
  await until(() => p.document.querySelector('.chat-thread .message.assistant'));
  assert.equal(composerAnimations.length, 0);
});
