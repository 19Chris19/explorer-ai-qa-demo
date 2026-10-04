import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createAnswerProcess } from '../public/answer-process.mjs';

function fixture() {
  const dom = new JSDOM('<article><div class="message-content">## Analysis: ordinary answer</div></article>');
  return { dom, message: dom.window.document.querySelector('article') };
}

test('explicit process expands live, collapses only on success, and can reopen', () => {
  const { dom, message } = fixture();
  try {
    const view = createAnswerProcess(message);
    assert.equal(message.querySelector('details'), null);
    view.push({ kind: 'reasoning', text: 'Unproved discriminator' });
    assert.equal(message.querySelector('details'), null);
    view.push({ kind: 'status', text: 'Synthetic retrieval progress' });
    const details = message.querySelector('details');
    assert.equal(details.open, true);
    view.push({ kind: 'status', text: 'Synthetic retrieval progress' });
    assert.equal(details.querySelectorAll('li').length, 1);
    view.settle('interrupted');
    assert.equal(details.open, true);
    view.settle('done');
    assert.equal(details.open, false);
    details.open = true;
    assert.equal(details.querySelector('li').textContent, 'Synthetic retrieval progress');
    assert.equal(message.querySelector('.message-content').textContent, '## Analysis: ordinary answer');
  } finally { dom.window.close(); }
});

test('history stays safely reopenable and malformed or excessive entries are ignored', () => {
  const { dom, message } = fixture();
  try {
    const malicious = '<img src=x onerror="throw 1"><script>throw 1</script>';
    const view = createAnswerProcess(message, { history: [{ kind: 'status', text: malicious }] });
    assert.equal(message.querySelector('details').open, false);
    assert.equal(message.querySelector('li').textContent, malicious);
    assert.equal(message.querySelector('img, script'), null);
    view.push({ kind: 'status', text: 'x'.repeat(2049) });
    for (let n = 0; n < 60; n++) view.push({ kind: 'status', text: `Synthetic ${n}` });
    assert.equal(message.querySelectorAll('li').length, 40);
  } finally { dom.window.close(); }
});
