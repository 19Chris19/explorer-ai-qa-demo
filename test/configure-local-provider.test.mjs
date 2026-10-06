import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('local adapter configuration preserves unrelated settings and repeat installation identity', () => {
  const root = mkdtempSync(join(tmpdir(), 'local-config-test-'));
  try {
    mkdirSync(join(root, 'scripts'));
    const script = join(root, 'scripts/configure-local-provider.mjs');
    copyFileSync(new URL('../scripts/configure-local-provider.mjs', import.meta.url), script);
    const source = join(root, 'synthetic-provider.env');
    writeFileSync(source, 'IMA_QA_API_TOKEN=synthetic-ordinary\nIMA_QA_INTERNAL_SERVICE_TOKEN=synthetic-service\nIMA_WEB_AGENT_SHARED_KNOWLEDGE_BASE_ID=999000111\n');
    const target = join(root, '.env.local');
    const retained = '# keep installation settings\nDEMO_MAINTENANCE_STATE_PATH=/private/synthetic-maintenance.json\nPROVIDER_A_HISTORY_ARCHIVE_PATH=/private/synthetic-archive.json\nDEMO_DISABLE_ADMIN=true\nCUSTOM_SETTING="unchanged value"\n';
    writeFileSync(target, retained + 'DEMO_COOKIE_SECRET=synthetic-cookie\nPORT=4999\nPROVIDER_A_API_TOKEN=synthetic-old\nPROVIDER_A_API_TOKEN=synthetic-duplicate\n');
    const run = () => spawnSync(process.execPath, [script, '--provider-env', source], { encoding: 'utf8' });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const result = readFileSync(target, 'utf8');
    assert.ok(result.startsWith(retained));
    assert.match(result, /DEMO_COOKIE_SECRET=synthetic-cookie\n/);
    assert.match(result, /PORT=4999\n/);
    assert.equal(result.match(/^PROVIDER_A_API_TOKEN=/gm).length, 1);
    assert.match(result, /PROVIDER_A_API_TOKEN=synthetic-ordinary\n/);
    assert.doesNotMatch(first.stdout + first.stderr, /synthetic-(ordinary|service|cookie)/);
    if (process.platform !== 'win32') assert.equal(statSync(target).mode & 0o777, 0o600);
    assert.equal(run().status, 0);
    assert.equal(readFileSync(target, 'utf8'), result);
    writeFileSync(source, 'IMA_QA_API_TOKEN=synthetic-same\nIMA_QA_INTERNAL_SERVICE_TOKEN=synthetic-same\nIMA_WEB_AGENT_SHARED_KNOWLEDGE_BASE_ID=999000111\n');
    assert.notEqual(run().status, 0);
    assert.equal(readFileSync(target, 'utf8'), result);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
