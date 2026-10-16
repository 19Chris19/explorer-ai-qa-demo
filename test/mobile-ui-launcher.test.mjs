import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('mobile UI launcher reports an exited browser without hiding its diagnostic', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-browser-failure-'));
  try {
    const fake = path.join(dir, 'browser');
    fs.writeFileSync(fake, '#!/bin/sh\nprintf "synthetic_browser_launch_failure\\n" >&2\nexit 42\n', { mode: 0o700 });
    const result = spawnSync(process.execPath, ['scripts/check-mobile-ui.mjs'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, CHROME_PATH: fake },
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exited before ready \(42\)/);
    assert.match(result.stderr, /synthetic_browser_launch_failure/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
