import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { initialize, parseOptions } from './release-config.mjs';

export const DEFAULT_SHARE_URL = 'https://ima.qq.com/wiki/?shareId=e528d98d028732fcd9b6adcc879db1463a8b3e4c8f8beb82a7519c4b4fdf8e64';
export function parseOnboardingOptions(args) {
  const { values } = parseArgs({ args, options: {
    'share-url': { type: 'string', default: DEFAULT_SHARE_URL },
    mode: { type: 'string', default: ['darwin', 'win32'].includes(process.platform) ? 'desktop' : 'server' },
    project: { type: 'string', default: 'zhitianxia-qa' },
    'web-port': { type: 'string', default: '4417' }, 'provider-port': { type: 'string', default: '3317' },
  } });
  if (!['desktop', 'server'].includes(values.mode)) throw Error('invalid_deployment_mode');
  const base = parseOptions(['--kb', '999000111', '--project', values.project,
    '--web-port', values['web-port'], '--provider-port', values['provider-port']]);
  return { ...base, mode: values.mode, shareUrl: values['share-url'] };
}
export function providerTools(directory) {
  try {
    const require = createRequire(join(resolve(directory), 'package.json'));
    const metadata = require('./package.json');
    if (!/^0\.4\.(?:[2-9]|[1-9][0-9]+)$/.test(metadata.version) || metadata.name !== 'ima-qa-web') throw Error();
    const tools = require('./src/guided-deployment.js');
    const target = require('./src/shared-kb-target.js');
    if (typeof tools.guided !== 'function' || typeof target.verifySharedMembership !== 'function') throw Error();
    return { ...tools, ...target, playwrightVersion: require('playwright-core/package.json').version };
  } catch { throw Error('provider_tooling_required'); }
}
async function docker(root, args, capture = false) {
  return new Promise((resolveResult, reject) => {
    const child = spawn('docker', args, { cwd: root, stdio: ['ignore', capture ? 'pipe' : 'ignore', 'ignore'], windowsHide: true });
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
  const source = resolve(process.env.PROVIDER_SOURCE_DIR || join(root, '.maintenance/provider-v0.4.2'));
  const tools = dependencies.tools || providerTools(source);
  const execute = dependencies.docker || ((args, capture) => docker(root, args, capture));
  const emit = dependencies.emit || (value => console.log(JSON.stringify(value)));
  const dir = join(root, '.docker-lab');
  const helperDir = join(dir, 'maintenance');
  const compose = ['compose', '--env-file', join(dir, 'release.env'), '-f', join(root, 'compose.linux.yaml')];
  if (command === 'doctor') {
    await tools.guided(source, 'doctor', {}, emit);
    emit({ stage: 'website_preflight', existingInstallation: existsSync(join(dir, 'deployment.json')),
      providerBaseline: 'v0.4.2', candidate: true, realQaVerified: false }); return;
  }
  if (command === 'init') {
    const options = parseOnboardingOptions(args);
    if (['provider.env', 'explorer.env', 'deployment.json', 'release.env'].some(name => existsSync(join(dir, name)))) throw Error('existing_installation_protected');
    await tools.guided(source, 'doctor', {}, emit);
    const target = await tools.resolveSharedTarget(options.shareUrl);
    if (await execute(['ps', '-aq', '--filter', `label=com.docker.compose.project=${options.project}`], true)) throw Error('existing_compose_project_protected');
    await (dependencies.freePort || freePort)(options.webPort); await (dependencies.freePort || freePort)(options.providerPort);
    const images = [process.env.PROVIDER_IMAGE || 'ghcr.io/19chris19/ima-qa-web-agent:v0.4.2',
      process.env.EXPLORER_IMAGE || 'ghcr.io/19chris19/explorer-ai-qa-demo:v0.2.1'];
    for (const image of images) {
      if (!/^[a-z0-9][a-z0-9./:_@-]+$/.test(image)) throw Error('invalid_image');
      if (!await execute(['image', 'inspect', image], true).catch(() => '')) await execute(['pull', image]);
    }
    const inspected = JSON.parse(await execute(['image', 'inspect', ...images], true));
    await execute(['run', '--rm', '--network', 'none', '--entrypoint', 'node', images[0], '-e',
      `if(require('playwright-core/package.json').version!==${JSON.stringify(tools.playwrightVersion)}||typeof require('./src/shared-kb-target').verifySharedMembership!=='function')process.exit(1)`]);
    if (options.mode === 'desktop') await tools.guided(source, 'browser-install', { project: options.project, directory: helperDir }, emit);
    const metadata = initialize(dir, { ...options, shareUrl: tools.parseShareUrl(target.shareUrl).url, kb: target.knowledgeBaseId,
      onboarding: { version: 1, mode: options.mode, providerSource: source } }, inspected);
    emit({ stage: 'configured', project: metadata.project, credentialsConfigured: true });
    return onboard(root, 'resume', [], dependencies);
  }
  if (['resume', 'repair'].includes(command)) {
    const state = JSON.parse(readFileSync(join(dir, 'deployment.json'), 'utf8'));
    if (state.onboarding?.version !== 1 || state.onboarding.providerSource !== source) throw Error('existing_installation_requires_reviewed_upgrade');
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
    if (state.onboarding?.version !== 1 || state.onboarding.providerSource !== source) throw Error('existing_installation_requires_reviewed_upgrade');
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
