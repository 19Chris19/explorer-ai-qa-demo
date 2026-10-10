import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAClient } from '../provider-a-client.mjs';
import { providerAccessState } from '../public/composer-controls.mjs';

const features = { knowledge_agent_keyed_sse_v1: true, durable_qa_tasks_v1: true, source_intent_web_requested_v1: true };
const native = { schemaVersion: 1, mode: 'knowledge_agent', features, policies: { knowledge_agent: { max_concurrent: 2 } }, active: 1, queued: 3 };
const bot = { ...native, policies: { knowledge_agent: { max_concurrent: 9 } }, active: 8, queued: 7 };
const readiness = payload => createProviderAClient({
  baseUrl: 'http://127.0.0.1:3117', apiToken: 'synthetic-api', serviceToken: 'synthetic-service', knowledgeScopeRef: 'a'.repeat(64),
  fetchImpl: async url => new Response(JSON.stringify(url.endsWith('/capacity') ? payload : { queue: { activeRequests: 6, queuedRequests: 5 } })),
}).readiness();

test('native website empty pool stays connected and compatible without borrowing bot capacity', async () => {
  const result = await readiness({ ...bot, website: { ...native, policies: { knowledge_agent: { max_concurrent: 0 } }, active: 0, queued: 0 } });
  assert.equal(result.connected, true);
  assert.equal(result.authenticated, true);
  assert.equal(result.contractSupported, true);
  assert.equal(result.durableTasksSupported, true);
  assert.equal(result.capacity, 0);
  assert.equal(result.ready, false);
  assert.equal(result.active, 0);
  assert.equal(result.queued, 0);
  assert.equal(providerAccessState(true, result), 'noCapacity');
});

test('classic website with native bot is incompatible even with stale native website feature flags', async () => {
  for (const websiteFeatures of [features, { ...features, knowledge_agent_keyed_sse_v1: false }]) {
    const result = await readiness({ ...bot, website: { ...native, mode: 'classic', features: websiteFeatures } });
    assert.equal(result.connected, true);
    assert.equal(result.authenticated, true);
    assert.equal(result.contractSupported, false);
    assert.equal(result.durableTasksSupported, false);
    assert.equal(result.webIntentSupported, false);
    assert.equal(result.ready, false);
    assert.equal(providerAccessState(true, result), 'incompatible');
  }
});

test('nested native readiness uses its own schema, features, capacity and queue facts', async () => {
  const result = await readiness({ schemaVersion: 99, features: {}, website: { ...native, features: { ...features, source_intent_web_requested_v1: false } } });
  assert.equal(result.contractSupported, true);
  assert.equal(result.durableTasksSupported, true);
  assert.equal(result.ready, true);
  assert.equal(result.capacity, 2);
  assert.equal(result.active, 1);
  assert.equal(result.queued, 3);
  assert.equal(result.webIntentSupported, false);
});

test('invalid nested website contract never falls back to the native bot contract', async () => {
  for (const website of [null, [], 'invalid', {}, { ...native, schemaVersion: 2 }, { ...native, mode: undefined },
    { ...native, features: {} }, { ...native, features: { ...features, knowledge_agent_keyed_sse_v1: 'true' } }]) {
    const result = await readiness({ ...bot, website });
    assert.equal(result.contractSupported, false);
    assert.equal(result.ready, false);
    assert.equal(providerAccessState(true, result), 'incompatible');
  }
  for (const website of [{ ...native, features: { ...features, durable_qa_tasks_v1: false } }, { ...native, policies: {} }]) {
    assert.equal((await readiness({ ...bot, website })).ready, false);
  }
  const noCounters = await readiness({ ...bot, website: { ...native, active: undefined, queued: undefined } });
  assert.equal(noCounters.active, 0);
  assert.equal(noCounters.queued, 0);
});

for (const policy of [{ policies: { knowledge_agent: { max_concurrent: 2 } } }, { policy_capacity: { knowledge_agent: 2 } }]) {
  test(`legacy generic ${Object.keys(policy)[0]} remains supported without website or mode`, async () => {
    const result = await readiness({ schemaVersion: 1, features, ...policy, active: 1, queued: 3 });
    assert.equal(result.contractSupported, true);
    assert.equal(result.durableTasksSupported, true);
    assert.equal(result.webIntentSupported, true);
    assert.equal(result.ready, true);
    assert.equal(result.capacity, 2);
    assert.equal(result.active, 1);
    assert.equal(result.queued, 3);
  });
}
