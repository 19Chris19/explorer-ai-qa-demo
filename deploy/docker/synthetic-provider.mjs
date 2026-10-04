import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// This fixture has no upstream client. Compose additionally disables network egress.
const file = '/app/runtime/synthetic.json';
mkdirSync('/app/runtime', { recursive: true });
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { conversations: {}, dispatched: 0, cancelled: 0 };
const save = () => writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
const answer = '## 合成部署验收\n\n**此内容不来自 IMA。**\n\n| 项目 | 结果 |\n| --- | --- |\n| 空格与换行 | 保留 |\n| 合成来源 | 1 条 |\n\n1. 创建会话\n2. 串行追问\n';
const sources = [{ index: 1, title: '合成资料', url: 'https://example.invalid/synthetic', source_type: 'knowledge' }];
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://fixture');
  if (url.pathname === '/healthz') return json(res, 200, { ok: true, synthetic: true });
  const internal = url.pathname.startsWith('/internal/');
  const token = internal ? process.env.IMA_QA_INTERNAL_SERVICE_TOKEN : process.env.IMA_QA_API_TOKEN;
  if (!token || req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: 'unauthorized' });
  if (url.pathname === '/internal/provider-a/capacity') return json(res, 200, {
    schemaVersion: 1, features: { knowledge_agent_keyed_sse_v1: true, source_intent_web_requested_v1: true },
    policies: { knowledge_agent: { max_concurrent: 1 } }, active: 0, queued: 0,
  });
  if (url.pathname === '/internal/synthetic/metrics') return json(res, 200, { dispatched: state.dispatched, cancelled: state.cancelled });
  const owner = req.headers['x-ima-client-id'];
  let body = {};
  if (req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
  }
  if (url.pathname === '/api/conversations') {
    if (req.method === 'POST') {
      const conversation = { conversationId: randomUUID(), title: '合成 Docker 会话', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      state.conversations[conversation.conversationId] = { owner, conversation, messages: [] }; save();
      return json(res, 201, { conversation });
    }
    return json(res, 200, { conversations: Object.values(state.conversations).filter(item => item.owner === owner).map(item => item.conversation) });
  }
  const id = url.pathname.split('/')[3];
  if (url.pathname.startsWith('/api/conversations/')) {
    const item = state.conversations[id];
    if (!item || item.owner !== owner) return json(res, 404, {});
    if (req.method === 'DELETE') { delete state.conversations[id]; save(); return json(res, 200, { success: true }); }
    return json(res, 200, { conversation: item.conversation, messages: item.messages });
  }
  if (url.pathname !== '/internal/provider-a/deep-ask') return json(res, 404, {});
  const item = state.conversations[body.conversationId];
  if (!item || item.owner !== owner) return json(res, 404, {});
  state.dispatched += 1; save();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
  let finished = false;
  res.on('close', () => { if (!finished) { state.cancelled += 1; save(); } });
  const send = async (name, data) => {
    const bytes = Buffer.from(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    for (let offset = 0; offset < bytes.length && !res.destroyed; offset += 7) {
      res.write(bytes.subarray(offset, offset + 7));
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  };
  await send('conversation', { conversationId: body.conversationId });
  await send('sources', { sources });
  await send('delta', { text: answer });
  if (body.question.includes('slow') || body.question.includes('cancel')) await new Promise(resolve => setTimeout(resolve, 5000));
  if (res.destroyed) return;
  if (body.question.includes('disconnect')) { finished = true; res.end(); return; }
  const evidence = { source_count: 1, knowledge_source_count: 1, web_source_count: 0, answer_basis: 'knowledge', source_intent: body.source_intent || '' };
  item.messages.push({ role: 'user', content: body.question }, { role: 'assistant', content: answer, sources, sourceCount: 1, ...evidence }); save();
  await send('done', { conversationId: body.conversationId, ...evidence });
  finished = true; res.end();
}).listen(3000, '0.0.0.0');
