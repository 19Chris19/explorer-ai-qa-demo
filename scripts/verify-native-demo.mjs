#!/usr/bin/env node
// Real serial acceptance. Only event counts and timing are printed.
import { randomUUID } from 'node:crypto';
import { createStreamObserver } from '../provider-a-client.mjs';

const base = process.env.DEMO_BASE_URL || 'http://127.0.0.1:4317';
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(base)) throw new Error('A localhost demo address is required');
const origin = base;
const status = await (await fetch(`${base}/api/qa/health`, { signal: AbortSignal.timeout(5000) })).json();
if (!status.connected || !status.authenticated || !status.contractSupported || !status.ready) throw new Error('Native knowledge Agent contract is not ready');
console.log(JSON.stringify({ phase: 'readiness', ready: true, capacity: status.capacity, websiteRelease: status.websiteRelease }));

const created = await fetch(`${base}/api/qa/conversations`, { method: 'POST', headers: { Origin: origin }, signal: AbortSignal.timeout(10000) });
if (!created.ok) throw new Error(`Conversation creation failed: ${created.status}`);
const cookie = created.headers.get('set-cookie')?.split(';')[0];
const conversationId = (await created.json()).conversation?.conversationId;
if (!cookie || !conversationId) throw new Error('Conversation setup did not return a cookie and ID');

for (const [index, question] of [
  '请用 Markdown 表格比较新手入门 3DGS 所需的设备、软件和常见坑。',
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
  const decoder = new TextDecoder();
  let pending = '';
  let streamedAnswer = '';
  for await (const chunk of response.body) {
    observer.append(chunk);
    pending += decoder.decode(chunk, { stream: true }).replace(/\r\n/gu, '\n');
    let boundary;
    while ((boundary = pending.indexOf('\n\n')) >= 0) {
      const packet = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      if (!/^event:\s*delta$/mu.test(packet)) continue;
      const raw = packet.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      streamedAnswer += String(JSON.parse(raw).text || '');
    }
  }
  const result = observer.result();
  const historyResponse = await fetch(`${base}/api/qa/conversations/${encodeURIComponent(conversationId)}`, {
    headers: { Cookie: cookie }, signal: AbortSignal.timeout(10000),
  });
  const history = historyResponse.ok ? await historyResponse.json() : {};
  const storedAnswer = Array.isArray(history.messages)
    ? history.messages.filter(message => message.role === 'assistant').at(-1)?.content : undefined;
  const historyMatches = streamedAnswer.length > 0 && storedAnswer === streamedAnswer;
  const passed = result.complete && result.conversationId === conversationId && result.sourceCount > 0
    && result.done === 1 && historyMatches;
  console.log(JSON.stringify({ phase: `ask_${index + 1}`, passed, events: {
    conversation: result.conversation, sources: result.sources, delta: result.delta,
    done: result.done, error: result.error,
  }, sourceCount: result.sourceCount, historyMatches,
  gfmTable: index === 0 ? /(?:^|\n)\s*\|[^\n]+\|\s*\n\s*\|[-: |]+\|/u.test(streamedAnswer) : undefined,
  elapsedMs: Math.round(performance.now() - started) }));
  if (!passed) throw new Error(`Ask ${index + 1} did not meet the source and completion criteria`);
}
