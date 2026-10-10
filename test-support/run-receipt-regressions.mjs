import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = [
  'task-recovery', 'receipt-recovery-ui', 'task-stream', 'task-resume-ui',
  'conversation-turn-queue', 'task-api', 'queue-api', 'maintenance-api',
  'task-watch-store', 'preview-failure', 'preview-task-errors', 'preview-gateway',
  'vercel-preview', 'provider-a-client', 'provider-website-capacity',
  'durable-task-bridge', 'task-client', 'conversation-restore-ui', 'turn-lifecycle',
].map(name => `test/${name}.test.mjs`);
const temporary = mkdtempSync(join(tmpdir(), 'explorer-receipt-public-source-'));
try {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean);
  // Copy public source only: BFF fixtures read .env.local beside server.mjs.
  for (const file of files) {
    if (!(file.endsWith('.mjs') || file.endsWith('.js') || file.startsWith('public/') || file === 'package.json')
        || file.split('/').some(part => part.startsWith('.env') || ['runtime', 'artifacts', 'node_modules'].includes(part))) continue;
    mkdirSync(dirname(join(temporary, file)), { recursive: true });
    copyFileSync(join(root, file), join(temporary, file));
  }
  symlinkSync(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...tests], {
    cwd: temporary, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: tmpdir() }, stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} finally { rmSync(temporary, { recursive: true, force: true }); }
