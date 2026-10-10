import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { syntheticAnswer } from '../test-support/synthetic-task-provider.mjs';

test('built synthetic host serves modern task UI contract at root and nested prefix', async () => {
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  await promisify(execFile)(process.execPath, ['scripts/build.mjs'], { cwd });
  for (const prefix of ['/', '/test/qa-app']) {
    const child = spawn(process.execPath, ['scripts/preview-synthetic-host.mjs', prefix], {
      cwd, env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = ''; child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    try {
      let address;
      for (let attempt = 0; attempt < 200; attempt++) {
        address = /Synthetic host: (http:\/\/127\.0\.0\.1:\d+)\/ai-qa/u.exec(output)?.[1];
        if (address) break;
        if (child.exitCode !== null) assert.fail(output);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.ok(address, output);
      const api = `${address}${prefix === '/' ? '' : prefix}/api/qa`;
      assert.equal((await fetch(`${address}/ai-qa`)).status, 200);
      const health = await (await fetch(`${api}/health`)).json();
      assert.equal(health.ready, true); assert.equal(health.durableTasksSupported, true);
      const created = await fetch(`${api}/conversations`, { method: 'POST' });
      assert.equal(created.status, 201);
      const headers = { Cookie: created.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
      const { conversation } = await created.json();
      const body = JSON.stringify({ question: '  Synthetic host question\n', conversationId: conversation.conversationId, requestId: randomUUID() });
      const submitted = await fetch(`${api}/tasks`, { method: 'POST', headers, body });
      assert.equal(submitted.status, 202);
      const { task } = await submitted.json();
      const stream = await (await fetch(`${api}/tasks/${task.id}/events?after=0`, { headers })).text();
      assert.equal((stream.match(/event: done\n/gu) || []).length, 1);
      const detail = await (await fetch(`${api}/tasks/${task.id}`, { headers })).json();
      assert.equal(detail.task.status, 'succeeded');
      assert.equal(detail.snapshot.events.filter(e => e.event === 'delta').map(e => e.data.text).join(''), syntheticAnswer);
      assert.equal(await (await fetch(`${api}/tasks/${task.id}/events?after=${detail.task.lastEventId}`, { headers })).text(), '');
      const again = await (await fetch(`${api}/tasks`, { method: 'POST', headers, body })).json();
      assert.equal(again.task.id, task.id);
      const history = await (await fetch(`${api}/conversations/${conversation.conversationId}`, { headers })).json();
      assert.equal(history.messages.length, 2); assert.equal(history.messages[1].content, syntheticAnswer);
      assert.equal((await fetch(`${address}${prefix === '/' ? '' : prefix}/internal/provider-a/capacity`)).status, 404);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
      }
    }
  }
});
