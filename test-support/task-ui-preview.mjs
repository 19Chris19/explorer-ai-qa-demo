// Loopback-only browser fixture. No Provider client, credentials, or real QA calls.
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticResponder } from '../static-assets.mjs';

const root = new URL('../', import.meta.url);
const serveStatic = createStaticResponder(fileURLToPath(root));
const conversations = new Map();
const tasks = new Map();
const counters = { submissions: 0, subscriptions: 0, cancellations: 0 };
const pack = row => `id: ${row.id}\nevent: ${row.event}\ndata: ${JSON.stringify(row.data)}\n\n`;
const send = (res, data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;
    if (path === '/__synthetic/status') return send(res, counters);
    if (path === '/api/qa/health') return send(res, { connected: true, authenticated: true, contractSupported: true, durableTasksSupported: true, ready: true, capacity: 1 });
    if (path === '/api/qa/archive/conversations') return send(res, { conversations: [] });
    if (path === '/api/qa/queue') return send(res, { queue: [] });
    if (path === '/api/qa/conversations') {
      if (req.method === 'POST') {
        const conversation = { conversationId: `synthetic-conversation-${conversations.size + 1}`, title: 'Synthetic browser conversation' };
        conversations.set(conversation.conversationId, conversation);
        return send(res, { conversation });
      }
      return send(res, { conversations: [...conversations.values()] });
    }
    if (path.startsWith('/api/qa/conversations/')) {
      const id = path.split('/').at(-1);
      const messages = [...tasks.values()].filter(row => row.task.conversationId === id && row.task.status === 'succeeded')
        .flatMap(row => [{ role: 'user', content: row.question, taskId: row.task.id },
          { role: 'assistant', content: 'Synthetic answer recovered after stream rotation.', taskId: row.task.id, complete: true }]);
      return send(res, { conversation: conversations.get(id), messages });
    }
    if (path === '/api/qa/tasks') {
      if (req.method === 'POST') {
        let body = ''; for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        const task = { id: `synthetic-task-${++counters.submissions}`, conversationId: input.conversationId,
          requestId: input.requestId, status: 'running', lastEventId: 0 };
        tasks.set(task.id, { task, question: input.question, events: [] });
        return send(res, { task }, 202);
      }
      return send(res, { tasks: [...tasks.values()].map(row => row.task).filter(task =>
        (!url.searchParams.get('conversationId') || task.conversationId === url.searchParams.get('conversationId'))
        && (!url.searchParams.get('requestId') || task.requestId === url.searchParams.get('requestId'))) });
    }
    if (path.startsWith('/api/qa/tasks/')) {
      const row = tasks.get(path.split('/')[4]);
      if (!row) return send(res, {}, 404);
      if (req.method === 'DELETE') {
        counters.cancellations++;
        row.task.status = 'cancelled';
        row.events.push({ id: row.events.length + 1, event: 'task.status', data: { status: 'cancelled' } });
      }
      if (path.endsWith('/events')) {
        counters.subscriptions++;
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
        if (!row.events.length) row.events.push({ id: 1, event: 'delta', data: { text: 'Synthetic answer ' } });
        for (const event of row.events.filter(event => event.id > Number(url.searchParams.get('after')))) res.write(pack(event));
        res.end();
        if (row.task.status === 'running') {
          row.events.push({ id: 2, event: 'delta', data: { text: 'recovered after stream rotation.' } },
            { id: 3, event: 'done', data: {} }, { id: 4, event: 'task.status', data: { status: 'succeeded' } });
          row.task.status = 'succeeded';
        }
        row.task.lastEventId = row.events.length;
        return;
      }
      row.task.lastEventId = row.events.length;
      return send(res, { task: row.task, snapshot: { events: row.events } });
    }
    if (path.startsWith('/api/')) return send(res, {}, 404);
    const special = { '/question-rotation.mjs': 'question-rotation.mjs', '/source-evidence.mjs': 'source-evidence.mjs',
      '/vendor/marked.umd.js': 'node_modules/marked/lib/marked.umd.js', '/vendor/purify.min.js': 'node_modules/dompurify/dist/purify.min.js' };
    const file = special[path] || `public${path === '/' ? '/index.html' : path}`;
    if (file.includes('..')) return send(res, {}, 404);
    serveStatic(req, res, file, { '.html': 'text/html', '.mjs': 'application/javascript', '.js': 'application/javascript',
      '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream');
  } catch { send(res, {}, 404); }
});
server.listen(0, '127.0.0.1', () => console.log(`Synthetic task UI: http://127.0.0.1:${server.address().port}`));
process.on('SIGTERM', () => { server.closeAllConnections(); server.close(); });
process.on('SIGINT', () => { server.closeAllConnections(); server.close(); });
