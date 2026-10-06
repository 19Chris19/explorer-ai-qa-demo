import { writeFileSync } from 'node:fs';
import { readBundle, releaseManifest } from '../deploy/bundle.mjs';

const manifest = releaseManifest(readBundle(), {
  revision: process.env.REVISION, digest: process.env.DIGEST,
  providerDigest: process.env.PROVIDER_DIGEST, providerRevision: process.env.PROVIDER_REVISION,
});
writeFileSync('release-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
