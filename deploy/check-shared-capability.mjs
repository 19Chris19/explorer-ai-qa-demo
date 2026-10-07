import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Offline behavior probe, not a trust/signature check. Never pass real credentials.
export async function checkSharedCapability(root) {
  const { createProviderAClient } = await import(pathToFileURL(join(root, 'provider-a-client.mjs')));
  let calls = 0;
  const client = createProviderAClient({ mode: 'shared', gatewayUrl: 'https://synthetic.tailnet.ts.net',
    'gatewayToken': 'synthetic-placeholder-site-token-32', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://synthetic.tailnet.ts.net/v1/capabilities');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-placeholder-site-token-32');
      calls++;
      return { ok: true, json: async () => ({ schemaVersion: 1, authenticated: true,
        connected: true, ready: true, capacity: 1, features: { knowledge_agent_keyed_sse_v1: true } }) };
    } });
  assert.equal((await client.readiness()).ready, true);
  assert.equal(calls, 1);
  const server = readFileSync(join(root, 'server.mjs'), 'utf8');
  for (const key of ['PROVIDER_A_MODE', 'PROVIDER_A_GATEWAY_URL', 'PROVIDER_A_GATEWAY_TOKEN', 'DEMO_COOKIE_SECRET']) assert.ok(server.includes(key));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  checkSharedCapability(resolve(process.argv[2] || '.')).catch(() => {
    console.error(JSON.stringify({ stage: 'blocked', code: 'shared_adapter_capability_missing',
      next: 'Build the reviewed integrated source; original v0.2.1 images are not shared-capable.' }));
    process.exitCode = 1;
  });
}
