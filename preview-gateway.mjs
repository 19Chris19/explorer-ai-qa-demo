import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const assets = new Set([
  '/', '/styles.css', '/chat.css', '/icons.svg', '/brand-orbit.png',
  '/questions.json', '/question-rotation.mjs', '/source-evidence.mjs',
  '/turn-lifecycle.mjs', '/prompt-sparks.mjs', '/answer-process.mjs',
  '/voice-preview.mjs', '/message-shape.mjs', '/composer-shape.mjs', '/composer-controls.mjs',
  '/answer-copy.mjs',
  '/selection-copy.mjs',
  '/task-stream.mjs',
  '/host-bridge.mjs',
  '/main-shell.css', '/site/logo.png', '/site/dm-sans-latin.woff2',
  ...['compass-3-line', 'chat-3-line', 'shapes-line', 'cpu-line', 'cloud-line', 'trophy-line', 'clapperboard-line', 'graduation-cap-line', 'information-line'].map(icon => `/site/${icon}.svg`),
  '/app.js', '/answer-markdown.js', '/vendor/marked.umd.js', '/vendor/purify.min.js',
]);

export function allowedPreviewRoute(path, method) {
  if (assets.has(path)) return method === 'GET' || method === 'HEAD';
  if (path === '/api/qa/health') return method === 'GET';
  if (path === '/api/qa/archive/conversations' || /^\/api\/qa\/archive\/conversations\/archive(?::|%3A)[a-zA-Z0-9-]{1,100}$/iu.test(path)) return method === 'GET';
  if (path === '/api/qa/conversations') return ['GET', 'POST'].includes(method);
  if (/^\/api\/qa\/conversations\/[a-zA-Z0-9-]+$/u.test(path)) return ['GET', 'DELETE'].includes(method);
  if (path === '/api/qa/ask') return method === 'POST';
  if (path === '/api/qa/tasks') return ['GET', 'POST'].includes(method);
  if (/^\/api\/qa\/tasks\/[a-zA-Z0-9-]{1,100}\/events$/u.test(path)) return method === 'GET';
  if (/^\/api\/qa\/tasks\/[a-zA-Z0-9-]{1,100}$/u.test(path)) return ['GET', 'DELETE'].includes(method);
  if (path === '/api/qa/queue') return ['GET', 'POST'].includes(method);
  if (/^\/api\/qa\/queue\/[a-f0-9-]{36}(?:\/events)?$/iu.test(path)) {
    return path.endsWith('/events') ? method === 'GET' : ['GET', 'PATCH', 'DELETE'].includes(method);
  }
  return false;
}

function equalSecret(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

async function smallBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 32 * 1024) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createPreviewGateway({ key, bffUrl, fetchImpl = fetch }) {
  if (typeof key !== 'string' || key.length < 32) throw new Error('Preview gateway requires a private 32-character key');
  const target = new URL(bffUrl);
  if (target.hostname !== '127.0.0.1' || target.protocol !== 'http:') throw new Error('Preview BFF must use loopback HTTP');
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!equalSecret(req.headers['x-preview-key'], key)) { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url || '/', 'http://preview.local');
    if (!allowedPreviewRoute(url.pathname, req.method)) { res.writeHead(404); res.end(); return; }
    const visitor = String(req.headers['x-preview-visitor'] || '');
    const publicOrigin = String(req.headers['x-preview-origin'] || '');
    if (!/^[a-f0-9]{64}$/u.test(visitor) || !/^https:\/\/[^/\s]+$/u.test(publicOrigin)
        || (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin !== publicOrigin)) {
      res.writeHead(403); res.end(); return;
    }
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await smallBody(req);
      const upstream = await fetchImpl(new URL(`${url.pathname}${url.search}`, target), {
        method: req.method,
        headers: {
          ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
          ...(req.headers.accept ? { Accept: req.headers.accept } : {}),
          ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}),
          ...(body ? { Origin: target.origin } : {}),
          'X-Explorer-Preview-Visitor': visitor,
        },
        body,
        signal: controller.signal,
        redirect: 'manual',
      });
      if (upstream.status >= 300 && upstream.status < 400) throw new Error('redirect_not_allowed');
      for (const name of ['content-type', 'content-security-policy', 'set-cookie', 'x-frame-options', 'referrer-policy', 'x-accel-buffering', 'retry-after']) {
        const value = upstream.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      res.writeHead(upstream.status);
      if (upstream.body && req.method !== 'HEAD') await pipeline(Readable.fromWeb(upstream.body), res);
      else res.end();
    } catch (error) {
      if (res.destroyed) return;
      if (!res.headersSent) {
        res.writeHead(error.message === 'body_too_large' ? 413 : 502);
        res.end();
      } else res.destroy();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const key = process.env.PREVIEW_GATEWAY_KEY || '';
  const bffUrl = process.env.PREVIEW_BFF_URL || 'http://127.0.0.1:4317';
  const port = Number(process.env.PREVIEW_GATEWAY_PORT || 4327);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid preview gateway port');
  createPreviewGateway({ key, bffUrl }).listen(port, '127.0.0.1', () => {
    console.log(`Preview gateway listening on 127.0.0.1:${port}`);
  });
}
