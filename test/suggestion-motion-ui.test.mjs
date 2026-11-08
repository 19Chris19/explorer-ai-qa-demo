import test from 'node:test';
import assert from 'node:assert/strict';
import { openUi } from '../test-support/ui-harness.mjs';

function motionHarness(window, animations) {
  window.matchMedia = () => ({ matches: false });
  const form = window.document.querySelector('#askForm');
  const input = window.document.querySelector('#question');
  let expanding = false;
  form.getBoundingClientRect = () => ({ height: form.dataset.layout === 'stacked' ? 122 : 58 });
  input.getBoundingClientRect = () => ({ top: expanding ? 70 : 80, left: 30, width: 300 });
  window.document.querySelector('#chatLog').style.marginTop = '80px';
  window.Element.prototype.animate = function (frames, options) {
    if (this === form && frames.some(frame => frame.height)) expanding = true;
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
    assert.equal(resize.options.duration, 520);
    const reveal = animations.find(item => item.target === input);
    assert.ok(reveal);
    const flight = document.querySelector('.suggestion-flight');
    assert.ok(flight);
    const travel = animations.find(item => item.target === flight);
    const landing = animations.find(item => item.target === form && item.frames.some(frame => frame.transform));
    assert.ok(landing);
    assert.equal(travel.frames.at(-1).transform, 'translate(30px, 80px)');
    assert.equal(travel.frames.at(-1).width, '300px');
    assert.equal(landing.options.delay, travel.options.duration);
    assert.ok(landing.frames.some(frame => /scaleY/.test(frame.transform || '')));
    input.value = '用户正在修改';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(input.value, '用户正在修改');
    assert.equal(reveal.cancelled, true);
    assert.equal(landing.cancelled, true);
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

test('keyboard input cancels a pending landing without changing the draft', async () => {
  const animations = [];
  const ui = await openUi({ setup: window => motionHarness(window, animations) });
  try {
    animations.length = 0;
    const { document, window } = ui;
    const button = document.querySelector('.suggestion-question');
    button.click();
    const input = document.querySelector('#question');
    const value = input.value;
    const flight = document.querySelector('.suggestion-flight');
    const travel = animations.find(item => item.target === flight);
    const reveal = animations.find(item => item.target === input);
    const landing = animations.find(item => item.target.id === 'askForm' && item.frames.some(frame => frame.transform));
    travel.finish();
    reveal.finish();
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.equal(landing.cancelled, true);
    assert.equal(input.value, value);
    assert.equal(document.activeElement, input);
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
