// Synthetic only: temporary queue, no Provider, account, browser or network.
import { performance } from 'node:perf_hooks';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ConversationTurnQueue } from '../conversation-turn-queue.mjs';

const sources = [], frames = [];
for (let n = 0; n < 33; n++) {
  sources.push({ key: `key-${n}`, url: `https://example.org/${n % 6}`, snippet: `Excerpt ${n % 6}: ` + '中文引用资料。'.repeat(220) });
  frames.push(Buffer.from(`id: ${n + 1}\nevent: sources\ndata: ${JSON.stringify({ sources: sources.slice() })}\n\n`));
}
frames.push(Buffer.from('id: 34\nevent: done\ndata: {}\n\n'));
const wireBytes = frames.reduce((n, frame) => n + frame.length, 0);
assert.ok(wireBytes > 2 * 1024 * 1024);
const expected = createHash('sha256'); for (const frame of frames) expected.update(frame);
const expectedHash = expected.digest('hex'), latency = [], replay = [];
let retainedBytes = 0, peakRss = process.memoryUsage().rss;
const cpu = process.cpuUsage(), directory = mkdtempSync(join(tmpdir(), 'queue-replay-benchmark-'));
try {
  for (let round = 0; round < 30; round++) {
    const queue = new ConversationTurnQueue(join(directory, `${round}.json`), async (_job, emit) => {
      for (const frame of frames) { const before = performance.now(); emit(frame); latency.push(performance.now() - before); }
    });
    const { job } = queue.enqueue({ clientId: 'synthetic', conversationId: 'synthetic', requestId: 'synthetic', question: 'synthetic' });
    await new Promise(resolve => setImmediate(resolve));
    const cached = queue.jobs.get(job.id); assert.equal(cached.status, 'complete');
    retainedBytes = cached.bytes; assert.equal(cached.wireBytes, wireBytes);
    let count = 0; const hash = createHash('sha256');
    const res = Object.assign(new EventEmitter(), { writeHead() {}, end() {},
      write(chunk) { if (count++) hash.update(chunk); return true; } });
    const before = performance.now(); queue.subscribe('synthetic', job.id, res); replay.push(performance.now() - before);
    assert.equal(hash.digest('hex'), expectedHash);
    peakRss = Math.max(peakRss, process.memoryUsage().rss); global.gc?.();
  }
} finally { rmSync(directory, { recursive: true, force: true }); }
const p95 = values => values.slice().sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
const used = process.cpuUsage(cpu);
console.log(JSON.stringify({ schemaVersion: 1, syntheticOnly: true, rounds: 30, node: process.version,
  wireBytes, retainedBytes, emitP95Ms: p95(latency), reconnectReplayP95Ms: p95(replay),
  exactWireReplay: true, cpuMs: (used.user + used.system) / 1000, peakRssBytes: peakRss }, null, 2));
