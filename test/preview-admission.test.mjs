import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewAdmission } from '../preview-admission.mjs';

test('preview submissions are limited per visitor and duplicate key is not charged twice', () => {
  let now = 0;
  const gate = new PreviewAdmission(() => now);
  for (let n = 0; n < 10; n += 1) assert.equal(gate.admit('visitor-a', `id-${n}`), true);
  assert.equal(gate.admit('visitor-a', 'id-0'), true);
  assert.equal(gate.admit('visitor-a', 'id-10'), false);
  assert.equal(gate.admit('visitor-b', 'id-10'), true);
  now = 60_000;
  assert.equal(gate.admit('visitor-a', 'id-10'), true);
});

test('preview dispatch is serial and cancelled waiters cannot acquire a slot', async () => {
  const gate = new PreviewAdmission();
  assert.equal(gate.hasRoom(7), true);
  assert.equal(gate.hasRoom(8), false);
  const first = gate.tryEnter();
  assert.equal(gate.tryEnter(), null);
  const controller = new AbortController();
  const cancelled = gate.enter(controller.signal);
  const following = gate.enter();
  controller.abort();
  await assert.rejects(cancelled, /preview_cancelled/u);
  first();
  const release = await following;
  assert.equal(gate.tryEnter(), null);
  release();
  assert.equal(typeof gate.tryEnter(), 'function');
});
