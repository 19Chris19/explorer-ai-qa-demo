#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const index = process.argv.indexOf('--provider-env');
if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: npm run configure:local -- --provider-env /private/path/provider-a.env');

const source = readEnv(process.argv[index + 1]);
const target = join(root, '.env.local');
let original = '';
try { original = readFileSync(target, 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const existing = parseEnv(original);
const apiToken = source.IMA_QA_API_TOKEN;
const serviceToken = source.IMA_QA_INTERNAL_SERVICE_TOKEN;
const knowledgeBaseId = source.IMA_WEB_AGENT_SHARED_KNOWLEDGE_BASE_ID || source.IMA_SHARED_KNOWLEDGE_BASE_ID;
if (!apiToken || !serviceToken || !knowledgeBaseId || apiToken === serviceToken) {
  throw new Error('Provider A requires distinct ordinary and internal tokens plus the shared knowledge-base ID');
}
const scope = createHash('sha256').update(knowledgeBaseId.trim()).digest('hex');
const values = {
  PROVIDER_A_BASE_URL: existing.PROVIDER_A_BASE_URL || 'http://127.0.0.1:3117',
  PROVIDER_A_API_TOKEN: apiToken,
  PROVIDER_A_INTERNAL_SERVICE_TOKEN: serviceToken,
  PROVIDER_A_KNOWLEDGE_SCOPE_REF: scope,
  DEMO_COOKIE_SECRET: existing.DEMO_COOKIE_SECRET || randomBytes(32).toString('hex'),
  PORT: existing.PORT || '4317',
};
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(values.PROVIDER_A_BASE_URL)) throw new Error('Provider A must use a localhost address or tunnel');
for (const value of Object.values(values)) if (/[\r\n]/u.test(value)) throw new Error('Invalid multiline configuration value');
const temporary = `${target}.${randomUUID()}.tmp`;
// Preserve non-adapter configuration verbatim, including privacy and maintenance.
const retained = original.split(/(?<=\n)/u).filter(line => {
  const key = line.match(/^([A-Z][A-Z0-9_]*)=/u)?.[1];
  return !Object.hasOwn(values, key);
}).join('');
const prefix = retained && !retained.endsWith('\n') ? `${retained}\n` : retained;
writeFileSync(temporary, `${prefix}${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
renameSync(temporary, target);
chmodSync(target, 0o600);
console.log('Private website adapter configuration stored; no credentials were printed.');

function readEnv(path) {
  return parseEnv(readFileSync(path, 'utf8'));
}

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/u).filter(line => /^[A-Z][A-Z0-9_]*=/u.test(line)).map(line => {
    const at = line.indexOf('=');
    const value = line.slice(at + 1).trim();
    const quote = value[0];
    return [line.slice(0, at), (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value];
  }));
}
