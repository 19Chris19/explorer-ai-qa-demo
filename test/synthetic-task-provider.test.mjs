import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createSyntheticTaskProvider, syntheticAnswer } from '../test-support/synthetic-task-provider.mjs';

test('host fixture provides owned task replay, strict cursors, cancellation and exact single history', async () => {
  const server = createSyntheticTaskProvider({ stepMs: 5 });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const taskPath = '/internal/provider-a/tasks';
  const request = (path, method = 'GET', body, owner = 'synthetic-owner', key = 'synthetic-request') => fetch(base + path, {
    method, headers: { Authorization: `Bearer synthetic-${path.startsWith('/internal/') ? 'service' : 'api'}`,
      'X-IMA-Client-Id': owner, 'Idempotency-Key': key, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    assert.equal((await fetch(base + taskPath)).status, 401);
    const capacity = await (await request('/internal/provider-a/capacity')).json();
    assert.equal(capacity.features.durable_qa_tasks_v1, true);
    const { conversation } = await (await request('/api/conversations', 'POST', {})).json();
    const input = { question: '  Synthetic question\n', conversationId: conversation.conversationId };
    const first = await request(taskPath, 'POST', input); assert.equal(first.status, 202);
    const { task } = await first.json(); const path = `${taskPath}/${task.id}`;
    assert.equal((await (await request(taskPath, 'POST', input)).json()).task.id, task.id);
    assert.equal((await request(taskPath, 'POST', { ...input, question: 'changed' })).status, 409);
    assert.equal((await request(path, 'GET', undefined, 'other-owner')).status, 404);
    assert.equal((await request(path, 'DELETE', undefined, 'other-owner')).status, 404);
    assert.equal((await request(`${path}/events`, 'GET', undefined, 'other-owner')).status, 404);
    assert.deepEqual((await (await request(taskPath, 'GET', undefined, 'other-owner')).json()).tasks, []);
    assert.equal((await (await request(`${taskPath}?requestKey=synthetic-request&conversationId=${conversation.conversationId}`)).json()).tasks[0].id, task.id);
    assert.deepEqual((await (await request(`${taskPath}?conversationId=other`)).json()).tasks, []);
    assert.equal((await request(`${path}/events?after=bad`)).status, 400);
    assert.equal((await request(`${path}/events?after=9999`)).status, 409);
    const live = await request(`${path}/events`);
    await live.body.cancel(); // Observation disconnect must leave execution alone.
    const stream = await (await request(`${path}/events?after=1`)).text();
    assert.doesNotMatch(stream, /id: 1\n/u);
    assert.equal((stream.match(/event: done\n/gu) || []).length, 1);
    const detail = await (await request(path)).json();
    assert.equal(detail.task.status, 'succeeded');
    assert.equal(detail.snapshot.events.filter(e => e.event === 'delta').map(e => e.data.text).join(''), syntheticAnswer);
    assert.equal(await (await request(`${path}/events?after=${detail.task.lastEventId}`)).text(), '');
    await request(taskPath, 'POST', input);
    const history = await (await request(`/api/conversations/${conversation.conversationId}`)).json();
    assert.equal(history.messages.length, 2);
    assert.equal(history.messages[0].content, input.question);
    assert.equal(history.messages[1].content, syntheticAnswer);
    const next = await (await request(taskPath, 'POST', input, 'synthetic-owner', 'synthetic-cancel')).json();
    assert.equal((await request(`/api/conversations/${conversation.conversationId}`, 'DELETE')).status, 409);
    const cancelled = await (await request(`${taskPath}/${next.task.id}`, 'DELETE')).json();
    assert.equal(cancelled.task.status, 'cancelled');
    assert.match(await (await request(`${taskPath}/${next.task.id}/events`)).text(), /event: error\n/u);
    assert.equal((await (await request(`/api/conversations/${conversation.conversationId}`)).json()).messages.length, 2);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
