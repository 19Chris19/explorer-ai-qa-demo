import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as onboarding from '../deploy/onboard.mjs';
import * as release from '../deploy/release-config.mjs';

const record = `COMPOSE_PROJECT_NAME=synthetic-lock\nPROVIDER_IMAGE=sha256:${'a'.repeat(64)}\nEXPLORER_IMAGE=sha256:${'b'.repeat(64)}\nEXPLORER_REVISION=${'c'.repeat(40)}\nWEB_HOST_PORT=4417\nPROVIDER_HOST_PORT=3317\n`;
const polluted = { ...process.env, COMPOSE_PROJECT_NAME: 'wrong-project', COMPOSE_PROFILES: 'unexpected',
  COMPOSE_FILE: '/nonexistent/override.yaml', EXPLORER_IMAGE: 'wrong:latest', PROVIDER_IMAGE: 'wrong:latest',
  EXPLORER_REVISION: 'wrong', WEB_HOST_PORT: '9999', PROVIDER_HOST_PORT: '9998', DEMO_ASSET_PREFIX: '/wrong' };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'compose-lock-'));
  mkdirSync(join(root, '.docker-lab')); mkdirSync(join(root, 'deploy')); mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, '.docker-lab/release.env'), record);
  return root;
}

test('installer locks project and removes ambient Compose interpolation without dropping Docker auth/transport', () => {
  const root = fixture();
  try {
    const invocation = onboarding.lockedCompose(root, ['up'], { ...polluted, Compose_Project_Name: 'windows-other', explorer_image: 'wrong:latest', DOCKER_HOST: 'synthetic-host', DOCKER_CONFIG: '/synthetic-auth' });
    assert.equal(invocation.args[invocation.args.indexOf('-p') + 1], 'synthetic-lock');
    for (const key of Object.keys(polluted).filter(k => k.startsWith('COMPOSE_') || /^(PROVIDER_IMAGE|EXPLORER_IMAGE|EXPLORER_REVISION|WEB_HOST_PORT|PROVIDER_HOST_PORT|DEMO_ASSET_PREFIX)$/.test(k))) {
      assert.equal(invocation.env[key], undefined, key);
    }
    assert.equal(invocation.env.DOCKER_HOST, 'synthetic-host');
    assert.equal(invocation.env.DOCKER_CONFIG, '/synthetic-auth');
    assert.equal(invocation.env.Compose_Project_Name, undefined);
    assert.equal(invocation.env.explorer_image, undefined);
    for (const invalid of [record.replace(/EXPLORER_IMAGE=.*\n/, ''), record.replace(/EXPLORER_IMAGE=.*/, 'EXPLORER_IMAGE=wrong:latest'), record + 'COMPOSE_PROJECT_NAME=other\n']) {
      writeFileSync(join(root, '.docker-lab/release.env'), invalid);
      assert.throws(() => onboarding.lockedCompose(root, ['up'], polluted), /invalid_release_lock/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('deploy.sh uses recorded project/images despite environment pollution and reloads changed locks', () => {
  const root = fixture();
  try {
    for (const file of ['deploy.sh', 'deploy/bundle.sh', 'deploy/bundle.env']) copyFileSync(new URL(`../${file}`, import.meta.url), join(root, file));
    // Fake Docker records arguments, inherited overrides and the selected lock; no services run.
    writeFileSync(join(root, 'bin/docker'), '#!/bin/sh\nprintf "%s\\n" "$@"\nprintf "ambient=%s,%s,%s,%s,%s\\n" "${COMPOSE_PROJECT_NAME-}" "${COMPOSE_FILE-}" "${WEB_HOST_PORT-}" "${COMPOSE_PROFILES-}" "${DEMO_ASSET_PREFIX-}"\nprintf "images=%s,%s\\n" "${PROVIDER_IMAGE-}" "${EXPLORER_IMAGE-}"\ncat .docker-lab/release.env\n', { mode: 0o755 });
    const run = () => spawnSync('sh', ['deploy.sh', 'check'], { cwd: root, env: { ...polluted, PATH: `${join(root, 'bin')}:${process.env.PATH}` }, encoding: 'utf8' });
    let result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /-p\nsynthetic-lock\n/);
    assert.match(result.stdout, /ambient=,,,,\n/);
    assert.match(result.stdout, /images=,\n/);
    const upgraded = record.replace(`sha256:${'b'.repeat(64)}`, `ghcr.io/19chris19/explorer-ai-qa-demo@sha256:${'d'.repeat(64)}`);
    writeFileSync(join(root, '.docker-lab/release.env'), upgraded);
    assert.match(run().stdout, /EXPLORER_IMAGE=ghcr.io\/19chris19\/explorer-ai-qa-demo@sha256:d{64}/);
    for (const invalid of [record.replace(/PROVIDER_IMAGE=.*\n/, ''), record.replace(/EXPLORER_IMAGE=.*/, 'EXPLORER_IMAGE=wrong:latest'), record + 'COMPOSE_PROJECT_NAME=other\n']) {
      writeFileSync(join(root, '.docker-lab/release.env'), invalid);
      result = run(); assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('synthetic CI selects the fixed Provider image before the durable Compose startup', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /readBundle\(\)\.PROVIDER_TAG/);
  assert.match(workflow, /PROVIDER_TASK_IMAGE=ghcr\.io\/19chris19\/ima-qa-web-agent:\$PROVIDER_TAG/);
  assert.ok(workflow.indexOf('docker pull "$PROVIDER_TASK_IMAGE"') < workflow.indexOf('up -d --no-build'));
  assert.match(workflow, /compose\.durable-test\.yaml/);
});

for (const failNewCheck of [false, true]) test(`deploy upgrade and rollback use current locks (new acceptance fails: ${failNewCheck})`, () => {
  const root = fixture();
  const nextImage = `ghcr.io/19chris19/explorer-ai-qa-demo@sha256:${'d'.repeat(64)}`;
  try {
    for (const file of ['deploy.sh', 'deploy/bundle.sh', 'deploy/bundle.env']) copyFileSync(new URL(`../${file}`, import.meta.url), join(root, file));
    writeFileSync(join(root, '.docker-lab/deployment.json'), '{}');
    writeFileSync(join(root, '.docker-lab/explorer.env'), '# synthetic empty configuration\n');
    writeFileSync(join(root, 'bin/docker'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'image') { console.log('e'.repeat(40)); process.exit(0); }
if (args[0] !== 'compose') process.exit(0);
const lock = Object.fromEntries(fs.readFileSync('.docker-lab/release.env', 'utf8').trim().split('\\n').map(l => l.split('=')));
fs.appendFileSync('calls.jsonl', JSON.stringify({ args, lock, polluted: Object.keys(process.env).filter(k => k.startsWith('COMPOSE_') || ['EXPLORER_IMAGE', 'PROVIDER_IMAGE', 'WEB_HOST_PORT'].includes(k)) }) + '\\n');
if (${failNewCheck} && args.at(-1) === 'check' && lock.EXPLORER_IMAGE === ${JSON.stringify(nextImage)}) process.exit(1);
`, { mode: 0o755 });
    const run = args => spawnSync('sh', ['deploy.sh', ...args], { cwd: root, env: { ...polluted, PATH: `${join(root, 'bin')}:${process.env.PATH}` }, encoding: 'utf8' });
    const upgraded = run(['upgrade', nextImage]);
    assert.equal(upgraded.status, failNewCheck ? 1 : 0, upgraded.stderr);
    assert.equal(readFileSync(join(root, '.docker-lab/release.env'), 'utf8'), failNewCheck ? record : record.replace(`sha256:${'b'.repeat(64)}`, nextImage).replace('c'.repeat(40), 'e'.repeat(40)));
    if (!failNewCheck) assert.equal(run(['rollback']).status, 0);
    assert.equal(readFileSync(join(root, '.docker-lab/release.env'), 'utf8'), record);
    const calls = readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    for (const call of calls) {
      assert.equal(call.args[call.args.indexOf('-p') + 1], 'synthetic-lock');
      assert.deepEqual(call.polluted, []);
      assert.equal(call.lock.PROVIDER_IMAGE, `sha256:${'a'.repeat(64)}`);
    }
    const starts = calls.filter(c => c.args.includes('up') && c.args.includes('explorer-qa'));
    assert.equal(starts[0].lock.EXPLORER_IMAGE, nextImage);
    assert.equal(starts.at(-1).lock.EXPLORER_IMAGE, `sha256:${'b'.repeat(64)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('release checker honors only explicit host-gateway authorization', () => {
  const env = { PROVIDER_A_BASE_URL: 'http://host.docker.internal:3117', PROVIDER_A_ALLOW_HOST_GATEWAY: 'true' };
  assert.doesNotThrow(() => release.releaseClient(env));
  for (const value of [undefined, 'false', '1']) assert.throws(() => release.releaseClient({ ...env, PROVIDER_A_ALLOW_HOST_GATEWAY: value }), /localhost/);
});
