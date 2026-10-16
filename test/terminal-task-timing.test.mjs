import test from 'node:test';
import assert from 'node:assert/strict';
import { taskLifecycleTiming, elapsedLifecycleTiming } from '../public/turn-lifecycle.mjs';

test('restoring a terminal failure freezes its duration at the recorded terminal time', () => {
  const timing = taskLifecycleTiming({ status: 'failed', createdAt: 60000,
    trace: { dispatchedAt: 61000, terminalAt: 70000 } }, {}, 100, 100000);
  assert.equal(elapsedLifecycleTiming(timing, 100).elapsedMs, 9000);
  assert.equal(elapsedLifecycleTiming(timing, 15100).elapsedMs, 9000);
  assert.equal(elapsedLifecycleTiming(timing, 15100).queueWaitMs, 1000);
});

test('a queued terminal task also stops waiting; invalid timestamps are not used as evidence', () => {
  const timing = taskLifecycleTiming({ status: 'cancelled', createdAt: 60000, trace: { terminalAt: 62000 } }, {}, 100, 100000);
  assert.equal(elapsedLifecycleTiming(timing, 10000).queueWaitMs, 2000);
  assert.equal(elapsedLifecycleTiming(timing, 10000).elapsedMs, 0);
  const invalid = taskLifecycleTiming({ status: 'failed', createdAt: 60000, trace: { dispatchedAt: 61000, terminalAt: 59000 } }, {}, 100, 100000);
  assert.equal(invalid.endedAt, null);
});
