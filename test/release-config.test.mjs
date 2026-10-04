import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialize, parseOptions } from '../deploy/release-config.mjs';

test('container initialization validates scope, project and ports', () => {
  assert.equal(parseOptions(['--kb', '999000111']).project, 'zhitianxia-qa');
  for (const args of [[], ['--kb', 'bad'], ['--kb', '999000111', '--web-port', '0'],
    ['--kb', '999000111', '--project', 'bad/name'], ['--kb', '999000111', '--provider-port', '4417']]) {
    assert.throws(() => parseOptions(args));
  }
});

test('fresh container configuration remains private and refuses reinitialization', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-release-'));
  try {
    initialize(dir, parseOptions(['--kb', '999000111']), [
      { Id: `sha256:${'a'.repeat(64)}`, RepoDigests: [], Config: { Labels: { 'org.opencontainers.image.revision': 'c'.repeat(40) } } },
      { Id: `sha256:${'b'.repeat(64)}`, RepoDigests: [], Config: { Labels: { 'org.opencontainers.image.revision': 'd'.repeat(40) } } },
    ]);
    const metadata = JSON.parse(readFileSync(join(dir, 'deployment.json')));
    assert.equal(metadata.explorerRevision, 'd'.repeat(40));
    assert.equal(metadata.providerImage, `sha256:${'a'.repeat(64)}`);
    assert.doesNotMatch(JSON.stringify(metadata), /TOKEN|SECRET/);
    const before = readFileSync(join(dir, 'provider.env'), 'utf8');
    assert.throws(() => initialize(dir, parseOptions(['--kb', '999000111']), []));
    assert.equal(readFileSync(join(dir, 'provider.env'), 'utf8'), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a partial prior installation is protected too', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-release-'));
  try {
    writeFileSync(join(dir, 'explorer.env'), 'synthetic-existing-config');
    assert.throws(() => initialize(dir, parseOptions(['--kb', '999000111']), []));
    assert.equal(readFileSync(join(dir, 'explorer.env'), 'utf8'), 'synthetic-existing-config');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
