import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';

export const ONLINE_URL = 'https://explorer-ai-qa-demo.vercel.app/';
const imagePattern = /^(?:ghcr\.io\/19chris19\/explorer-ai-qa-demo@)?sha256:[a-f0-9]{64}$/;
export function gatewayOrigin(value) {
  // Canonical origins only: no credentials, port, path, escaping, query or redirect discovery.
  if (!/^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2}ts\.net$/.test(value || '')) throw Error('approved_https_ts_net_origin_required');
  if (new URL(value).origin !== value) throw Error('approved_https_ts_net_origin_required');
  return value;
}
function present(path) {
  try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function privateRead(path) {
  if (!path || !existsSync(path)) throw Error('private_token_or_config_missing');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384
    || process.platform !== 'win32' && (stat.mode & 0o077)) throw Error('private_file_permissions_required');
  return readFileSync(path, 'utf8');
}
function validate(options, requireImage = true) {
  if (!['node', 'docker'].includes(options.runtime)) throw Error('explicit_runtime_required');
  if (!/^[a-z0-9][a-z0-9_-]{0,48}$/.test(options.project || '')) throw Error('invalid_project');
  if (!/^[1-9][0-9]{0,4}$/.test(String(options.port)) || Number(options.port) > 65535) throw Error('invalid_port');
  if (requireImage && options.runtime === 'docker' && !imagePattern.test(options.image || '')) throw Error('reviewed_shared_adapter_image_digest_required');
}
export function validateInputs(options) {
  validate(options, false);
  if (options.image) validate(options);
  gatewayOrigin(options.gateway);
  const token = privateRead(options.tokenFile).replace(/\r?\n$/, '');
  if (!/^[\x21-\x7e]{24,512}$/.test(token)) throw Error('invalid_site_token');
  return token;
}
export function initializeShared(root, options) {
  validate(options);
  const gateway = gatewayOrigin(options.gateway);
  for (const name of ['.docker-lab', '.env.local', 'runtime', '.maintenance/shared']) {
    if (present(join(root, name))) throw Error('existing_installation_protected');
  }
  const token = validateInputs(options);
  const parent = join(root, '.maintenance');
  if (present(parent) && (!lstatSync(parent).isDirectory() || lstatSync(parent).isSymbolicLink())) throw Error('unsafe_private_directory');
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const directory = join(parent, 'shared');
  // Exclusive directory creation is the initialization lock, including partial failures.
  mkdirSync(directory, { mode: 0o700 });
  const state = { schemaVersion: 1, mode: 'shared', runtime: options.runtime,
    project: options.project, port: Number(options.port), image: options.image || null };
  const configuration = [
    'PROVIDER_A_MODE=shared', `PROVIDER_A_GATEWAY_URL=${gateway}`, `PROVIDER_A_GATEWAY_TOKEN=${token}`,
    `DEMO_COOKIE_SECRET=${randomBytes(32).toString('hex')}`, 'DEMO_DISABLE_ADMIN=1',
    `PORT=${options.runtime === 'docker' ? 4317 : state.port}`,
    `DEMO_LISTEN_HOST=${options.runtime === 'docker' ? '0.0.0.0' : '127.0.0.1'}`,
    `DEMO_RUNTIME_DIR=${options.runtime === 'docker' ? '/var/lib/explorer-qa' : join(directory, 'runtime')}`,
  ].join('\n') + '\n';
  writeFileSync(join(directory, 'explorer.env'), configuration, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(directory, 'deployment.json'), JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return state;
}
export function readShared(root, runtime) {
  const directory = join(root, '.maintenance/shared');
  for (const path of [join(root, '.maintenance'), directory]) {
    if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) throw Error('unsafe_private_directory');
  }
  const state = JSON.parse(privateRead(join(directory, 'deployment.json')));
  validate(state);
  if (state.schemaVersion !== 1 || state.mode !== 'shared' || state.runtime !== runtime) throw Error('shared_installation_mismatch');
  const env = {};
  const allowed = ['PROVIDER_A_MODE', 'PROVIDER_A_GATEWAY_URL', 'PROVIDER_A_GATEWAY_TOKEN', 'DEMO_COOKIE_SECRET',
    'DEMO_DISABLE_ADMIN', 'PORT', 'DEMO_LISTEN_HOST', 'DEMO_RUNTIME_DIR'];
  for (const line of privateRead(join(directory, 'explorer.env')).trimEnd().split('\n')) {
    const at = line.indexOf('='), key = line.slice(0, at);
    if (!allowed.includes(key) || Object.hasOwn(env, key)) throw Error('invalid_shared_configuration');
    env[key] = line.slice(at + 1);
  }
  gatewayOrigin(env.PROVIDER_A_GATEWAY_URL);
  if (Object.keys(env).length !== allowed.length || env.PROVIDER_A_MODE !== 'shared' || env.DEMO_DISABLE_ADMIN !== '1'
    || !/^[\x21-\x7e]{24,512}$/.test(env.PROVIDER_A_GATEWAY_TOKEN)
    || !/^[a-f0-9]{64}$/.test(env.DEMO_COOKIE_SECRET)
    || env.PORT !== String(runtime === 'docker' ? 4317 : state.port)
    || env.DEMO_LISTEN_HOST !== (runtime === 'docker' ? '0.0.0.0' : '127.0.0.1')
    || env.DEMO_RUNTIME_DIR !== (runtime === 'docker' ? '/var/lib/explorer-qa' : join(directory, 'runtime'))) throw Error('invalid_shared_configuration');
  return { state, env };
}
export async function sharedReadiness(root, runtime, fetchImpl = fetch) {
  const { env } = readShared(root, runtime);
  try {
    const response = await fetchImpl(`${env.PROVIDER_A_GATEWAY_URL}/v1/capabilities`, {
      headers: { Authorization: `Bearer ${env.PROVIDER_A_GATEWAY_TOKEN}`, 'X-IMA-Client-Id': 'demo:readiness' },
      redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw Error();
    const data = await response.json();
    const ready = data.schemaVersion === 1 && data.features?.knowledge_agent_keyed_sse_v1 === true
      && data.authenticated === true && data.connected === true && data.ready === true
      && Number.isSafeInteger(data.capacity) && data.capacity > 0;
    return { stage: ready ? 'shared_ready' : 'shared_unavailable', ready,
      next: ready ? 'Gateway contract and capacity checked; real question/follow-up still requires authorization.'
        : 'Website liveness is independent. Ask operator to review gateway auth, contract and capacity; do not change origin or credentials.' };
  } catch {
    return { stage: 'shared_unavailable', ready: false,
      next: 'Website can remain available for drafts. Review approved network/gateway access; redirects are refused and no question was sent.' };
  }
}
export async function main(root, args) {
  if (Number(process.versions.node.split('.')[0]) < 20) throw Error('node_twenty_or_newer_required');
  const { values: v } = parseArgs({ args, options: Object.fromEntries([
    'runtime', 'action', 'project', 'gateway-url', 'token-file', 'web-port', 'image',
  ].map(key => [key, { type: 'string' }])) });
  const options = { runtime: v.runtime, project: v.project, gateway: v['gateway-url'],
    'tokenFile': v['token-file'], port: v['web-port'], image: v.image };
  if (v.action === 'readiness') {
    const result = await sharedReadiness(root, v.runtime);
    console.log(JSON.stringify(result));
    if (!result.ready) process.exitCode = 1;
  } else if (v.action === 'validate-input') {
    validateInputs(options);
    console.log(JSON.stringify({ stage: 'inputs_validated', next: 'Build and inspect reviewed shared adapter; no credentials printed.' }));
  } else if (v.action === 'init') {
    initializeShared(root, options);
    console.log('Shared configuration created; credentials withheld. Start only with the reviewed shared /v1 adapter. See docs/SHARED_INSTALLATION.md.');
  } else if (v.action === 'compose-lock' && v.runtime === 'docker') {
    const { state } = readShared(root, 'docker');
    console.log(`${state.project} ${state.image} ${state.port}`);
  } else if (v.action === 'start' && v.runtime === 'node') {
    const { env } = readShared(root, 'node');
    if (present(join(root, '.env.local'))) throw Error('existing_installation_protected');
    if (!existsSync(join(root, 'node_modules'))) throw Error('install_reviewed_dependencies_first');
    const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PROVIDER_|IMA_|DEMO_|PORT$|NODE_(OPTIONS|PATH|TLS_REJECT_UNAUTHORIZED)$)/i.test(key)));
    await new Promise((accept, reject) => {
      const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...clean, ...env }, stdio: 'inherit' });
      child.once('error', () => reject(Error('shared_start_failed')));
      child.once('exit', code => code === 0 ? accept() : reject(Error('shared_start_failed')));
    });
  } else throw Error('explicit_shared_action_required');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(resolve(fileURLToPath(new URL('..', import.meta.url))), process.argv.slice(2)).catch(error => {
    // Never echo parser errors or input values, including accidental CLI secrets.
    const hints = {
      'private_token_or_config_missing': 'Supply an existing private token file, or resume the recorded configuration.',
      private_file_permissions_required: 'Use a regular owner-only file (0600), not a symlink; do not print its contents.',
      'invalid_site_token': 'Ask the operator for a 24-512 printable nonspace ASCII site token; recommend generated base64url with at least 32 characters.',
      approved_https_ts_net_origin_required: 'Supply exactly https://host.tailnet.ts.net without port, path or trailing slash.',
      existing_installation_protected: 'Use the recorded recovery flow; do not delete configuration or volumes.',
      reviewed_shared_adapter_image_digest_required: 'Build reviewed integrated source or supply its immutable shared-capable image.',
      node_twenty_or_newer_required: 'Obtain consent for official Node 22 installation.',
      explicit_runtime_required: 'Select node or docker.', invalid_project: 'Choose a fresh lowercase Compose project name.',
      invalid_port: 'Use a port from 1 through 65535.',
    };
    const code = Object.hasOwn(hints, error.message) ? error.message : 'shared_installation_blocked';
    console.error(JSON.stringify({ stage: 'blocked', code, next: hints[code] || 'Review docs/SHARED_INSTALLATION.md and recorded runtime; no secrets printed.' }));
    process.exitCode = 1;
  });
}
