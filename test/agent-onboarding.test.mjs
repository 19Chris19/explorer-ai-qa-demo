import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOnboardingOptions, providerTools, DEFAULT_SHARE_URL, onboard } from '../deploy/onboard.mjs';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBundle } from '../deploy/bundle.mjs';

function syntheticImages() {
  const bundle = readBundle();
  return ['a', 'b'].map((char, index) => ({ Id: 'sha256:' + char.repeat(64), RepoDigests: [],
    Config: { Labels: { 'org.opencontainers.image.revision': char.repeat(40),
      'org.opencontainers.image.version': index === 0 ? bundle.PROVIDER_TAG : `v${bundle.WEBSITE_VERSION}` } } }));
}

test('website delegates enrollment to Provider and defaults only its own library preset', () => {
  const options = parseOnboardingOptions([]);
  assert.equal(options.shareUrl, DEFAULT_SHARE_URL);
  assert.equal(options.mode, ['darwin', 'win32'].includes(process.platform) ? 'desktop' : 'server');
  assert.throws(() => parseOnboardingOptions(['--mode', 'invalid']));
  assert.throws(() => parseOnboardingOptions(['--provider-port', '4417']));
  assert.throws(() => providerTools('/nonexistent-provider'), /provider_tooling_required/);
});
test('synthetic double-service setup prepares the desktop helper before starting and preserves credentials on resume', async () => {
  const root = mkdtempSync(join(tmpdir(), 'website-onboard-')); const calls = []; const events = [];
  const images = syntheticImages();
  const deps = {
    env: { PROVIDER_IMAGE: 'synthetic/provider:reviewed', EXPLORER_IMAGE: 'synthetic/website:reviewed' },
    tools: { playwrightVersion: 'synthetic', guided: async (_, command) => calls.push(command),
      resolveGuidedTarget: async () => ({ shareUrl: 'https://ima.qq.com/wiki/?shareId=' + 'a'.repeat(64), knowledgeBaseId: '999000111' }),
      parseShareUrl: url => ({ url }) },
    docker: async (args, _, env) => {
      if (args[0] === 'compose') {
        assert.equal(args[args.indexOf('-p') + 1], 'zhitianxia-qa');
        assert.equal(env.PROVIDER_IMAGE, undefined); assert.equal(env.EXPLORER_IMAGE, undefined);
      }
      calls.push(args.join(' ')); return args[0] === 'ps' ? '' : args[0] === 'image' ? JSON.stringify(images)
      : args.includes('provider-a') && args.includes('exec') ? JSON.stringify({ protocol: 'shared_library_membership_v1', browserReady: true }) : ''; },
    freePort: async () => {}, emit: e => events.push(e),
  };
  try {
    await onboard(root, 'init', ['--mode', 'desktop'], deps);
    const file = join(root, '.docker-lab/provider.env'); const before = readFileSync(file, 'utf8');
    assert.match(before, /SHARED_KNOWLEDGE_BASE_SHARE_URL=https:/);
    assert.ok(calls.indexOf('browser-install') < calls.findIndex(c => c.includes('up -d')));
    assert.ok(!JSON.stringify(events).includes(before.match(/IMA_QA_ADMIN_TOKEN=(.*)/)[1]));
    assert.equal(events.at(-1).realQaVerified, false);
    const metadata = JSON.parse(readFileSync(join(root, '.docker-lab/deployment.json')));
    assert.equal(metadata.bundle.providerTag, 'v0.4.2');
    assert.equal(metadata.bundle.topology, 'dedicated-provider');
    await onboard(root, 'resume', [], deps); assert.equal(readFileSync(file, 'utf8'), before);
    await onboard(root, 'check', [], deps);
    const original = deps.docker;
    deps.docker = async (args, capture, env) => args.includes('provider-a') && args.includes('exec')
      ? JSON.stringify({ protocol: 'shared_library_membership_v1', browserReady: false }) : original(args, capture, env);
    await assert.rejects(onboard(root, 'check', [], deps), /enrollment_path_not_ready/);
    assert.equal(readFileSync(file, 'utf8'), before);
    await assert.rejects(onboard(root, 'init', [], deps), /existing_installation_protected/);
    const stateFile = join(root, '.docker-lab/deployment.json');
    for (const bundle of [undefined, { ...metadata.bundle, providerTag: 'v0.4.1' },
      { ...metadata.bundle, websiteVersion: '0.2.0' }, { ...metadata.bundle, topology: 'shared-provider' }]) {
      writeFileSync(stateFile, JSON.stringify({ ...metadata, bundle }));
      for (const command of ['resume', 'repair', 'check']) {
        const count = calls.length;
        await assert.rejects(onboard(root, command, [], deps), /existing_installation_requires_reviewed_upgrade/);
        assert.equal(calls.length, count);
        assert.equal(readFileSync(file, 'utf8'), before);
      }
    }
    assert.ok(!calls.some(c => c.includes('--force-recreate') || c.includes('down')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('wrong candidate image version stops before target resolution or configuration', async () => {
  const root = mkdtempSync(join(tmpdir(), 'website-image-failure-'));
  const images = syntheticImages(); images[0].Config.Labels['org.opencontainers.image.version'] = 'v0.4.1';
  const deps = {
    env: { PROVIDER_IMAGE: 'synthetic/provider:reviewed', EXPLORER_IMAGE: 'synthetic/website:reviewed' },
    tools: { guided: async () => {}, resolveGuidedTarget: async () => assert.fail('must not resolve target') },
    docker: async args => args[0] === 'ps' ? '' : JSON.stringify(images),
    freePort: async () => {}, emit: () => {},
  };
  try {
    await assert.rejects(onboard(root, 'init', [], deps), /image_version_mismatch/);
    assert.equal(existsSync(join(root, '.docker-lab')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('a helper setup failure creates no website credentials and can be retried', async () => {
  const root = mkdtempSync(join(tmpdir(), 'website-helper-failure-'));
  const deps = { env: { PROVIDER_IMAGE: 'synthetic/provider:reviewed', EXPLORER_IMAGE: 'synthetic/website:reviewed' }, tools: { playwrightVersion: 'synthetic', guided: async (_, command) => { if (command === 'browser-install') throw Error('synthetic_helper_offline'); },
    resolveGuidedTarget: async () => ({ shareUrl: DEFAULT_SHARE_URL, knowledgeBaseId: '999000111' }), parseShareUrl: url => ({ url }) },
    docker: async args => args[0] === 'ps' ? '' : JSON.stringify(syntheticImages()), freePort: async () => {}, emit: () => {} };
  try {
    await assert.rejects(onboard(root, 'init', ['--mode', 'desktop'], deps), /synthetic_helper_offline/);
    assert.equal(existsSync(join(root, '.docker-lab/provider.env')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
