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

test('release generator and verifier agree while preserving older complete manifests',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'qa-release-manifest-'));
 try {
  execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/write-release-manifest.mjs',import.meta.url))],{cwd:dir,env:{...process.env,
   REVISION:'a'.repeat(40),PROVIDER_REVISION:'b'.repeat(40),DIGEST:'sha256:'+ 'c'.repeat(64),PROVIDER_DIGEST:'sha256:'+ 'd'.repeat(64)}});
  const manifest=JSON.parse(readFileSync(join(dir,'release-manifest.json'),'utf8'));
  const methods=[]; const fetch=async(url,options)=>{
   methods.push(options.method||'GET');
   if(url.pathname==='/api/qa/health')return new Response(JSON.stringify({ready:true,websiteRelease:manifest.version,websiteRevision:manifest.revision,
    providerRelease:{version:manifest.providerBaseline,revision:manifest.providerRevision,taskRecordFormat:manifest.taskRecordFormat}}));
   return new Response(readFileSync(new URL('../public'+url.pathname,import.meta.url)));
  };
  assert.equal((await checkPairedRelease('https://synthetic.example',manifest,fetch)).assets,8);
  const current={...manifest,websiteAssets:{...manifest.websiteAssets}};delete current.websiteAssets['/send-motion.mjs'];
  assert.equal((await checkPairedRelease('https://synthetic.example',current,fetch)).assets,7);
  delete current.websiteAssets['/chat-controls.css'];
  await assert.rejects(checkPairedRelease('https://synthetic.example',current,fetch),/invalid_asset_manifest/);
  current.websiteAssets['/unexpected.js']='f'.repeat(64);
  await assert.rejects(checkPairedRelease('https://synthetic.example',current,fetch),/invalid_asset_manifest/);
  assert.equal(methods.every(m=>m==='GET'),true);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

import {assertStartedBundle} from '../scripts/docker-start.mjs';
test('legacy source Docker installer distinguishes packaged version from source revision',()=>{
 const health={authenticated:true,contractSupported:true,websiteRelease:'v0.4.0',websiteRevision:'a'.repeat(40)};
 assert.doesNotThrow(()=>assertStartedBundle(health,'0.4.0','a'.repeat(40)));
 assert.throws(()=>assertStartedBundle({...health,websiteRelease:'a'.repeat(40)},'0.4.0','a'.repeat(40)));
 assert.throws(()=>assertStartedBundle({...health,websiteRevision:'b'.repeat(40)},'0.4.0','a'.repeat(40)));
});
