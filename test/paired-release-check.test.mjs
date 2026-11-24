import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkPairedRelease} from '../scripts/check-paired-release.mjs';
test('stable deployment gate checks both actual revisions and every served QA asset without submitting work',async()=>{
 const hash=createHash('sha256').update('asset').digest('hex');
 const manifest={version:'v0.4.0',revision:'a'.repeat(40),providerBaseline:'v0.6.0',providerRevision:'b'.repeat(40),taskRecordFormat:'jsonl_v2',websiteAssets:Object.fromEntries(['/app.js','/chat-presentation.js','/chat-presentation.css','/task-stream.mjs','/answer-markdown.js'].map(p=>[p,hash]))};
 let broken=false,oldRevision=false;const methods=[];
 const fetch=async(url,options)=>{methods.push(options.method||'GET');return new Response(url.pathname.endsWith('/health')?JSON.stringify({ready:true,websiteRelease:manifest.version,websiteRevision:oldRevision?'c'.repeat(40):manifest.revision,providerRelease:{version:manifest.providerBaseline,revision:manifest.providerRevision,taskRecordFormat:'jsonl_v2'}}):broken?'outdated':'asset');};
 assert.equal((await checkPairedRelease('https://synthetic.example',manifest,fetch)).matched,true);
 broken=true;await assert.rejects(checkPairedRelease('https://synthetic.example',manifest,fetch),/served_asset_mismatch/);
 broken=false;oldRevision=true;await assert.rejects(checkPairedRelease('https://synthetic.example',manifest,fetch),/running_release_mismatch/);
 assert.equal(methods.every(m=>m==='GET'),true);
 await assert.rejects(checkPairedRelease('http://public.example',manifest,fetch),/invalid_public_entry/);
});

test('release generator and verifier cover model controls while preserving complete historical manifests',async()=>{
 const {buildReleaseManifest}=await import('../scripts/write-release-manifest.mjs');const {readBundle}=await import('../deploy/bundle.mjs');
 const manifest=buildReleaseManifest({...readBundle(),STATUS:'released'},{revision:'a'.repeat(40),providerRevision:'b'.repeat(40),digest:'sha256:'+'c'.repeat(64),providerDigest:'sha256:'+'d'.repeat(64)});const methods=[];
 const verify=m=>checkPairedRelease('https://synthetic.example',m,async(url,options)=>{methods.push(options.method||'GET');if(url.pathname==='/api/qa/health')return Response.json({ready:true,websiteRelease:m.version,websiteRevision:m.revision,providerRelease:{version:m.providerBaseline,revision:m.providerRevision,taskRecordFormat:m.taskRecordFormat}});return new Response(readFileSync(new URL('../public'+url.pathname,import.meta.url)));});
 assert.equal((await verify(manifest)).assets,10);const incomplete={...manifest,websiteAssets:{...manifest.websiteAssets}};delete incomplete.websiteAssets['/model-picker.js'];await assert.rejects(verify(incomplete),/invalid_asset_manifest/);
 const historical={...manifest,version:'v0.5.1',websiteAssets:{...manifest.websiteAssets}};delete historical.websiteAssets['/model-picker.js'];delete historical.websiteAssets['/model-picker.css'];assert.equal((await verify(historical)).assets,8);delete historical.websiteAssets['/send-motion.mjs'];assert.equal((await verify(historical)).assets,7);delete historical.websiteAssets['/chat-controls.css'];await assert.rejects(verify(historical),/invalid_asset_manifest/);assert.equal(methods.every(m=>m==='GET'),true);
 assert.throws(()=>buildReleaseManifest({...readBundle(),STATUS:'candidate'},{revision:'a'.repeat(40),providerRevision:'b'.repeat(40),digest:'sha256:'+'c'.repeat(64),providerDigest:'sha256:'+'d'.repeat(64)}),/candidate_not_releasable/);
});

import {assertStartedBundle} from '../scripts/docker-start.mjs';
test('legacy source Docker installer distinguishes packaged version from source revision',()=>{
 const health={authenticated:true,contractSupported:true,websiteRelease:'v0.4.0',websiteRevision:'a'.repeat(40)};
 assert.doesNotThrow(()=>assertStartedBundle(health,'0.4.0','a'.repeat(40)));
 assert.throws(()=>assertStartedBundle({...health,websiteRelease:'a'.repeat(40)},'0.4.0','a'.repeat(40)));
 assert.throws(()=>assertStartedBundle({...health,websiteRevision:'b'.repeat(40)},'0.4.0','a'.repeat(40)));
});
