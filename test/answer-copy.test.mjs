import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import { createAnswerCopy } from '../public/answer-copy.mjs';
import { openUi, until } from '../test-support/ui-harness.mjs';

const window = new JSDOM('').window;
Object.assign(globalThis, { document: window.document, marked, DOMPurify: createDOMPurify(window) });
await import('../public/answer-markdown.js');
const clean = (...args) => globalThis.ImaAnswerMarkdown.answerMarkdownForCopy(...args);

test('copy removes only known citations and preserves Markdown syntax and literal technical text', () => {
  const raw = '# 建议 [1]\n\n**正文 [1]**、保留 [9]、`[1]`、\\[1]、[1](https://example.com)\n\n'
    + '> 引用 [1]\n\n- 列表 [1]\n\n| 项 | 值 |\n| --- | --- |\n| a\\|b | 16GB [1] |\n\n'
    + '```js\narray[1]\n```\n\n来源 [1](@context-ref?id=42) 4090。\n';
  const result = clean(raw, { sourceIndexes: [1] });
  assert.equal(result, raw.replace('# 建议 [1]', '# 建议 ').replace('**正文 [1]**', '**正文 **')
    .replace('> 引用 [1]', '> 引用 ').replace('- 列表 [1]', '- 列表 ')
    .replace('16GB [1]', '16GB ').replace('[1](@context-ref?id=42)', ''));
  assert.equal(clean(raw, { sourceIndexes: [] }), raw);
  assert.equal(clean('| 项 | 值 |\n| --- |\n| A | 4090 |'), '| 项 | 值 |\n| --- |\n| A | 4090 |');
});

test('copy stays hidden while streaming, copies once and gives bounded feedback without UI metadata', async () => {
  const message = window.document.createElement('article');
  message.textContent = '用时 8 秒 · 检索资料 2 条 · 过程与邀请';
  window.document.body.append(message);
  const written = [], timers = [];
  const control = createAnswerCopy(message, {
    getMarkdown: () => '**合成正文**\n\n| A | B |\n| --- | --- |',
    getLabel: key => key, writeText: async text => written.push(text),
    schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, cancel: () => {},
  });
  const button = message.querySelector('.answer-copy');
  assert.equal(button.parentElement.hidden, true);
  control.setReady(true);
  button.click(); button.click();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(written.length, 1);
  assert.equal(written[0], '**合成正文**\n\n| A | B |\n| --- | --- |');
  assert.equal(button.getAttribute('aria-label'), 'copied');
  assert.equal(timers[0].ms, 1500);
  timers[0].fn();
  assert.equal(button.getAttribute('aria-label'), 'copyAnswer');
  control.destroy(); message.remove();
});

test('partial copy is explicit and clipboard failure exposes selectable text without executing markup', async () => {
  const message = window.document.createElement('article'); window.document.body.append(message);
  const control = createAnswerCopy(message, {
    getMarkdown: () => '<img onerror=alert(1)>\nPartial [9]', getLabel: key => key,
    writeText: async () => { throw new Error('synthetic denied'); },
  });
  control.setReady(true, { partial: true });
  const button = message.querySelector('.answer-copy');
  assert.equal(button.title, 'copyPartial');
  button.click(); await Promise.resolve(); await Promise.resolve();
  assert.equal(message.querySelector('.copy-fallback textarea').value, '<img onerror=alert(1)>\nPartial [9]');
  assert.equal(message.querySelector('img'), null);
  assert.equal(message.querySelector('.copy-status').textContent, 'copyFailed');
  message.querySelector('.copy-fallback-close').click();
  assert.equal(message.querySelector('.copy-fallback'), null);
  control.destroy(); message.remove();
});

test('restored history copy reads original Markdown and structured citations, not rendered status or process', async () => {
  const written = [];
  const raw = '**合成回答** [1]\n\n| 项 | 值 |\n| --- | --- |\n| A | 16GB |\n\n`array[1]`';
  const view = await openUi({
    conversationId: 'synthetic-copy',
    setup: window => Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async text => written.push(text) } }),
    fetchImpl: async url => url === '/api/qa/conversations/synthetic-copy' ? { ok: true, json: async () => ({
      conversation: { conversationId: 'synthetic-copy' }, messages: [
        { role: 'user', content: '合成问题' },
        { role: 'assistant', content: raw, sources: [{ index: 1 }], sourceCount: 1,
          timing: { elapsed_ms: 5000 }, process: [{ kind: 'status', text: '合成过程' }] },
      ],
    }) } : null,
  });
  try {
    await until(() => view.document.querySelector('.answer-copy'));
    view.document.querySelector('.answer-copy').click();
    await until(() => written.length);
    assert.equal(written[0], raw.replace('**合成回答** [1]', '**合成回答** '));
    assert.doesNotMatch(written[0], /合成过程|用时|检索资料/);
    assert.equal(view.document.querySelectorAll('.message.assistant table').length, 1);
  } finally { view.close(); }
});
