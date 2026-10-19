import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readBundle, selectBundleImages, verifyBundleImages, releaseManifest } from '../deploy/bundle.mjs';

test('website release selects one Provider version and never a floating latest pair', () => {
  const bundle = readBundle();
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(bundle.WEBSITE_VERSION, pkg.version);
  assert.equal(bundle.PROVIDER_TAG, 'v0.7.0');
  assert.throws(() => selectBundleImages({ ...bundle, STATUS: 'candidate' }, {}), /candidate_requires_explicit_images/);
  assert.throws(() => selectBundleImages({ ...bundle, STATUS: 'candidate' }, { PROVIDER_IMAGE: 'synthetic/provider:reviewed' }), /candidate_requires_explicit_images/);
  assert.deepEqual(selectBundleImages(bundle, { PROVIDER_IMAGE: 'synthetic/provider:reviewed', EXPLORER_IMAGE: 'synthetic/website:reviewed' }),
    ['synthetic/provider:reviewed', 'synthetic/website:reviewed']);
  assert.deepEqual(selectBundleImages({ ...bundle, STATUS: 'released' }, {}),
    [`ghcr.io/19chris19/ima-qa-web-agent:${bundle.PROVIDER_TAG}`, `ghcr.io/19chris19/explorer-ai-qa-demo:v${pkg.version}`]);
});

test('bundle parsing rejects duplicate fields and executable or floating versions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-bundle-'));
  const file = join(dir, 'bundle.env');
  const valid = readFileSync(new URL('../deploy/bundle.env', import.meta.url), 'utf8');
  try {
    for (const content of [valid + 'STATUS=released\n', valid.replace(readBundle().PROVIDER_TAG, 'latest'),
      valid + 'UNEXPECTED=value\n', valid.replace(readBundle().PROVIDER_TAG, '$(echo bad)')]) {
      writeFileSync(file, content);
      assert.throws(() => readBundle(file), /invalid_deployment_bundle/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('candidate shell entry stops before downloading or invoking Docker without explicit inputs', t => {
  if (readBundle().STATUS !== 'candidate') { t.skip('Released installation uses published tags'); return; }
  const root = new URL('..', import.meta.url);
  const env = { ...process.env };
  delete env.PROVIDER_SOURCE_DIR; delete env.PROVIDER_IMAGE; delete env.EXPLORER_IMAGE;
  for (const [file, args] of [['onboard.sh', ['doctor']], ['deploy.sh', ['init', '--kb', '999000111']]]) {
    const result = spawnSync('sh', [file, ...args], { cwd: root, env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unpublished candidate/);
  }
});

test('release workflow derives Provider evidence from bundle, not a stale literal baseline', () => {
  const workflow = readFileSync(new URL('../.github/workflows/images.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /providerBaseline:\s*["']v0\.4\.1/);
  assert.match(workflow, /Reject unpublished deployment bundle/);
  assert.match(workflow, /PROVIDER_DIGEST/);
  assert.match(workflow, /write-release-manifest\.mjs/);
});

test('accepted release manifest binds both digests and refuses incomplete candidate evidence', () => {
  const bundle = readBundle();
  const evidence = { revision: 'a'.repeat(40), digest: 'sha256:' + 'b'.repeat(64),
    providerDigest: 'sha256:' + 'c'.repeat(64), providerRevision: 'd'.repeat(40) };
  assert.throws(() => releaseManifest({ ...bundle, STATUS: 'candidate' }, evidence), /candidate_not_releasable/);
  assert.throws(() => releaseManifest({ ...bundle, STATUS: 'released' }, { ...evidence, providerDigest: '' }), /release_evidence_missing/);
  const result = releaseManifest({ ...bundle, STATUS: 'released' }, evidence);
  assert.equal(result.providerBaseline, bundle.PROVIDER_TAG);
  assert.equal(result.providerDigest, evidence.providerDigest);
  assert.equal(result.providerRevision, evidence.providerRevision);
  assert.equal(result.digest, evidence.digest);
  assert.equal(result.realQaVerified, false);
});

for (const status of ['candidate', 'released']) test(`${status} install rejects swapped, unlabeled or wrong-version images before configuration`, () => {
  const bundle = { ...readBundle(), STATUS: status };
  const images = [bundle.PROVIDER_TAG, `v${bundle.WEBSITE_VERSION}`]
    .map(version => ({ Config: { Labels: { 'org.opencontainers.image.version': version } } }));
  assert.doesNotThrow(() => verifyBundleImages(bundle, images));
  for (const invalid of [[], [null, null], [...images].reverse(), [{}, images[1]], null]) {
    assert.throws(() => verifyBundleImages(bundle, invalid), /image_version_mismatch/);
  }
});

test('released shell rejects wrong-tag, dirty and wrong-origin cached tooling before execution', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-wrapper-'));
  const source = join(root, '.maintenance/provider-v0.4.2');
  const git = (...args) => {
    const result = spawnSync('git', ['-C', source, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    mkdirSync(join(root, 'deploy'), { recursive: true });
    mkdirSync(source, { recursive: true });
    for (const file of ['onboard.sh', 'deploy/bundle.sh']) copyFileSync(new URL('../' + file, import.meta.url), join(root, file));
    writeFileSync(join(root, 'deploy/bundle.env'), 'STATUS=released\nWEBSITE_VERSION=0.2.1\nPROVIDER_TAG=v0.4.2\n');
    writeFileSync(join(source, 'onboard.sh'), '#!/bin/sh\necho TOOL_EXECUTED >&2\nexit 1\n');
    git('init'); git('config', 'user.name', 'Synthetic'); git('config', 'user.email', 'synthetic@example.invalid');
    git('add', 'onboard.sh'); git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-m', 'synthetic');
    git('remote', 'add', 'origin', 'https://github.com/19Chris19/ima-qa-web-agent.git');
    const env = { ...process.env }; delete env.PROVIDER_SOURCE_DIR;
    const run = blocked => {
      const result = spawnSync('sh', ['onboard.sh', 'doctor'], { cwd: root, env, encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      if (blocked) { assert.doesNotMatch(result.stderr, /TOOL_EXECUTED/); assert.match(result.stderr, /clean checkout/); }
      else assert.match(result.stderr, /TOOL_EXECUTED/);
    };
    run(true); // Missing tag.
    git('tag', 'v0.4.2'); run(false);
    writeFileSync(join(source, 'unexpected'), 'synthetic'); run(true);
    git('add', 'unexpected');
    git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-m', 'wrong revision'); run(true);
    git('tag', '-f', 'v0.4.2');
    git('remote', 'set-url', 'origin', 'https://example.invalid/other.git'); run(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
