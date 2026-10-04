import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAClient } from '../provider-a-client.mjs';

test('server configuration accepts only loopback or the explicit Compose service', () => {
  for (const baseUrl of ['http://127.0.0.1:3117', 'http://provider-a:3000']) {
    assert.doesNotThrow(() => createProviderAClient({ baseUrl }));
  }
  for (const baseUrl of ['http://provider-a:3001', 'http://provider-a:3000/evil', 'http://provider-a:3000@evil.test', 'http://evil.test:3000', 'https://provider-a:3000', 'http://127.0.0.1:99999', 'http://user:pass@provider-a:3000']) {
    assert.throws(() => createProviderAClient({ baseUrl }));
  }
});
