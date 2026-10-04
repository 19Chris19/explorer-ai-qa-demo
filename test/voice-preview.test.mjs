import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoicePreview } from '../public/voice-preview.mjs';

function fixture() {
  const documentRef = new EventTarget();
  documentRef.hidden = false;
  const timers = new Map();
  const changes = [];
  let id = 0;
  const preview = createVoicePreview({
    documentRef, onChange: value => changes.push(value),
    setTimeout(fn, delay) { assert.equal(delay, 4000); timers.set(++id, fn); return id; },
    clearTimeout(key) { timers.delete(key); },
  });
  return { preview, documentRef, timers, changes };
}

test('voice preview toggles and expires without stale timers stopping a new preview', () => {
  const { preview, timers, changes } = fixture();
  preview.toggle();
  assert.equal(preview.active, true);
  const stale = timers.values().next().value;
  preview.toggle();
  assert.equal(preview.active, false);
  assert.equal(timers.size, 0);
  preview.toggle();
  stale();
  assert.equal(preview.active, true);
  timers.values().next().value();
  assert.equal(preview.active, false);
  assert.equal(timers.size, 0);
  assert.deepEqual(changes, [true, false, true, false]);
  preview.destroy();
});

test('Escape, hiding, explicit cancellation and destruction stop visual preview', () => {
  const { preview, documentRef, timers } = fixture();
  preview.toggle();
  documentRef.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  assert.equal(preview.active, false);
  preview.toggle();
  documentRef.hidden = true;
  documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(preview.active, false);
  preview.toggle();
  assert.equal(preview.active, false);
  documentRef.hidden = false;
  preview.toggle();
  preview.stop();
  assert.equal(preview.active, false);
  preview.toggle();
  preview.destroy();
  preview.toggle();
  assert.equal(preview.active, false);
  assert.equal(timers.size, 0);
});
