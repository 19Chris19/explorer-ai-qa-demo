import test from 'node:test';
import assert from 'node:assert/strict';
import { composerControlState, providerAccessState } from '../public/composer-controls.mjs';

test('one control handles empty, send, stop, queue and in-flight submissions', () => {
  assert.deepEqual(composerControlState({ draft: '' }), { action: 'sendQuestion', stopping: false, disabled: true });
  assert.equal(composerControlState({ draft: ' question ' }).disabled, false);
  assert.deepEqual(composerControlState({ busy: true, draft: '' }), { action: 'stopAnswer', stopping: true, disabled: false });
  assert.deepEqual(composerControlState({ busy: true, draft: 'next' }), { action: 'enqueueQuestion', stopping: false, disabled: false });
  for (const flag of ['preparing', 'queueSubmitting']) assert.equal(composerControlState({ draft: 'next', [flag]: true }).disabled, true);
  assert.equal(composerControlState({ busy: true, access: 'offline', draft: '' }).disabled, false);
  assert.equal(composerControlState({ access: 'incompatible', draft: 'keep me' }).disabled, true);
});

test('health is readiness evidence, not proof of real answering; busy accounts still permit queueing', () => {
  assert.equal(providerAccessState(false, {}), 'offline');
  assert.equal(providerAccessState(true, { connected: true, authenticated: false }), 'noCredentials');
  assert.equal(providerAccessState(true, { connected: true, authenticated: true, contractSupported: false }), 'incompatible');
  assert.equal(providerAccessState(true, { connected: true, authenticated: true, contractSupported: true, ready: false }), 'noCapacity');
  assert.equal(providerAccessState(true, { connected: true, authenticated: true, contractSupported: true, ready: true, active: 1, capacity: 1 }), 'ready');
});
