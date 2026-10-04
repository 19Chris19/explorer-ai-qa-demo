import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi } from '../test-support/ui-harness.mjs';

test('suggestions protect unsent drafts, hide without removing space and never submit', async () => {
  const ui = await openUi();
  try {
    const input = ui.document.querySelector('#question');
    const strip = ui.document.querySelector('#suggestionStrip');
    const suggestion = ui.document.querySelector('.suggestion-question');
    input.value = '不能覆盖的合成草稿';
    input.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
    assert.equal(strip.classList.contains('has-draft'), true);
    assert.equal(strip.hidden, false);
    suggestion.click();
    assert.equal(input.value, '不能覆盖的合成草稿');
    input.value = '';
    input.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
    assert.equal(strip.classList.contains('has-draft'), false);
    input.dispatchEvent(new ui.window.CompositionEvent('compositionstart', { bubbles: true }));
    suggestion.click();
    assert.equal(input.value, '');
    input.dispatchEvent(new ui.window.CompositionEvent('compositionend', { bubbles: true }));
    suggestion.click();
    assert.equal(input.value, suggestion.dataset.question);
    assert.equal(strip.classList.contains('has-draft'), true);
    assert.equal(ui.document.activeElement, input);
    assert.equal(ui.requests.some(item => item.options?.method === 'POST'), false);
  } finally { ui.close(); }
});
