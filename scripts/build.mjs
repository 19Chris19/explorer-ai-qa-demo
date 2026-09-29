import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'dist');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(join(root, 'public'), join(output, 'public'), { recursive: true });
for (const file of [
  'server.mjs', 'provider-a-client.mjs', 'session-mode-store.mjs', 'request-ledger.mjs', 'conversation-turn-queue.mjs',
  'question-rotation.mjs', 'source-evidence.mjs', 'package.json', 'package-lock.json', '.env.example',
]) {
  copyFileSync(join(root, file), join(output, file));
}
console.log('Built dist/ (no credentials or runtime data).');
