import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProviderAClient, createStreamObserver } from './provider-a-client.mjs';
import { SessionModeStore } from './session-mode-store.mjs';
import { RequestLedger } from './request-ledger.mjs';
import { ConversationTurnQueue } from './conversation-turn-queue.mjs';
import { PreviewAdmission } from './preview-admission.mjs';
import { deploymentPaths, routePath, storageNamespace } from './deployment-paths.mjs';

const root = dirname(fileURLToPath(import.meta.url));
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
const provider = createProviderAClient({ baseUrl: providerBaseUrl, apiToken: providerApiToken, serviceToken: providerServiceToken, knowledgeScopeRef });
const runtimeDir = process.env.DEMO_RUNTIME_DIR || join(root, 'runtime');
const nativeSessions = new SessionModeStore(join(runtimeDir, 'native-sessions.json'));
const requestLedger = new RequestLedger(join(runtimeDir, 'request-ledger.json'));
const turnQueue = new ConversationTurnQueue(join(runtimeDir, 'queued-turns.json'), dispatchQueuedTurn);
const previewAdmission = new PreviewAdmission();
let lastRealSuccessAt = '';
const staticFiles = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/admin', ['public/admin.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/chat.css', ['public/chat.css', 'text/css; charset=utf-8']],
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
  ['/answer-markdown.js', ['public/answer-markdown.js', 'text/javascript; charset=utf-8']],
  ['/vendor/marked.umd.js', ['public/vendor/marked.umd.js', 'text/javascript; charset=utf-8']],
  ['/vendor/purify.min.js', ['public/vendor/purify.min.js', 'text/javascript; charset=utf-8']],
  ['/admin.js', ['public/admin.js', 'text/javascript; charset=utf-8']],
]);

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
if (!['127.0.0.1', '0.0.0.0'].includes(listenHost)) throw new Error('Invalid DEMO_LISTEN_HOST');

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = routePath(url.pathname, assetPrefix);
    const embedded = pathname === '/' && url.searchParams.get('embed') === '1';
    setSecurityHeaders(res, embedded);
    if (disableAdmin && ['/admin', '/admin.js'].includes(pathname)) { sendJson(res, 404, { error: 'Not found' }); return; }
    if (req.method === 'GET' && staticFiles.has(pathname)) {
      const [file, type] = staticFiles.get(pathname);
      res.writeHead(200, { 'Content-Type': type });
      if (pathname === '/') {
        let html = readFileSync(join(root, file), 'utf8');
        if (disableAdmin) html = html.replace(/<a class="admin-link"[^>]*>.*?<\/a>/su, '');
        if (embedded) html = html.replace('class="app-page"', 'class="app-page qa-embedded"');
        if (assetPrefix) html = html.replaceAll('href="/', `href="${assetPrefix}/`).replaceAll('src="/', `src="${assetPrefix}/`);
        res.end(html.replace('name="qa-asset-prefix" content=""', `name="qa-asset-prefix" content="${assetPrefix}"`)
          .replace('name="qa-storage-namespace" content=""', `name="qa-storage-namespace" content="${storageNamespace(paths)}"`));
      } else res.end(readFileSync(join(root, file)));
      return;
    }
    if (pathname === '/api/qa/health' && req.method === 'GET') {
      await health(res);
      return;
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
  }
});

server.listen(port, listenHost, () => {
  console.log(`QA demo listening on ${listenHost}:${port}`);
  if (provider.configured) {
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
  res.setHeader('Content-Security-Policy', `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors ${embedded ? "'self'" : "'none'"}; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'`);
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
  let content = '';
  for await (const chunk of req) {
    content += chunk.toString('utf8');
    if (content.length > 16384) throw new Error('Request too large');
  }
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

async function requireNativeContract(res) {
  const status = await provider.readiness().catch(() => null);
  if (!status?.connected) {
    sendJson(res, 503, { error: 'Provider A 服务暂不可用', code: 'provider_unavailable' });
    return false;
  }
  if (!status.authenticated) {
    sendJson(res, 503, { error: 'Provider A 接入凭证不可用', code: 'provider_auth_unavailable' });
    return false;
  }
  if (!status.contractSupported) {
    sendJson(res, 409, { error: '当前 Provider A 版本与网站问答协议不兼容', code: 'provider_contract_incompatible' });
    return false;
  }
  return true;
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
      const result = turnQueue.remove(clientId, match[1]);
      sendJson(res, result.error ? 409 : 200, result.error ? { error: '这条问题已开始处理，无法作为待发项删除' } : result);
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
  if (!await requireNativeContract(res)) return;
  if (input.sourceIntent === 'web' && !await supportsWebIntent()) { sendJson(res, 409, { error: '当前问答服务尚未启用本轮联网请求' }); return; }
  const visitor = previewVisitor(req);
  if (visitor && !previewAdmission.hasRoom(turnQueue.previewPendingCount())) {
    sendJson(res, 429, { error: '公开预览待发问题已满，请稍后再试。' }); return;
  }
  if (visitor && !previewAdmission.admit(visitor, input.requestId)) {
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
  const status = await provider.readiness().catch(() => null);
  if (!status?.authenticated || !status.contractSupported) throw new Error('provider_contract_unavailable');
  if (job.sourceIntent === 'web' && !await supportsWebIntent()) throw new Error('web_intent_unavailable');
  const claim = requestLedger.claim(job);
  if (!claim.accepted) throw new Error('request_already_dispatched');
  const timeout = setTimeout(() => job.controller?.abort(), 190000);
  let releasePreview;
  try {
    if (job.preview) releasePreview = await previewAdmission.enter(signal);
    const upstream = await provider.request({
      route: '/api/ask', method: 'POST', clientId: job.clientId, requestId: job.requestId,
      body: JSON.stringify({ question: job.question, conversationId: job.conversationId }),
      sourceIntent: job.sourceIntent, signal,
    });
    if (!upstream.ok || !upstream.headers.get('content-type')?.includes('text/event-stream')) throw new Error('invalid_upstream_response');
    const observer = createStreamObserver();
    for await (const chunk of upstream.body) {
      if (signal.aborted) throw new Error('cancelled');
      observer.append(chunk);
      emit(chunk);
    }
    const result = observer.result();
    if (!result.complete || result.conversationId !== job.conversationId || signal.aborted) throw new Error('incomplete_queued_answer');
    nativeSessions.remember(result.conversationId, job.clientId);
    if (result.sourceCount > 0) lastRealSuccessAt = new Date().toISOString();
    requestLedger.complete(claim.key);
  } finally { clearTimeout(timeout); releasePreview?.(); }
}

async function proxy(req, res, route) {
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
      if (!previewAdmission.hasRoom(turnQueue.previewPendingCount()) || !(releasePreview = previewAdmission.tryEnter())) {
        sendJson(res, 429, { error: '公开预览正在回答，请稍后再试。' }); return;
      }
      if (!previewAdmission.admit(visitor, requestId)) {
        releasePreview();
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
  try {
    const upstream = await provider.request({ route, method: req.method, clientId, body, requestId, sourceIntent, signal: controller.signal });
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
          if (!res.write(chunk)) await new Promise(resolve => res.once('drain', resolve));
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
    sendJson(res, upstream.status, data);
  } finally {
    clearTimeout(timeout);
    controller.abort();
    if (activeConversationId) turnQueue.finishDirect(clientId, activeConversationId, completed);
    releasePreview?.();
  }
}
