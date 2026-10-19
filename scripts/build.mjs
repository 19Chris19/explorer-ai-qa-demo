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
  'qa-admission-config.mjs', 'chat-presentation.cjs', 'source-preview.mjs', 'server.mjs', 'static-assets.mjs', 'provider-a-client.mjs', 'durable-task-bridge.mjs', 'task-watch-store.mjs', 'history-archive.mjs', 'maintenance-gate.mjs', 'session-mode-store.mjs', 'request-ledger.mjs', 'private-json-file.mjs', 'conversation-turn-queue.mjs', 'preview-admission.mjs', 'preview-gateway.mjs',
  'question-rotation.mjs', 'source-evidence.mjs', 'deployment-paths.mjs', 'package.json', 'package-lock.json', '.env.example',
]) {
  copyFileSync(join(root, file), join(output, file));
}
mkdirSync(join(output, 'scripts'), { recursive: true });
copyFileSync(join(root, 'scripts/maintenance.mjs'), join(output, 'scripts/maintenance.mjs'));
mkdirSync(join(output, 'deploy'), { recursive: true });
cpSync(join(root, 'deploy/macos'), join(output, 'deploy/macos'), { recursive: true });
console.log('Built dist/ (no credentials or runtime data).');
