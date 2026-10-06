import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { initialize, parseOptions } from './release-config.mjs';
import { readBundle, selectBundleImages, verifyBundleImages } from './bundle.mjs';
import { assertFreshProject } from './project-resources.mjs';

export const DEFAULT_SHARE_URL = 'https://ima.qq.com/wiki/?shareId=e528d98d028732fcd9b6adcc879db1463a8b3e4c8f8beb82a7519c4b4fdf8e64';
export function parseOnboardingOptions(args) {
  const { values } = parseArgs({ args, options: {
    'share-url': { type: 'string', default: DEFAULT_SHARE_URL },
    'target-file': { type: 'string' },
    mode: { type: 'string', default: ['darwin', 'win32'].includes(process.platform) ? 'desktop' : 'server' },
    project: { type: 'string', default: 'zhitianxia-qa' },
    'web-port': { type: 'string', default: '4417' }, 'provider-port': { type: 'string', default: '3317' },
  } });
  if (!['desktop', 'server'].includes(values.mode)) throw Error('invalid_deployment_mode');
  const base = parseOptions(['--kb', '999000111', '--project', values.project,
    '--web-port', values['web-port'], '--provider-port', values['provider-port']]);
  return { ...base, mode: values.mode, shareUrl: values['share-url'], targetFile: values['target-file'] };
}
export function providerTools(directory, tag = readBundle().PROVIDER_TAG) {
  try {
    const require = createRequire(join(resolve(directory), 'package.json'));
    const metadata = require('./package.json');
    if (`v${metadata.version}` !== tag || metadata.name !== 'ima-qa-web') throw Error();
    const tools = require('./src/guided-deployment.js');
    const target = require('./src/shared-kb-target.js');
    if (typeof tools.guided !== 'function' || typeof tools.resolveGuidedTarget !== 'function' || typeof target.verifySharedMembership !== 'function') throw Error();
    return { ...tools, ...target, playwrightVersion: require('playwright-core/package.json').version };
  } catch { throw Error('provider_tooling_required'); }
}
function verifyInstallation(state, source, bundle, project) {
  if (state.project !== project || state.onboarding?.version !== 1 || state.onboarding.providerSource !== source
    || state.bundle?.providerTag !== bundle.PROVIDER_TAG
    || state.bundle?.websiteVersion !== bundle.WEBSITE_VERSION
    || state.bundle?.topology !== 'dedicated-provider') throw Error('existing_installation_requires_reviewed_upgrade');
}
export function lockedCompose(root, args, environment = process.env) {
  const path = join(root, '.docker-lab/release.env');
  const rules = {
    COMPOSE_PROJECT_NAME: /^[a-z0-9][a-z0-9_-]{0,48}$/,
    PROVIDER_IMAGE: /^(?:ghcr\.io\/19chris19\/[a-z0-9-]+@)?sha256:[a-f0-9]{64}$/,
    EXPLORER_IMAGE: /^(?:ghcr\.io\/19chris19\/[a-z0-9-]+@)?sha256:[a-f0-9]{64}$/,
    EXPLORER_REVISION: /^[a-f0-9]{40}$/,
    WEB_HOST_PORT: /^[1-9][0-9]{0,4}$/,
    PROVIDER_HOST_PORT: /^[1-9][0-9]{0,4}$/,
  };
  const values = {};
  for (const line of readFileSync(path, 'utf8').trimEnd().split('\n')) {
    const at = line.indexOf('='), key = line.slice(0, at), value = line.slice(at + 1);
    if (!Object.hasOwn(rules, key) || Object.hasOwn(values, key) || !rules[key].test(value)) throw Error('invalid_release_lock');
    values[key] = value;
  }
  if (Object.keys(values).length !== 6 || Number(values.WEB_HOST_PORT) > 65535
    || Number(values.PROVIDER_HOST_PORT) > 65535 || values.WEB_HOST_PORT === values.PROVIDER_HOST_PORT) throw Error('invalid_release_lock');
  const env = Object.fromEntries(Object.entries(environment).filter(([key]) => {
    const normalized = key.toUpperCase();
    return !normalized.startsWith('COMPOSE_') && !Object.hasOwn(rules, normalized) && normalized !== 'DEMO_ASSET_PREFIX';
  }));
  return { project: values.COMPOSE_PROJECT_NAME, args: ['compose', '-p', values.COMPOSE_PROJECT_NAME, '--env-file', path,
    '-f', join(root, 'compose.linux.yaml'), ...args], env };
}
async function docker(root, args, capture = false, env = process.env) {
  return new Promise((resolveResult, reject) => {
    const child = spawn('docker', args, { cwd: root, env, stdio: ['ignore', capture ? 'pipe' : 'ignore', 'ignore'], windowsHide: true });
    let output = ''; const timer = setTimeout(() => { child.kill(); reject(Error('docker_operation_timeout')); }, 300000);
    if (capture) child.stdout.on('data', chunk => { output += chunk; if (output.length > 1048576) child.kill(); });
    child.once('error', () => { clearTimeout(timer); reject(Error('docker_unavailable')); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolveResult(output.trim()) : reject(Error('docker_operation_failed_check_permissions_and_images')); });
  });
}
async function freePort(port) {
  await new Promise((accept, reject) => {
    const server = net.createServer(); server.once('error', () => reject(Error('port_unavailable')));
    server.listen(port, '127.0.0.1', () => server.close(accept));
  });
}
async function checkEnrollment(execute, compose, mode) {
  // Read admin credentials inside Provider only; the subprocess returns status, never tokens.
  const script = `(async()=>{const headers={authorization:'Bearer '+process.env.IMA_QA_ADMIN_TOKEN};
    const r=await fetch('http://127.0.0.1:3000/api/admin/bootstrap',{headers,signal:AbortSignal.timeout(10000)});
    const data=await r.json();if(!r.ok||String(data.sharedKnowledgeBaseId)!==process.env.IMA_WEB_AGENT_SHARED_KNOWLEDGE_BASE_ID||data.enrollment?.authorizationProtocol!=='shared_library_membership_v1')throw Error();
    let browserReady=false;if(${JSON.stringify(mode)}==='desktop'){const p=await fetch('http://127.0.0.1:3000/api/admin/enrollment-preflight',{method:'POST',headers,signal:AbortSignal.timeout(10000)});browserReady=p.ok&&(await p.json()).enrollment?.ready===true;}
    console.log(JSON.stringify({protocol:data.enrollment.authorizationProtocol,browserReady}));
  })().catch(()=>{console.error('enrollment_path_not_ready');process.exitCode=1;})`;
  let result;
  try { result = JSON.parse(await execute([...compose, 'exec', '-T', 'provider-a', 'node', '-e', script], true)); }
  catch { throw Error('enrollment_path_not_ready'); }
  if (result.protocol !== 'shared_library_membership_v1' || mode === 'desktop' && result.browserReady !== true) throw Error('enrollment_path_not_ready');
}
export async function onboard(root, command, args, dependencies = {}) {
  const bundle = readBundle();
  const source = resolve(process.env.PROVIDER_SOURCE_DIR || join(root, `.maintenance/provider-${bundle.PROVIDER_TAG}`));
  const tools = dependencies.tools || providerTools(source, bundle.PROVIDER_TAG);
  const execute = (args, capture) => {
    const invocation = args[0] === 'compose' ? lockedCompose(root, args.slice(1), dependencies.env || process.env)
      : { args, env: dependencies.env || process.env };
    return dependencies.docker ? dependencies.docker(invocation.args, capture, invocation.env)
      : docker(root, invocation.args, capture, invocation.env);
  };
  const emit = dependencies.emit || (value => console.log(JSON.stringify(value)));
  const dir = join(root, '.docker-lab');
  const helperDir = join(dir, 'maintenance');
  const compose = ['compose'];
  if (command === 'doctor') {
    await tools.guided(source, 'doctor', {}, emit);
    emit({ stage: 'website_preflight', existingInstallation: existsSync(join(dir, 'deployment.json')),
      providerBaseline: bundle.PROVIDER_TAG, websiteVersion: bundle.WEBSITE_VERSION,
      topology: 'dedicated-provider', candidate: bundle.STATUS === 'candidate', realQaVerified: false }); return;
  }
  if (command === 'init') {
    const options = parseOnboardingOptions(args);
    if (['provider.env', 'explorer.env', 'deployment.json', 'release.env'].some(name => existsSync(join(dir, name)))) throw Error('existing_installation_protected');
    const images = selectBundleImages(bundle, dependencies.env || process.env);
    await tools.guided(source, 'doctor', {}, emit);
    await assertFreshProject(options.project, execute);
    await (dependencies.freePort || freePort)(options.webPort); await (dependencies.freePort || freePort)(options.providerPort);
    for (const image of images) {
      if (!/^[a-z0-9][a-z0-9./:_@-]+$/.test(image)) throw Error('invalid_image');
      if (!await execute(['image', 'inspect', image], true).catch(() => '')) await execute(['pull', image]);
    }
    const inspected = JSON.parse(await execute(['image', 'inspect', ...images], true));
    verifyBundleImages(bundle, inspected);
    await execute(['run', '--rm', '--network', 'none', '--entrypoint', 'node', images[0], '-e',
      `if(require('playwright-core/package.json').version!==${JSON.stringify(tools.playwrightVersion)}||typeof require('./src/shared-kb-target').verifySharedMembership!=='function')process.exit(1)`]);
    const target = await tools.resolveGuidedTarget(source, { shareUrl: options.shareUrl, mode: options.mode,
      project: options.project, directory: helperDir, targetFile: options.targetFile }, emit);
    if (options.mode === 'desktop') await tools.guided(source, 'browser-install', { project: options.project, directory: helperDir }, emit);
    const metadata = initialize(dir, { ...options, shareUrl: tools.parseShareUrl(target.shareUrl).url, kb: target.knowledgeBaseId,
      onboarding: { version: 1, mode: options.mode, providerSource: source },
      bundle: { websiteVersion: bundle.WEBSITE_VERSION, providerTag: bundle.PROVIDER_TAG,
        status: bundle.STATUS, topology: 'dedicated-provider' } }, inspected);
    emit({ stage: 'configured', project: metadata.project, credentialsConfigured: true });
    return onboard(root, 'resume', [], dependencies);
  }
  if (['resume', 'repair'].includes(command)) {
    const state = JSON.parse(readFileSync(join(dir, 'deployment.json'), 'utf8'));
    verifyInstallation(state, source, bundle, lockedCompose(root, []).project);
    if (!/^IMA_WEB_AGENT_SHARED_KNOWLEDGE_BASE_SHARE_URL=https:\/\/ima\.qq\.com\/wiki\/\?shareId=[a-f0-9]{64}$/mi.test(readFileSync(join(dir, 'provider.env'), 'utf8'))) throw Error('incomplete_configuration_requires_review');
    if (state.onboarding.mode === 'desktop') await tools.guided(source, 'repair', {
      project: state.project, directory: helperDir, env: join(dir, 'provider.env') }, emit);
    if (command === 'repair') {
      emit({ stage: 'repaired', providerRestarted: false, next: 'An existing Provider requires a separate idle maintenance window to load changed configuration.' }); return;
    }
    await execute([...compose, 'up', '-d', '--no-build', '--no-recreate', '--pull', 'never', '--wait', '--wait-timeout', '180']);
    await execute([...compose, 'exec', '-T', 'explorer-qa', 'node', 'deploy/release-config.mjs', 'check']);
    await checkEnrollment(execute, compose, state.onboarding.mode);
    emit({ stage: 'service_started', websiteUrl: `http://127.0.0.1:${state.webPort}`, adminUrl: `http://127.0.0.1:${state.providerPort}/admin.html`,
      enrollmentMode: state.onboarding.mode === 'desktop' ? 'desktop_helper' : 'remote_cli',
      realQaVerified: false, next: 'Human scan and knowledge-base authorization required.' }); return;
  }
  if (command === 'check') {
    const state = JSON.parse(readFileSync(join(dir, 'deployment.json'), 'utf8'));
    verifyInstallation(state, source, bundle, lockedCompose(root, []).project);
    await execute([...compose, 'exec', '-T', 'explorer-qa', 'node', 'deploy/release-config.mjs', 'check']);
    await checkEnrollment(execute, compose, state.onboarding.mode);
    emit({ stage: 'protocol_checked', realQaVerified: false }); return;
  }
  throw Error('use_doctor_init_resume_check_or_repair');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  onboard(root, process.argv[2] || 'doctor', process.argv.slice(3)).catch(error => {
    const code = /^[a-z_]+$/.test(error.message || '') ? error.message : 'onboarding_blocked';
    console.error(JSON.stringify({ stage: 'blocked', code, credentialsPrinted: false, next: 'Read docs/AGENT_DEPLOYMENT.md; do not reinitialize existing data.' }));
    process.exitCode = 1;
  });
}
