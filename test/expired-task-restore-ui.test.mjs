import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi, until } from '../test-support/ui-harness.mjs';

for (const status of ['failed', 'cancelled']) {
  test(`expired ${status} receipt leaves history readable and the composer usable`, async () => {
    const json = value => ({ ok: true, json: async () => value });
    const receipt = { id: 'synthetic-expired', requestId: 'synthetic-request',
      conversationId: 'synthetic-session', status, eventsExpired: true };
    const ui = await openUi({
      conversationId: receipt.conversationId,
      setup(window) {
        window.localStorage.setItem('qa-task-identities-v1', JSON.stringify([
          { id: receipt.id, requestId: receipt.requestId, conversationId: receipt.conversationId },
        ]));
      },
      fetchImpl(url) {
        if (url === '/api/qa/conversations/synthetic-session') return json({
          conversation: { conversationId: receipt.conversationId },
          messages: [{ role: 'user', content: 'Synthetic saved question' },
            { role: 'assistant', content: 'Synthetic saved answer', complete: true }],
        });
        if (url.startsWith('/api/qa/tasks?')) return json({ tasks: [receipt] });
      },
    });
    try {
      await until(() => ui.document.querySelector('.message.assistant'));
      await until(() => JSON.parse(ui.window.localStorage.getItem('qa-task-identities-v1')).length === 0);
      const input = ui.document.querySelector('#question');
      input.value = 'Synthetic next draft';
      input.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
      await until(() => !ui.document.querySelector('#sendButton').disabled);
      assert.match(ui.document.querySelector('.message.assistant').textContent, /Synthetic saved answer/);
      assert.equal(ui.requests.some(r => r.url.includes('/tasks/synthetic-expired')), false);
      assert.equal(ui.requests.some(r => r.options?.method === 'POST'), false);
    } finally { ui.close(); }
  });
}
