import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openUi, until } from '../test-support/ui-harness.mjs';
import { lifecycleView } from '../public/turn-lifecycle.mjs';

test('old history gets a neutral anchor without inventing elapsed time or completion evidence', () => {
  assert.deepEqual(lifecycleView({ outcome: 'history' }), { status: 'history', label: '知识库回答', details: '', settled: true });
  assert.equal(lifecycleView({ outcome: 'history', locale: 'en' }).label, 'Knowledge base answer');
});

test('each restored answer has an aligned lifecycle before explicit process, body and evidence', async () => {
  const view = await openUi({
    conversationId: 'synthetic-reading',
    setup: window => {
      const style = window.document.createElement('style');
      style.textContent = readFileSync(new URL('../public/chat.css', import.meta.url), 'utf8');
      window.document.head.append(style);
    },
    fetchImpl: async url => url === '/api/qa/conversations/synthetic-reading' ? { ok: true, json: async () => ({
      conversation: { conversationId: 'synthetic-reading' }, messages: [
        { role: 'user', content: '合成旧问题' }, { role: 'assistant', content: '合成旧回答' },
        { role: 'user', content: '合成新问题' }, { role: 'assistant', content: '合成新回答', sourceCount: 2,
          process: [{ kind: 'status', text: '合成检索' }], timing: { elapsed_ms: 1200 } },
      ],
    }) } : null,
  });
  try {
    await until(() => view.document.querySelectorAll('.message.assistant').length === 2);
    const answers = [...view.document.querySelectorAll('.message.assistant')];
    assert.equal(answers[0].firstElementChild.className, 'answer-lifecycle is-settled');
    assert.equal(answers[0].querySelector('.answer-lifecycle-details').textContent, '');
    assert.equal(answers[1].children[0].classList.contains('answer-lifecycle'), true);
    assert.equal(answers[1].children[1].className, 'answer-process');
    assert.equal(answers[1].children[2].className, 'message-content');
    assert.equal(answers[1].querySelector('.source-count').textContent, '检索资料 2 条');
    assert.equal(view.window.getComputedStyle(answers[1]).marginTop, '18px');
    assert.equal(view.window.getComputedStyle(view.document.querySelector('.message.assistant + .message.user')).marginTop, '36px');
  } finally { view.close(); }
});
