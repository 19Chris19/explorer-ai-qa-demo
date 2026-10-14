import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { readBundle, releaseManifest } from '../deploy/bundle.mjs';

const manifest = releaseManifest(readBundle(), {
  revision: process.env.REVISION, digest: process.env.DIGEST,
  providerDigest: process.env.PROVIDER_DIGEST, providerRevision: process.env.PROVIDER_REVISION,
});
manifest.websiteAssets = Object.fromEntries(['app.js','chat-presentation.js','chat-presentation.css','task-stream.mjs','answer-markdown.js'].map(file => ['/'+file,createHash('sha256').update(readFileSync(new URL('../public/'+file,import.meta.url))).digest('hex')]));
writeFileSync('release-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
