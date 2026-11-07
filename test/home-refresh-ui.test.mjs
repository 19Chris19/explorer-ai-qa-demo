import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi } from '../test-support/ui-harness.mjs';

test('homepage offers three editable suggestions after the composer without submitting', async () => {
  const ui = await openUi();
  try {
    const { document, window, requests } = ui;
    const form = document.querySelector('#askForm');
    const strip = document.querySelector('#suggestionStrip');
    const suggestions = [...strip.querySelectorAll('.suggestion-question')];
    assert.equal(suggestions.length, 3);
    assert.equal(new Set(suggestions.map(item => item.dataset.questionId)).size, 3);
    assert.ok(form.compareDocumentPosition(strip) & window.Node.DOCUMENT_POSITION_FOLLOWING);
    suggestions[1].click();
    assert.equal(document.querySelector('#question').value, suggestions[1].dataset.question);
    assert.equal(document.activeElement, document.querySelector('#question'));
    assert.equal(requests.some(item => item.options?.method === 'POST'), false);
  } finally { ui.close(); }
});

test('community placeholder opens as a dialog and Escape restores focus without claiming a join link', async () => {
  const ui = await openUi();
  try {
    const { document, window, requests } = ui;
    const open = document.querySelector('#communityOpen');
    const dialog = document.querySelector('#communityDialog');
    const close = document.querySelector('#communityClose');
    open.click();
    assert.equal(dialog.open, true);
    assert.equal(open.getAttribute('aria-expanded'), 'true');
    assert.equal(document.activeElement, close);
    assert.match(dialog.textContent, /示意 · 不可扫码/u);
    assert.match(dialog.textContent, /入群方式待配置/u);
    assert.equal(dialog.querySelector('a[href]'), null);
    const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    close.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true);
    close.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(dialog.open, false);
    assert.equal(open.getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement, open);
    assert.equal(requests.some(item => item.options?.method === 'POST'), false);
  } finally { ui.close(); }
});

test('header and menu theme switches share the same saved preference', async () => {
  const ui = await openUi();
  try {
    const quick = ui.document.querySelector('#themeQuickToggle');
    const menu = ui.document.querySelector('#darkModeButton');
    quick.click();
    assert.equal(ui.document.body.classList.contains('dark'), true);
    assert.equal(quick.getAttribute('aria-pressed'), 'true');
    assert.equal(menu.getAttribute('aria-pressed'), 'true');
    assert.equal(ui.window.localStorage.getItem('qa-ui-dark'), 'true');
    menu.click();
    assert.equal(ui.document.body.classList.contains('dark'), false);
    assert.equal(quick.getAttribute('aria-pressed'), 'false');
    assert.equal(ui.window.localStorage.getItem('qa-ui-dark'), 'false');
  } finally { ui.close(); }
});
