import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { prepareConfiguration } from '../scripts/prepare-docker-lab.mjs';
import { createProviderAClient } from '../provider-a-client.mjs';

export function parseOptions(args) {
  const { values } = parseArgs({ args, options: {
    kb: { type: 'string' }, project: { type: 'string', default: 'zhitianxia-qa' },
    'web-port': { type: 'string', default: '4417' }, 'provider-port': { type: 'string', default: '3317' },
  } });
  const webPort = Number(values['web-port']), providerPort = Number(values['provider-port']);
  if (!/^[1-9][0-9]{0,31}$/u.test(values.kb || '') || !/^[a-z0-9][a-z0-9_-]{0,48}$/u.test(values.project)
    || [webPort, providerPort].some(p => !Number.isInteger(p) || p < 1 || p > 65535) || webPort === providerPort) {
    throw Error('Explicit numeric knowledge scope and valid distinct ports/project required');
  }
  return { kb: values.kb, project: values.project, webPort, providerPort };
}

export function imageMetadata(image) {
  const revision = image?.Config?.Labels?.['org.opencontainers.image.revision'];
  const id = image?.Id;
  if (!/^sha256:[a-f0-9]{64}$/u.test(id || '') || !/^[a-f0-9]{40}$/u.test(revision || '')) throw Error('Image provenance missing');
  const digest = (image.RepoDigests || []).find(value => /^ghcr\.io\/19chris19\/[a-z0-9-]+@sha256:[a-f0-9]{64}$/u.test(value));
  return { image: digest || id, revision };
}

export function initialize(dir, options, images) {
  if (['provider.env', 'explorer.env', 'deployment.json', 'release.env'].some(name => existsSync(resolve(dir, name)))) {
    throw Error('Existing installation protected; do not initialize during upgrade');
  }
  if (!Array.isArray(images) || images.length !== 2) throw Error('Both inspected images required');
  if (options.shareUrl && !/^https:\/\/ima\.qq\.com\/wiki\/\?shareId=[a-f0-9]{64}$/i.test(options.shareUrl)) throw Error('Official canonical share URL required');
  const provider = imageMetadata(images[0]), website = imageMetadata(images[1]);
  const metadata = { schemaVersion: 1, project: options.project, providerImage: provider.image,
    providerRevision: provider.revision, explorerImage: website.image, explorerRevision: website.revision,
    webPort: options.webPort, providerPort: options.providerPort };
  if (options.onboarding) metadata.onboarding = options.onboarding;
  prepareConfiguration(dir, options.kb);
  if (options.shareUrl) appendFileSync(resolve(dir, 'provider.env'), `IMA_WEB_AGENT_SHARED_KNOWLEDGE_BASE_SHARE_URL=${options.shareUrl}\n`);
  writeFileSync(resolve(dir, 'deployment.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  writeFileSync(resolve(dir, 'release.env'), [
    `COMPOSE_PROJECT_NAME=${metadata.project}`, `PROVIDER_IMAGE=${metadata.providerImage}`,
    `EXPLORER_IMAGE=${metadata.explorerImage}`, `EXPLORER_REVISION=${metadata.explorerRevision}`,
    `WEB_HOST_PORT=${metadata.webPort}`, `PROVIDER_HOST_PORT=${metadata.providerPort}`,
  ].join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  return metadata;
}

async function check(idle) {
  const client = createProviderAClient({ baseUrl: process.env.PROVIDER_A_BASE_URL,
    apiToken: process.env.PROVIDER_A_API_TOKEN, serviceToken: process.env.PROVIDER_A_INTERNAL_SERVICE_TOKEN,
    knowledgeScopeRef: process.env.PROVIDER_A_KNOWLEDGE_SCOPE_REF });
  const state = await client.readiness();
  if (!state.authenticated || !state.contractSupported) throw Error('Provider authentication or protocol check failed');
  const queueFile = resolve(process.env.DEMO_RUNTIME_DIR, 'queued-turns.json');
  const jobs = existsSync(queueFile) ? JSON.parse(readFileSync(queueFile, 'utf8')) : [];
  if (!Array.isArray(jobs)) throw Error('Website queue unreadable');
  if (jobs.some(job => !job || !['queued', 'paused', 'running'].includes(job.status))) throw Error('Website queue state unknown');
  const pending = jobs.filter(job => ['queued', 'paused', 'running'].includes(job.status)).length;
  if (idle && (![state.active, state.queued].every(n => Number.isSafeInteger(n) && n === 0) || pending !== 0)) {
    throw Error('Queues are not proven idle; operation blocked');
  }
  console.log(JSON.stringify({ contract: true, ready: state.ready, capacity: state.capacity,
    active: state.active, queued: state.queued, websitePending: pending, revision: process.env.DEMO_RELEASE_REVISION || 'unknown' }));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'init') {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    initialize(resolve('.docker-lab'), parseOptions(args), JSON.parse(input));
    console.log('Created independent configuration and pinned images; credential values withheld.');
  } else if (command === 'check' || command === 'idle') await check(command === 'idle');
  else throw Error('Use init, check or idle');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
