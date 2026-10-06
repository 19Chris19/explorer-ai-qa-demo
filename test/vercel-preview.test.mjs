import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../preview/api/proxy.mjs';
import { readFileSync } from 'node:fs';
import { allowedPreviewRoute } from '../preview-gateway.mjs';

test('every application module is accessible through both public allowlists, read-only', async () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const modules = [...app.matchAll(/from\s+['"]\.\/([^'"]+)['"]/gu)].map((match) => match[1]);
  assert.ok(modules.length >= 9, 'exercise the real entry point dependencies');
  const shellCss = readFileSync(new URL('../public/main-shell.css', import.meta.url), 'utf8');
  modules.push('main-shell.css', 'site/logo.png', ...[...shellCss.matchAll(/url\("\.\/([^"\s]+)"\)/gu)].map(match => match[1]));
  const previousKey = process.env.PREVIEW_ORIGIN_KEY;
  const previousUrl = process.env.PREVIEW_ORIGIN_URL;
  const previousFetch = globalThis.fetch;
  process.env.PREVIEW_ORIGIN_KEY = 'synthetic-preview-key-12345678901234567890';
  process.env.PREVIEW_ORIGIN_URL = 'https://synthetic.ngrok.app/';
  globalThis.fetch = async () => new Response('synthetic module');
  try {
    for (const module of modules) {
      for (const method of ['GET', 'HEAD']) {
        assert.equal(allowedPreviewRoute(`/${module}`, method), true, `${method} gateway ${module}`);
        const response = await handler.fetch(new Request(`https://synthetic.vercel.app/api/proxy?path=${module}`, { method }));
        assert.equal(response.status, 200, `${method} Vercel ${module}`);
      }
      assert.equal(allowedPreviewRoute(`/${module}`, 'POST'), false);
      assert.equal((await handler.fetch(new Request(`https://synthetic.vercel.app/api/proxy?path=${module}`, { method: 'POST' }))).status, 404);
    }
    for (const path of ['internal/provider-a/capacity', 'admin.js', 'not-a-module.mjs', 'site/unknown.svg', 'site/runtime.json']) {
      assert.equal((await handler.fetch(new Request(`https://synthetic.vercel.app/api/proxy?path=${path}`))).status, 404);
    }
    for (const path of ['api/qa/archive/conversations', 'api/qa/archive/conversations/archive:synthetic', 'api/qa/archive/conversations/archive%3Asynthetic']) {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
        assert.equal(allowedPreviewRoute(`/${path}`, method), method === 'GET');
        assert.equal((await handler.fetch(new Request(`https://synthetic.vercel.app/api/proxy?path=${encodeURIComponent(path)}`, { method }))).status, method === 'GET' ? 200 : 404);
      }
    }
    for (const path of ['api/qa/archive/admin', 'api/qa/archive/conversations/native-id', 'api/qa/archive/conversations/archive:synthetic/extra']) {
      assert.equal(allowedPreviewRoute(`/${path}`, 'GET'), false);
      assert.equal((await handler.fetch(new Request(`https://synthetic.vercel.app/api/proxy?path=${encodeURIComponent(path)}`))).status, 404);
    }
  } finally {
    if (previousKey === undefined) delete process.env.PREVIEW_ORIGIN_KEY; else process.env.PREVIEW_ORIGIN_KEY = previousKey;
    if (previousUrl === undefined) delete process.env.PREVIEW_ORIGIN_URL; else process.env.PREVIEW_ORIGIN_URL = previousUrl;
    globalThis.fetch = previousFetch;
  }
});

test('Vercel preview function forwards only to configured HTTPS gateway and streams without caching', async () => {
  const previousKey = process.env.PREVIEW_ORIGIN_KEY;
  const previousUrl = process.env.PREVIEW_ORIGIN_URL;
  const previousFetch = globalThis.fetch;
  process.env.PREVIEW_ORIGIN_KEY = 'synthetic-preview-key-12345678901234567890';
  process.env.PREVIEW_ORIGIN_URL = 'https://synthetic.ngrok.app/';
  let seen;
  globalThis.fetch = async (target, options) => {
    seen = { target: String(target), headers: options.headers, redirect: options.redirect };
    return new Response('event: done\ndata: {}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    const request = new Request('https://synthetic.vercel.app/api/proxy?path=api/qa/ask', {
      method: 'POST', headers: { Origin: 'https://synthetic.vercel.app', 'Content-Type': 'application/json', 'X-Preview-Key': 'forged' }, body: '{}',
    });
    const response = await handler.fetch(request);
    assert.equal(response.status, 200);
    assert.equal(seen.target, 'https://synthetic.ngrok.app/api/qa/ask');
    assert.equal(seen.headers.get('x-preview-key'), process.env.PREVIEW_ORIGIN_KEY);
    assert.equal(seen.redirect, 'manual');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /event: done/u);
    assert.equal((await handler.fetch(new Request('https://synthetic.vercel.app/api/proxy?path=admin'))).status, 404);
    assert.equal((await handler.fetch(new Request('https://synthetic.vercel.app/api/proxy?path=../admin'))).status, 404);
    assert.equal((await handler.fetch(new Request('https://synthetic.vercel.app/api/proxy?path=api/qa/ask', { method: 'POST', body: '{}' }))).status, 403);
  } finally {
    if (previousKey === undefined) delete process.env.PREVIEW_ORIGIN_KEY; else process.env.PREVIEW_ORIGIN_KEY = previousKey;
    if (previousUrl === undefined) delete process.env.PREVIEW_ORIGIN_URL; else process.env.PREVIEW_ORIGIN_URL = previousUrl;
    globalThis.fetch = previousFetch;
  }
});
