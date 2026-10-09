import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

export const syntheticAnswer = '## Synthetic acceptance\n\n**Not an IMA answer.**\n\n| Check | Result |\n| --- | --- |\n| Same-origin path | PASS |\n| Table and newlines | PASS |\n';
const sources = [{ index: 1, title: 'Synthetic source', source_type: 'knowledge' }];
const terminal = task => ['succeeded', 'cancelled'].includes(task.status);
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

// UI/HTTP fixture only: no upstream client, disk durability or real credentials.
export function createSyntheticTaskProvider({ stepMs = 20 } = {}) {
  const conversations = new Map();
  const tasks = new Map();
  const timers = new Set();
  const publicTask = row => ({ ...row.task });
  const packet = event => `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
  const emit = (row, event, data) => {
    const entry = { id: ++row.task.lastEventId, event, data };
    row.events.push(entry);
    for (const res of row.subscribers) res.write(packet(entry));
  };
  const finish = row => { for (const res of row.subscribers) res.end(); row.subscribers.clear(); };
  const later = action => {
    const timer = setTimeout(() => { timers.delete(timer); action(); }, stepMs);
    timers.add(timer);
  };
  const run = row => {
    if (terminal(row.task)) return;
    if ([...tasks.values()].some(item => item.task.status === 'running')) { later(() => run(row)); return; }
    row.task.status = 'running'; emit(row, 'task.status', { status: 'running' });
    emit(row, 'conversation', { conversationId: row.task.conversationId });
    emit(row, 'sources', { sources });
    let offset = 0;
    const tick = () => {
      if (terminal(row.task)) return;
      if (offset < syntheticAnswer.length) {
        emit(row, 'delta', { text: syntheticAnswer.slice(offset, offset + 12) });
        offset += 12; later(tick); return;
      }
      const evidence = { source_count: 1, knowledge_source_count: 1, web_source_count: 0,
        answer_basis: 'knowledge', source_intent: row.input.source_intent || '' };
      const conversation = conversations.get(row.task.conversationId);
      conversation.messages.push({ role: 'user', content: row.input.question },
        { role: 'assistant', content: syntheticAnswer, sources, sourceCount: 1, ...evidence });
      row.task.status = 'succeeded';
      emit(row, 'done', { conversationId: row.task.conversationId, ...evidence });
      emit(row, 'task.status', { status: 'succeeded' }); finish(row);
    };
    later(tick);
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://fixture');
      const path = url.pathname;
      if (path === '/healthz') return json(res, 200, { ok: true, synthetic: true });
      const internal = path.startsWith('/internal/');
      if (req.headers.authorization !== `Bearer synthetic-${internal ? 'service' : 'api'}`) return json(res, 401, {});
      if (path === '/internal/provider-a/capacity') return json(res, 200, {
        schemaVersion: 1, features: { knowledge_agent_keyed_sse_v1: true, durable_qa_tasks_v1: true, source_intent_web_requested_v1: true },
        policies: { knowledge_agent: { max_concurrent: 1 } },
        active: [...tasks.values()].filter(row => row.task.status === 'running').length,
        queued: [...tasks.values()].filter(row => row.task.status === 'queued').length,
      });
      const owner = req.headers['x-ima-client-id'];
      if (!owner) return json(res, 400, {});
      let body = {};
      if (req.method === 'POST') {
        const chunks = []; for await (const part of req) chunks.push(part);
        body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      }
      if (path === '/api/conversations') {
        if (req.method === 'POST') {
          const conversation = { conversationId: randomUUID(), title: 'Synthetic host acceptance', updatedAt: new Date().toISOString() };
          conversations.set(conversation.conversationId, { owner, conversation, messages: [] });
          return json(res, 201, { conversation });
        }
        return json(res, 200, { conversations: [...conversations.values()].filter(row => row.owner === owner).map(row => row.conversation) });
      }
      if (path.startsWith('/api/conversations/')) {
        const id = path.split('/')[3]; const row = conversations.get(id);
        if (!row || row.owner !== owner) return json(res, 404, {});
        if (req.method === 'DELETE') {
          if ([...tasks.values()].some(item => item.task.conversationId === id && !terminal(item.task))) return json(res, 409, {});
          conversations.delete(id); return json(res, 200, { success: true });
        }
        return json(res, 200, { conversation: row.conversation, messages: row.messages });
      }
      const base = '/internal/provider-a/tasks';
      if (path === base) {
        if (req.method === 'POST') {
          const requestKey = req.headers['idempotency-key'];
          if (!requestKey || typeof body.question !== 'string' || !body.question.trim()) return json(res, 400, {});
          const existing = [...tasks.values()].find(row => row.owner === owner && row.task.requestKey === requestKey);
          if (existing) return json(res, JSON.stringify(existing.input) === JSON.stringify(body) ? 200 : 409, { task: publicTask(existing) });
          if (conversations.get(body.conversationId)?.owner !== owner) return json(res, 404, {});
          if ([...tasks.values()].some(row => row.task.conversationId === body.conversationId && !terminal(row.task))) return json(res, 429, { error: 'queue_full' });
          const row = { owner, input: body, events: [], subscribers: new Set(), task: {
            id: randomUUID(), conversationId: body.conversationId, question: body.question,
            sourceIntent: body.source_intent === 'web_requested' ? 'web' : '', requestKey, status: 'queued', lastEventId: 0,
          } };
          tasks.set(row.task.id, row); emit(row, 'task.status', { status: 'queued' }); later(() => run(row));
          return json(res, 202, { task: publicTask(row) });
        }
        return json(res, 200, { tasks: [...tasks.values()].filter(row => row.owner === owner &&
          (!url.searchParams.has('requestKey') || row.task.requestKey === url.searchParams.get('requestKey')) &&
          (!url.searchParams.has('conversationId') || row.task.conversationId === url.searchParams.get('conversationId'))).map(publicTask) });
      }
      const match = /^\/internal\/provider-a\/tasks\/([^/]+)(\/events)?$/u.exec(path);
      const row = match && tasks.get(match[1]);
      if (!row || row.owner !== owner) return json(res, 404, {});
      if (req.method === 'DELETE' && !match[2]) {
        if (!terminal(row.task)) {
          row.task.status = 'cancelled'; emit(row, 'error', { code: 'cancelled', message: 'Synthetic cancellation' });
          emit(row, 'task.status', { status: 'cancelled' }); finish(row);
        }
        return json(res, 200, { task: publicTask(row) });
      }
      if (match[2]) {
        const cursor = url.searchParams.get('after') ?? '0';
        if (!/^(0|[1-9]\d*)$/u.test(cursor) || !Number.isSafeInteger(Number(cursor))) return json(res, 400, {});
        if (Number(cursor) > row.task.lastEventId) return json(res, 409, {});
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
        res.flushHeaders();
        for (const event of row.events) if (event.id > Number(cursor)) res.write(packet(event));
        if (terminal(row.task)) return res.end();
        row.subscribers.add(res); res.on('close', () => row.subscribers.delete(res)); return;
      }
      return json(res, 200, { task: publicTask(row), snapshot: { events: row.events } });
    } catch { if (!res.headersSent) json(res, 400, {}); else res.end(); }
  });
  server.on('close', () => { for (const timer of timers) clearTimeout(timer); });
  return server;
}
