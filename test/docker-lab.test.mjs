import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('lab bootstrap makes private distinct credentials and refuses overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'explorer-docker-bootstrap-'));
  const script = fileURLToPath(new URL('../scripts/prepare-docker-lab.mjs', import.meta.url));
  try {
    const first = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
    assert.equal(first.status, 0);
    const provider = readFileSync(join(dir, '.docker-lab/provider.env'), 'utf8');
    const website = readFileSync(join(dir, '.docker-lab/explorer.env'), 'utf8');
    const tokens = provider.split('\n').filter(line => /TOKEN=/.test(line)).map(line => line.split('=')[1]);
    assert.equal(new Set(tokens).size, 3);
    assert.equal(tokens.some(token => first.stdout.includes(token)), false);
    assert.equal(website.includes(tokens[2]), false);
    assert.equal(statSync(join(dir, '.docker-lab/provider.env')).mode & 0o777, 0o600);
    assert.equal(statSync(join(dir, '.docker-lab')).mode & 0o777, 0o700);
    assert.notEqual(spawnSync(process.execPath, [script], { cwd: dir }).status, 0);
    assert.equal(readFileSync(join(dir, '.docker-lab/provider.env'), 'utf8') === provider, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('deployment keeps admin blocked, streams unbuffered and isolates fixture egress', () => {
  const nginx = readFileSync(new URL('../deploy/docker/nginx.conf', import.meta.url), 'utf8');
  assert.match(nginx, /proxy_buffering off/);
  assert.match(nginx, /access_log off/);
  assert.match(nginx, /\(admin\|internal\)/);
  assert.match(nginx, /location \/ \{ return 404;/);
  const compose = readFileSync(new URL('../compose.linux.yaml', import.meta.url), 'utf8');
  assert.doesNotMatch(compose, /network_mode: host/);
  assert.match(compose, /127\.0\.0\.1:/);
  const synthetic = readFileSync(new URL('../deploy/docker/compose.synthetic.yaml', import.meta.url), 'utf8');
  assert.match(synthetic, /internal: true/);
  assert.match(synthetic, /networks: \[backend, browser-access\]/);
});
