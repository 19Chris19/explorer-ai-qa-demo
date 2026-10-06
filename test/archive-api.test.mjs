import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { owner, otherOwner, syntheticConversation } from '../test-support/history-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const secret = 'synthetic-cookie-secret';
function cookie(client, name = 'qa_demo_client_v2', key = secret) {
  const id = client.replace(/^demo:/u, '');
  return `${name}=${id}.${createHmac('sha256', key).update(id).digest('hex')}`;
}
async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; server.close(); await once(server, 'close'); return port;
}
function start(port, dir, overrides = {}) {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, PORT: String(port), DEMO_LISTEN_HOST: '127.0.0.1', DEMO_DISABLE_ADMIN: '1',
    DEMO_RUNTIME_DIR: join(dir, 'runtime'), DEMO_COOKIE_SECRET: secret,
    DEMO_ASSET_PREFIX: '', DEMO_COOKIE_NAME: 'qa_demo_client_v2', DEMO_COOKIE_PATH: '/',
    PROVIDER_A_BASE_URL: 'http://127.0.0.1:1', PROVIDER_A_API_TOKEN: 'synthetic-api-token',
    PROVIDER_A_INTERNAL_SERVICE_TOKEN: '<synthetic-service-token>', PROVIDER_A_KNOWLEDGE_SCOPE_REF: 'a'.repeat(64),
    PROVIDER_A_ALLOW_HOST_GATEWAY: 'false', PROVIDER_A_HISTORY_ARCHIVE_PATH: '', ...overrides,
  } });
  child.logs = ''; child.stdout.on('data', chunk => { child.logs += chunk; }); child.stderr.on('data', chunk => { child.logs += chunk; });
  return child;
}
async function ready(child) {
  for (let i = 0; i < 100; i++) {
    if (child.logs.includes('QA demo listening')) return;
    if (child.exitCode !== null) throw new Error(child.logs);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Synthetic BFF did not start');
}
async function stop(child) { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } }

test('archive API shares cookie policy, denies mixed owners/mutations and cannot dispatch colliding archive IDs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'synthetic-archive-api-'));
  const requests = [];
  const provider = createServer(async (req, res) => {
    requests.push({ route: req.url, owner: req.headers['x-ima-client-id'] });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/healthz') return res.end('{}');
    if (req.url === '/internal/provider-a/capacity') return res.end(JSON.stringify({ schemaVersion: 1, features: { knowledge_agent_keyed_sse_v1: true }, policies: { knowledge_agent: { max_concurrent: 1 } } }));
    if (req.url === '/api/conversations' && req.method === 'POST') return res.end('{"conversation":{"conversationId":"synthetic-collision"}}');
    if (req.url === '/api/conversations/synthetic-collision') return res.end('{"conversation":{"conversationId":"synthetic-collision"},"messages":[]}');
    return res.end('{"conversations":[]}');
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  const file = join(dir, 'archive.json');
  const data = JSON.stringify({ schemaVersion: 1, conversations: [syntheticConversation(), syntheticConversation({ id: 'other', ownerKey: otherOwner }),
    syntheticConversation({ id: 'legacy-cookie', ownerKey: owner.slice(5) })] });
  writeFileSync(file, data, { mode: 0o600 });
  const port = await freePort();
  const child = start(port, dir, { PROVIDER_A_HISTORY_ARCHIVE_PATH: file, PROVIDER_A_BASE_URL: `http://127.0.0.1:${provider.address().port}` });
  const base = `http://127.0.0.1:${port}`;
  const headers = { Cookie: cookie(owner), 'Content-Type': 'application/json' };
  try {
    await ready(child);
    const list = await fetch(`${base}/api/qa/archive/conversations?ownerKey=${otherOwner}`, { headers });
    assert.equal(list.headers.get('cache-control'), 'no-store');
    const listed = await list.json();
    assert.deepEqual(listed.conversations.map(row => row.conversationId), ['archive:synthetic-collision']);
    const detailUrl = `${base}/api/qa/archive/conversations/archive%3Asynthetic-collision`;
    const detail = await (await fetch(detailUrl, { headers })).json();
    assert.equal(detail.messages[1].content, 'Synthetic answer');
    assert.equal(JSON.stringify(detail).includes('ownerKey'), false);
    assert.equal(JSON.stringify(listed).includes(owner), false);
    assert.equal((await fetch(detailUrl, { headers: { Cookie: cookie(otherOwner), 'X-IMA-Client-Id': owner } })).status, 404);
    assert.equal((await fetch(detailUrl)).status, 404);
    assert.equal((await fetch(detailUrl, { headers: { Cookie: cookie(owner, 'qa_demo_client_v2', 'forged-synthetic') } })).status, 404);
    const legacy = await (await fetch(`${base}/api/qa/archive/conversations`, { headers: { Cookie: cookie(owner, 'qa_demo_client', 'synthetic-api-token') } })).json();
    assert.deepEqual(legacy.conversations.map(row => row.conversationId), ['archive:legacy-cookie']);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      for (const url of [detailUrl, `${base}/api/qa/archive/conversations`]) assert.equal((await fetch(url, { method, headers })).status, 405);
    }
    assert.equal((await fetch(`${base}/api/qa/archive/conversations/synthetic-collision`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/api/qa/archive/conversations/%ZZ`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/internal/provider-a/capacity`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/admin`, { headers })).status, 404);
    assert.deepEqual(readdirSync(dir).sort(), ['archive.json']);
    await fetch(`${base}/api/qa/conversations`, { method: 'POST', headers });
    assert.equal(requests.find(row => row.route === '/api/conversations').owner, owner);
    assert.equal((await (await fetch(`${base}/api/qa/conversations/synthetic-collision`, { headers })).json()).legacyMode, false);
    const before = requests.length;
    for (const route of ['ask', 'queue']) {
      const response = await fetch(`${base}/api/qa/${route}`, { method: 'POST', headers,
        body: JSON.stringify({ question: 'Synthetic question', conversationId: 'archive:synthetic-collision', requestId: randomUUID(), ownerKey: owner }) });
      assert.equal(response.status, 400);
    }
    assert.equal((await fetch(`${base}/api/qa/queue?conversationId=archive%3Asynthetic-collision`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/api/qa/conversations/archive%3Asynthetic-collision`, { method: 'DELETE', headers })).status, 404);
    assert.equal(requests.length, before);
    assert.equal(readFileSync(file, 'utf8'), data);
    assert.equal(readFileSync(join(dir, 'runtime/native-sessions.json'), 'utf8').includes('archive:'), false);
    assert.deepEqual(readdirSync(join(dir, 'runtime')), ['native-sessions.json']);
  } finally { await stop(child); provider.close(); await once(provider, 'close'); rmSync(dir, { recursive: true, force: true }); }
});

test('startup fails closed on invalid archives; disabled archives and explicit gateway opt-in boot', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'synthetic-archive-config-'));
  const file = join(dir, 'bad.json'); writeFileSync(file, '{');
  try {
    for (const overrides of [
      { PROVIDER_A_HISTORY_ARCHIVE_PATH: file }, { PROVIDER_A_HISTORY_ARCHIVE_PATH: join(dir, 'missing') },
      { PROVIDER_A_BASE_URL: 'http://host.docker.internal:3117' },
      { PROVIDER_A_BASE_URL: 'http://host.docker.internal:3117', PROVIDER_A_ALLOW_HOST_GATEWAY: 'TRUE' },
      { PROVIDER_A_BASE_URL: 'http://host.docker.internal:3118', PROVIDER_A_ALLOW_HOST_GATEWAY: 'true' },
    ]) {
      const child = start(await freePort(), dir, overrides);
      try { const [code] = await once(child, 'exit'); assert.notEqual(code, 0); assert.doesNotMatch(child.logs, /QA demo listening/); }
      finally { await stop(child); }
    }
    for (const overrides of [{}, { PROVIDER_A_BASE_URL: 'http://host.docker.internal:3117', PROVIDER_A_ALLOW_HOST_GATEWAY: 'true', DEMO_ASSET_PREFIX: '/qa', DEMO_COOKIE_PATH: '/qa/' }]) {
      const port = await freePort(); const child = start(port, dir, overrides);
      try {
        await ready(child);
        const response = await fetch(`http://127.0.0.1:${port}${overrides.DEMO_ASSET_PREFIX || ''}/api/qa/archive/conversations`);
        assert.deepEqual(await response.json(), { enabled: false, conversations: [] });
      } finally { await stop(child); }
    }
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, conversations: [syntheticConversation()] }));
    const port = await freePort();
    const child = start(port, dir, { PROVIDER_A_HISTORY_ARCHIVE_PATH: file, DEMO_ASSET_PREFIX: '/qa', DEMO_COOKIE_PATH: '/qa/', DEMO_COOKIE_NAME: 'qa_synthetic' });
    try {
      await ready(child);
      const url = `http://127.0.0.1:${port}/qa/api/qa/archive/conversations`;
      const own = await (await fetch(url, { headers: { Cookie: cookie(owner, 'qa_synthetic') } })).json();
      assert.equal(own.conversations.length, 1);
      for (const value of [cookie(owner), cookie(owner, 'qa_demo_client', 'synthetic-api-token')]) {
        const denied = await (await fetch(url, { headers: { Cookie: value } })).json();
        assert.deepEqual(denied.conversations, []);
      }
    } finally { await stop(child); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
