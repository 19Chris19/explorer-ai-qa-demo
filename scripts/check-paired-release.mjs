// Read-only deployment check. Never submits a question or reads conversation history.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export async function checkPairedRelease(base, manifest, request = fetch) {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))) throw Error('invalid_public_entry');
  if (!/^v\d+\.\d+\.\d+$/.test(manifest.version || '') || !/^[a-f0-9]{40}$/.test(manifest.revision || '')
      || !/^[a-f0-9]{40}$/.test(manifest.providerRevision || '') || manifest.taskRecordFormat !== 'jsonl_v2') throw Error('invalid_stable_manifest');
  const read = async path => {
    const response = await request(new URL(path.replace(/^\//,''), url.href.replace(/\/?$/,'/')), {signal:AbortSignal.timeout(10000),redirect:'error'});
    if (!response.ok) throw Error('entry_unavailable');
    const chunks=[];let size=0;
    for await (const chunk of response.body) {size+=chunk.length;if(size>512*1024){await response.body.cancel().catch(()=>{});throw Error('response_too_large');}chunks.push(chunk);}
    return Buffer.concat(chunks);
  };
  const health=JSON.parse((await read('/api/qa/health')).toString());
  if (!health.ready || health.websiteRelease !== manifest.version || health.websiteRevision !== manifest.revision
      || health.providerRelease?.version !== manifest.providerBaseline || health.providerRelease?.revision !== manifest.providerRevision
      || health.providerRelease?.taskRecordFormat !== manifest.taskRecordFormat) throw Error('running_release_mismatch');
  const assets=Object.entries(manifest.websiteAssets || {});
  if (assets.length!==5 || assets.some(([path,hash])=>!/^\/(?:app\.js|chat-presentation\.(?:js|css)|task-stream\.mjs|answer-markdown\.js)$/.test(path)||!/^[a-f0-9]{64}$/.test(hash))) throw Error('invalid_asset_manifest');
  for (const [path,hash] of assets) if(createHash('sha256').update(await read(path)).digest('hex')!==hash) throw Error('served_asset_mismatch');
  return {matched:true,website:manifest.version,provider:manifest.providerBaseline,assets:assets.length,ready:true};
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const args=process.argv.slice(2);const at=key=>args[args.indexOf(key)+1];
    if(!args.includes('--url')||!args.includes('--manifest'))throw Error('usage_url_and_manifest_required');
    console.log(JSON.stringify(await checkPairedRelease(at('--url'),JSON.parse(readFileSync(at('--manifest'),'utf8')))));
  }catch(error){console.error(/^[a-z_]+$/.test(error.message)?error.message:'release_check_failed');process.exitCode=1;}
}
