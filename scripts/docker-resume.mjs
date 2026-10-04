import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const state=JSON.parse(readFileSync(resolve(root,'.docker-lab/deployment.json'),'utf8'));
  if(!/^[a-z0-9][a-z0-9_-]{0,48}$/u.test(state.project)
    ||[state.providerImage,state.explorerImage].some(image=>!/^sha256:[a-f0-9]{64}$/u.test(image))
    ||! /^[a-f0-9]{40}$/u.test(state.explorerRevision)
    ||[state.webPort,state.providerPort].some(port=>!Number.isInteger(port)||port<1||port>65535))throw new Error('Invalid deployment metadata');
  const env={...process.env,PROVIDER_IMAGE:state.providerImage,EXPLORER_IMAGE:state.explorerImage,EXPLORER_REVISION:state.explorerRevision,WEB_HOST_PORT:String(state.webPort),PROVIDER_HOST_PORT:String(state.providerPort)};
  execFileSync('docker',['compose','-p',state.project,'-f','compose.linux.yaml','up','-d','--no-recreate','--no-build','--pull','never','--wait','--wait-timeout','180'],{cwd:root,env,stdio:['ignore','pipe','pipe'],timeout:240000});
  console.log('Resumed the recorded image digests with current persistent volumes; no configuration regenerated.');
} catch {console.error('Resume failed; inspect private deployment metadata and Docker state without printing credentials.');process.exitCode=1;}
