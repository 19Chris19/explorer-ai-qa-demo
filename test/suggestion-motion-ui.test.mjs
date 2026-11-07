import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi } from '../test-support/ui-harness.mjs';

function motionHarness(window, animations) {
  window.matchMedia = () => ({ matches: false });
  const form = window.document.querySelector('#askForm');
  form.getBoundingClientRect = () => ({ height: form.dataset.layout === 'stacked' ? 122 : 58 });
  window.document.querySelector('#chatLog').style.marginTop = '80px';
  window.Element.prototype.animate = function (frames, options) {
    const animation = {
      target: this, frames, options, cancelled: false,
      cancel() { this.cancelled = true; this.oncancel?.(); },
      finish() { this.onfinish?.(); },
    };
    animations.push(animation);
    return animation;
  };
}

test('a suggested multiline draft expands in place and motion yields to immediate editing', async () => {
  const animations = [];
  const ui = await openUi({ setup: window => motionHarness(window, animations) });
  try {
    animations.length = 0;
    const { document, window } = ui;
    const main = document.querySelector('#main');
    const input = document.querySelector('#question');
    const form = document.querySelector('#askForm');
    const suggestions = [...document.querySelectorAll('.suggestion-question')];
    suggestions[0].dataset.question = '第一行问题\n第二行问题';
    suggestions[0].click();
    assert.equal(input.value, '第一行问题\n第二行问题');
    assert.equal(document.activeElement, input);
    assert.equal(main.classList.contains('is-welcome-anchored'), true);
    assert.deepEqual([...document.querySelectorAll('.suggestion-question')], suggestions);
    assert.equal(suggestions[0].classList.contains('is-flying'), true);
    assert.equal(suggestions[1].tabIndex, -1);
    const resize = animations.find(item => item.target === form);
    assert.deepEqual(resize.frames, [{ height: '58px' }, { height: '122px' }]);
    assert.equal(resize.options.duration, 280);
    const reveal = animations.find(item => item.target === input);
    assert.ok(reveal);
    assert.ok(document.querySelector('.suggestion-flight'));
    input.value = '用户正在修改';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(input.value, '用户正在修改');
    assert.equal(reveal.cancelled, true);
    assert.equal(document.querySelector('.suggestion-flight'), null);
    assert.equal(ui.requests.some(item => item.options?.method === 'POST'), false);
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    animations.filter(item => item.target === form && !item.cancelled).at(-1)?.finish();
    assert.equal(main.classList.contains('is-welcome-anchored'), false);
    assert.equal(document.querySelector('#suggestionStrip').classList.contains('has-draft'), false);
    assert.equal(document.querySelectorAll('.suggestion-question').length, 3);
  } finally { ui.close(); }
});

test('reduced motion fills a suggestion without flight or delayed text', async () => {
  const animations = [];
  const ui = await openUi({ setup(window) {
    motionHarness(window, animations);
    window.matchMedia = () => ({ matches: true });
  } });
  try {
    animations.length = 0;
    const button = ui.document.querySelector('.suggestion-question');
    button.dataset.question = '第一行问题\n第二行问题';
    button.click();
    assert.equal(ui.document.querySelector('#question').value, button.dataset.question);
    assert.equal(ui.document.querySelector('.suggestion-flight'), null);
    assert.equal(animations.some(item => item.target.id === 'question' || item.target.id === 'askForm'), false);
  } finally { ui.close(); }
});
