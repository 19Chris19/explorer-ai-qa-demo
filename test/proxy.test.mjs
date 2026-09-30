import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStreamObserver } from '../provider-a-client.mjs';

test('server keeps Provider A credentials private and streams two turns under one client identity', async () => {
  const seen = [];
  const providerAsks = [];
  let webIntentEnabled = true;
  let contractEnabled = true;
  let createdCount = 0;
  const fake = createServer(async (req, res) => {
    seen.push({ path: req.url, auth: req.headers.authorization, client: req.headers['x-ima-client-id'], key: req.headers['idempotency-key'] });
    if (req.url === '/healthz') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, provider: 'ima-web-agent', queue: { queued: 0 } })); return; }
    if (req.url === '/internal/provider-a/capacity') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ schemaVersion: 1, policies: { knowledge_agent: { max_concurrent: 2 } }, features: { knowledge_agent_keyed_sse_v1: contractEnabled, source_intent_web_requested_v1: webIntentEnabled }, active: 0, queued: 0 })); return; }
    if (req.url === '/api/conversations?limit=1') { res.setHeader('Content-Type', 'application/json'); res.end('{"conversations":[]}'); return; }
    if (req.url === '/api/conversations' && req.method === 'POST') { createdCount += 1; res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, conversation: { conversationId: `demo-${createdCount}` } })); return; }
    if (req.url === '/internal/provider-a/deep-ask') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      providerAsks.push(body);
      assert.match(body.conversationId, /^demo-[12]$/u);
      assert.equal(body.retrieval_policy, 'knowledge_agent');
      assert.equal(body.knowledge_scope_ref, 'a'.repeat(64));
      assert.match(req.headers['idempotency-key'], /^[a-f0-9]{64}$/u);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (body.question === '损坏事件') { res.end('event: sources\ndata: {not-json}\n\n'); return; }
      res.write(`event: conversation\ndata: {"conversationId":"${body.conversationId}"}\n\n`);
      res.write(`event: sources\ndata: ${JSON.stringify({ sources: body.source_intent ? [{ title: '合成知识来源' }, { title: '合成网页来源' }] : [{ title: '合成知识来源' }] })}\n\n`);
      res.write('event: delta\ndata: {"text":"示例回答"}\n\n');
      const done = body.source_intent
        ? { conversationId: body.conversationId, source_intent: body.source_intent, answer_basis: 'mixed', source_count: 2, knowledge_source_count: 1, web_source_count: 1 }
        : { conversationId: body.conversationId, source_intent: '', answer_basis: 'knowledge', source_count: 1, knowledge_source_count: 1, web_source_count: 0 };
      res.end(`event: done\ndata: ${JSON.stringify(done)}\n\n`);
      return;
    }
    res.writeHead(404); res.end();
  });
  fake.listen(0, '127.0.0.1'); await once(fake, 'listening');
  const fakePort = fake.address().port;
  const frontendPort = await freePort();
  const runtimeDir = mkdtempSync(join(tmpdir(), 'ima-web-demo-test-'));
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, PORT: String(frontendPort), DEMO_RUNTIME_DIR: runtimeDir, DEMO_COOKIE_SECRET: 'synthetic-cookie-secret', PROVIDER_A_BASE_URL: `http://127.0.0.1:${fakePort}`, PROVIDER_A_API_TOKEN: 'test-only-token', PROVIDER_A_INTERNAL_SERVICE_TOKEN: 'test-only-service-token', PROVIDER_A_KNOWLEDGE_SCOPE_REF: 'a'.repeat(64) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitFor(`http://127.0.0.1:${frontendPort}/api/qa/health`);
    const page = await fetch(`http://127.0.0.1:${frontendPort}/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.equal(html.includes('test-only-token'), false);
    assert.match(html, /\/answer-markdown\.js/u);
    const renderer = await fetch(`http://127.0.0.1:${frontendPort}/answer-markdown.js`);
    assert.equal(renderer.status, 200);
    assert.match(await renderer.text(), /formatAnswerHtml/u);
    for (const asset of ['marked.umd.js', 'purify.min.js']) {
      const dependency = await fetch(`http://127.0.0.1:${frontendPort}/vendor/${asset}`);
      assert.equal(dependency.status, 200);
      assert.match(dependency.headers.get('content-type'), /text\/javascript/u);
    }
    const health = await (await fetch(`http://127.0.0.1:${frontendPort}/api/qa/health`)).json();
    assert.equal(health.connected, true);
    assert.equal(health.ready, true);
    assert.equal(health.contractSupported, true);
    assert.equal(health.capacity, 2);
    assert.equal(health.webIntentSupported, true);
    const create = await fetch(`http://127.0.0.1:${frontendPort}/api/qa/conversations`, { method: 'POST', headers: { Origin: `http://127.0.0.1:${frontendPort}` } });
    assert.equal(create.status, 201);
    assert.equal((await create.json()).conversation.conversationId, 'demo-1');
    const cookie = create.headers.get('set-cookie').split(';')[0];
    assert.match(create.headers.get('set-cookie'), /HttpOnly/u);
    const firstRequestId = randomUUID();
    for (const [index, text] of ['首问', '追问'].entries()) {
      const response = await fetch(`http://127.0.0.1:${frontendPort}/api/qa/ask`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: `http://127.0.0.1:${frontendPort}`, 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-IMA-Client-Id': 'attacker-choice' },
        body: JSON.stringify({ question: text, conversationId: 'demo-1', requestId: index ? randomUUID() : firstRequestId, ...(index === 0 ? { sourceIntent: 'web' } : {}) }),
      });
      assert.equal(response.status, 200);
      const stream = await response.text();
      for (const event of ['conversation', 'sources', 'delta', 'done']) assert.match(stream, new RegExp(`event: ${event}`));
    }
    const asks = seen.filter(item => item.path === '/internal/provider-a/deep-ask');
    assert.equal(asks.length, 2);
    assert.equal(asks[0].auth, 'Bearer test-only-service-token');
    assert.equal(asks[0].client, asks[1].client);
    assert.match(asks[0].client, /^demo:/u);
    assert.notEqual(asks[0].client, 'attacker-choice');
    assert.notEqual(asks[0].key, asks[1].key);
    assert.equal(providerAsks[0].source_intent, 'web_requested');
    assert.equal(providerAsks[1].source_intent, undefined);
    const duplicate = await fetch(`http://127.0.0.1:${frontendPort}/api/qa/ask`, {
      method: 'POST', headers: { Cookie: cookie, Origin: `http://127.0.0.1:${frontendPort}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '首问', conversationId: 'demo-1', requestId: firstRequestId }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(seen.filter(item => item.path === '/internal/provider-a/deep-ask').length, 2);
    contractEnabled = false;
    const incompatible = await (await fetch(`http://127.0.0.1:${frontendPort}/api/qa/health`)).json();
    assert.equal(incompatible.authenticated, true);
    assert.equal(incompatible.ready, false);
    assert.equal(incompatible.contractSupported, false);
    const rejected = await fetch(`http://127.0.0.1:${frontendPort}/api/qa/ask`, {
      method: 'POST', headers: { Cookie: cookie, Origin: `http://127.0.0.1:${frontendPort}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '旧合同不能问答', conversationId: 'demo-1', requestId: randomUUID() }),
    });
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).code, 'provider_contract_incompatible');
    assert.equal(seen.filter(item => item.path === '/internal/provider-a/deep-ask').length, 2);
    contractEnabled = true;
    webIntentEnabled = false;
    const unsupportedWeb = await fetch(`http://127.0.0.1:${frontendPort}/api/qa/ask`, {
      method: 'POST', headers: { Cookie: cookie, Origin: `http://127.0.0.1:${frontendPort}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '要求联网但旧服务不支持', conversationId: 'demo-1', requestId: randomUUID(), sourceIntent: 'web' }),
    });
    assert.equal(unsupportedWeb.status, 409);
    assert.equal(seen.filter(item => item.path === '/internal/provider-a/deep-ask').length, 2);
    const malformed = await fetch(`http://127.0.0.1:${frontendPort}/api/qa/ask`, {
      method: 'POST', headers: { Cookie: cookie, Origin: `http://127.0.0.1:${frontendPort}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '损坏事件', conversationId: 'demo-1', requestId: randomUUID() }),
    });
    const malformedStream = await malformed.text();
    assert.match(malformedStream, /event: error/u);
    assert.doesNotMatch(malformedStream, /event: done/u);
    const second = await fetch(`http://127.0.0.1:${frontendPort}/api/qa/conversations`, { method: 'POST', headers: { Origin: `http://127.0.0.1:${frontendPort}` } });
    const secondCookie = second.headers.get('set-cookie').split(';')[0];
    assert.notEqual(secondCookie, cookie);
    const crossUser = await fetch(`http://127.0.0.1:${frontendPort}/api/qa/ask`, {
      method: 'POST', headers: { Cookie: secondCookie, Origin: `http://127.0.0.1:${frontendPort}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '另一个用户', conversationId: 'demo-1', requestId: randomUUID() }),
    });
    assert.equal(crossUser.status, 409);
    const legacy = await fetch(`http://127.0.0.1:${frontendPort}/api/qa/ask`, {
      method: 'POST', headers: { Cookie: cookie, Origin: `http://127.0.0.1:${frontendPort}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '旧会话', conversationId: 'old-session', requestId: randomUUID() }),
    });
    assert.equal(legacy.status, 409);
  } finally {
    child.kill(); fake.close(); rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test('stream observer handles split events and refuses an interrupted answer as success', () => {
  const observer = createStreamObserver();
  observer.append(Buffer.from('event: conversation\ndata: {"conversationId":"demo-1"}\n\nevent: sour'));
  observer.append(Buffer.from('ces\ndata: {"sources":[{"title":"合成资料"}]}\n\nevent: delta\ndata: {"text":"回答"}\n\n'));
  assert.equal(observer.result().sourceCount, 1);
  assert.equal(observer.result().complete, false);
  observer.append(Buffer.from('event: done\ndata: {"conversationId":"demo-1"}\n\n'));
  assert.equal(observer.result().complete, true);
});

async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; server.close(); await once(server, 'close'); return port;
}

async function waitFor(url) {
  for (let i = 0; i < 40; i++) {
    try { const response = await fetch(url); if (response.status) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Demo server did not start');
}
