import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'dist');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(join(root, 'public'), join(output, 'public'), { recursive: true });
mkdirSync(join(output, 'public/vendor'), { recursive: true });
copyFileSync(join(root, 'node_modules/marked/lib/marked.umd.js'), join(output, 'public/vendor/marked.umd.js'));
copyFileSync(join(root, 'node_modules/dompurify/dist/purify.min.js'), join(output, 'public/vendor/purify.min.js'));
for (const file of [
  'server.mjs', 'provider-a-client.mjs', 'history-archive.mjs', 'maintenance-gate.mjs', 'session-mode-store.mjs', 'request-ledger.mjs', 'conversation-turn-queue.mjs', 'preview-admission.mjs', 'preview-gateway.mjs',
  'question-rotation.mjs', 'source-evidence.mjs', 'deployment-paths.mjs', 'package.json', 'package-lock.json', '.env.example',
]) {
  copyFileSync(join(root, file), join(output, file));
}
mkdirSync(join(output, 'scripts'), { recursive: true });
copyFileSync(join(root, 'scripts/maintenance.mjs'), join(output, 'scripts/maintenance.mjs'));
console.log('Built dist/ (no credentials or runtime data).');
