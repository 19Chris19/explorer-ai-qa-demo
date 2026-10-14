import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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

import {assertStartedBundle} from '../scripts/docker-start.mjs';
test('legacy source Docker installer distinguishes packaged version from source revision',()=>{
 const health={authenticated:true,contractSupported:true,websiteRelease:'v0.4.0',websiteRevision:'a'.repeat(40)};
 assert.doesNotThrow(()=>assertStartedBundle(health,'0.4.0','a'.repeat(40)));
 assert.throws(()=>assertStartedBundle({...health,websiteRelease:'a'.repeat(40)},'0.4.0','a'.repeat(40)));
 assert.throws(()=>assertStartedBundle({...health,websiteRevision:'b'.repeat(40)},'0.4.0','a'.repeat(40)));
});
