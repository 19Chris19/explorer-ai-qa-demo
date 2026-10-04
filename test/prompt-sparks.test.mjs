import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createPromptSparks } from '../public/prompt-sparks.mjs';

test('prompt sparks run continuously while active and clean up when disabled', () => {
  const callbacks = new Map();
  let nextFrame = 0;
  let arcs = 0;
  let clears = 0;
  const context = {
    setTransform() {},
    clearRect() { clears += 1; },
    beginPath() {},
    arc() { arcs += 1; },
    fill() {},
    globalAlpha: 1,
    fillStyle: '',
    shadowColor: '',
    shadowBlur: 0,
  };
  const canvas = {
    dataset: {},
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 640, height: 72 }),
  };
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  const windowRef = {
    devicePixelRatio: 2,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame(callback) { nextFrame += 1; callbacks.set(nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    ResizeObserver: ResizeObserverStub,
    getComputedStyle: () => ({ getPropertyValue: name => {
      assert.equal(name, '--web-spark');
      return '#00a3ff';
    } }),
  };

  const sparks = createPromptSparks(canvas, { root: {}, windowRef });
  sparks.setActive(true);
  assert.equal(Object.hasOwn(canvas.dataset, 'active'), true);
  assert.equal(callbacks.size, 1);
  const first = callbacks.values().next().value;
  callbacks.clear();
  first(16);
  assert.ok(arcs > 0);
  assert.equal(context.fillStyle, '#00a3ff');
  assert.equal(callbacks.size, 1);

  sparks.setActive(false);
  assert.equal(Object.hasOwn(canvas.dataset, 'active'), false);
  assert.equal(callbacks.size, 0);
  assert.ok(clears >= 2);
});

test('web diffusion is independent of theme accent and does not tint the whole surface', () => {
  const css = readFileSync(new URL('../public/chat.css', import.meta.url), 'utf8');
  assert.match(css, /--web-glow-blue: #0066ff/);
  assert.match(css, /--web-glow-cyan: #00d8ff/);
  assert.match(css, /--web-spark: #00a3ff/);
  for (const selector of ['.app-page .composer::before', '.app-page .composer.is-web-armed', '.app-page .composer.is-web-searching']) {
    const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    assert.match(block, /var\(--web-glow-/);
    assert.doesNotMatch(block, /var\(--accent/);
  }
  const armed = css.slice(css.indexOf('.app-page .composer.is-web-armed {')).split('}')[0];
  assert.match(armed, /background: var\(--surface\)/);
});

test('sparks preserve requested state across reduced motion and page visibility', () => {
  const preference = new EventTarget();
  preference.matches = true;
  const documentRef = new EventTarget();
  documentRef.hidden = false;
  const frames = new Map();
  let id = 0;
  const canvas = {
    dataset: {}, getBoundingClientRect: () => ({ width: 640, height: 56 }),
    getContext: () => ({ setTransform() {}, clearRect() {} }),
  };
  const sparks = createPromptSparks(canvas, {
    documentRef,
    windowRef: {
      matchMedia: () => preference,
      requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
      cancelAnimationFrame(key) { frames.delete(key); },
      ResizeObserver: class { observe() {} disconnect() {} },
    },
  });
  sparks.setActive(true);
  assert.equal(frames.size, 0);
  preference.matches = false;
  preference.dispatchEvent(new Event('change'));
  assert.equal(frames.size, 1);
  documentRef.hidden = true;
  documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(frames.size, 0);
  documentRef.hidden = false;
  documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(frames.size, 1);
  preference.matches = true;
  preference.dispatchEvent(new Event('change'));
  assert.equal(frames.size, 0);
  sparks.setActive(false);
  preference.matches = false;
  preference.dispatchEvent(new Event('change'));
  assert.equal(frames.size, 0);
  sparks.setActive(true);
  sparks.destroy();
  preference.dispatchEvent(new Event('change'));
  documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(frames.size, 0);
});
