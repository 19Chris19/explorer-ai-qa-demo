import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('main-site embed keeps QA assets prefixed and disables the admin prototype', async () => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port;
  probe.close(); await once(probe, 'close');
  const runtime = mkdtempSync(join(tmpdir(), 'explorer-embed-test-'));
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, PORT: String(port), DEMO_RUNTIME_DIR: runtime, DEMO_ASSET_PREFIX: '/qa-app', DEMO_DISABLE_ADMIN: '1', DEMO_RELEASE_REVISION: 'synthetic-revision',
      PROVIDER_A_BASE_URL: 'http://127.0.0.1:1', PROVIDER_A_API_TOKEN: 'synthetic-api', PROVIDER_A_INTERNAL_SERVICE_TOKEN: 'synthetic-service',
      PROVIDER_A_KNOWLEDGE_SCOPE_REF: '0'.repeat(64), DEMO_COOKIE_SECRET: 'synthetic-cookie' },
    stdio: 'ignore',
  });
  try {
    let page;
    for (let n = 0; n < 50; n += 1) {
      try { page = await fetch(`http://127.0.0.1:${port}/?embed=1`); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    assert.equal(page?.status, 200);
    const html = await page.text();
    assert.match(html, /class="app-page qa-embedded"/u);
    assert.match(html, /src="\/qa-app\/app.js"/u);
    assert.match(html, /name="qa-asset-prefix" content="\/qa-app"/u);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self'/u);
    const prefixed = await fetch(`http://127.0.0.1:${port}/qa-app/?embed=1`);
    assert.equal(prefixed.status, 200);
    assert.match(await prefixed.text(), /qa-embedded/u);
    assert.equal((await fetch(`http://127.0.0.1:${port}/qa-app/host-bridge.mjs`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/qa-app/api/qa/health`)).status, 503);
    assert.equal((await fetch(`http://127.0.0.1:${port}/qa-app/admin`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/qa-app/internal/capacity`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/admin`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/admin.js`)).status, 404);
    const standalone = await fetch(`http://127.0.0.1:${port}/`);
    assert.match(standalone.headers.get('content-security-policy'), /frame-ancestors 'none'/u);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
    rmSync(runtime, { recursive: true, force: true });
  }
});
