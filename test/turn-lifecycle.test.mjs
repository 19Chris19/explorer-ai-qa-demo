import test from 'node:test';
import assert from 'node:assert/strict';
import { formatElapsed, lifecycleView } from '../public/turn-lifecycle.mjs';

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
