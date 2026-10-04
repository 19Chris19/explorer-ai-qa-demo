import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi } from '../test-support/ui-harness.mjs';

test('keyboard menu and history close return to a visible entry; pointer dismissal does not steal focus', async () => {
  const view = await openUi();
  try {
    const { document: doc, window } = view;
    const toggle = doc.querySelector('#moreToggle'), menu = doc.querySelector('#moreMenu');
    const history = doc.querySelector('#historySidebar'), question = doc.querySelector('#question');
    const escape = () => doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    toggle.focus(); toggle.click();
    assert.equal(doc.activeElement.id, 'newChat');
    escape(); assert.equal(menu.hidden, true); assert.equal(doc.activeElement, toggle);
    toggle.click(); doc.querySelector('#showHistory').click();
    assert.equal(doc.activeElement.id, 'historySearch');
    const close = doc.querySelector('#historyClose'); close.focus(); close.click();
    assert.equal(history.hidden, true); assert.equal(doc.activeElement, toggle);
    toggle.click(); doc.querySelector('#showHistory').click();
    escape(); assert.equal(doc.activeElement, toggle);
    toggle.click(); doc.querySelector('#showHistory').click();
    question.dispatchEvent(new window.Event('pointerdown', { bubbles: true })); question.focus();
    assert.equal(history.hidden, true); assert.equal(doc.activeElement, question);
    toggle.focus(); toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true, detail: 1 }));
    assert.equal(doc.activeElement, toggle);
    question.dispatchEvent(new window.Event('pointerdown', { bubbles: true })); question.focus();
    assert.equal(menu.hidden, true); assert.equal(doc.activeElement, question);
  } finally { view.close(); }
});

test('closing a panel whose focus moved elsewhere does not restore; accessibility labels follow locale', async () => {
  const view = await openUi();
  try {
    const { document: doc, window } = view;
    doc.querySelector('#moreToggle').click(); doc.querySelector('#showHistory').click();
    doc.querySelector('#question').focus();
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(doc.activeElement.id, 'question');
    doc.querySelector('#moreToggle').click(); doc.querySelector('#languageButton').click();
    assert.equal(doc.querySelector('#moreToggle').getAttribute('aria-label'), 'More options');
    assert.equal(doc.querySelector('#historyClose').getAttribute('aria-label'), 'Close recent conversations');
  } finally { view.close(); }
});
