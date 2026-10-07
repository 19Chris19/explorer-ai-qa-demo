import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, chmodSync, symlinkSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gatewayOrigin, initializeShared, readShared, validateInputs, sharedReadiness, ONLINE_URL } from '../deploy/shared-install.mjs';
import { checkSharedCapability } from '../deploy/check-shared-capability.mjs';

const source = resolve(new URL('..', import.meta.url).pathname);
const secret = 'synthetic-site-token-not-a-real-secret';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'shared-installer-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const tokenFile = join(root, 'token');
  writeFileSync(tokenFile, secret + '\n', { mode: 0o600 });
  return { root, options: { runtime: 'node', project: 'synthetic-site', port: '4417',
    gateway: 'https://name.tailnet.ts.net', tokenFile } };
}
test('shared endpoint is a canonical HTTPS ts.net origin only', () => {
  assert.equal(gatewayOrigin('https://name.tailnet.ts.net'), 'https://name.tailnet.ts.net');
  for (const url of ['http://name.ts.net', 'https://evil.example', 'https://ts.net', 'https://name.ts.net',
    'https://name.ts.net/', 'https://name.ts.net/v1', 'https://name.ts.net:443',
    'https://user:pass@name.ts.net', 'https://name.ts.net?x=1', 'https://name.ts.net#x',
    'https://NAME.ts.net', 'https://name.ts.net.evil.example', 'https://-name.ts.net',
    'https://name.ts.net\n', 'https://127.0.0.1', 'https://name%2ets.net']) assert.throws(() => gatewayOrigin(url));
});
test('shared config contains only gateway credentials and survives rejected reinitialization', t => {
  const { root, options } = fixture(t);
  initializeShared(root, options);
  const path = join(root, '.maintenance/shared/explorer.env'), before = readFileSync(path, 'utf8');
  assert.match(before, /PROVIDER_A_MODE=shared/);
  assert.match(before, /PROVIDER_A_GATEWAY_TOKEN=synthetic-site/);
  assert.doesNotMatch(before, /PROVIDER_A_(API_TOKEN|INTERNAL_SERVICE_TOKEN|KNOWLEDGE_SCOPE_REF|BASE_URL)|IMA_|ADMIN_TOKEN/);
  assert.equal(readShared(root, 'node').state.mode, 'shared');
  assert.equal(readShared(root, 'node').env.DEMO_COOKIE_SECRET.length, 64);
  assert.notEqual(readShared(root, 'node').env.DEMO_COOKIE_SECRET, secret);
  assert.throws(() => initializeShared(root, options), /existing_installation_protected/);
  assert.equal(readFileSync(path, 'utf8'), before);
  assert.throws(() => readShared(root, 'docker'), /shared_installation_mismatch/);
  writeFileSync(path, before + 'PROVIDER_A_API_TOKEN=synthetic\n');
  assert.throws(() => readShared(root, 'node'), /invalid_shared_configuration/);
});
test('fresh-install and secret-file fences fail before writing private configuration', t => {
  for (const name of ['.env.local', '.docker-lab', 'runtime', '.maintenance/shared']) {
    const { root, options } = fixture(t);
    mkdirSync(join(root, name), { recursive: true });
    assert.throws(() => initializeShared(root, options), /existing_installation_protected/);
  }
  const { root, options } = fixture(t);
  chmodSync(options.tokenFile, 0o644);
  assert.throws(() => initializeShared(root, options), /private_file_permissions_required/);
  chmodSync(options.tokenFile, 0o600);
  symlinkSync(options.tokenFile, join(root, 'link'));
  assert.throws(() => initializeShared(root, { ...options, tokenFile: join(root, 'link') }), /private_file_permissions_required/);
  writeFileSync(options.tokenFile, 'synthetic-token\nPROVIDER_A_API_TOKEN=bad');
  assert.throws(() => initializeShared(root, options), /invalid_site_token/);
  assert.equal(existsSync(join(root, '.maintenance/shared')), false);
});
test('Docker locks require reviewed immutable website image and website-only topology', t => {
  const { root, options } = fixture(t);
  const docker = { ...options, runtime: 'docker', image: 'sha256:' + 'a'.repeat(64) };
  assert.throws(() => initializeShared(root, { ...docker, image: 'website:latest' }));
  initializeShared(root, docker);
  assert.equal(readShared(root, 'docker').env.DEMO_RUNTIME_DIR, '/var/lib/explorer-qa');
  const compose = readFileSync(join(source, 'compose.shared.yaml'), 'utf8');
  assert.doesNotMatch(compose, /provider-a:|provider-state|provider\.env|admin|3317/);
  assert.match(compose, /explorer-state:/);
  const statePath = join(root, '.maintenance/shared/deployment.json');
  const state = JSON.parse(readFileSync(statePath));
  writeFileSync(statePath, JSON.stringify({ ...state, image: 'website:latest' }));
  assert.throws(() => readShared(root, 'docker'));
});
function shellFixture(t, dockerScript = '') {
  const { root, options } = fixture(t);
  cpSync(join(source, 'install.sh'), join(root, 'install.sh'));
  const bin = join(root, 'bin'); mkdirSync(bin);
  // All external executables are explicit stubs; no host Docker or Node is reachable.
  for (const [name, body] of Object.entries({ dirname: '[ "$1" != -- ] || shift; printf "%s\\n" "${1%/*}"',
    uname: '[ "$1" != -s ] || { echo Linux; exit; }; echo x86_64',
    tailscale: 'exit 0', id: 'echo 1000', grep: 'exec /usr/bin/grep "$@"',
    docker: '[ "$1 $2" != "info --format" ] || { echo linux/x86_64; exit; };\n' + (dockerScript || 'exit 127') })) writeFileSync(join(bin, name), '#!/bin/sh\n' + body + '\n', { mode: 0o700 });
  const run = args => spawnSync('/bin/sh', [join(root, 'install.sh'), ...args], {
    env: { PATH: bin, CALLS: join(root, 'calls') }, encoding: 'utf8', input: '',
  });
  return { root, options, run };
}
test('online and missing noninteractive mode do not probe or install software', t => {
  const { root, run } = shellFixture(t, 'echo called >> "$CALLS"; exit 1');
  assert.notEqual(run([]).status, 0);
  assert.equal(run(['--mode', 'online']).stdout.trim(), ONLINE_URL);
  assert.equal(run(['--mode', 'independent']).status, 0);
  assert.equal(existsSync(join(root, 'calls')), false);
  assert.equal(existsSync(join(root, '.maintenance')), false);
});
test('Docker checks precede configuration generation and distinguish daemon/compose', t => {
  for (const [script, message] of [
    ['echo "$*" >> "$CALLS"; exit 1', /daemon stopped or inaccessible/],
    ['echo "$*" >> "$CALLS"; [ "$1" = info ]', /Compose plugin missing/],
  ]) {
    const { root, run } = shellFixture(t, script);
    const result = run(['--mode', 'shared', '--runtime', 'docker']);
    assert.notEqual(result.status, 0); assert.match(result.stderr, message);
    assert.doesNotMatch(readFileSync(join(root, 'calls'), 'utf8'), /run|pull|compose up/);
    assert.equal(existsSync(join(root, '.maintenance')), false);
  }
});
test('resource query failure never becomes permission to initialize', t => {
  const { root, run } = shellFixture(t, 'echo "$*" >> "$CALLS"; case "$1" in info) exit 0;; compose) echo 2.30.3; exit 0;; *) exit 1;; esac');
  assert.notEqual(run(['--mode', 'shared', '--runtime', 'docker']).status, 0);
  assert.doesNotMatch(readFileSync(join(root, 'calls'), 'utf8'), /run|pull/);
});
test('CLI diagnostics do not reflect accidental secret arguments', t => {
  const { root } = fixture(t);
  const result = spawnSync(process.execPath, [join(source, 'deploy/shared-install.mjs'), '--token', secret], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.ok(!(result.stdout + result.stderr).includes(secret));
});

test('gateway token grammar is printable nonspace ASCII 24-512 with literal punctuation', t => {
  const { root, options } = fixture(t);
  for (const value of ['x'.repeat(23), 'x'.repeat(513), 'x'.repeat(24) + ' ', 'x'.repeat(24) + '\nother', '非'.repeat(24)]) {
    writeFileSync(options.tokenFile, value);
    assert.throws(() => validateInputs(options), /invalid_site_token/);
    assert.equal(existsSync(join(root, '.maintenance')), false);
  }
  const literal = 'synthetic-$dollar#hash"quote\\slash=token';
  writeFileSync(options.tokenFile, literal);
  assert.equal(validateInputs(options), literal);
  initializeShared(root, options);
  assert.equal(readShared(root, 'node').env.PROVIDER_A_GATEWAY_TOKEN, literal);
  assert.match(readFileSync(join(source, 'compose.shared.yaml'), 'utf8'), /format: raw/);
});
test('Docker preflight reads no private contents and never generates/builds', t => {
  const { root, options, run } = shellFixture(t, 'echo "$*" >> "$CALLS"; echo 2.30.3');
  writeFileSync(options.tokenFile, 'invalid content must not be read in preflight');
  const result = run(['--mode', 'shared', '--runtime', 'docker', '--action', 'preflight',
    '--gateway-url', options.gateway, '--token-file', options.tokenFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).stage, 'preflight_ready');
  assert.doesNotMatch(readFileSync(join(root, 'calls'), 'utf8'), /run|build|pull| up /);
  assert.equal(existsSync(join(root, '.maintenance')), false);
});
test('missing Docker and Tailscale produce actionable structured preflight results', t => {
  for (const missing of ['docker', 'tailscale']) {
    const { root, run } = shellFixture(t, 'echo 2.30.3');
    rmSync(join(root, 'bin', missing));
    const result = run(['--mode', 'shared', '--runtime', 'docker', '--action', 'preflight']);
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(result.stderr).code, `${missing}_missing`);
  }
});
test('Docker validates inputs before candidate build and probes before generating configuration', t => {
  const { options: external } = fixture(t);
  const { root, run } = shellFixture(t, `echo "$*" >> "$CALLS"
case "$1" in
  compose) echo 2.30.3;;
  build|image) echo sha256:${'a'.repeat(64)};;
esac`);
  const result = run(['--mode', 'shared', '--runtime', 'docker', '--gateway-url', external.gateway,
    '--token-file', external.tokenFile]);
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(join(root, 'calls'), 'utf8');
  assert.ok(calls.indexOf('--action validate-input') < calls.indexOf('build --quiet'));
  assert.ok(calls.indexOf('check-shared-capability.mjs') < calls.indexOf('--action init'));
  assert.doesNotMatch(calls, /v0\.2\.1|provider-a|docker.sock/);
  assert.ok(!calls.includes(secret));
});
test('independent-only adapter cannot pass the shared capability probe', async t => {
  const { root } = fixture(t);
  writeFileSync(join(root, 'provider-a-client.mjs'), 'export function createProviderAClient() { return { readiness: async () => ({ ready: false }) }; }');
  await assert.rejects(checkSharedCapability(root));
});
test('Compose older than raw env support stops before token validation or build', t => {
  const { root, run } = shellFixture(t, 'echo "$*" >> "$CALLS"; echo 2.29.7');
  const result = run(['--mode', 'shared', '--runtime', 'docker', '--action', 'preflight']);
  assert.equal(JSON.parse(result.stderr).code, 'docker_compose_version');
  assert.doesNotMatch(readFileSync(join(root, 'calls'), 'utf8'), /run|build|pull/);
});
test('newer Compose major 5.0.2 satisfies minimum 2.30', t => {
  const { options, run } = shellFixture(t, 'echo 5.0.2');
  const result = run(['--mode', 'shared', '--runtime', 'docker', '--action', 'preflight',
    '--gateway-url', options.gateway, '--token-file', options.tokenFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).stage, 'preflight_ready');
});
test('recorded Docker start does not block local website on missing Tailscale', t => {
  const { root, run } = shellFixture(t, `echo "$*" >> "$CALLS"
case "$1 $2" in
  'compose version') echo 5.0.2;;
  'run --rm') echo synthetic-site sha256:${'a'.repeat(64)} 4417;;
esac`);
  rmSync(join(root, 'bin/tailscale'));
  const result = run(['--mode', 'shared', '--runtime', 'docker', '--action', 'start']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(root, 'calls'), 'utf8'), /up -d --no-build --no-recreate/);
});
test('liveness is local and explicit readiness fails closed offline without exposing secrets', async t => {
  const { root, options } = fixture(t);
  initializeShared(root, options);
  const compose = readFileSync(join(source, 'compose.shared.yaml'), 'utf8');
  assert.match(compose, /fetch\('http:\/\/127\.0\.0\.1:4317\/'\)/);
  assert.doesNotMatch(compose, /api\/qa\/health/);
  const result = await sharedReadiness(root, 'node', async (url, request) => {
    assert.equal(url, 'https://name.tailnet.ts.net/v1/capabilities');
    assert.equal(request.redirect, 'error');
    throw Error(secret);
  });
  assert.equal(result.stage, 'shared_unavailable');
  assert.ok(!JSON.stringify(result).includes(secret));
  const ready = await sharedReadiness(root, 'node', async () => ({ ok: true, json: async () => ({
    schemaVersion: 1, features: { knowledge_agent_keyed_sse_v1: true }, authenticated: true,
    connected: true, ready: true, capacity: 1,
  }) }));
  assert.equal(ready.ready, true);
});
test('Windows entry chooses before dispatch and preserves pinned Provider runtime arguments', () => {
  const ps = readFileSync(join(source, 'install.ps1'), 'utf8');
  assert.ok(ps.indexOf("'online' { Write-Output") < ps.indexOf('Get-Command wsl.exe'));
  assert.match(ps, /IsInputRedirected/);
  assert.match(ps, /WslRoot/);
  for (const path of ['onboard.sh', 'onboard.ps1']) {
    const content = readFileSync(join(source, path), 'utf8');
    assert.match(content, /deployment-choice\.(?:sh|ps1)/);
    assert.match(content, /runtime --deployment-mode independent --allow-bootstrap/);
  }
});

const unsafeNodeEnv = {
  NODE_OPTIONS: '--import=data:text/javascript,console.log(%22SYNTHETIC_PRELOAD_EXECUTED%22)',
  NODE_PATH: '/synthetic/unapproved-modules',
  NODE_TLS_REJECT_UNAUTHORIZED: '0',
};
for (const action of ['preflight', 'init', 'start', 'readiness']) {
  test(`environment safety before first Node and shared ${action}`, { skip: process.platform === 'win32' }, t => {
    const { root, options } = shellFixture(t);
    const calls = join(root, 'environment-calls');
    const probe = join(root, 'environment-probe.cjs');
    writeFileSync(probe, `const fs = require('node:fs');
fs.appendFileSync(process.env.CALLS, JSON.stringify({ args: process.argv.slice(2),
  unsafe: Object.keys(process.env).filter(key => ${JSON.stringify(Object.keys(unsafeNodeEnv))}.includes(key)) }) + '\\n');
`);
    writeFileSync(join(root, 'bin/node'), `#!/bin/sh\nexec '${process.execPath}' '${probe}' "$@"\n`, { mode: 0o700 });
    writeFileSync(join(root, '.env'), 'echo SYNTHETIC_USER_CONFIG_SOURCED\n');
    const r = spawnSync('/bin/sh', [join(root, 'install.sh'), '--mode', 'shared', '--runtime', 'node',
      '--action', action, '--gateway-url', options.gateway, '--token-file', options.tokenFile], {
      env: { PATH: join(root, 'bin'), CALLS: calls, ...unsafeNodeEnv }, encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(r.error);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, /SYNTHETIC_PRELOAD_EXECUTED|SYNTHETIC_USER_CONFIG_SOURCED/);
    const events = readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
    assert.match(events[0].args.join(' '), /process.versions/);
    for (const event of events) assert.deepEqual(event.unsafe, [], JSON.stringify(event.args));
    if (action !== 'preflight') assert.ok(events.at(-1).args.includes(action));
  });
}
test('online and missing mode stay dependency-free with unsafe Node settings', { skip: process.platform === 'win32' }, t => {
  const { root } = shellFixture(t);
  for (const [args, status] of [[['--mode', 'online'], 0], [[], 1]]) {
    const r = spawnSync('/bin/sh', [join(root, 'install.sh'), ...args], {
      env: { PATH: join(root, 'bin'), ...unsafeNodeEnv }, encoding: 'utf8', input: '', timeout: 5000,
    });
    assert.ifError(r.error);
    assert.equal(r.status, status, r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, /SYNTHETIC_PRELOAD_EXECUTED/);
    assert.equal(existsSync(join(root, '.maintenance')), false);
  }
});
test('shared Node child removes ambient execution and TLS overrides without loading user config', t => {
  const { root, options } = fixture(t);
  initializeShared(root, options);
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'server.mjs'), `console.log(JSON.stringify({
    unsafe: Object.keys(process.env).filter(key => ${JSON.stringify(Object.keys(unsafeNodeEnv))}.includes(key)),
    mode: process.env.PROVIDER_A_MODE, host: process.env.DEMO_LISTEN_HOST,
    preserved: process.env.SYNTHETIC_KEEP
  }));`);
  writeFileSync(join(root, '.env'), 'NODE_TLS_REJECT_UNAUTHORIZED=0\n');
  // Set overrides after Node startup so this checks the actual child filter.
  const script = `import { main } from ${JSON.stringify(new URL('../deploy/shared-install.mjs', import.meta.url).href)};
    Object.assign(process.env, ${JSON.stringify(unsafeNodeEnv)});
    await main(${JSON.stringify(root)}, ['--runtime', 'node', '--action', 'start']);`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { SYNTHETIC_KEEP: 'preserved' }, encoding: 'utf8', timeout: 5000,
  });
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { unsafe: [], mode: 'shared', host: '127.0.0.1', preserved: 'preserved' });
});
test('PowerShell removes Node overrides before WSL dispatch', () => {
  const ps = readFileSync(join(source, 'install.ps1'), 'utf8');
  const dispatch = ps.indexOf('& wsl.exe @arguments');
  for (const key of Object.keys(unsafeNodeEnv)) assert.ok(ps.indexOf(`'${key}'`) >= 0 && ps.indexOf(`'${key}'`) < dispatch, key);
  assert.match(ps.slice(0, dispatch), /\[Environment\]::SetEnvironmentVariable\(\$name, \$null, 'Process'\)/);
});
const pwsh = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8' });
test('PowerShell WSL double observes a clean environment', { skip: pwsh.status !== 0 }, () => {
  const script = `$env:PROCESSOR_ARCHITECTURE = 'AMD64'
function global:wsl.exe {
  foreach ($name in @('NODE_OPTIONS', 'NODE_PATH', 'NODE_TLS_REJECT_UNAUTHORIZED')) {
    if (Test-Path "Env:$name") { throw 'synthetic_unsafe_environment' }
  }
  Write-Output 'synthetic_clean_wsl'
  $global:LASTEXITCODE = 0
}
& '${join(source, 'install.ps1').replaceAll("'", "''")}' -Mode shared -Runtime node -Action preflight -Distribution Synthetic -WslRoot /home/synthetic/explorer`;
  const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, ...unsafeNodeEnv }, encoding: 'utf8', timeout: 5000,
  });
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'synthetic_clean_wsl');
});
