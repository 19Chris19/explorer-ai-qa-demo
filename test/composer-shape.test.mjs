import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeComposer, observeComposerWidth } from '../public/composer-shape.mjs';

test('composer follows wrapping and shrinks without changing drafts, focus or width', () => {
  const form = { dataset: {} };
  let height = 24;
  const input = { style: {}, value: 'synthetic draft', get scrollHeight() {
    assert.equal(this.style.height, '0px'); return height;
  } };
  const style = { lineHeight: '24px', maxHeight: '144px' };
  for (const [measured, lines, shape] of [[24.1, 1, 'single'], [48, 2, 'medium'], [72, 3, 'medium'], [96, 4, 'long'], [240, 10, 'long'], [24, 1, 'single']]) {
    height = measured;
    assert.deepEqual(resizeComposer(form, input, style), { lines, shape, height: Math.min(height, 144) });
    assert.equal(input.style.overflowY, height > 144 ? 'auto' : 'hidden');
    assert.equal(input.value, 'synthetic draft');
    assert.equal(input.style.width, undefined);
  }
  input.value = '';
  height = 240;
  assert.deepEqual(resizeComposer(form, input, style), { lines: 1, height: 24, shape: 'single' });
  assert.equal(input.style.overflowY, 'hidden');
});

test('composer observes width changes without a textarea-height resize feedback loop', () => {
  let callback;
  let calls = 0;
  const frames = [];
  const input = {};
  const observer = observeComposerWidth(input, () => { calls += 1; }, class {
    constructor(fn) { callback = fn; }
    observe(target) { assert.equal(target, input); }
  }, fn => frames.push(fn));
  assert.ok(observer);
  callback([{ target: input, contentRect: { width: 500, height: 24 } }]);
  callback([{ target: input, contentRect: { width: 500, height: 144 } }]);
  assert.equal(calls, 0);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(calls, 1);
  callback([{ target: input, contentRect: { width: 180, height: 144 } }]);
  callback([{ target: {}, contentRect: { width: 700 } }]);
  callback([{ target: input, contentRect: { width: 170, height: 144 } }]);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(calls, 2);
});

test('multiline layout is chosen at compact width, not its expanded width', () => {
  const form = { dataset: {} };
  const input = { style: {}, value: 'synthetic long draft', scrollHeight: 24 };
  const style = { lineHeight: '24px', maxHeight: '144px' };
  resizeComposer(form, input, style, () => 48);
  assert.equal(form.dataset.layout, 'stacked');
  assert.equal(form.dataset.textShape, 'medium');
  resizeComposer(form, input, style, () => 48);
  assert.equal(form.dataset.layout, 'stacked');
  input.value = 'short';
  resizeComposer(form, input, style, () => 24);
  assert.equal(form.dataset.layout, 'compact');
  input.value = 'first\nsecond';
  resizeComposer(form, input, style, () => 24);
  assert.equal(form.dataset.layout, 'stacked');
  input.value = '';
  resizeComposer(form, input, style, () => 240);
  assert.equal(form.dataset.layout, 'compact');
  assert.equal(form.dataset.textShape, 'single');
});
