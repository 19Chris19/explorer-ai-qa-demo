import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const synthetic = process.argv.includes('--synthetic');
const restore = process.argv.includes('--restore');
const live = process.argv.includes('--live');
assert.ok(!(synthetic && live), 'Choose synthetic or live, not both');
const syntheticProject = process.env.SYNTHETIC_PROJECT || 'air-qa-synthetic';
assert.match(syntheticProject, /^[a-z0-9][a-z0-9_-]{0,48}$/u);
const base = `http://127.0.0.1:${synthetic ? (process.env.SYNTHETIC_WEB_PORT || 4418) : 4417}`;
const upstream = `http://127.0.0.1:${synthetic ? 3318 : 3317}`;
const env = Object.fromEntries(readFileSync('.docker-lab/provider.env', 'utf8').trim().split('\n').map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
const get = async (url, options = {}) => {
  if (synthetic && url.startsWith(upstream)) {
    // The fixture has no egress or published port. Credentials travel on stdin, never argv.
    const result = JSON.parse(execFileSync('docker', ['exec', '-i', `${syntheticProject}-provider-a-1`, 'node', '-e',
      "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',async()=>{const q=JSON.parse(s);const r=await fetch('http://127.0.0.1:3000'+q.path,{headers:q.headers});console.log(JSON.stringify({status:r.status,body:await r.text()}))})"],
    { input: JSON.stringify({ path: url.slice(upstream.length), headers: options.headers }), encoding: 'utf8', timeout: 30000 }));
    return new Response(result.body, { status: result.status });
  }
  return fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30000) });
};
const expectStatus = async (url, status, options) => { const r = await get(url, options); assert.equal(r.status, status, `Unexpected status: ${new URL(url).pathname}`); return r; };
for (let i = 0; ; i++) {
  try { const h = await (await get(`${base}/api/qa/health`)).json(); if (!h.connected || !h.authenticated) throw Error('not yet'); break; }
  catch { if (i >= 60) throw Error('Lab startup timeout'); await new Promise(resolve => setTimeout(resolve, 1000)); }
}
const health = await (await get(`${base}/api/qa/health`)).json();
assert.equal(health.contractSupported, true);
if (live) { assert.ok(health.capacity > 0); assert.equal(health.ready, true); }
else { assert.equal(health.ready, synthetic); assert.equal(health.capacity, synthetic ? 1 : 0); }
await expectStatus(`${upstream}/api/conversations`, 401);
await expectStatus(`${upstream}/internal/provider-a/capacity`, 401);
await expectStatus(`${upstream}/internal/provider-a/capacity`, 401, { headers: { Authorization: `Bearer ${env.IMA_QA_API_TOKEN}` } });
await expectStatus(`${upstream}/api/conversations`, 401, { headers: { Authorization: `Bearer ${env.IMA_QA_ADMIN_TOKEN}` } });
await expectStatus(`${base}/`, 200);
for (const path of ['/admin', '/admin.js', '/admin.html', '/internal/provider-a/capacity', '/.env.local', '/server.mjs', '/unknown']) await expectStatus(`${base}${path}`, 404);
for (const path of ['/app.js', '/chat.css', '/icons.svg', '/brand-orbit.png', '/questions.json', '/question-rotation.mjs', '/source-evidence.mjs', '/turn-lifecycle.mjs', '/answer-process.mjs', '/prompt-sparks.mjs', '/voice-preview.mjs', '/message-shape.mjs', '/composer-shape.mjs', '/composer-controls.mjs', '/answer-copy.mjs', '/selection-copy.mjs', '/vendor/marked.umd.js', '/vendor/purify.min.js']) await expectStatus(`${base}${path}`, 200);
const checkpoint = `.docker-lab/${synthetic ? 'synthetic' : live ? 'live' : 'empty'}-checkpoint.json`;
let session;
if (restore) session = JSON.parse(readFileSync(checkpoint, 'utf8'));
else {
  const created = await expectStatus(`${base}/api/qa/conversations`, 201, { method: 'POST', headers: { Origin: base } });
  session = { id: (await created.json()).conversation.conversationId, cookie: created.headers.get('set-cookie').split(';')[0] };
  writeFileSync(checkpoint, JSON.stringify(session), { mode: 0o600 });
}
const headers = { Origin: base, Cookie: session.cookie, 'Content-Type': 'application/json' };
const history = async () => (await expectStatus(`${base}/api/qa/conversations/${session.id}`, 200, { headers })).json();
await history();
if (restore) { console.log(JSON.stringify({ restored: true, synthetic, messages: (await history()).messages?.length || 0 })); process.exit(0); }
if (!synthetic) {
  console.log(JSON.stringify({ [live ? 'liveReadiness' : 'emptyPool']: 'PASS', configured: health.configured, authenticated: health.authenticated, contract: health.contractSupported, ready: health.ready, capacity: health.capacity, pathsAndAuth: 'PASS', realAnswer:'not tested by this check' }));
  process.exit(0);
}
const ask = (question, requestId = randomUUID(), signal) => get(`${base}/api/qa/ask`, { method: 'POST', headers, body: JSON.stringify({ question, conversationId: session.id, requestId }), signal });
const key = randomUUID();
const started = Date.now();
const first = await ask('synthetic first table', key); assert.equal(first.status, 200);
const reader = first.body.getReader(); const initial = await reader.read();
assert.ok(initial.value?.length); const firstChunkMs = Date.now() - started;
const decoder = new TextDecoder();
let raw = decoder.decode(initial.value, { stream: true });
for (;;) { const part = await reader.read(); if (part.done) break; raw += decoder.decode(part.value, { stream: true }); }
raw += decoder.decode();
assert.equal((raw.match(/event: done/g) || []).length, 1); assert.match(raw, /event: sources/);
assert.equal((await ask('synthetic first table', key)).status, 409);
assert.match(await (await ask('synthetic followup')).text(), /event: done/);
const messages = (await history()).messages;
assert.equal(messages.length, 4); assert.match(messages[1].content, /\n\n\| 项目 \| 结果 \|/);
const streamedText = raw.split('\n\n').filter(packet => packet.startsWith('event: delta\n')).map(packet => JSON.parse(packet.split('\ndata: ')[1]).text).join('');
assert.equal(streamedText, messages[1].content);
const other = await get(`${base}/api/qa/conversations`, { method: 'POST' });
const otherCookie = other.headers.get('set-cookie').split(';')[0];
await expectStatus(`${base}/api/qa/conversations/${session.id}`, 404, { headers: { Cookie: otherCookie } });
const slow = await ask('synthetic slow');
const queued = await expectStatus(`${base}/api/qa/queue`, 202, { method: 'POST', headers, body: JSON.stringify({ question: 'queued synthetic', conversationId: session.id, requestId: randomUUID() }) });
const job = (await queued.json()).job;
await expectStatus(`${base}/api/qa/queue/${job.id}`, 200, { method: 'PATCH', headers, body: JSON.stringify({ question: 'edited synthetic' }) });
const removed = await expectStatus(`${base}/api/qa/queue`, 202, { method: 'POST', headers, body: JSON.stringify({ question: 'remove synthetic', conversationId: session.id, requestId: randomUUID() }) });
await expectStatus(`${base}/api/qa/queue/${(await removed.json()).job.id}`, 200, { method: 'DELETE', headers });
const next = await get(`${base}/api/qa/queue/${job.id}/events`, { headers });
assert.match(await slow.text(), /event: done/); assert.match(await next.text(), /event: done/);
assert.ok((await history()).messages.some(m => m.content === 'edited synthetic'));
const broken = await (await ask('synthetic disconnect')).text(); assert.match(broken, /event: error/); assert.doesNotMatch(broken, /event: done/);
const controller = new AbortController(); const cancel = await ask('synthetic cancel', randomUUID(), controller.signal);
await cancel.body.getReader().read(); controller.abort();
await new Promise(resolve => setTimeout(resolve, 1000));
const metrics = await (await get(`${upstream}/internal/synthetic/metrics`, { headers: { Authorization: `Bearer ${env.IMA_QA_INTERNAL_SERVICE_TOKEN}` } })).json();
assert.ok(metrics.cancelled >= 1);
console.log(JSON.stringify({ synthetic: 'PASS', firstChunkMs, tableHistory: 'PASS', ownership: 'PASS', dedup: 'PASS', queueEditDelete: 'PASS', disconnect: 'PASS', cancel: 'PASS' }));
