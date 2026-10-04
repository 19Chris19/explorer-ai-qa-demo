import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentPaths, routePath, storageNamespace } from '../deployment-paths.mjs';
import { createHostBridge, embedUrl } from '../public/host-bridge.mjs';

test('module paths and cookie namespaces are validated, preserving the legacy root', () => {
  const root = deploymentPaths({});
  assert.equal(root.prefix, '');
  assert.equal(root.cookieName, 'qa_demo_client_v2');
  assert.equal(root.cookiePath, '/');
  assert.equal(storageNamespace(root), '');
  const testSite = deploymentPaths({ DEMO_ASSET_PREFIX: '/test/qa-app/', DEMO_COOKIE_NAME: 'qa_test' });
  assert.equal(testSite.prefix, '/test/qa-app');
  assert.equal(testSite.cookiePath, '/test/qa-app/');
  assert.notEqual(storageNamespace(testSite), '');
  for (const value of ['//evil.test', '/qa-app/../admin', '/qa-app?x=1', '/a%2fb', '/a; Secure']) {
    assert.throws(() => deploymentPaths({ DEMO_ASSET_PREFIX: value }));
  }
  assert.throws(() => deploymentPaths({ DEMO_COOKIE_NAME: 'a; Path=/' }));
  assert.throws(() => deploymentPaths({ DEMO_COOKIE_PATH: '/x; Secure' }));
  assert.equal(routePath('/test/qa-app/api/qa/health', testSite.prefix), '/api/qa/health');
  assert.equal(routePath('/api/qa/health', testSite.prefix), '/api/qa/health');
  assert.equal(routePath('/test/qa-appish/admin', testSite.prefix), '/test/qa-appish/admin');
});

test('embed URLs cannot move the module to another origin or inject queries', () => {
  assert.equal(embedUrl('/'), '/?embed=1');
  assert.equal(embedUrl('/qa-app/'), '/qa-app/?embed=1');
  assert.equal(embedUrl('/test/qa-app'), '/test/qa-app/?embed=1');
  for (const path of ['https://evil.test/', '//evil.test/', '/qa-app?x=1', '/qa-app/../admin']) {
    assert.throws(() => embedUrl(path));
  }
});

test('bridge requires the real same-origin parent, validates preferences and announces readiness', () => {
  const origin = 'https://synthetic.test';
  const sent = [], commands = [], preferences = [];
  const parent = { postMessage: (data, target) => sent.push({ data, target }) };
  let listener;
  const window = { parent, location: { origin },
    addEventListener: (type, handler) => { assert.equal(type, 'message'); listener = handler; },
    removeEventListener: () => { listener = null; } };
  const bridge = createHostBridge(window, { onCommand: command => commands.push(command),
    onPreferences: value => preferences.push(value) });
  bridge.ready();
  assert.equal(sent[0].data.type, 'explorer-qa:ready');
  assert.equal(sent[0].data.version, 1);
  assert.equal(sent[0].target, origin);
  const emit = (data, source = parent, from = origin) => listener({ data, source, origin: from });
  emit({ type: 'explorer-qa:new', version: 1 }, {}, origin);
  emit({ type: 'explorer-qa:new', version: 1 }, parent, 'https://evil.test');
  emit({ type: 'explorer-qa:new', version: 9 });
  emit({ type: 'toString', version: 1 });
  emit({ type: 'explorer-qa:preferences', version: 1, locale: 'xx', dark: 'yes' });
  assert.equal(commands.length, 0);
  assert.equal(preferences.length, 0);
  emit({ type: 'explorer-qa:new', version: 1 });
  emit({ type: 'explorer-qa:history' });
  assert.deepEqual(commands, ['new', 'history']);
  emit({ type: 'explorer-qa:preferences', version: 1, locale: 'en', dark: true, color: 'teal' });
  assert.deepEqual(preferences, [{ locale: 'en', dark: true, color: 'teal' }]);
  emit({ type: 'explorer-qa:hello', version: 1 });
  assert.equal(sent.length, 2);
  bridge.returnFocus();
  assert.deepEqual(sent[2], { data: { type: 'explorer-qa:focus-return', control: 'more', version: 1 }, target: origin });
  bridge.dispose();
  assert.equal(listener, null);
});

test('a directly opened embed entry never posts preferences back to itself', () => {
  const window = { location: { origin: 'https://synthetic.test' } };
  window.parent = window;
  const bridge = createHostBridge(window, { onCommand: () => assert.fail(), onPreferences: () => assert.fail() });
  bridge.ready();
  bridge.preferences({ locale: 'zh', dark: false, color: 'blue' });
  bridge.dispose();
});
