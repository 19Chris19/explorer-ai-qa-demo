import chatPresentation from './chat-presentation.cjs';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProviderAClient, createStreamObserver, requestKey } from './provider-a-client.mjs';
import { SessionModeStore } from './session-mode-store.mjs';
import { RequestLedger } from './request-ledger.mjs';
import { ConversationTurnQueue } from './conversation-turn-queue.mjs';
import { PreviewAdmission } from './preview-admission.mjs';
import { deploymentPaths, routePath, storageNamespace } from './deployment-paths.mjs';
import { loadHistoryArchive } from './history-archive.mjs';
import { MaintenanceGate } from './maintenance-gate.mjs';
import { cancelTaskAttempt, followTask, lookupSubmittedTask, recoverSubmittedTask, relayTaskEvents, taskTerminalError, terminalTask } from './durable-task-bridge.mjs';
import { TaskWatchStore } from './task-watch-store.mjs';
import { createStaticResponder } from './static-assets.mjs';
import { relaySourcePreview } from './source-preview.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const serveStatic = createStaticResponder(root);
const env = readPrivateEnv(join(root, '.env.local'));
const port = Number(process.env.PORT || env.PORT || 4317);
const listenHost = process.env.DEMO_LISTEN_HOST || env.DEMO_LISTEN_HOST || '127.0.0.1';
const providerBaseUrl = process.env.PROVIDER_A_BASE_URL || env.PROVIDER_A_BASE_URL || 'http://127.0.0.1:3117';
const providerApiToken = process.env.PROVIDER_A_API_TOKEN || env.PROVIDER_A_API_TOKEN || '';
const providerServiceToken = process.env.PROVIDER_A_INTERNAL_SERVICE_TOKEN || env.PROVIDER_A_INTERNAL_SERVICE_TOKEN || '';
const knowledgeScopeRef = process.env.PROVIDER_A_KNOWLEDGE_SCOPE_REF || env.PROVIDER_A_KNOWLEDGE_SCOPE_REF || '';
const cookieSecret = process.env.DEMO_COOKIE_SECRET || env.DEMO_COOKIE_SECRET || providerApiToken;
const releaseRevision = process.env.DEMO_RELEASE_REVISION || env.DEMO_RELEASE_REVISION || 'local-dev';
const disableAdmin = (process.env.DEMO_DISABLE_ADMIN || env.DEMO_DISABLE_ADMIN) === '1';
const paths = deploymentPaths({ ...env, ...process.env });
const assetPrefix = paths.prefix;
const provider = createProviderAClient({ baseUrl: providerBaseUrl, apiToken: providerApiToken, serviceToken: providerServiceToken, knowledgeScopeRef,
  allowHostGateway: (process.env.PROVIDER_A_ALLOW_HOST_GATEWAY ?? env.PROVIDER_A_ALLOW_HOST_GATEWAY) === 'true' });
const historyArchive = loadHistoryArchive(process.env.PROVIDER_A_HISTORY_ARCHIVE_PATH ?? env.PROVIDER_A_HISTORY_ARCHIVE_PATH ?? '');
const runtimeDir = process.env.DEMO_RUNTIME_DIR || join(root, 'runtime');
const nativeSessions = new SessionModeStore(join(runtimeDir, 'native-sessions.json'));
const requestLedger = new RequestLedger(join(runtimeDir, 'request-ledger.json'));
const maintenance = new MaintenanceGate(process.env.DEMO_MAINTENANCE_STATE_PATH ?? env.DEMO_MAINTENANCE_STATE_PATH ?? '');
const turnQueue = new ConversationTurnQueue(join(runtimeDir, 'queued-turns.json'), dispatchQueuedTurn, () => Date.now(),
  { preserveExpiredPending: maintenance.enabled });
const previewAdmission = new PreviewAdmission();
const taskWatches = new Map();
const taskWatchStore = new TaskWatchStore(join(runtimeDir, 'task-watch.json'));
const directLanes = new Map();
maintenance.start(() => ({ ...turnQueue.maintenanceSnapshot(), ...previewAdmission.maintenanceSnapshot() }));
process.once('exit', () => maintenance.stop());
if (maintenance.enabled) {
  process.once('SIGTERM', () => process.exit(0));
  process.once('SIGINT', () => process.exit(0));
}
let lastRealSuccessAt = '';
const vendorFile = (bundled, dependency) => existsSync(join(root, bundled)) ? bundled : dependency;
const staticFiles = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/admin', ['public/admin.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/chat-presentation.js', ['public/chat-presentation.js', 'text/javascript; charset=utf-8']],
  ['/chat-presentation.css', ['public/chat-presentation.css', 'text/css; charset=utf-8']],
  ['/chat.css', ['public/chat.css', 'text/css; charset=utf-8']],
  ['/main-shell.css', ['public/main-shell.css', 'text/css; charset=utf-8']],
  ['/site/logo.png', ['public/site/logo.png', 'image/png']],
  ['/site/dm-sans-latin.woff2', ['public/site/dm-sans-latin.woff2', 'font/woff2']],
  ['/icons.svg', ['public/icons.svg', 'image/svg+xml']],
  ['/brand-orbit.png', ['public/brand-orbit.png', 'image/png']],
  ['/questions.json', ['public/questions.json', 'application/json; charset=utf-8']],
  ['/question-rotation.mjs', ['question-rotation.mjs', 'text/javascript; charset=utf-8']],
  ['/source-evidence.mjs', ['source-evidence.mjs', 'text/javascript; charset=utf-8']],
  ['/turn-lifecycle.mjs', ['public/turn-lifecycle.mjs', 'text/javascript; charset=utf-8']],
  ['/answer-process.mjs', ['public/answer-process.mjs', 'text/javascript; charset=utf-8']],
  ['/prompt-sparks.mjs', ['public/prompt-sparks.mjs', 'text/javascript; charset=utf-8']],
  ['/voice-preview.mjs', ['public/voice-preview.mjs', 'text/javascript; charset=utf-8']],
  ['/message-shape.mjs', ['public/message-shape.mjs', 'text/javascript; charset=utf-8']],
  ['/composer-shape.mjs', ['public/composer-shape.mjs', 'text/javascript; charset=utf-8']],
  ['/composer-controls.mjs', ['public/composer-controls.mjs', 'text/javascript; charset=utf-8']],
  ['/answer-copy.mjs', ['public/answer-copy.mjs', 'text/javascript; charset=utf-8']],
  ['/selection-copy.mjs', ['public/selection-copy.mjs', 'text/javascript; charset=utf-8']],
  ['/host-bridge.mjs', ['public/host-bridge.mjs', 'text/javascript; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/task-stream.mjs', ['public/task-stream.mjs', 'text/javascript; charset=utf-8']],
  ['/answer-markdown.js', ['public/answer-markdown.js', 'text/javascript; charset=utf-8']],
  ['/vendor/marked.umd.js', [vendorFile('public/vendor/marked.umd.js', 'node_modules/marked/lib/marked.umd.js'), 'text/javascript; charset=utf-8']],
  ['/vendor/purify.min.js', [vendorFile('public/vendor/purify.min.js', 'node_modules/dompurify/dist/purify.min.js'), 'text/javascript; charset=utf-8']],
  ['/admin.js', ['public/admin.js', 'text/javascript; charset=utf-8']],
]);

for (const icon of ['compass-3-line', 'chat-3-line', 'shapes-line', 'cpu-line', 'cloud-line', 'trophy-line', 'clapperboard-line', 'graduation-cap-line', 'information-line']) {
  staticFiles.set(`/site/${icon}.svg`, [`public/site/${icon}.svg`, 'image/svg+xml']);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
if (!['127.0.0.1', '0.0.0.0'].includes(listenHost)) throw new Error('Invalid DEMO_LISTEN_HOST');

const server = createServer(async (req, res) => {
  let releaseAdmission;
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = routePath(url.pathname, assetPrefix);
    const embedded = pathname === '/' && url.searchParams.get('embed') === '1';
    setSecurityHeaders(res, embedded);
    if (req.method === 'POST' && ['/api/qa/ask', '/api/qa/tasks', '/api/qa/queue', '/api/qa/conversations'].includes(pathname)) {
      releaseAdmission = maintenance.admit();
      if (!releaseAdmission) {
        res.setHeader('Retry-After', '30');
        sendJson(res, 503, { error: '问答服务维护中，请稍后重试。' });
        return;
      }
    }
    if (disableAdmin && ['/admin', '/admin.js'].includes(pathname)) { sendJson(res, 404, { error: 'Not found' }); return; }
    if (['GET', 'HEAD'].includes(req.method) && staticFiles.has(pathname)) {
      const [file, type] = staticFiles.get(pathname);
      if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': type });
        let html = readFileSync(join(root, file), 'utf8');
        if (disableAdmin) html = html.replace(/<a class="admin-link"[^>]*>.*?<\/a>/su, '');
        if (embedded) html = html.replace('class="app-page"', 'class="app-page qa-embedded"');
        if (assetPrefix) html = html.replaceAll('href="/', `href="${assetPrefix}/`).replaceAll('src="/', `src="${assetPrefix}/`);
        res.end(req.method === 'HEAD' ? undefined : html.replace('name="qa-asset-prefix" content=""', `name="qa-asset-prefix" content="${assetPrefix}"`)
          .replace('name="qa-storage-namespace" content=""', `name="qa-storage-namespace" content="${storageNamespace(paths)}"`));
      } else if (pathname === '/admin') {
        res.writeHead(200, { 'Content-Type': type });
        res.end(req.method === 'HEAD' ? undefined : readFileSync(join(root, file)));
      } else serveStatic(req, res, file, type);
      return;
    }
    if (pathname === '/api/qa/health' && req.method === 'GET') {
      await health(res);
      return;
    }
    if (['/api/qa/source-preview', '/api/qa/source-preview/image'].includes(pathname) && req.method === 'GET') {
      await relaySourcePreview(provider, { req, res, clientId: getClientId(req, res), params: url.searchParams,
        image: pathname.endsWith('/image'), prefix: assetPrefix }); return;
    }
    if (pathname === '/api/qa/tasks' || /^\/api\/qa\/tasks\/[a-zA-Z0-9-]{1,100}(?:\/events)?$/u.test(pathname)) {
      if (!provider.configured) { sendJson(res, 503, { error: '问答接入尚未完成配置' }); return; }
      if (req.method !== 'GET' && !isSameOrigin(req)) { sendJson(res, 403, { error: 'Invalid request origin' }); return; }
      await taskRoute(req, res, pathname, url.searchParams);
      return;
    }
    if (pathname === '/api/qa/archive/conversations' || pathname.startsWith('/api/qa/archive/conversations/')) {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); sendJson(res, 405, { error: 'Read-only archive' }); return; }
      const clientId = getClientId(req, res);
      if (pathname === '/api/qa/archive/conversations') {
        sendJson(res, 200, { enabled: historyArchive.enabled, conversations: historyArchive.list(clientId) }); return;
      }
      let id;
      try { id = decodeURIComponent(pathname.slice('/api/qa/archive/conversations/'.length)); } catch {}
      const data = typeof id === 'string' && /^archive:[a-zA-Z0-9-]{1,100}$/u.test(id) ? historyArchive.detail(id, clientId) : null;
      sendJson(res, data ? 200 : 404, data ? (url.searchParams.get('presentation') === 'chat_v1' ? chatPresentation.projectHistory(data) : data) : { error: 'Not found' }); return;
    }
    if (pathname === '/api/qa/queue' || /^\/api\/qa\/queue\/[a-f0-9-]{36}(?:\/events)?$/iu.test(pathname)) {
      if (!provider.configured) { sendJson(res, 503, { error: 'Provider A 问答接入尚未完成配置' }); return; }
      if (req.method !== 'GET' && !isSameOrigin(req)) { sendJson(res, 403, { error: 'Invalid request origin' }); return; }
      await queueRoute(req, res, pathname);
      return;
    }
    const route = matchQaRoute(pathname, req.method);
    if (route) {
      if (!provider.configured) { sendJson(res, 503, { error: 'Provider A 问答接入尚未完成配置' }); return; }
      if (req.method !== 'GET' && !isSameOrigin(req)) { sendJson(res, 403, { error: 'Invalid request origin' }); return; }
      await proxy(req, res, route);
      return;
    }
    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    if (!res.headersSent) sendJson(res, 502, { error: 'Provider A is unavailable' });
    else res.end();
    console.error('Request failed: internal_error');
  } finally {
    releaseAdmission?.();
  }
});

server.listen(port, listenHost, () => {
  console.log(`QA demo listening on ${listenHost}:${port}`);
  if (provider.configured) {
    for (const row of taskWatchStore.rows.values()) {
      if (row.queueId && row.status === 'cancelled' && !taskIdOf(row)) turnQueue.remove(row.clientId, row.queueId);
      else if (!row.queueId) watchDirectTask(row);
    }
    turnQueue.resumeRecovered();
    void provider.readiness().then(status => {
      if (status.authenticated && !status.contractSupported) console.warn('Provider A contract incompatible: knowledge_agent_keyed_sse_v1 missing');
    }).catch(() => console.warn('Provider A startup contract check unavailable'));
  }
});

function readPrivateEnv(file) {
  try {
    return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/u.test(line)).map(line => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function setSecurityHeaders(res, embedded = false) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors ${embedded ? "'self'" : "'none'"}; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'`);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function matchQaRoute(path, method) {
  if (path === '/api/qa/conversations' && ['GET', 'POST'].includes(method)) return `/api/conversations${method === 'GET' ? '?limit=50' : ''}`;
  const id = path.match(/^\/api\/qa\/conversations\/([a-zA-Z0-9-]+)$/u)?.[1];
  if (id && ['GET', 'DELETE'].includes(method)) return `/api/conversations/${id}`;
  if (path === '/api/qa/ask' && method === 'POST') return '/api/ask';
  return null;
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === req.headers.host && /^https?:$/u.test(parsed.protocol);
  } catch { return false; }
}

function getClientId(req, res) {
  const current = new RegExp(`(?:^|;\\s*)${paths.cookieName}=([a-f0-9-]{36})\\.([a-f0-9]{64})(?:;|$)`, 'iu').exec(req.headers.cookie || '');
  if (current && (validSignature(current[1], current[2]) || (!storageNamespace(paths) && validSignature(current[1], current[2], providerApiToken)))) return `demo:${current[1]}`;
  const match = !storageNamespace(paths) && /(?:^|;\s*)qa_demo_client=([a-f0-9-]{36})\.([a-f0-9]{64})(?:;|$)/iu.exec(req.headers.cookie || '');
  if (match && validSignature(match[1], match[2], providerApiToken)) return match[1];
  const id = randomUUID();
  res.setHeader('Set-Cookie', `${paths.cookieName}=${id}.${signClientId(id)}; HttpOnly; SameSite=Lax; Path=${paths.cookiePath}; Max-Age=2592000${paths.secure || isPreview(req) ? '; Secure' : ''}`);
  return `demo:${id}`;
}

function previewVisitor(req) {
  const value = String(req.headers['x-explorer-preview-visitor'] || '');
  return /^[a-f0-9]{64}$/u.test(value) ? value : '';
}

function isPreview(req) {
  return Boolean(previewVisitor(req));
}

function validSignature(id, signature, secret = cookieSecret) {
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(signClientId(id, secret), 'hex'));
}

function signClientId(id, secret = cookieSecret) {
  return createHmac('sha256', secret).update(id).digest('hex');
}

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16384) throw new Error('Request too large');
    chunks.push(chunk);
  }
  const content = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  const body = JSON.parse(content || '{}');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid JSON object');
  return body;
}

async function health(res) {
  try {
    const status = await provider.readiness();
    sendJson(res, 200, { ...status, lastRealSuccessAt, websiteRelease: releaseRevision });
  } catch {
    sendJson(res, 503, { connected: false, configured: provider.configured, authenticated: false, contractSupported: false, ready: false, capacity: 0, webIntentSupported: false, lastRealSuccessAt, websiteRelease: releaseRevision });
  }
}

async function requireNativeContract(res, durable = false) {
  const status = await provider.readiness().catch(() => null);
  if (!status?.connected) {
    sendJson(res, 503, { error: 'Provider A 服务暂不可用', code: 'provider_unavailable' });
    return false;
  }
  if (!status.authenticated) {
    sendJson(res, 503, { error: 'Provider A 接入凭证不可用', code: 'provider_auth_unavailable' });
    return false;
  }
  if (!status.contractSupported || (durable && !status.durableTasksSupported)) {
    sendJson(res, 409, { error: '当前 Provider A 版本与网站问答协议不兼容', code: 'provider_contract_incompatible' });
    return false;
  }
  return true;
}
const submissionFingerprint = input => createHash('sha256').update(JSON.stringify([input.conversationId, input.question.trim(), input.sourceIntent || ''])).digest('hex');
const taskIdOf = row => row.taskId || (!row.requestId ? row.id : null);
const pendingPublicCount = () => turnQueue.previewPendingCount() + taskWatchStore.pendingCount();
const activeWatch = row => !terminalTask(row.status) && row.status !== 'rejected';

function submissionIntent(clientId, input, preview, queueId, status = 'unconfirmed') {
  const existing = taskWatchStore.findRequest(clientId, input.requestId);
  if (existing) return existing;
  const row = { id: 'intent-' + requestKey(clientId, input.requestId), clientId, conversationId: input.conversationId,
    requestId: input.requestId, fingerprint: submissionFingerprint(input), preview, status, ...(queueId ? { queueId } : {}) };
  taskWatchStore.set(row);
  return row;
}

function recordTask(row, task) {
  if (!task?.id || !validConversationId(task.id) || !['queued', 'running', 'succeeded', 'failed', 'cancelled', 'indeterminate'].includes(task.status)) return null;
  const current = taskWatchStore.rows.get(row.id) || row;
  const next = { ...current, taskId: task.id, status: task.status };
  taskWatchStore.set(next);
  return next;
}

// Caller has synchronously persisted intent before entering this one-shot POST.
async function postTaskOnce(row, input) {
  let response;
  try {
    response = await provider.request({ route: '/api/tasks', method: 'POST', clientId: row.clientId, requestId: row.requestId,
      body: JSON.stringify({ question: input.question.trim(), conversationId: input.conversationId }), sourceIntent: input.sourceIntent,
      signal: AbortSignal.timeout(60000) });
    if (response.ok) {
      const data = await response.json();
      if (recordTask(row, data.task)) return { status: response.status, data };
    } else {
      await response.body?.cancel();
      if ([400, 403, 404, 409, 410, 422, 429].includes(response.status)) {
        taskWatchStore.set({ ...row, status: 'rejected', rejectionStatus: response.status });
        return { status: response.status, data: { code: response.status === 429 ? 'queue_full' : 'task_request_rejected', error: '问题未被接收。' } };
      }
    }
  } catch { /* Accepted-but-unobserved stays durable and is reconciled by GET. */ }
  return { status: 503, data: { code: 'task_request_unconfirmed', error: '提交状态尚未确认，请查询原请求，勿创建新请求。' } };
}

async function taskRoute(req, res, pathname, params) {
  const clientId = getClientId(req, res);
  const presentation = params.get('presentation');
  if (presentation !== null && presentation !== 'chat_v1') { sendJson(res, 400, { error: 'Invalid presentation' }); return; }
  const rootRoute = pathname === '/api/qa/tasks';
  const events = pathname.endsWith('/events');
  if (!(rootRoute ? ['GET', 'POST'] : events ? ['GET'] : ['GET', 'DELETE']).includes(req.method)) {
    sendJson(res, 405, { error: 'Method not allowed' }); return;
  }
  let route = pathname.replace('/api/qa/', '/api/');
  if (req.method === 'POST') {
    let input;
    try {
      input = await readBody(req); validateQueuedInput(input, true);
      if (Object.keys(input).some(key => !['question', 'conversationId', 'requestId', 'sourceIntent'].includes(key))) throw new Error('不支持的请求字段');
    } catch (error) { sendJson(res, 400, { error: error.message }); return; }
    if (!nativeSessions.belongsToNative(input.conversationId, clientId)) { sendJson(res, 404, { error: '会话不存在' }); return; }
    if (!taskWatchStore.findRequest(clientId, input.requestId)) {
      if (!await requireNativeContract(res, true)) return;
      if (input.sourceIntent === 'web' && !await supportsWebIntent()) { sendJson(res, 409, { error: '当前服务不支持本轮联网请求' }); return; }
    }
    // Recheck after readiness awaits so concurrent duplicates cannot dispatch twice.
    const existing = taskWatchStore.findRequest(clientId, input.requestId);
    if (existing) {
      if (existing.fingerprint !== submissionFingerprint(input)) { sendJson(res, 409, { error: '此请求编号已用于另一问题。', code: 'task_request_conflict' }); return; }
      if (existing.status === 'rejected') { sendJson(res, existing.rejectionStatus || 409, { error: '原请求未被接收。', code: 'task_request_rejected' }); return; }
      if (existing.status === 'cancelled' && existing.queueId && !taskIdOf(existing)) {
        sendJson(res, 409, { error: '原待发问题已删除。', code: 'task_request_conflict' }); return;
      }
      const task = await lookupSubmittedTask(provider, { clientId, requestKey: requestKey(clientId, input.requestId) });
      if (task) recordTask(existing, task);
      if (!existing.queueId) watchDirectTask(taskWatchStore.rows.get(existing.id));
      sendJson(res, task ? 202 : 503, task ? { task } : { error: '原请求状态尚未确认。', code: 'task_request_unconfirmed' });
      return;
    }
    if (turnQueue.findRequest(clientId, input.requestId)) { sendJson(res, 409, { error: '原请求已在待发队列中。', code: 'task_request_conflict' }); return; }
    if (!taskWatchStore.hasRoom()) { sendJson(res, 429, { error: '任务记录已满，问题尚未接收。', code: 'task_storage_full' }); return; }
    const visitor = previewVisitor(req);
    if (visitor && !previewAdmission.hasRoom(pendingPublicCount())) { sendJson(res, 429, { error: '待发队列已满，问题尚未接收。', code: 'queue_full' }); return; }
    if (visitor && !previewAdmission.admit(visitor, input.requestId)) { sendJson(res, 429, { error: '提交过于频繁，问题尚未接收。', code: 'submission_rate_limited' }); return; }
    const row = submissionIntent(clientId, input, Boolean(visitor));
    watchDirectTask(row);
    const result = await postTaskOnce(row, input);
    watchDirectTask(taskWatchStore.rows.get(row.id));
    sendJson(res, result.status, result.data);
    return;
  }
  if (events) {
    const after = params.get('after') || '0';
    if (!/^\d{1,15}$/u.test(after) || !Number.isSafeInteger(Number(after))) { sendJson(res, 400, { error: 'Invalid event cursor' }); return; }
    await relayTaskEvents(provider, { req, res, route: route + '?after=' + after + (presentation ? '&presentation=chat_v1' : ''), clientId, presentation });
    return;
  }
  if (req.method === 'DELETE') {
    const taskId = pathname.split('/').at(-1);
    let row = taskWatchStore.findTask(clientId, taskId);
    if (!row) {
      const upstream = await provider.request({ route, method: 'GET', clientId, signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) { await upstream.body?.cancel(); sendJson(res, upstream.status === 404 ? 404 : 503, { code: 'task_request_unconfirmed' }); return; }
      const { task } = await upstream.json();
      if (task?.id !== taskId || !nativeSessions.belongsToNative(task.conversationId, clientId)) { sendJson(res, 404, { error: '任务不存在' }); return; }
      row = { id: taskId, taskId, clientId, conversationId: task.conversationId, preview: isPreview(req), status: task.status };
    }
    row = { ...row, cancelRequested: true };
    taskWatchStore.set(row);
    const task = await cancelTaskAttempt(provider, { clientId, taskId });
    if (task) recordTask(row, task);
    if (row.queueId) turnQueue.remove(clientId, row.queueId);
    else {
      watchDirectTask(taskWatchStore.rows.get(row.id));
      taskWatches.get(row.id)?.controller.abort();
    }
    sendJson(res, terminalTask(task?.status) ? 200 : 202, terminalTask(task?.status) ? { task } : { cancelPending: true, taskId });
    return;
  }
  if (rootRoute) {
    const query = new URLSearchParams();
    const conversationId = params.get('conversationId');
    if (conversationId) {
      if (!validConversationId(conversationId) || !nativeSessions.belongsToNative(conversationId, clientId)) { sendJson(res, 404, { error: '会话不存在' }); return; }
      query.set('conversationId', conversationId);
    }
    const requestId = params.get('requestId');
    if (requestId) {
      if (!validRequestId(requestId)) { sendJson(res, 400, { error: 'Invalid request id' }); return; }
      const receipt = taskWatchStore.findRequest(clientId, requestId);
      if (receipt?.status === 'rejected' && (!conversationId || receipt.conversationId === conversationId)) {
        sendJson(res, 200, { tasks: [], receipt: { requestId, conversationId: receipt.conversationId,
          status: 'rejected', rejectionStatus: receipt.rejectionStatus } });
        return;
      }
      if (receipt?.status === 'cancelled' && receipt.queueId && !taskIdOf(receipt)
          && (!conversationId || receipt.conversationId === conversationId)) {
        sendJson(res, 200, { tasks: [], receipt: { requestId, conversationId: receipt.conversationId, status: 'cancelled' } });
        return;
      }
      const queued = turnQueue.findRequest(clientId, requestId);
      if (queued && (!conversationId || queued.conversationId === conversationId)) {
        const job = turnQueue.list(clientId, queued.conversationId).find(item => item.requestId === requestId);
        if (job) { sendJson(res, 200, { tasks: [], job }); return; }
      }
      query.set('requestKey', requestKey(clientId, requestId));
    }
    if (presentation) query.set('presentation', presentation);
    route += '?' + query;
  }
  if (!rootRoute && presentation) route += '?presentation=chat_v1';
  const upstream = await provider.request({ route, method: 'GET', clientId, signal: AbortSignal.timeout(60000) });
  if (!upstream.ok) {
    await upstream.body?.cancel();
    sendJson(res, [400, 403, 404, 409, 410, 429].includes(upstream.status) ? upstream.status : 503, { error: '当前操作未能确认，请检查原任务状态。', code: 'task_request_unconfirmed' });
    return;
  }
  const data = await upstream.json();
  sendJson(res, upstream.status, presentation === 'chat_v1' ? chatPresentation.projectSnapshot(data) : data);
}

function watchDirectTask(row) {
  if (!row || !activeWatch(row) || taskWatches.has(row.id)) return;
  const { clientId, conversationId } = row;
  const laneKey = clientId + ':' + conversationId;
  let lane = directLanes.get(laneKey);
  if (!lane) {
    lane = { count: 0, owns: turnQueue.beginDirect(clientId, conversationId), complete: true };
    directLanes.set(laneKey, lane);
  }
  lane.count++;
  const controller = new AbortController();
  if (row.cancelRequested) controller.abort();
  taskWatches.set(row.id, { controller });
  void (async () => {
    let taskId = taskIdOf(row);
    if (!taskId) {
      const task = await recoverSubmittedTask(provider, { clientId, requestKey: requestKey(clientId, row.requestId), recordedTask() {
        const current = taskWatchStore.rows.get(row.id);
        if (current.status === 'rejected') throw taskTerminalError('failed');
        return taskIdOf(current) ? { id: taskIdOf(current), status: current.status } : null;
      } });
      row = recordTask(row, task);
      taskId = task.id;
    }
    if (taskWatchStore.rows.get(row.id)?.cancelRequested) controller.abort();
    if (terminalTask(row.status)) {
      if (row.status !== 'succeeded') throw taskTerminalError(row.status);
      return;
    }
    await followTask(provider, { clientId, taskId, signal: controller.signal, emit() {},
      confirmedStatus: () => taskWatchStore.rows.get(row.id)?.status,
      onStatus(status) {
        if (['queued', 'running'].includes(status)) taskWatchStore.set({ ...taskWatchStore.rows.get(row.id), status });
      } });
  })().then(() => {
    taskWatchStore.set({ ...taskWatchStore.rows.get(row.id), status: 'succeeded' });
  }, error => {
    if (!error.confirmedTerminal) throw error;
    lane.complete = false;
    const current = taskWatchStore.rows.get(row.id);
    taskWatchStore.set({ ...current, status: current.status === 'rejected' ? 'rejected' : error.taskStatus });
  }).then(() => {
    taskWatches.delete(row.id);
    lane.count--;
    if (!lane.count) {
      directLanes.delete(laneKey);
      if (lane.owns) turnQueue.finishDirect(clientId, conversationId, lane.complete);
    }
  }).catch(() => {
    // Storage faults retain the record and lane. Restart recovers without redispatch.
  });
}

const validConversationId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,100}$/u.test(value);
const validRequestId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);

async function queueRoute(req, res, pathname) {
  const clientId = getClientId(req, res);
  const match = pathname.match(/^\/api\/qa\/queue\/([a-f0-9-]{36})(\/events)?$/iu);
  if (match) {
    const job = turnQueue.get(clientId, match[1]);
    if (!job) { sendJson(res, 404, { error: '待发问题不存在' }); return; }
    if (match[2] && req.method === 'GET') { turnQueue.subscribe(clientId, match[1], res); return; }
    if (match[2]) { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    if (req.method === 'DELETE') {
      if (!job.submissionStarted && !job.taskId) {
        const receipt = submissionIntent(clientId, job, job.preview, job.id, 'cancelled');
        if (receipt.status !== 'cancelled') taskWatchStore.set({ ...receipt, status: 'cancelled' });
      }
      const result = turnQueue.remove(clientId, match[1]);
      sendJson(res, result.error ? 409 : result.cancelPending ? 202 : 200, result.error ? { error: '这条问题已开始处理，无法作为待发项删除' } : result);
      return;
    }
    if (req.method === 'PATCH') {
      let input;
      try { input = await readBody(req); validateQueuedInput(input, false); }
      catch (error) { sendJson(res, 400, { error: error.message }); return; }
      if (input.sourceIntent === 'web' && !await supportsWebIntent()) { sendJson(res, 409, { error: '当前问答服务尚未启用本轮联网请求' }); return; }
      const result = turnQueue.edit(clientId, match[1], input.question.trim(), input.sourceIntent || '');
      sendJson(res, result.error ? 409 : 200, result.error ? { error: '这条问题已经开始处理，不能再编辑' } : result);
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (pathname !== '/api/qa/queue') { sendJson(res, 404, { error: 'Not found' }); return; }
  if (req.method === 'GET') {
    const conversationId = new URL(req.url, 'http://localhost').searchParams.get('conversationId');
    if (!validConversationId(conversationId) || !nativeSessions.belongsToNative(conversationId, clientId)) {
      sendJson(res, 404, { error: '会话不存在' }); return;
    }
    sendJson(res, 200, { queue: turnQueue.list(clientId, conversationId) });
    return;
  }
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
  let input;
  try { input = await readBody(req); validateQueuedInput(input, true); }
  catch (error) { sendJson(res, 400, { error: error.message }); return; }
  if (!nativeSessions.belongsToNative(input.conversationId, clientId)) { sendJson(res, 404, { error: '会话不存在' }); return; }
  if (!await requireNativeContract(res, true)) return;
  if (input.sourceIntent === 'web' && !await supportsWebIntent()) { sendJson(res, 409, { error: '当前问答服务尚未启用本轮联网请求' }); return; }
  const visitor = previewVisitor(req);
  const repeated = turnQueue.findRequest(clientId, input.requestId);
  if (!repeated && taskWatchStore.findRequest(clientId, input.requestId)) {
    sendJson(res, 409, { error: '原请求已被接收，请查询原任务。', code: 'task_request_conflict' }); return;
  }
  if (!repeated && !taskWatchStore.hasRoom()) {
    sendJson(res, 429, { error: '任务记录已满，问题尚未接收。', code: 'task_storage_full' }); return;
  }
  if (visitor && !repeated && !previewAdmission.hasRoom(pendingPublicCount())) {
    sendJson(res, 429, { error: '公开预览待发问题已满，请稍后再试。' }); return;
  }
  if (visitor && !repeated && !previewAdmission.admit(visitor, input.requestId)) {
    sendJson(res, 429, { error: '提交过于频繁，请一分钟后再试。' }); return;
  }
  const result = turnQueue.enqueue({
    clientId, conversationId: input.conversationId, requestId: input.requestId,
    question: input.question.trim(), sourceIntent: input.sourceIntent || '', preview: Boolean(visitor),
  });
  const errors = { conflict: '此请求编号已用于另一问题，请重新提交。', paused: '上一轮未完整结束，请先处理待发问题。', full: '本会话最多排队 3 条问题。' };
  sendJson(res, result.error ? 409 : 202, result.error ? { error: errors[result.error] } : result);
}

function validateQueuedInput(input, requireIdentity) {
  if (typeof input.question !== 'string' || !input.question.trim() || input.question.length > 2000) throw new Error('Question must be 1–2000 characters');
  if (input.sourceIntent !== undefined && input.sourceIntent !== 'web') throw new Error('sourceIntent 只能是 web');
  if (requireIdentity && (!validConversationId(input.conversationId) || !validRequestId(input.requestId))) throw new Error('会话或请求编号格式不正确');
}

async function supportsWebIntent() {
  const readiness = await provider.readiness().catch(() => null);
  return readiness?.webIntentSupported === true;
}

async function dispatchQueuedTurn(job, emit, signal) {
  if (!nativeSessions.belongsToNative(job.conversationId, job.clientId)) throw new Error('conversation_not_owned');
  let row = taskWatchStore.findRequest(job.clientId, job.requestId);
  if (!job.taskId && !job.submissionStarted && !row) {
    const status = await provider.readiness().catch(() => null);
    if (!status?.authenticated || !status.durableTasksSupported) throw new Error('provider_contract_unavailable');
    if (job.sourceIntent === 'web' && !await supportsWebIntent()) throw new Error('web_intent_unavailable');
    // No asynchronous gap between this check, durable intent, and dispatch.
    signal.throwIfAborted();
    if (!taskWatchStore.hasRoom()) throw new Error('task_storage_full');
    turnQueue.markSubmitting(job);
    row = submissionIntent(job.clientId, job, job.preview, job.id);
    await postTaskOnce(row, job);
    row = taskWatchStore.rows.get(row.id);
  }
  if (row?.status === 'rejected') throw taskTerminalError('failed');
  if (!job.taskId) {
    const task = taskIdOf(row || {}) ? { id: taskIdOf(row), status: row.status }
      : await recoverSubmittedTask(provider, { clientId: job.clientId, requestKey: requestKey(job.clientId, job.requestId) });
    row ||= submissionIntent(job.clientId, job, job.preview, job.id);
    row = recordTask(row, task);
    turnQueue.attachTask(job, task.id);
    turnQueue.providerStatus(job, task.status);
  }
  if (row?.cancelRequested && !signal.aborted) turnQueue.remove(job.clientId, job.id);
  try {
    await followTask(provider, { clientId: job.clientId, taskId: job.taskId, emit, signal,
      confirmedStatus: () => row && taskWatchStore.rows.get(row.id)?.cancelRequested ? taskWatchStore.rows.get(row.id)?.status : null,
      onStatus(status) { turnQueue.providerStatus(job, status); } });
    if (row) taskWatchStore.set({ ...taskWatchStore.rows.get(row.id), status: 'succeeded' });
  } catch (error) {
    if (row && error.confirmedTerminal) taskWatchStore.set({ ...taskWatchStore.rows.get(row.id), status: error.taskStatus });
    throw error;
  }
}

async function proxy(req, res, route) {
  const presentation = new URL(req.url, 'http://localhost').searchParams.get('presentation');
  if (presentation !== null && presentation !== 'chat_v1') { sendJson(res, 400, { error: 'Invalid presentation' }); return; }
  let body;
  let requestId;
  let sourceIntent = '';
  let requestedConversationId = '';
  try {
    if (req.method === 'POST' && route === '/api/ask') {
      const input = await readBody(req);
      if (typeof input.question !== 'string' || !input.question.trim() || input.question.length > 2000) throw new Error('Question must be 1–2000 characters');
      if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(input.requestId)) throw new Error('requestId 格式不正确');
      if (input.sourceIntent !== undefined && input.sourceIntent !== 'web') throw new Error('sourceIntent 只能是 web');
      sourceIntent = input.sourceIntent || '';
      requestId = input.requestId;
      if (input.conversationId !== undefined && input.conversationId !== '' && !validConversationId(input.conversationId)) throw new Error('Invalid conversationId');
      requestedConversationId = typeof input.conversationId === 'string' && /^[a-zA-Z0-9-]+$/u.test(input.conversationId) ? input.conversationId : '';
      body = JSON.stringify({ question: input.question.trim(), ...(requestedConversationId ? { conversationId: requestedConversationId } : {}) });
    } else if (req.method === 'POST') {
      body = '{}';
    }
  } catch (error) { sendJson(res, 400, { error: error.message }); return; }

  const clientId = getClientId(req, res);
  if (req.method === 'DELETE' && route.startsWith('/api/conversations/')
      && turnQueue.hasItems(clientId, route.slice('/api/conversations/'.length))) {
    sendJson(res, 409, { error: '此会话仍在回答或有待发问题，请完成或删除后重试。' });
    return;
  }
  if (requestedConversationId && !nativeSessions.belongsToNative(requestedConversationId, clientId)) {
    sendJson(res, 409, { error: '此会话创建于旧问答模式。请新建会话后再提问；旧记录仍可查看。' });
    return;
  }
  let claim;
  let activeConversationId = '';
  let completed = false;
  let releasePreview;
  if (route === '/api/ask') {
    if (!await requireNativeContract(res)) return;
    if (sourceIntent === 'web') {
      const readiness = await provider.readiness().catch(() => null);
      if (!readiness?.webIntentSupported) {
        sendJson(res, 409, { error: '当前问答服务尚未启用本轮联网请求' });
        return;
      }
    }
    activeConversationId = requestedConversationId || '__new__';
    if (turnQueue.hasItems(clientId, activeConversationId)) {
      sendJson(res, 409, { error: '这段会话已有正在处理或待发的问题，请使用排队入口。' });
      return;
    }
    const visitor = previewVisitor(req);
    if (visitor) {
      if (!previewAdmission.hasRoom(pendingPublicCount())) {
        sendJson(res, 429, { error: '公开预览正在回答，请稍后再试。' }); return;
      }
      if (!previewAdmission.admit(visitor, requestId)) {
        releasePreview?.();
        sendJson(res, 429, { error: '提交过于频繁，请一分钟后再试。' }); return;
      }
    }
    try {
      claim = requestLedger.claim({ clientId, requestId, question: JSON.parse(body).question, conversationId: requestedConversationId, sourceIntent });
    } catch (error) {
      releasePreview?.();
      throw error;
    }
    if (!claim.accepted) {
      releasePreview?.();
      sendJson(res, 409, { error: claim.reason === 'conflict'
        ? '此请求编号已用于另一问题，请重新提交。'
        : '此请求已经提交过，请先查看会话历史；为避免重复问答，系统不会自动重发。' });
      return;
    }
    if (!turnQueue.beginDirect(clientId, activeConversationId)) {
      releasePreview?.();
      sendJson(res, 409, { error: '这段会话已有正在处理或待发的问题，请使用排队入口。' });
      return;
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 190000);
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  if (res.destroyed) controller.abort();
  try {
    const upstream = await provider.request({ route: req.method === 'GET' && presentation ? route + '?presentation=chat_v1' : route, method: req.method, clientId, body, requestId, sourceIntent, signal: controller.signal });
    const contentType = upstream.headers.get('content-type') || '';
    if (route === '/api/ask' && upstream.ok && contentType.includes('text/event-stream')) {
      const observer = createStreamObserver();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      });
      try {
        for await (const chunk of upstream.body) {
          if (res.destroyed) break;
          observer.append(chunk);
          if (!res.write(chunk)) await new Promise(resolve => {
            const settled = () => { res.off('drain', settled); res.off('close', settled); resolve(); };
            res.once('drain', settled);
            res.once('close', settled);
            if (res.destroyed) settled();
          });
        }
      } catch {
        if (!res.destroyed) res.write('event: error\ndata: {"error":"上游流式回答中断或格式异常"}\n\n');
        res.end();
        return;
      }
      const result = observer.result();
      if (result.conversationId) nativeSessions.remember(result.conversationId, clientId);
      if (!res.destroyed && !result.complete) res.write('event: error\ndata: {"error":"上游回答未完整结束"}\n\n');
      if (result.complete && result.sourceCount > 0) lastRealSuccessAt = new Date().toISOString();
      if (result.complete) requestLedger.complete(claim.key);
      completed = result.complete;
      res.end();
      return;
    }
    const data = await upstream.json().catch(() => ({ error: 'Invalid Provider A response' }));
    if (upstream.ok && route.startsWith('/api/conversations/') && req.method === 'GET') {
      data.legacyMode = !nativeSessions.belongsToNative(route.slice('/api/conversations/'.length), clientId);
    }
    if (upstream.ok && route === '/api/conversations' && req.method === 'POST' && data.conversation?.conversationId) {
      nativeSessions.remember(data.conversation.conversationId, clientId);
    }
    if (upstream.ok && route.startsWith('/api/conversations/') && req.method === 'DELETE') {
      nativeSessions.forget(route.slice('/api/conversations/'.length), clientId);
    }
    sendJson(res, upstream.status, presentation === 'chat_v1' && Array.isArray(data.messages) ? chatPresentation.projectHistory(data) : data);
  } finally {
    clearTimeout(timeout);
    controller.abort();
    if (activeConversationId) turnQueue.finishDirect(clientId, activeConversationId, completed);
    releasePreview?.();
  }
}
