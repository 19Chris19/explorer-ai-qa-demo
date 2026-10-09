import test from 'node:test';
import assert from 'node:assert/strict';
import { formatElapsed, lifecycleView, taskLifecycleTiming, elapsedLifecycleTiming } from '../public/turn-lifecycle.mjs';

test('formats live answer time without false precision on long turns', () => {
  assert.equal(formatElapsed(0), '0.0 秒');
  assert.equal(formatElapsed(1875), '1.9 秒');
  assert.equal(formatElapsed(12620), '13 秒');
  assert.equal(formatElapsed(Number.NaN), '0.0 秒');
});

test('keeps queue wait separate from active answer timing', () => {
  assert.deepEqual(lifecycleView({ phase: 'retrieving', elapsedMs: 3250 }), {
    status: 'retrieving', label: '正在检索资料', details: '已用时 3.3 秒', settled: false,
  });
  assert.deepEqual(lifecycleView({ outcome: 'done', elapsedMs: 8720, queueWaitMs: 1320 }), {
    status: 'done', label: '回答完成', details: '等待 1.3 秒 · 用时 8.7 秒', settled: true,
  });
});

test('settles cancellation, interruption and failure as distinct outcomes', () => {
  assert.equal(lifecycleView({ outcome: 'cancelled' }).label, '回答已停止');
  assert.equal(lifecycleView({ outcome: 'interrupted' }).label, '回答未完整结束');
  assert.equal(lifecycleView({ outcome: 'failed' }).label, '回答失败');
  assert.equal(lifecycleView({ outcome: 'done', elapsedMs: 1200, locale: 'en' }).details, 'Duration 1.2s');
});

test('queued timing shows waiting only and starts execution at dispatch, including refresh', () => {
  const wall = 1800000000000;
  const queued = taskLifecycleTiming({ status: 'queued', createdAt: wall - 5000 }, {}, 1000, wall);
  const waiting = elapsedLifecycleTiming(queued, 2000);
  assert.equal(waiting.elapsedMs, 0);
  assert.equal(lifecycleView(waiting).details, '等待 6.0 秒');
  assert.equal(lifecycleView({ ...waiting, locale: 'en' }).label, 'Queued');
  assert.equal(lifecycleView({ ...waiting, outcome: 'cancelled' }).details, '等待 6.0 秒');
  const running = { status: 'running', createdAt: wall - 5000, trace: { dispatchedAt: wall - 2000 } };
  for (const previous of [{}, queued]) {
    const timing = elapsedLifecycleTiming(taskLifecycleTiming(running, previous, 1000, wall), 1000);
    assert.equal(timing.elapsedMs, 2000);
    assert.equal(timing.queueWaitMs, 3000);
  }
});

test('invalid, future and pre-creation timestamps fall back without resetting the running clock', () => {
  const wall = 1800000000000;
  for (const dispatchedAt of [null, NaN, Infinity, -1, wall + 100000, 'invalid', wall - 20000]) {
    const task = { status: 'running', createdAt: wall - 10000, trace: { dispatchedAt } };
    const first = taskLifecycleTiming(task, {}, 1000, wall);
    assert.equal(first.startedAt, 1000);
    assert.equal(taskLifecycleTiming(task, first, 2000, wall + 1000).startedAt, 1000);
  }
  const fallback = taskLifecycleTiming({ status: 'running', trace: { dispatchedAt: wall + 1 },
    startedAt: new Date(wall - 3000).toISOString() }, {}, 1000, wall);
  assert.equal(elapsedLifecycleTiming(fallback, 1000).elapsedMs, 3000);
});
