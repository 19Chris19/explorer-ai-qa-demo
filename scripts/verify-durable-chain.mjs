// Synthetic-only acceptance: no account directory, credential file or IMA network.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createPreviewGateway } from '../preview-gateway.mjs';
import { proxy } from '../preview/api/proxy.mjs';

const providerSource = process.env.SYNTHETIC_PROVIDER_SOURCE;
if (!providerSource) throw new Error('Set SYNTHETIC_PROVIDER_SOURCE to an isolated Provider candidate checkout');
const durationMs = Number(process.env.SYNTHETIC_DURATION_MS || 370000);
if (!Number.isSafeInteger(durationMs) || durationMs < 1000) throw new Error('Invalid synthetic duration');
const require = createRequire(join(resolve(providerSource), 'package.json'));
const { createApp } = require('./src/app.js');
const { ConversationStore } = require('./src/conversation-store.js');
const runtime = mkdtempSync(join(tmpdir(), 'synthetic-durable-chain-'));
const store = new ConversationStore({ storePath: join(runtime, 'history.json') });
let dispatches = 0;
let upstreamAborted = false;
const answer = '## 合成长回答\n\n| 项目 | 数值 |\n| --- | --- |\n| 空格保真 |  123  |\n';
const started = Date.now();
const app = createApp({ config: {
  qaProvider: 'ima-web-agent', mimo: {}, webAgent: { sharedKnowledgeBaseId: 'synthetic-kb' },
  conversations: { storePath: store.storePath }, security: { apiToken: 'synthetic-api', internalServiceToken: 'synthetic-service' },
  concurrency: { maxConcurrentAsk: 5, queueLimit: 20, requestTimeoutMs: 180000 },
  limits: { maxQuestionLength: 2000 }, rateLimit: { windowMs: 0, max: 0 },
}, conversationStore: store, webReadiness: { mode: 'knowledge_agent', snapshot: () => ({ mode: 'knowledge_agent', knowledgeAgentCapacity: 5, capacity: 5, schedulable: 5 }) },
imaWebAgentClient: { async *streamAsk({ signal, onDispatch, onActivity }) {
  onDispatch?.();
  dispatches++;
  signal.addEventListener('abort', () => { upstreamAborted = true; }, { once: true });
  const until = Date.now() + durationMs;
  // No正文 until the end: transport heartbeats must not be mistaken for a failure.
  while (Date.now() < until) { await delay(Math.min(5000, until - Date.now()), undefined, { signal }); onActivity?.({ bytes: 1 }); yield { type: 'heartbeat' }; }
  for (const text of [answer.slice(0, 13), answer.slice(13)]) yield { type: 'delta', text };
  yield { type: 'done' };
} } });
const providerServer = app.listen(0, '127.0.0.1'); await once(providerServer, 'listening');
const free = createServer(); free.listen(0, '127.0.0.1'); await once(free, 'listening');
const port = free.address().port; await new Promise(resolve => free.close(resolve));
const website = spawn(process.execPath, ['server.mjs'], { cwd: new URL('../', import.meta.url), stdio: 'ignore', env: {
  ...process.env, PORT: String(port), DEMO_RUNTIME_DIR: join(runtime, 'website'), DEMO_COOKIE_SECRET: 'synthetic-cookie', DEMO_MAINTENANCE_STATE_PATH: '', PROVIDER_A_HISTORY_ARCHIVE_PATH: '',
  PROVIDER_A_BASE_URL: `http://127.0.0.1:${providerServer.address().port}`, PROVIDER_A_API_TOKEN: 'synthetic-api', PROVIDER_A_INTERNAL_SERVICE_TOKEN: 'synthetic-service', PROVIDER_A_KNOWLEDGE_SCOPE_REF: createHash('sha256').update('synthetic-kb').digest('hex'),
} });
const key = 'synthetic-preview-key-'.repeat(3);
const gateway = createPreviewGateway({ key, bffUrl: `http://127.0.0.1:${port}` });
gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
const nativeFetch = globalThis.fetch;
const oldOrigin = process.env.PREVIEW_ORIGIN_URL, oldKey = process.env.PREVIEW_ORIGIN_KEY;
process.env.PREVIEW_ORIGIN_URL = 'https://synthetic-tunnel.invalid'; process.env.PREVIEW_ORIGIN_KEY = key;
// Exercise the real Vercel function with only its configured tunnel hop replaced.
globalThis.fetch = (url, options) => {
  const parsed = new URL(url);
  if (parsed.origin === 'https://synthetic-tunnel.invalid') return nativeFetch(`http://127.0.0.1:${gateway.address().port}${parsed.pathname}${parsed.search}`, options);
  if (parsed.hostname !== '127.0.0.1') throw new Error('Synthetic acceptance forbids external network');
  return nativeFetch(url, options);
};
let cookie = '';
const request = (path, options = {}) => proxy(new Request(`https://synthetic-preview.invalid/api/proxy?path=${path}`, {
  ...options, headers: { Origin: 'https://synthetic-preview.invalid', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
}));
try {
  for (let i = 0; i < 100; i++) { try { if ((await nativeFetch(`http://127.0.0.1:${port}/api/qa/health`)).ok) break; } catch {} await delay(50); }
  const created = await request('api/qa/conversations', { method: 'POST' }); assert.equal(created.status, 201);
  cookie = created.headers.get('set-cookie').split(';')[0];
  const conversationId = (await created.json()).conversation.conversationId;
  const requestId = randomUUID();
  const submitted = await request('api/qa/tasks', { method: 'POST', body: JSON.stringify({ question: '合成表格验证，不访问真实上游', conversationId, requestId }) });
  assert.equal(submitted.status, 202);
  const { task } = await submitted.json();
  console.log(JSON.stringify({ phase: 'accepted', durationMs, realIMA: false }));
  // Simulate a phone connection disappearing. The Provider must keep running.
  const interrupted = new AbortController();
  const initial = await request(`api/qa/tasks/${task.id}/events`, { signal: interrupted.signal });
  await initial.body.getReader().read(); interrupted.abort();
  await delay(100);
  assert.equal(upstreamAborted, false);
  let cursor = 0, text = '', done = 0, rotations = 0;
  while (!done) {
    const response = await request(`api/qa/tasks/${task.id}/events&after=${cursor}`);
    assert.equal(response.status, 200);
    const decoder = new TextDecoder(); let pending = '';
    for await (const chunk of response.body) {
      pending += decoder.decode(chunk, { stream: true });
      let split;
      while ((split = pending.indexOf('\n\n')) >= 0) {
        const packet = pending.slice(0, split); pending = pending.slice(split + 2);
        const id = Number(/^id:\s*(\d+)/mu.exec(packet)?.[1]);
        if (!id || id <= cursor) continue;
        assert.equal(id, cursor + 1); cursor = id;
        const name = /^event:\s*(\S+)/mu.exec(packet)?.[1];
        const data = JSON.parse(packet.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5)).join('\n'));
        if (name === 'delta') text += data.text;
        if (name === 'done') done++;
        assert.notEqual(name, 'error', `Synthetic chain failed: ${data.failureReason || 'unknown'}`);
      }
    }
    if (!done) { rotations++; console.log(JSON.stringify({ phase: 'resubscribe', elapsedMs: Date.now() - started, cursor })); }
  }
  const result = await (await request(`api/qa/tasks/${task.id}`)).json();
  const history = await (await request(`api/qa/conversations/${conversationId}`)).json();
  assert.equal(result.task.status, 'succeeded');
  assert.equal(text, answer); assert.equal(done, 1); assert.equal(dispatches, 1); assert.equal(upstreamAborted, false);
  assert.equal(result.snapshot.events.filter(event => event.event === 'done').length, 1);
  assert.ok(JSON.stringify(history).includes(JSON.stringify(answer).slice(1, -1)));
  if (durationMs > 360000) assert.ok(rotations >= 1);
  console.log(JSON.stringify({ result: 'PASS', elapsedMs: Date.now() - started, rotations, upstreamDispatches: dispatches, uniqueTerminal: done, whitespaceExact: true, realIMA: false, actualVercelNetwork: false }));
} finally {
  globalThis.fetch = nativeFetch;
  if (oldOrigin === undefined) delete process.env.PREVIEW_ORIGIN_URL; else process.env.PREVIEW_ORIGIN_URL = oldOrigin;
  if (oldKey === undefined) delete process.env.PREVIEW_ORIGIN_KEY; else process.env.PREVIEW_ORIGIN_KEY = oldKey;
  website.kill(); await once(website, 'exit');
  gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve));
  await app.locals.durableQATasks?.close(); providerServer.closeAllConnections(); await new Promise(resolve => providerServer.close(resolve));
  rmSync(runtime, { recursive: true, force: true });
}
