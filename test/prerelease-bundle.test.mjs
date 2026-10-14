import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readBundle, releaseManifest } from '../deploy/bundle.mjs';

test('Node and Shell agree on strict fixed rc deployment pairs', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-rc-bundle-'));
  mkdirSync(join(root, 'deploy'));
  const file = join(root, 'deploy/bundle.env');
  try {
    for (const [website, provider, valid] of [
      ['1.2.3', 'v2.3.4', true], ['1.2.3-rc.1', 'v2.3.4-rc.2', true],
      ['1.2.3-rc.0', 'v2.3.4', false], ['1.2.3-rc.01', 'v2.3.4', false],
      ['1.2.3-beta.1', 'v2.3.4', false], ['1.2.3', 'v2.3.4-rc.1', false],
    ]) {
      writeFileSync(file, `STATUS=released\nWEBSITE_VERSION=${website}\nPROVIDER_TAG=${provider}\n`);
      if (valid) assert.equal(readBundle(file).WEBSITE_VERSION, website);
      else assert.throws(() => readBundle(file), /invalid_deployment_bundle/);
      const shell = spawnSync('sh', ['-c', 'ROOT=$2; . "$1"', 'synthetic',
        fileURLToPath(new URL('../deploy/bundle.sh', import.meta.url)), root], { encoding: 'utf8' });
      assert.equal(shell.status === 0, valid, `${website}: ${shell.stderr}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('prerelease manifest identifies the testing channel without asserting real QA', () => {
  const result = releaseManifest({ STATUS: 'released', WEBSITE_VERSION: '1.2.3-rc.1', PROVIDER_TAG: 'v2.3.4-rc.1' },
    { revision: 'a'.repeat(40), digest: 'sha256:' + 'b'.repeat(64), providerRevision: 'c'.repeat(40), providerDigest: 'sha256:' + 'd'.repeat(64) });
  assert.equal(result.channel, 'prerelease');
  assert.equal(result.realQaVerified, false);
});
