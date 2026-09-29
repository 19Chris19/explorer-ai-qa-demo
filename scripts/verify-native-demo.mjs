#!/usr/bin/env node
// Real serial acceptance. Only event counts and timing are printed.
import { randomUUID } from 'node:crypto';
import { createStreamObserver } from '../provider-a-client.mjs';

const base = process.env.DEMO_BASE_URL || 'http://127.0.0.1:4317';
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(base)) throw new Error('A localhost demo address is required');
const origin = base;
const status = await (await fetch(`${base}/api/qa/health`, { signal: AbortSignal.timeout(5000) })).json();
if (!status.connected || !status.authenticated || !status.ready) throw new Error('Native knowledge Agent is not ready');
console.log(JSON.stringify({ phase: 'readiness', ready: true, capacity: status.capacity }));

const created = await fetch(`${base}/api/qa/conversations`, { method: 'POST', headers: { Origin: origin }, signal: AbortSignal.timeout(10000) });
if (!created.ok) throw new Error(`Conversation creation failed: ${created.status}`);
const cookie = created.headers.get('set-cookie')?.split(';')[0];
const conversationId = (await created.json()).conversation?.conversationId;
if (!cookie || !conversationId) throw new Error('Conversation setup did not return a cookie and ID');

for (const [index, question] of [
  '新手入门3DGS需要什么设备和软件？怎么避开常见坑？',
  '如果预算有限，哪些可以先省下来？',
].entries()) {
  const started = performance.now();
  const response = await fetch(`${base}/api/qa/ask`, {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ question, conversationId, requestId: randomUUID() }),
    signal: AbortSignal.timeout(190000),
  });
  if (!response.ok) throw new Error(`Ask ${index + 1} failed: HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Expected SSE');
  const observer = createStreamObserver();
  for await (const chunk of response.body) observer.append(chunk);
  const result = observer.result();
  const passed = result.complete && result.conversationId === conversationId && result.sourceCount > 0 && result.done === 1;
  console.log(JSON.stringify({ phase: `ask_${index + 1}`, passed, events: {
    conversation: result.conversation, sources: result.sources, delta: result.delta,
    done: result.done, error: result.error,
  }, sourceCount: result.sourceCount, elapsedMs: Math.round(performance.now() - started) }));
  if (!passed) throw new Error(`Ask ${index + 1} did not meet the source and completion criteria`);
}
