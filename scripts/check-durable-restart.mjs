import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const base = process.env.SYNTHETIC_WEBSITE_URL;
const container = process.env.SYNTHETIC_PROVIDER_CONTAINER;
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(base || '') || container !== 'qa-durable-20261009-provider-a-1') {
  throw new Error('Only the explicitly isolated durable test project is allowed');
}
const create = await fetch(`${base}/api/qa/conversations`, { method: 'POST' });
const cookie = create.headers.get('set-cookie').split(';')[0];
const conversationId = (await create.json()).conversation.conversationId;
const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
const request = async (path, options = {}) => {
  const res = await fetch(base + path, { ...options, headers });
  if (!res.ok) throw new Error(`synthetic_http_${res.status}`);
  return res.json();
};
const input = { question: 'synthetic slow restart', conversationId, requestId: randomUUID() };
const { task } = await request('/api/qa/tasks', { method: 'POST', body: JSON.stringify(input) });
for (let attempt = 0; attempt < 30; attempt += 1) {
  if ((await request(`/api/qa/tasks/${task.id}`)).task.status === 'running') break;
  await delay(50);
}
assert.equal((await request(`/api/qa/tasks/${task.id}`)).task.status, 'running');
execFileSync('docker', ['restart', container], { stdio: 'pipe' });
let restored;
for (let attempt = 0; attempt < 100; attempt += 1) {
  try { restored = await request(`/api/qa/tasks/${task.id}`); break; } catch { await delay(100); }
}
assert.equal(restored?.task.status, 'indeterminate');
assert.equal(restored.snapshot.events.filter(event => event.event === 'done').length, 0);
assert.equal(restored.snapshot.events.filter(event => event.event === 'error').length, 1);
const repeated = await request('/api/qa/tasks', { method: 'POST', body: JSON.stringify(input) });
assert.equal(repeated.task.id, task.id);
assert.equal(repeated.task.status, 'indeterminate');
const history = await request(`/api/qa/conversations/${conversationId}`);
assert.equal(history.messages.length, 0);
console.log(JSON.stringify({ result: 'PASS', synthetic: true, restart: 'indeterminate', repeat: 'same-task-no-redispatch', fabricatedHistory: false }));
