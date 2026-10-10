import test from 'node:test';
import assert from 'node:assert/strict';
import { proxy } from '../preview/api/proxy.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('browser error display never echoes raw upstream or tool messages', () => {
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const helper = source.slice(source.indexOf('function userError('), source.indexOf('function status('));
  for (const locale of ['zh', 'en']) {
    const context = vm.createContext({ ui: { locale } });
    vm.runInContext(helper, context);
    for (const status of [undefined, 400, 404, 409, 429, 500]) {
      const result = context.userError({ status, message: 'ERR_NGROK_3200 synthetic-private-token' });
      assert.doesNotMatch(result, /NGROK|private-token/);
      assert.ok(result.length > 10);
    }
  }
  assert.doesNotMatch(source, /status\(error\.message|\$\{error\.message\}/);
});

test('preview contains vendor errors and never repeats requests', async () => {
  const saved = { fetch: globalThis.fetch, key: process.env.PREVIEW_ORIGIN_KEY, url: process.env.PREVIEW_ORIGIN_URL };
  process.env.PREVIEW_ORIGIN_KEY = 'synthetic-key-123456789012345678901234';
  process.env.PREVIEW_ORIGIN_URL = 'https://synthetic.example/';
  const request = (path, method = 'GET') => new Request(`https://website.example/api/proxy?path=${path}`, {
    method, headers: { origin: 'https://website.example' }, ...(method === 'POST' ? { body: '{}' } : {}),
  });
  try {
    for (const status of [301, 400, 401, 403, 404, 409, 429, 500, 502, 503, 504]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response('ERR_NGROK_3200 synthetic-private-host internal failure', {
        status, headers: { 'Content-Type': 'text/html', 'Retry-After': '30', Location: 'https://synthetic-private-host/' },
      }); };
      for (const [path, method] of [['', 'GET'], ['api/qa/ask', 'POST']]) {
        const before = calls;
        const res = await proxy(request(path, method));
        const body = await res.text();
        assert.equal(calls, before + 1);
        assert.doesNotMatch(body, /NGROK|private-host|internal failure/);
        assert.equal(res.headers.get('location'), null);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.match(res.headers.get('content-type'), path ? /application\/json/ : /text\/html/);
      }
    }
    globalThis.fetch = async () => { throw Error('synthetic secret network detail'); };
    assert.match(await (await proxy(request(''))).text(), /服务暂时连接不上/);
    globalThis.fetch = async () => new Response('<html>vendor error</html>', { headers: { 'Content-Type': 'text/html' } });
    assert.equal((await proxy(request('app.js'))).status, 503);
    assert.equal((await proxy(request('api/qa/health'))).status, 503);
    globalThis.fetch = async () => new Response('vendor error', { headers: { 'Content-Type': 'text/html', 'ngrok-error-code': 'ERR_NGROK_3200' } });
    assert.equal((await proxy(request(''))).status, 503);
    assert.equal(await (await proxy(request('', 'HEAD'))).text(), '');
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [key, value] of [['PREVIEW_ORIGIN_KEY', saved.key], ['PREVIEW_ORIGIN_URL', saved.url]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
