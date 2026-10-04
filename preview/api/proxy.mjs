import { createHmac } from 'node:crypto';

export const maxDuration = 300;

const assets = new Set(['', 'styles.css', 'chat.css', 'icons.svg', 'brand-orbit.png', 'questions.json',
  'question-rotation.mjs', 'source-evidence.mjs', 'app.js', 'answer-markdown.js', 'message-shape.mjs',
  'turn-lifecycle.mjs', 'prompt-sparks.mjs', 'answer-process.mjs', 'voice-preview.mjs',
  'composer-shape.mjs', 'composer-controls.mjs',
  'answer-copy.mjs',
  'selection-copy.mjs',
  'main-shell.css', 'site/logo.png', 'site/dm-sans-latin.woff2',
  ...['compass-3-line', 'chat-3-line', 'shapes-line', 'cpu-line', 'cloud-line', 'trophy-line', 'clapperboard-line', 'graduation-cap-line', 'information-line'].map(icon => `site/${icon}.svg`),
  'vendor/marked.umd.js', 'vendor/purify.min.js']);

function allowed(path, method) {
  if (assets.has(path)) return ['GET', 'HEAD'].includes(method);
  if (path === 'api/qa/health') return method === 'GET';
  if (path === 'api/qa/conversations') return ['GET', 'POST'].includes(method);
  if (/^api\/qa\/conversations\/[a-zA-Z0-9-]+$/u.test(path)) return ['GET', 'DELETE'].includes(method);
  if (path === 'api/qa/ask') return method === 'POST';
  if (path === 'api/qa/queue') return ['GET', 'POST'].includes(method);
  if (/^api\/qa\/queue\/[a-f0-9-]{36}\/events$/iu.test(path)) return method === 'GET';
  if (/^api\/qa\/queue\/[a-f0-9-]{36}$/iu.test(path)) return ['GET', 'PATCH', 'DELETE'].includes(method);
  return false;
}

export async function proxy(request) {
  const key = process.env.PREVIEW_ORIGIN_KEY || '';
  const rawOrigin = process.env.PREVIEW_ORIGIN_URL || '';
  if (key.length < 32) return new Response('Preview unavailable', { status: 503 });
  let origin;
  try { origin = new URL(rawOrigin); }
  catch { return new Response('Preview unavailable', { status: 503 }); }
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) {
    return new Response('Preview unavailable', { status: 503 });
  }
  const incoming = new URL(request.url);
  const path = incoming.searchParams.get('path');
  if (path === null || path.startsWith('/') || path.includes('\\') || path.includes('..') || !allowed(path, request.method)) {
    return new Response('Not found', { status: 404 });
  }
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== incoming.origin) {
    return new Response('Invalid request origin', { status: 403 });
  }
  incoming.searchParams.delete('path');
  const target = new URL(`/${path}${incoming.search}`, origin);
  const ip = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown';
  const visitor = createHmac('sha256', key).update(ip.split(',').at(-1).trim()).digest('hex');
  const headers = new Headers({
    'X-Preview-Key': key,
    'X-Preview-Visitor': visitor,
    'X-Preview-Origin': incoming.origin,
  });
  for (const name of ['cookie', 'accept', 'content-type', 'origin']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(target, {
      method: request.method, headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      ...(request.body ? { duplex: 'half' } : {}),
      signal: request.signal,
      redirect: 'manual',
      cache: 'no-store',
    });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
    for (const name of ['content-type', 'content-security-policy', 'set-cookie', 'x-frame-options', 'referrer-policy', 'x-accel-buffering']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return new Response('Air preview is temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export default { fetch: proxy };
