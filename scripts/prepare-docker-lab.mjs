import { mkdirSync, existsSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

export function prepareConfiguration(dir, scope) {
if (!/^[1-9][0-9]{0,31}$/u.test(scope)) throw new Error('Invalid knowledge scope');
// New credentials only. Never read live Air configuration or account stores.
mkdirSync(dir, { recursive: true, mode: 0o700 });
for (const name of ['provider.env', 'explorer.env']) {
  if (existsSync(resolve(dir, name))) throw new Error('Lab configuration exists; refusing to overwrite it');
}
const secret = () => randomBytes(32).toString('base64url');
const api = secret(), internal = secret(), admin = secret(), cookie = secret();
const provider = [
  'IMA_QA_PROVIDER=ima-web-agent', 'PORT=3000',
  `IMA_WEB_AGENT_SHARED_KNOWLEDGE_BASE_ID=${scope}`,
  `IMA_QA_API_TOKEN=${api}`, `IMA_QA_INTERNAL_SERVICE_TOKEN=${internal}`, `IMA_QA_ADMIN_TOKEN=${admin}`,
  'IMA_WEB_AGENT_ACCOUNT_STORE_PATH=/app/runtime/accounts.json',
  'IMA_WEB_AGENT_ACCOUNT_STORE_KEY_PATH=/app/runtime/accounts.key',
  'IMA_QA_CONVERSATION_STORE_PATH=/app/runtime/conversations.json',
  'IMA_QA_ACCOUNT_POOL_CAPACITY_MODE=auto', 'IMA_QA_MAX_CONCURRENT_ASK=auto',
  'IMA_QA_HEALTH_DETAILS=basic', 'TRUST_PROXY=false',
];
const explorer = [
  `PROVIDER_A_API_TOKEN=${api}`, `PROVIDER_A_INTERNAL_SERVICE_TOKEN=${internal}`,
  `PROVIDER_A_KNOWLEDGE_SCOPE_REF=${createHash('sha256').update(scope).digest('hex')}`,
  `DEMO_COOKIE_SECRET=${cookie}`,
];
for (const [name, lines] of [['provider.env', provider], ['explorer.env', explorer]]) {
  const path = resolve(dir, name);
  writeFileSync(path, `${lines.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
  chmodSync(path, 0o600);
}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
const { values } = parseArgs({ options: { kb: { type: 'string', default: '999000111' } } });
prepareConfiguration(resolve('.docker-lab'), values.kb);
console.log('Created isolated lab configuration (values withheld). No accounts enrolled.');
}
