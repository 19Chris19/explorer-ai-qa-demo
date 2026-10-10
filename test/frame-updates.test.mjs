import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameUpdater } from '../public/task-stream.mjs';

function fixture() {
  const frames = new Map(); let id = 0; const seen = [];
  const updater = createFrameUpdater(value => seen.push(value), {
    schedule: fn => { frames.set(++id, fn); return id; },
    cancel: key => frames.delete(key),
  });
  return { updater, frames, seen, tick() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); } };
}

test('a burst renders the latest accumulated value once, not every delta', () => {
  const f = fixture();
  for (let i = 1; i <= 100; i++) f.updater.schedule({ text: 'x'.repeat(i) });
  assert.equal(f.frames.size, 1); assert.equal(f.seen.length, 0);
  f.tick(); assert.deepEqual(f.seen, [{ text: 'x'.repeat(100) }]);
  f.updater.schedule({ text: 'next' }); f.tick(); assert.equal(f.seen.length, 2);
});

test('terminal flush is immediate even when a background tab has no animation frames', () => {
  const f = fixture(); f.updater.schedule('final table'); f.updater.flush();
  assert.deepEqual(f.seen, ['final table']); assert.equal(f.frames.size, 0);
  f.tick(); assert.equal(f.seen.length, 1);
});

test('disposing a switched conversation cannot mutate its detached view', () => {
  const f = fixture(); f.updater.schedule('old'); f.updater.dispose();
  f.tick(); f.updater.schedule('late'); f.updater.flush();
  assert.equal(f.seen.length, 0); assert.equal(f.frames.size, 0);
});
