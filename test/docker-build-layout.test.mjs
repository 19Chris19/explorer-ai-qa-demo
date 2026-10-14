import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

test('Docker build-stage inputs produce the complete native maintenance artifact', t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const layout = mkdtempSync(join(tmpdir(), 'synthetic-website-build-layout-'));
  t.after(() => rmSync(layout, { recursive: true, force: true }));
  const stage = readFileSync(join(root, 'Dockerfile'), 'utf8').split('\nFROM ')[0];
  for (const line of stage.split('\n')) {
    const match = /^COPY (.+) (\.\/\S*)$/u.exec(line);
    if (!match) continue;
    for (const source of match[1].split(' ')) {
      const sources = source === '*.mjs' ? readdirSync(root).filter(name => name.endsWith('.mjs')) : [source];
      for (const name of sources) cpSync(join(root, name), join(layout, match[2], match[2] === './' ? name : ''), { recursive: true });
    }
  }
  symlinkSync(join(root, 'node_modules'), join(layout, 'node_modules'), 'dir');
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: layout, stdio: 'pipe' });
  for (const file of ['server.mjs', 'maintenance-gate.mjs', 'scripts/maintenance.mjs',
    'deploy/macos/control.mjs', 'deploy/macos/launchd-profile.mjs']) {
    assert.equal(existsSync(join(layout, 'dist', file)), true, `artifact missing ${file}`);
  }
  assert.equal(existsSync(join(layout, 'dist/.env.local')), false);
});
