import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi } from '../test-support/ui-harness.mjs';

test('Docker UI initializes with administration removed and renders a usable welcome', async () => {
  const ui = await openUi({ setup(window) { window.document.querySelector('.admin-link').remove(); } });
  try {
    assert.equal(ui.document.querySelector('.admin-link'), null);
    assert.ok(ui.document.querySelector('.welcome'));
    assert.ok(ui.document.querySelector('.suggestion-question'));
    assert.equal(ui.document.querySelector('#sendButton').disabled, true);
    const input = ui.document.querySelector('#question');
    input.value = 'synthetic draft';
    input.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
    assert.equal(ui.document.querySelector('#sendButton').disabled, false);
  } finally { ui.close(); }
});
