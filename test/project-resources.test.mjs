import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { onboard } from '../deploy/onboard.mjs';
import { assertFreshProject } from '../deploy/project-resources.mjs';

const scenarios = ['volume-label', 'network-label', 'volume-name', 'volume-queue-name', 'network-name', 'query-error'];
function resourceReply(args, scenario) {
  if (args[0] === 'ps' || args[0] === 'info') return '';
  if (!['volume', 'network'].includes(args[0])) throw Error('unexpected_mutation');
  if (scenario === 'query-error') throw Error('synthetic_inventory_failure');
  if (args.includes('--filter')) return scenario === `${args[0]}-label` ? 'synthetic-resource' : '';
  if (scenario === 'volume-name' && args[0] === 'volume') return 'synthetic-lock_provider-state';
  if (scenario === 'volume-queue-name' && args[0] === 'volume') return 'synthetic-lock_explorer-state';
  if (scenario === 'network-name' && args[0] === 'network') return 'synthetic-lock_backend';
  return 'unrelated-resource';
}

test('fresh-project guard permits unrelated resources and fails closed on every inventory error', async () => {
  const calls = [];
  await assertFreshProject('synthetic-lock', async args => {
    calls.push(args);
    return args.includes('--format') ? 'other_provider-state\nsynthetic-lock_backend-extra' : '';
  });
  assert.equal(calls.length, 5);
  for (let failed = 0; failed < calls.length; failed++) {
    let count = 0;
    await assert.rejects(assertFreshProject('synthetic-lock', async () => {
      if (count++ === failed) throw Error('inventory_failed');
      return '';
    }), /inventory_failed/);
    assert.equal(count, failed + 1);
  }
  await assert.rejects(assertFreshProject('synthetic-lock', async () => 'existing-container'), /existing_compose_project_protected/);
  await assert.rejects(assertFreshProject('invalid/project', async () => assert.fail('invalid name must not query Docker')), /invalid_compose_project/);
});

for (const scenario of scenarios) test(`onboard init rejects orphan resource inventory: ${scenario}`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'website-resource-'));
  try {
    await assert.rejects(onboard(root, 'init', ['--project', 'synthetic-lock', '--mode', 'server'], {
      env: { PROVIDER_IMAGE: 'synthetic/provider:reviewed', EXPLORER_IMAGE: 'synthetic/website:reviewed' },
      tools: { guided: async () => {}, resolveGuidedTarget: async () => assert.fail('must not resolve target') },
      docker: async args => resourceReply(args, scenario),
      freePort: async () => {}, emit: () => {},
    }), scenario === 'query-error' ? /synthetic_inventory_failure/ : /existing_compose_project_protected/);
    assert.equal(existsSync(join(root, '.docker-lab')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const entry of ['shell', 'legacy-node']) for (const scenario of scenarios) {
  test(`${entry} init rejects ${scenario} before creating configuration or running images`, () => {
    const root = mkdtempSync(join(tmpdir(), 'website-resource-entry-'));
    try {
      for (const directory of ['deploy', 'scripts', 'bin', 'provider']) mkdirSync(join(root, directory));
      for (const file of ['deploy.sh', 'deploy/bundle.sh', 'deploy/bundle.env', 'scripts/docker-start.mjs']) copyFileSync(new URL(`../${file}`, import.meta.url), join(root, file));
      const guard = new URL('../deploy/project-resources.mjs', import.meta.url);
      if (existsSync(guard)) copyFileSync(guard, join(root, 'deploy/project-resources.mjs'));
      writeFileSync(join(root, 'provider/package.json'), '{"name":"ima-qa-web"}');
      writeFileSync(join(root, 'provider/Dockerfile'), '# synthetic fixture');
      writeFileSync(join(root, 'bin/git'), `#!/bin/sh\ncase "$1" in status) exit 0 ;; *) printf '%s\\n' '${'a'.repeat(40)}' ;; esac\n`, { mode: 0o755 });
      writeFileSync(join(root, 'bin/docker'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
try { console.log((${resourceReply.toString()})(args, ${JSON.stringify(scenario)})); }
catch (error) { console.error(error.message); process.exit(1); }
`, { mode: 0o755 });
      const args = ['--project', 'synthetic-lock', '--kb', '999000111'];
      const result = spawnSync(entry === 'shell' ? 'sh' : process.execPath,
        entry === 'shell' ? ['deploy.sh', 'init', ...args] : ['scripts/docker-start.mjs', '--provider-dir', join(root, 'provider'), ...args],
        { cwd: root, env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, PROVIDER_IMAGE: 'synthetic/provider:reviewed', EXPLORER_IMAGE: 'synthetic/website:reviewed' }, encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      const calls = readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      assert.ok(calls.some(args => ['volume', 'network'].includes(args[0])), result.stderr);
      assert.ok(calls.every(args => ['ps', 'info', 'volume', 'network'].includes(args[0])), result.stderr);
      assert.equal(existsSync(join(root, '.docker-lab')), false);
      if (scenario !== 'query-error') assert.match(result.stderr, /existing_compose_project_protected/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
