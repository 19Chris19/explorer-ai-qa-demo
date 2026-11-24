import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readBundle, releaseManifest } from '../deploy/bundle.mjs';

export function buildReleaseManifest(bundle, evidence){
const manifest = releaseManifest(bundle, evidence);
manifest.websiteAssets = Object.fromEntries(['app.js','chat-presentation.js','chat-presentation.css','chat-controls.js','chat-controls.css','task-stream.mjs','answer-markdown.js','send-motion.mjs','model-picker.js','model-picker.css'].map(file => ['/'+file,createHash('sha256').update(readFileSync(new URL('../public/'+file,import.meta.url))).digest('hex')]));
return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
const manifest = buildReleaseManifest(readBundle(), {
  revision: process.env.REVISION, digest: process.env.DIGEST,
  providerDigest: process.env.PROVIDER_DIGEST, providerRevision: process.env.PROVIDER_REVISION,
});
writeFileSync('release-manifest.json', JSON.stringify(manifest, null, 2) + '\n');

}
