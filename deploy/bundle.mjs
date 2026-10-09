import { readFileSync } from 'node:fs';

export function readBundle(file = new URL('./bundle.env', import.meta.url)) {
  const result = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const match = /^(STATUS|WEBSITE_VERSION|PROVIDER_TAG)=([a-z0-9.-]+)$/.exec(line);
    if (!match || Object.hasOwn(result, match[1])) throw Error('invalid_deployment_bundle');
    result[match[1]] = match[2];
  }
  if (!['candidate', 'released'].includes(result.STATUS)
    || !releaseVersionValid(result.WEBSITE_VERSION)
    || !releaseVersionValid(result.PROVIDER_TAG?.slice(1)) || !result.PROVIDER_TAG?.startsWith('v')
    || (!result.WEBSITE_VERSION.includes('-rc.') && result.PROVIDER_TAG.includes('-rc.'))) throw Error('invalid_deployment_bundle');
  return result;
}

export function releaseVersionValid(version) {
  return typeof version === 'string' && /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-rc\.[1-9]\d*)?$/.test(version);
}

export function selectBundleImages(bundle, env = process.env) {
  if (bundle.STATUS === 'candidate' && (!env.PROVIDER_IMAGE || !env.EXPLORER_IMAGE)) {
    throw Error('candidate_requires_explicit_images');
  }
  const images = [env.PROVIDER_IMAGE || `ghcr.io/19chris19/ima-qa-web-agent:${bundle.PROVIDER_TAG}`,
    env.EXPLORER_IMAGE || `ghcr.io/19chris19/explorer-ai-qa-demo:v${bundle.WEBSITE_VERSION}`];
  if (images.some(image => !/^[a-z0-9][a-z0-9./:_@-]+$/.test(image))) throw Error('invalid_image');
  return images;
}

export function verifyBundleImages(bundle, images) {
  const expected = [bundle.PROVIDER_TAG, `v${bundle.WEBSITE_VERSION}`];
  if (!Array.isArray(images) || images.length !== 2 || images.some((image, index) =>
    image?.Config?.Labels?.['org.opencontainers.image.version'] !== expected[index])) throw Error('image_version_mismatch');
}

export function releaseManifest(bundle, { revision, digest, providerDigest, providerRevision }) {
  if (bundle.STATUS !== 'released') throw Error('candidate_not_releasable');
  if (![revision, providerRevision].every(value => /^[a-f0-9]{40}$/.test(value || ''))
    || ![digest, providerDigest].every(value => /^sha256:[a-f0-9]{64}$/.test(value || ''))) throw Error('release_evidence_missing');
  return { schemaVersion: 2, version: `v${bundle.WEBSITE_VERSION}`, revision,
    channel: bundle.WEBSITE_VERSION.includes('-rc.') ? 'prerelease' : 'stable',
    image: 'ghcr.io/19chris19/explorer-ai-qa-demo', digest,
    platforms: ['linux/amd64', 'linux/arm64'], providerBaseline: bundle.PROVIDER_TAG,
    providerImage: 'ghcr.io/19chris19/ima-qa-web-agent', providerDigest, providerRevision,
    providerContract: 'knowledge_agent_keyed_sse_v1', topology: 'dedicated-provider',
    acceptance: 'synthetic startup; no real IMA question', realQaVerified: false,
    visibility: 'private; authorized registry login required' };
}
