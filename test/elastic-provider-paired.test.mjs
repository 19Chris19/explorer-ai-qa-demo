import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const providerRoot = process.env.PROVIDER_SCHEDULING_ROOT;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  for (let i = 0; i < 300; i++) { if (await check()) return; await pause(10); }
  assert.fail(`did not settle: ${label}`);
}
const hashFile = path => createHash('sha256').update(readFileSync(path)).digest('hex');

test('actual Provider + BFF share scoped capacity and named quotas, preserve SSE, cancellation and restart history',
  { skip: !providerRoot && 'Set PROVIDER_SCHEDULING_ROOT to the paired local Provider checkout', timeout: 30000 }, async t => {
    const require = createRequire(join(resolve(providerRoot), 'package.json'));
    const { IMAWebAgentPool } = require('./src/ima-web-agent-pool');
    const { createApp } = require('./src/app');
    const { ConversationStore } = require('./src/conversation-store');
    const dir = mkdtempSync(join(tmpdir(), 'ima-elastic-paired-'));
    const calls = []; let release;
    const hold = new Promise(resolve => { release = resolve; });
    const principal = 'a'.repeat(64);
    const account = { id: 'fixture', modelId: 'fixture-model', modelType: 3, principalFingerprint: principal, maxConcurrent: 1 };
    const pool = new IMAWebAgentPool({ accounts: [account], webMode: 'knowledge_agent', elasticScheduling: {
      enabled: true, initialConcurrent: 3, maxGlobal: 3, minStartSpacingMs: 5,
      accountLimits: [{ accountId: account.id, principalFingerprint: principal, mode: 'knowledge_agent', modelId: account.modelId,
        modelType: 3, initialConcurrent: 3, validatedMaxConcurrent: 3 }],
    } }, { clientFactory: () => ({ async *streamAsk(options) {
      calls.push({ question: options.question, session: options.sessionId }); options.onDispatch?.();
      options.onSession?.(options.sessionId || `fixture-session-${calls.length}`);
      yield { type: 'delta', text: 'Synthetic stream: ' };
      await Promise.race([hold, new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))]);
      yield { type: 'delta', text: 'completed.' }; yield { type: 'done' };
    } }) });
    const historyPath = join(dir, 'provider-history.json');
    const config = { qaProvider: 'ima-web-agent', mimo: {}, webAgent: { sharedKnowledgeBaseId: 'fixture-kb', mode: 'knowledge_agent' },
      conversations: { storePath: historyPath }, security: { applications: [
        { id: 'website', apiTokens: ['synthetic-web-api'], internalServiceTokens: ['synthetic-web-service'] },
        { id: 'agent', apiTokens: ['synthetic-agent-api'], internalServiceTokens: ['synthetic-agent-service'] },
      ] }, concurrency: { maxConcurrentAsk: 3, queueLimit: 10, applicationScheduling: { enabled: true, default: { maxWaitMs: 3000 }, applications: {
        'application:website': { maxConcurrent: 2, queueLimit: 4, weight: 2 }, 'application:agent': { maxConcurrent: 1, weight: 1 },
      } } }, limits: { maxQuestionLength: 2000 }, rateLimit: { windowMs: 0, max: 0 } };
    const conversations = new ConversationStore({ storePath: historyPath });
    const app = createApp({ config, conversationStore: conversations, imaWebAgentClient: pool,
      webReadiness: { mode: 'knowledge_agent', snapshot: () => ({ mode: 'knowledge_agent', capacity: pool.stats().capacity,
        knowledgeAgentCapacity: pool.stats().capacity, schedulable: pool.stats().availableSlots, totalSlots: pool.stats().totalSlots }) } });
    const unsubscribe = pool.onAvailability(() => app.locals.imaQaAskQueue.wake());
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const providerBase = `http://127.0.0.1:${server.address().port}`;
    let child; let output = '';
    t.after(async () => {
      release(); if (child?.exitCode === null && child?.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
      await app.locals.durableQATasks.close(); unsubscribe(); pool.closeScheduling();
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true });
    });
    const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
    const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    async function startWebsite() {
      child = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: { PATH: process.env.PATH, PORT: String(port), DEMO_RUNTIME_DIR: join(dir, 'website'), DEMO_COOKIE_SECRET: 'synthetic-cookie-secret',
          PROVIDER_A_BASE_URL: providerBase, PROVIDER_A_API_TOKEN: 'synthetic-web-api', PROVIDER_A_INTERNAL_SERVICE_TOKEN: 'synthetic-web-service',
          PROVIDER_A_KNOWLEDGE_SCOPE_REF: createHash('sha256').update('fixture-kb').digest('hex'), DEMO_PREVIEW_MAX_PENDING: '12' }, stdio: ['ignore', 'pipe', 'pipe'] });
      for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output = (output + data).slice(-8192); });
      await until(async () => { assert.equal(child.exitCode, null, output); try { return (await fetch(`${base}/api/qa/health`)).ok; } catch { return false; } }, 'BFF listening');
    }
    await startWebsite();
    const health = await (await fetch(`${base}/api/qa/health`)).json();
    assert.equal(health.capacity, 2); assert.equal(health.allocation.isolationVerified, true); assert.equal(health.admission.maxPending, 12);
    const first = await fetch(`${base}/api/qa/conversations`, { method: 'POST' });
    const cookie = first.headers.get('set-cookie').split(';')[0];
    const firstId = (await first.json()).conversation.conversationId;
    const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
    const createConversation = async () => (await (await fetch(`${base}/api/qa/conversations`, { method: 'POST', headers })).json()).conversation.conversationId;
    const ids = [firstId, await createConversation(), await createConversation()];
    const submit = async (conversationId, requestId) => {
      const res = await fetch(`${base}/api/qa/tasks`, { method: 'POST', headers, body: JSON.stringify({ conversationId, requestId, question: 'synthetic paired question' }) });
      assert.equal(res.status, 202); return (await res.json()).task;
    };
    const requestIds = ids.map(() => randomUUID());
    const tasks = await Promise.all(ids.map((id, i) => submit(id, requestIds[i])));
    const agentHeaders = { authorization: 'Bearer synthetic-agent-api', 'X-IMA-Client-Id': 'fixture-agent', 'Content-Type': 'application/json' };
    const agentConversation = (await (await fetch(`${providerBase}/api/conversations`, { method: 'POST', headers: agentHeaders })).json()).conversation.conversationId;
    const agentResponse = await fetch(`${providerBase}/api/tasks`, { method: 'POST', headers: { ...agentHeaders, 'Idempotency-Key': 'fixture-agent-task' },
      body: JSON.stringify({ conversationId: agentConversation, question: 'synthetic agent question' }) });
    assert.equal(agentResponse.status, 202); const agentTask = (await agentResponse.json()).task;
    await until(() => calls.length === 3, 'two website + one agent active');
    assert.equal(pool.stats().activeRequests, 3);
    assert.equal(app.locals.imaQaAskQueue.applicationStats('application:website').active, 2);
    assert.equal(app.locals.imaQaAskQueue.applicationStats('application:agent').active, 1);
    const queued = tasks.find(task => app.locals.durableQATasks.store.tasks.get(task.id).status === 'queued'); assert.ok(queued);
    const cancelled = await fetch(`${base}/api/qa/tasks/${queued.id}`, { method: 'DELETE', headers }); assert.ok(cancelled.ok);
    await until(() => app.locals.durableQATasks.store.tasks.get(queued.id).status === 'cancelled', 'queued cancellation');
    const activeTask = tasks.find(task => task.id !== queued.id);
    const stream = await fetch(`${base}/api/qa/tasks/${activeTask.id}/events?after=0`, { headers });
    const reader = stream.body.getReader(); const firstChunk = await reader.read();
    assert.equal(firstChunk.done, false); assert.ok(firstChunk.value.length > 0);
    // Deliberately disconnect; GET recovery must not submit another task.
    await reader.cancel(); release();
    await until(() => [activeTask.id, agentTask.id].every(id => app.locals.durableQATasks.store.tasks.get(id).status === 'succeeded'), 'completion');
    const replay = await (await fetch(`${base}/api/qa/tasks/${activeTask.id}/events?after=0`, { headers })).text();
    assert.match(replay, /event: delta/); assert.match(replay, /event: done/); assert.match(replay, /completed/);
    assert.equal(calls.length, 3, 'cancelled queued work never dispatched');
    const previousBinding = conversations.getUpstream(activeTask.conversationId, app.locals.durableQATasks.store.tasks.get(activeTask.id).ownerKey);
    const followup = await submit(activeTask.conversationId, randomUUID());
    await until(() => app.locals.durableQATasks.store.tasks.get(followup.id).status === 'succeeded', 'same-session followup');
    assert.equal(calls.length, 4); assert.equal(calls.at(-1).session, previousBinding.sessionId);
    const count = calls.length; const oldHash = hashFile(historyPath);
    child.kill('SIGTERM'); await once(child, 'exit'); await startWebsite();
    const restored = await (await fetch(`${base}/api/qa/conversations/${activeTask.conversationId}`, { headers })).json();
    assert.match(JSON.stringify(restored), /Synthetic stream/);
    assert.equal(hashFile(historyPath), oldHash); assert.equal(calls.length, count);
    const prior = tasks.findIndex(task => task.id === activeTask.id);
    const repeated = await fetch(`${base}/api/qa/tasks`, { method: 'POST', headers,
      body: JSON.stringify({ conversationId: activeTask.conversationId, requestId: requestIds[prior], question: 'synthetic paired question' }) });
    assert.ok(repeated.ok); assert.equal((await repeated.json()).task.id, activeTask.id); assert.equal(calls.length, count);
    // An ordinary credential from another named application cannot read this task.
    const watchRows = JSON.parse(readFileSync(join(dir, 'website', 'task-watch.json'), 'utf8'));
    const sameVisitor = watchRows.find(row => row.taskId === activeTask.id).clientId;
    const scopedHeaders = { ...agentHeaders, authorization: 'Bearer synthetic-agent-service', 'X-IMA-Client-Id': sameVisitor };
    assert.equal((await fetch(`${providerBase}/internal/provider-a/tasks/${activeTask.id}`, { headers: scopedHeaders })).status, 404);
    assert.equal((await fetch(`${providerBase}/internal/provider-a/tasks/${activeTask.id}`, { headers: { ...scopedHeaders, authorization: 'Bearer synthetic-web-service' } })).status, 200);
  });
