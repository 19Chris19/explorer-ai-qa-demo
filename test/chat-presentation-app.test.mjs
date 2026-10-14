import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi, until } from '../test-support/ui-harness.mjs';

test('actual site app renders chat_v1 citations and recommendations, preserves the carousel and protects the composer', async () => {
  let input;
  const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  const task = { id: 'synthetic-task', conversationId: 'synthetic-chat', status: 'running' };
  const data = [
    ['sources', { sourceCount: 2, citationMap: { 'index:42': { type: 'web', sources: [{ url: 'https://example.org/paper', title: 'Synthetic web', snippet: 'supplied excerpt' }] },
      'index:5': { type: 'knowledge' } } }],
    ['delta', { text: 'Answer[7](@index-ref?id=42)[2](@index-ref?id=5)' }],
    ['process', { phase: 'web', status: 'completed' }],
    ['suggestions', { suggestions: ['one', 'two', 'three'] }],
    ['done', { source_count: 2, web_source_count: 1, knowledge_source_count: 1, answer_basis: 'mixed' }],
    ['task.status', { status: 'succeeded' }],
  ];
  const ui = await openUi({ presentation: true, fetchImpl: async (url, options = {}) => {
    if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation: { conversationId: task.conversationId } });
    if (url === '/api/qa/archive/conversations') return json({ conversations: [] });
    if (url === '/api/qa/tasks' && options.method === 'POST') { input = JSON.parse(options.body); return json({ task }); }
    if (url === '/api/qa/tasks/synthetic-task') return json({ task: { ...task, status: 'succeeded', lastEventId: data.length },
      snapshot: { events: data.map(([event, value], index) => ({ id: index + 1, event, data: value })) } });
    return null;
  } });
  try {
    assert.ok(ui.document.querySelector('.suggestion-question'), 'homepage carousel still exists');
    const question = ui.document.querySelector('#question');
    question.value = 'Synthetic question'; question.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
    ui.document.querySelector('#askForm').dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => ui.document.querySelector('.chat-suggestions button') && !ui.document.querySelector('#sendButton').classList.contains('is-busy'));
    assert.equal(input.question, 'Synthetic question');
    assert.equal(ui.document.querySelector('[data-citation-key="index:42"]').textContent, '7');
    assert.equal(ui.document.querySelectorAll('.chat-citation-static').length, 1);
    assert.match(ui.document.querySelector('.chat-process').textContent, /联网搜索/);
    assert.ok(ui.requests.some(row => row.url === '/api/qa/tasks/synthetic-task?presentation=chat_v1'));
    ui.document.querySelector('.chat-suggestions button').click();
    assert.equal(question.value, 'one');
    assert.ok([...ui.document.querySelectorAll('.chat-suggestions button')].every(control => control.disabled));
    const posts = ui.requests.filter(row => row.options?.method === 'POST');
    assert.equal(posts.filter(row => row.url === '/api/qa/tasks').length, 1, 'recommendation does not send');
    question.value = 'Existing draft'; question.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
    ui.document.querySelector('.chat-suggestions button:nth-child(2)').click();
    assert.equal(question.value, 'Existing draft');
  } finally { ui.close(); }
});
